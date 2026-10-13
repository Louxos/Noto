import { invoke, isTauri } from '@tauri-apps/api/core';
import { getFileKind } from './fileTypes';
import { searchText } from './search';

export interface FolderSearchHit {
  path: string;
  name: string;
  line: number | null;
  matches: number;
  preview: string;
}

export interface FolderSearchSummary {
  hits: FolderSearchHit[];
  filesScanned: number;
  filesSkipped: number;
  directoriesSkipped: number;
  truncated: boolean;
}

export interface FolderSearchProgress {
  directoriesVisited: number;
  filesScanned: number;
  matchesFound: number;
}

export interface FolderSearchOptions {
  root: string;
  query: string;
  signal?: AbortSignal;
  onProgress?: (progress: FolderSearchProgress) => void;
}

const MAX_DEPTH = 10;
const MAX_FILES = 5_000;
const MAX_RESULTS = 200;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 64_000_000;
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '.next', '.cache', '.venv', 'coverage', 'vendor']);
const SEARCHABLE_KINDS = new Set(['markdown', 'text', 'code', 'html', 'csv']);

export function searchFolderFile(name: string, path: string, content: string, query: string): FolderSearchHit | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const result = searchText(content, trimmed, { caseSensitive: false, wholeWord: false, regex: false });
  if (result.error) return null;
  const fileNameMatches = name.toLocaleLowerCase('fr-FR').includes(trimmed.toLocaleLowerCase('fr-FR'));
  if (!result.total && !fileNameMatches) return null;
  const first = result.matches[0];
  return {
    path,
    name,
    line: first?.line ?? null,
    matches: result.total,
    preview: first ? first.preview.slice(0, 240) : 'Le nom du fichier correspond à la recherche.',
  };
}

export async function searchLocalFolder({ root, query, signal, onProgress }: FolderSearchOptions): Promise<FolderSearchSummary> {
  if (!isTauri()) throw new Error('La recherche dans les dossiers est disponible dans l’application de bureau.');
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error('Saisissez un texte à rechercher.');
  if (trimmedQuery.length > 200) throw new Error('La recherche est limitée à 200 caractères.');
  if (!root.trim()) throw new Error('Choisissez d’abord un dossier.');

  await invoke('allow_directory_access', { path: root, recursive: true });
  const { readDir, readTextFile, stat } = await import('@tauri-apps/plugin-fs');
  const queue: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }];
  const hits: FolderSearchHit[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;
  let directoriesSkipped = 0;
  let directoriesVisited = 0;
  let entriesVisited = 0;
  let totalBytesRead = 0;
  let truncated = false;

  while (queue.length) {
    if (signal?.aborted) throw new Error('Recherche annulée.');
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
      if (signal?.aborted) throw new Error('Recherche annulée.');
      entriesVisited += 1;
      if (entriesVisited % 100 === 0) {
        onProgress?.({ directoriesVisited, filesScanned, matchesFound: hits.length });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      const childPath = joinPath(directory.path, entry.name);
      if (entry.isDirectory) {
        if (directory.depth < MAX_DEPTH && !IGNORED_DIRECTORIES.has(entry.name.toLocaleLowerCase('en-US'))) {
          queue.push({ path: childPath, depth: directory.depth + 1 });
        } else directoriesSkipped += 1;
        continue;
      }
      if (!entry.isFile || !SEARCHABLE_KINDS.has(getFileKind(entry.name))) continue;
      if (filesScanned >= MAX_FILES || hits.length >= MAX_RESULTS || totalBytesRead >= MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      filesScanned += 1;
      try {
        const metadata = await stat(childPath);
        if (!Number.isFinite(metadata.size) || metadata.size > MAX_FILE_BYTES || totalBytesRead + metadata.size > MAX_TOTAL_BYTES) {
          filesSkipped += 1;
          continue;
        }
        const content = await readTextFile(childPath);
        totalBytesRead += metadata.size;
        const hit = searchFolderFile(entry.name, childPath, content, trimmedQuery);
        if (hit) hits.push(hit);
      } catch {
        filesSkipped += 1;
      }
      if (filesScanned % 20 === 0) {
        onProgress?.({ directoriesVisited, filesScanned, matchesFound: hits.length });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    onProgress?.({ directoriesVisited, filesScanned, matchesFound: hits.length });
    if (truncated) break;
  }

  return { hits, filesScanned, filesSkipped, directoriesSkipped, truncated };
}

function joinPath(parent: string, name: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${name}`;
}
