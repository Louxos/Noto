import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  createNotebookManifest,
  isSafePagePath,
  normalizeNotebookManifest,
  NOTEBOOK_MANIFEST_NAME,
  safeNotebookTitle,
  slugifyNotebookFile,
  type NotebookManifest,
  type NotebookPage,
  type NotebookReference,
} from './notebookModel';

const NOTEBOOKS_KEY = 'noto.notebooks.v1';
export const ACTIVE_NOTEBOOK_KEY = 'noto.notebooks.active.v1';
const MAX_NOTEBOOK_REFERENCES = 50;
const authorizedNotebookRoots = new Set<string>();

function pathSeparator(path: string): string {
  return path.includes('\\') ? '\\' : '/';
}

export function joinNotebookPath(root: string, relativePath: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, '');
  const relative = relativePath.replaceAll('\\', '/');
  if (!normalizedRoot || relative.startsWith('/') || /^[a-zA-Z]:/.test(relative)
      || relative.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Le chemin demandé sort du dossier du carnet.');
  }
  const separator = pathSeparator(root);
  return `${normalizedRoot}${separator}${relative.split('/').join(separator)}`;
}

export function notebookFolderName(name: string): string {
  const normalized = safeNotebookTitle(name);
  if (!normalized || /[\\/:*?"<>|]/.test(normalized) || /[. ]$/.test(normalized)) {
    throw new Error('Choisissez un nom de carnet valide pour Windows.');
  }
  return normalized;
}

export function notebookPathName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
}

export function loadNotebookReferences(): NotebookReference[] {
  try {
    const value = JSON.parse(localStorage.getItem(NOTEBOOKS_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.flatMap((entry): NotebookReference[] => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as Partial<NotebookReference>;
      if (typeof item.id !== 'string' || !item.id || seen.has(item.id)
          || typeof item.name !== 'string' || !item.name.trim()
          || typeof item.path !== 'string' || !item.path.trim()) return [];
      seen.add(item.id);
      return [{
        id: item.id,
        name: item.name.trim().slice(0, 120),
        path: item.path.slice(0, 3_000),
        lastOpened: typeof item.lastOpened === 'number' && Number.isFinite(item.lastOpened) ? item.lastOpened : 0,
      }];
    }).slice(0, MAX_NOTEBOOK_REFERENCES);
  } catch {
    return [];
  }
}

export function saveNotebookReferences(references: NotebookReference[]): void {
  try {
    localStorage.setItem(NOTEBOOKS_KEY, JSON.stringify(references.slice(0, MAX_NOTEBOOK_REFERENCES)));
  } catch {
    // A full or private browser store must not prevent access to a folder the user just selected.
  }
}

export async function authorizeNotebookDirectory(path: string): Promise<void> {
  if (!isTauri()) throw new Error('Les carnets locaux sont disponibles dans l’application de bureau Noto.');
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '');
  if (authorizedNotebookRoots.has(normalized)) return;
  await invoke('allow_directory_tree_access', { path });
  authorizedNotebookRoots.add(normalized);
}

async function fileSystem() {
  if (!isTauri()) throw new Error('Les carnets locaux sont disponibles dans l’application de bureau Noto.');
  return import('@tauri-apps/plugin-fs');
}

async function saveManifest(rootPath: string, manifest: NotebookManifest): Promise<void> {
  const fs = await fileSystem();
  await fs.writeTextFile(joinNotebookPath(rootPath, NOTEBOOK_MANIFEST_NAME), JSON.stringify(manifest, null, 2));
}

export async function createNotebookInFolder(parentPath: string, name: string): Promise<{ rootPath: string; manifest: NotebookManifest }> {
  const folderName = notebookFolderName(name);
  if (!isTauri()) throw new Error('Les carnets locaux sont disponibles dans l’application de bureau Noto.');
  // This native command creates only the selected child directory; it does not grant access to sibling files.
  const rootPath = await invoke<string>('create_notebook_directory', { parentPath, folderName });
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const manifest = createNotebookManifest(name);
  await fs.mkdir(joinNotebookPath(rootPath, 'sections'), { recursive: true });
  await fs.mkdir(joinNotebookPath(rootPath, 'attachments'), { recursive: true });
  await fs.mkdir(joinNotebookPath(rootPath, `sections/${manifest.sections[0]!.id}`), { recursive: true });
  await saveManifest(rootPath, manifest);
  return { rootPath, manifest };
}

export async function readNotebookFolder(rootPath: string): Promise<NotebookManifest | null> {
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const manifestPath = joinNotebookPath(rootPath, NOTEBOOK_MANIFEST_NAME);
  if (!(await fs.exists(manifestPath))) return null;
  let raw: unknown;
  try { raw = JSON.parse(await fs.readTextFile(manifestPath)); }
  catch { throw new Error('Le fichier de carnet est illisible ou mal formé. Aucun fichier n’a été modifié.'); }
  return normalizeNotebookManifest(raw);
}

export async function initializeNotebookFolder(rootPath: string): Promise<NotebookManifest> {
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const manifestPath = joinNotebookPath(rootPath, NOTEBOOK_MANIFEST_NAME);
  if (await fs.exists(manifestPath)) {
    const existing = await readNotebookFolder(rootPath);
    if (!existing) throw new Error('Impossible de lire le carnet existant.');
    return existing;
  }
  const manifest = createNotebookManifest(notebookPathName(rootPath));
  await fs.mkdir(joinNotebookPath(rootPath, 'sections'), { recursive: true });
  await fs.mkdir(joinNotebookPath(rootPath, 'attachments'), { recursive: true });
  await fs.mkdir(joinNotebookPath(rootPath, `sections/${manifest.sections[0]!.id}`), { recursive: true });
  await saveManifest(rootPath, manifest);
  return manifest;
}

export async function persistNotebookManifest(rootPath: string, manifest: NotebookManifest): Promise<void> {
  await authorizeNotebookDirectory(rootPath);
  const normalized = normalizeNotebookManifest(manifest);
  await saveManifest(rootPath, normalized);
}

export async function createNotebookSectionFolder(rootPath: string, sectionId: string): Promise<void> {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(sectionId)) throw new Error('Identifiant de section invalide.');
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  await fs.mkdir(joinNotebookPath(rootPath, `sections/${sectionId}`), { recursive: true });
}

export async function readNotebookPage(rootPath: string, page: NotebookPage): Promise<string> {
  if (!isSafePagePath(page.relativePath, page.sectionId)) throw new Error('Le chemin de page du carnet est invalide.');
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const fullPath = joinNotebookPath(rootPath, page.relativePath);
  if (!(await fs.exists(fullPath))) {
    await fs.writeTextFile(fullPath, '');
    return '';
  }
  return fs.readTextFile(fullPath);
}

export async function writeNotebookPage(rootPath: string, page: NotebookPage, content: string): Promise<void> {
  if (!isSafePagePath(page.relativePath, page.sectionId)) throw new Error('Le chemin de page du carnet est invalide.');
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const fullPath = joinNotebookPath(rootPath, page.relativePath);
  const parentPath = fullPath.slice(0, Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\')));
  await fs.mkdir(parentPath, { recursive: true });
  await fs.writeTextFile(fullPath, content);
}

export async function renameNotebookPageFile(rootPath: string, oldPath: string, newPath: string, sectionId: string): Promise<void> {
  if (!isSafePagePath(oldPath, sectionId) || !isSafePagePath(newPath, sectionId)) throw new Error('Le chemin de page du carnet est invalide.');
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const from = joinNotebookPath(rootPath, oldPath);
  const to = joinNotebookPath(rootPath, newPath);
  if (await fs.exists(to)) throw new Error('Un fichier de page portant déjà ce nom existe.');
  if (await fs.exists(from)) await fs.rename(from, to);
}

export async function removeNotebookPageFile(rootPath: string, relativePath: string, sectionId: string): Promise<void> {
  if (!isSafePagePath(relativePath, sectionId)) throw new Error('Le chemin de page du carnet est invalide.');
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const target = joinNotebookPath(rootPath, relativePath);
  if (await fs.exists(target)) await fs.remove(target);
}

export async function removeNotebookSectionFolder(rootPath: string, sectionId: string): Promise<void> {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(sectionId)) throw new Error('Identifiant de section invalide.');
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const target = joinNotebookPath(rootPath, `sections/${sectionId}`);
  if (await fs.exists(target)) await fs.remove(target, { recursive: true });
}

export async function copyFileIntoNotebook(rootPath: string, pageId: string, sourcePath: string): Promise<{ relativePath: string; name: string }> {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(pageId)) throw new Error('Identifiant de page invalide.');
  await invoke('allow_file_access', { path: sourcePath });
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const name = notebookPathName(sourcePath).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'piece-jointe';
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : '';
  const bytes = await fs.readFile(sourcePath);
  await fs.mkdir(joinNotebookPath(rootPath, `attachments/${pageId}`), { recursive: true });
  let fileName = '';
  let targetPath = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    fileName = `${slugifyNotebookFile(stem)}-${crypto.randomUUID().slice(0, 16)}${extension}`;
    targetPath = joinNotebookPath(rootPath, `attachments/${pageId}/${fileName}`);
    if (!(await fs.exists(targetPath))) break;
    fileName = '';
  }
  if (!fileName) throw new Error('Impossible de réserver un nom unique pour cette pièce jointe.');
  const relativePath = `attachments/${pageId}/${fileName}`;
  await fs.writeFile(targetPath, bytes);
  return { relativePath, name };
}

export async function readNotebookAttachment(rootPath: string, pageId: string, relativePath: string): Promise<Uint8Array> {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(pageId) || !normalized.startsWith(`attachments/${pageId}/`)
      || normalized.split('/').length !== 3
      || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Le chemin de pièce jointe est invalide.');
  }
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  return fs.readFile(joinNotebookPath(rootPath, normalized));
}

export async function removeNotebookPageAttachments(rootPath: string, pageId: string): Promise<void> {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(pageId)) throw new Error('Identifiant de page invalide.');
  await authorizeNotebookDirectory(rootPath);
  const fs = await fileSystem();
  const target = joinNotebookPath(rootPath, `attachments/${pageId}`);
  if (await fs.exists(target)) await fs.remove(target, { recursive: true });
}

export function removeNotebookReference(references: NotebookReference[], id: string): NotebookReference[] {
  const next = references.filter((reference) => reference.id !== id);
  saveNotebookReferences(next);
  return next;
}

export function upsertNotebookReference(references: NotebookReference[], manifest: NotebookManifest, path: string): NotebookReference[] {
  const nextReference: NotebookReference = { id: manifest.id, name: manifest.name, path, lastOpened: Date.now() };
  const next = [nextReference, ...references.filter((reference) => reference.id !== manifest.id && reference.path !== path)]
    .slice(0, MAX_NOTEBOOK_REFERENCES);
  saveNotebookReferences(next);
  return next;
}
