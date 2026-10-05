import { invoke, isTauri } from '@tauri-apps/api/core';
import { getExtension, getFileKind, isProbablyText, decodeText, mimeTypeFor, type FileKind } from './fileTypes';
import type { BrowserFileHandle, OpenDocument } from '../types';

export const MAX_TEXT_PREVIEW_BYTES = 8 * 1024 * 1024;
const PARTIAL_TEXT_BYTES = 1 * 1024 * 1024;
const PARTIAL_TEXT_CHARACTERS = 1_000_000;
const LARGE_BINARY_BYTES = 50 * 1024 * 1024;

interface BrowserPickerWindow extends Window {
  showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<Array<BrowserFileHandle & { name: string }>>;
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<BrowserFileHandle>;
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pathName(path: string): string {
  return path.replaceAll('\\', '/').split('/').pop() || path;
}

function confirmLargeFile(name: string, size: number): boolean {
  const sizeLabel = formatBytes(size);
  return window.confirm(
    `« ${name} » fait ${sizeLabel}. La lecture d’un fichier volumineux peut ralentir Noto.\n\nVoulez-vous continuer ?`,
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1_000;
  let unit = 0;
  while (value >= 1_000 && unit < units.length - 1) {
    value /= 1_000;
    unit += 1;
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

function documentRecord(input: {
  name: string;
  path: string;
  kind: FileKind;
  content?: string;
  bytes?: Uint8Array;
  mimeType?: string;
  size: number;
  source: 'browser' | 'desktop';
  handle?: BrowserFileHandle;
  truncated?: boolean;
}): OpenDocument {
  const content = input.content ?? '';
  return {
    id: makeId(),
    name: input.name,
    path: input.path,
    extension: getExtension(input.name),
    kind: input.kind,
    content,
    savedContent: content,
    bytes: input.bytes,
    mimeType: input.mimeType ?? mimeTypeFor(input.name),
    size: input.size,
    truncated: input.truncated ?? false,
    source: input.source,
    handle: input.handle,
  };
}

export async function loadBrowserFile(file: File, handle?: BrowserFileHandle): Promise<OpenDocument | null> {
  const initialKind = getFileKind(file.name);
  const isText = ['markdown', 'text', 'code', 'html', 'csv'].includes(initialKind);
  const name = file.name || 'Sans nom';
  const largeFileConfirmed = initialKind === 'unknown' && file.size > MAX_TEXT_PREVIEW_BYTES;
  if (largeFileConfirmed && !confirmLargeFile(name, file.size)) return null;
  if (!isText && initialKind !== 'unknown' && file.size > LARGE_BINARY_BYTES && !confirmLargeFile(name, file.size)) return null;

  if (isText) {
    if (file.size > MAX_TEXT_PREVIEW_BYTES && !confirmLargeFile(name, file.size)) return null;
    const truncated = file.size > MAX_TEXT_PREVIEW_BYTES;
    const source = truncated ? file.slice(0, PARTIAL_TEXT_BYTES) : file;
    const content = decodeText(new Uint8Array(await source.arrayBuffer()));
    return documentRecord({
      name,
      path: file.webkitRelativePath || file.name,
      kind: initialKind,
      content,
      mimeType: file.type || mimeTypeFor(name),
      size: file.size,
      source: 'browser',
      handle,
      truncated,
    });
  }

  if (initialKind === 'unknown') {
    const sample = new Uint8Array(await file.slice(0, 8_192).arrayBuffer());
    if (isProbablyText(sample)) {
      if (file.size > MAX_TEXT_PREVIEW_BYTES && !largeFileConfirmed && !confirmLargeFile(name, file.size)) return null;
      const truncated = file.size > MAX_TEXT_PREVIEW_BYTES;
      const textSource = truncated ? file.slice(0, PARTIAL_TEXT_BYTES) : file;
      const bytes = new Uint8Array(await textSource.arrayBuffer());
      return documentRecord({
        name,
        path: file.webkitRelativePath || file.name,
        kind: 'unknown',
        content: decodeText(bytes),
        mimeType: file.type || mimeTypeFor(name),
        size: file.size,
        source: 'browser',
        handle,
        truncated,
      });
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return documentRecord({
    name,
    path: file.webkitRelativePath || file.name,
    kind: initialKind,
    bytes,
    mimeType: file.type || mimeTypeFor(name),
    size: file.size,
    source: 'browser',
    handle,
  });
}

export async function pickBrowserFiles(): Promise<OpenDocument[] | null> {
  const pickerWindow = window as BrowserPickerWindow;
  if (!pickerWindow.showOpenFilePicker) return null;
  try {
    const handles = await pickerWindow.showOpenFilePicker({ multiple: true });
    const documents: OpenDocument[] = [];
    for (const handle of handles) {
      const document = await loadBrowserFile(await handle.getFile(), handle);
      if (document) documents.push(document);
    }
    return documents;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return [];
    // Unsupported or blocked file-system pickers fall back to the ordinary input.
    return null;
  }
}

export async function openDesktopFiles(): Promise<OpenDocument[]> {
  if (!isTauri()) return [];
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readFile, stat } = await import('@tauri-apps/plugin-fs');
  const selected = await open({ multiple: true });
  if (!selected) return [];

  const paths = Array.isArray(selected) ? selected : [selected];
  const documents: OpenDocument[] = [];
  for (const path of paths) {
    try {
      const name = pathName(path);
      await invoke('allow_file_access', { path });
      const fileInfo = await stat(path);
      const kind = getFileKind(name);
      const textKind = ['markdown', 'text', 'code', 'html', 'csv'].includes(kind);
      const warningLimit = kind === 'unknown' || textKind ? MAX_TEXT_PREVIEW_BYTES : LARGE_BINARY_BYTES;
      if (fileInfo.size > warningLimit && !confirmLargeFile(name, fileInfo.size)) continue;
      const bytes = await readFile(path);
      const isText = textKind || (kind === 'unknown' && isProbablyText(bytes));
      const decoded = isText ? decodeText(bytes) : undefined;
      const truncated = Boolean(decoded && fileInfo.size > MAX_TEXT_PREVIEW_BYTES);
      documents.push(documentRecord({
        name,
        path,
        kind,
        content: decoded && truncated ? decoded.slice(0, PARTIAL_TEXT_CHARACTERS) : decoded,
        bytes: isText ? undefined : bytes,
        mimeType: mimeTypeFor(name),
        size: fileInfo.size,
        source: 'desktop',
        truncated,
      }));
    } catch (error) {
      console.error(`Impossible de lire ${path}`, error);
      throw new Error(`Impossible de lire « ${pathName(path)} ». Vérifiez que le fichier est accessible.`);
    }
  }
  return documents;
}

export async function readDesktopPath(path: string): Promise<OpenDocument> {
  const { readFile, stat } = await import('@tauri-apps/plugin-fs');
  await invoke('allow_file_access', { path });
  const name = pathName(path);
  const fileInfo = await stat(path);
  const kind = getFileKind(name);
  const textKind = ['markdown', 'text', 'code', 'html', 'csv'].includes(kind);
  const warningLimit = kind === 'unknown' || textKind ? MAX_TEXT_PREVIEW_BYTES : LARGE_BINARY_BYTES;
  if (fileInfo.size > warningLimit && !confirmLargeFile(name, fileInfo.size)) {
    throw new Error('Ouverture annulée.');
  }
  const bytes = await readFile(path);
  const isText = textKind || (kind === 'unknown' && isProbablyText(bytes));
  const decoded = isText ? decodeText(bytes) : undefined;
  const truncated = Boolean(decoded && fileInfo.size > MAX_TEXT_PREVIEW_BYTES);
  return documentRecord({
    name,
    path,
    kind,
    content: decoded && truncated ? decoded.slice(0, PARTIAL_TEXT_CHARACTERS) : decoded,
    bytes: isText ? undefined : bytes,
    mimeType: mimeTypeFor(name),
    size: fileInfo.size,
    source: 'desktop',
    truncated,
  });
}

export async function saveDocument(document: OpenDocument, content: string, saveAs = false): Promise<OpenDocument> {
  if (document.source === 'desktop' && !saveAs) {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(document.path, content);
    return { ...document, content, savedContent: content, size: new TextEncoder().encode(content).length };
  }

  if (document.source === 'browser' && document.handle && !saveAs) {
    const writer = await document.handle.createWritable();
    await writer.write(content);
    await writer.close();
    return { ...document, content, savedContent: content, size: new TextEncoder().encode(content).length };
  }

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: document.name });
    if (!path) throw new Error('Enregistrement annulé.');
    await writeTextFile(path, content);
    return { ...document, name: pathName(path), path, source: 'desktop', content, savedContent: content, size: new TextEncoder().encode(content).length };
  }

  const pickerWindow = window as BrowserPickerWindow;
  if (pickerWindow.showSaveFilePicker) {
    try {
      const handle = await pickerWindow.showSaveFilePicker({ suggestedName: document.name });
      const writer = await handle.createWritable();
      await writer.write(content);
      await writer.close();
      return { ...document, path: document.name, source: 'browser', handle, content, savedContent: content, size: new TextEncoder().encode(content).length };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Enregistrement annulé.');
      throw error;
    }
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = document.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return { ...document, content, savedContent: content, size: new TextEncoder().encode(content).length };
}
