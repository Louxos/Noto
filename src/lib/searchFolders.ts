export interface PinnedSearchFolder {
  path: string;
  name: string;
}

const SEARCH_FOLDERS_KEY = 'noto.search-folders.v1';
const MAX_PINNED_FOLDERS = 10;

export function normalizePinnedSearchFolders(value: unknown): PinnedSearchFolder[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, PinnedSearchFolder>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<PinnedSearchFolder>;
    if (typeof candidate.path !== 'string' || !candidate.path.trim()) continue;
    const path = candidate.path.trim();
    const name = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : folderName(path);
    const key = path.toLocaleLowerCase('en-US');
    if (!unique.has(key)) unique.set(key, { path, name });
  }
  return [...unique.values()].slice(0, MAX_PINNED_FOLDERS);
}

export function loadPinnedSearchFolders(storage?: Pick<Storage, 'getItem'>): PinnedSearchFolder[] {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    if (!store) return [];
    return normalizePinnedSearchFolders(JSON.parse(store.getItem(SEARCH_FOLDERS_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function savePinnedSearchFolders(folders: PinnedSearchFolder[], storage?: Pick<Storage, 'setItem'>): void {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    if (!store) return;
    store.setItem(SEARCH_FOLDERS_KEY, JSON.stringify(normalizePinnedSearchFolders(folders)));
  } catch {
    // Pinned locations are optional local conveniences.
  }
}

export function togglePinnedSearchFolder(folders: PinnedSearchFolder[], path: string): PinnedSearchFolder[] {
  const normalizedPath = path.trim();
  if (!normalizedPath) return normalizePinnedSearchFolders(folders);
  const exists = folders.some((folder) => folder.path.toLocaleLowerCase('en-US') === normalizedPath.toLocaleLowerCase('en-US'));
  if (exists) return folders.filter((folder) => folder.path.toLocaleLowerCase('en-US') !== normalizedPath.toLocaleLowerCase('en-US'));
  return normalizePinnedSearchFolders([{ path: normalizedPath, name: folderName(normalizedPath) }, ...folders]);
}

function folderName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || path;
}
