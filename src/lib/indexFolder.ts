import { invoke, isTauri } from '@tauri-apps/api/core';
import { getFileKind } from './fileTypes';

export interface IndexableDocument {
  path: string;
  name: string;
  kind: string;
  content: string;
}

export interface IndexScanProgress {
  directoriesVisited: number;
  filesScanned: number;
  filesSkipped: number;
  bytesRead: number;
}

export interface IndexScanResult extends IndexScanProgress {
  documents: IndexableDocument[];
  directoriesSkipped: number;
  truncated: boolean;
}

export interface IndexScanOptions {
  root: string;
  signal?: AbortSignal;
  onProgress?: (progress: IndexScanProgress) => void;
}

const MAX_DEPTH = 10;
const MAX_DIRECTORIES = 1_000;
const MAX_ENTRIES = 50_000;
const MAX_FILES = 5_000;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 64_000_000;
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '.next', '.cache', '.venv', 'coverage', 'vendor']);
const SEARCHABLE_KINDS = new Set(['markdown', 'text', 'code', 'html', 'csv']);

export async function scanFolderForIndex({ root, signal, onProgress }: IndexScanOptions): Promise<IndexScanResult> {
  if (!isTauri()) throw new Error('L’indexation locale est disponible dans l’application de bureau.');
  const rootPath = root.trim();
  if (!rootPath) throw new Error('Choisissez d’abord un dossier.');

  await invoke('allow_directory_access', { path: rootPath, recursive: true });
  const { readDir, readTextFile, stat } = await import('@tauri-apps/plugin-fs');
  const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];
  const documents: IndexableDocument[] = [];
  let directoriesVisited = 0;
  let directoriesSkipped = 0;
  let filesScanned = 0;
  let filesSkipped = 0;
  let bytesRead = 0;
  let entriesVisited = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (signal?.aborted) throw new Error('Indexation annulée.');
    if (directoriesVisited >= MAX_DIRECTORIES) {
      truncated = true;
      break;
    }
    const directory = queue.shift()!;
    directoriesVisited += 1;
    let entries: Awaited<ReturnType<typeof readDir>>;
    try {
      entries = await readDir(directory.path);
    } catch {
      directoriesSkipped += 1;
      continue;
    }

    for (const entry of entries) {
      if (signal?.aborted) throw new Error('Indexation annulée.');
      if (entriesVisited >= MAX_ENTRIES) {
        truncated = true;
        break;
      }
      entriesVisited += 1;
      if (entriesVisited % 100 === 0) {
        onProgress?.({ directoriesVisited, filesScanned, filesSkipped, bytesRead });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      const path = joinPath(directory.path, entry.name);
      if (entry.isDirectory) {
        if (directory.depth < MAX_DEPTH && !IGNORED_DIRECTORIES.has(entry.name.toLocaleLowerCase('en-US'))) {
          queue.push({ path, depth: directory.depth + 1 });
        } else {
          directoriesSkipped += 1;
        }
        continue;
      }
      if (!entry.isFile || !SEARCHABLE_KINDS.has(getFileKind(entry.name))) continue;
      if (filesScanned >= MAX_FILES || bytesRead >= MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      filesScanned += 1;
      try {
        const metadata = await stat(path);
        if (!Number.isFinite(metadata.size) || metadata.size > MAX_FILE_BYTES || bytesRead + metadata.size > MAX_TOTAL_BYTES) {
          filesSkipped += 1;
          continue;
        }
        const content = await readTextFile(path);
        bytesRead += metadata.size;
        documents.push({ path, name: entry.name, kind: getFileKind(entry.name), content });
      } catch {
        filesSkipped += 1;
      }
      if (filesScanned % 20 === 0) {
        onProgress?.({ directoriesVisited, filesScanned, filesSkipped, bytesRead });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    onProgress?.({ directoriesVisited, filesScanned, filesSkipped, bytesRead });
    if (truncated) break;
  }

  return { documents, directoriesVisited, directoriesSkipped, filesScanned, filesSkipped, bytesRead, truncated };
}

function joinPath(parent: string, name: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${name}`;
}
