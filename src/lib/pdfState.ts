export interface PdfLocalState {
  lastPage: number;
  bookmarks: number[];
}

const DEFAULT_STATE: PdfLocalState = { lastPage: 1, bookmarks: [] };
const MAX_BOOKMARKS = 100;

export function pdfStateKey(identifier: string): string {
  // Keep paths out of the localStorage key while remaining stable across app restarts.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < identifier.length; index += 1) {
    const code = identifier.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `noto.pdf-state.v1:${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function normalizePdfLocalState(value: unknown, pageCount = Number.MAX_SAFE_INTEGER): PdfLocalState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_STATE, bookmarks: [] };
  const record = value as { lastPage?: unknown; bookmarks?: unknown };
  const lastPage = typeof record.lastPage === 'number' && Number.isFinite(record.lastPage)
    ? clampPage(record.lastPage, pageCount)
    : 1;
  const bookmarks = Array.isArray(record.bookmarks)
    ? [...new Set(record.bookmarks.filter((page): page is number => typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= pageCount))]
      .sort((left, right) => left - right)
      .slice(0, MAX_BOOKMARKS)
    : [];
  return { lastPage, bookmarks };
}

export function readPdfLocalState(identifier: string, storage?: Pick<Storage, 'getItem'>): PdfLocalState {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    if (!store) return { ...DEFAULT_STATE, bookmarks: [] };
    return normalizePdfLocalState(JSON.parse(store.getItem(pdfStateKey(identifier)) ?? 'null'));
  } catch {
    return { ...DEFAULT_STATE, bookmarks: [] };
  }
}

function clampPage(value: number, pageCount: number): number {
  const safeCount = Number.isFinite(pageCount) ? Math.max(1, Math.floor(pageCount)) : Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.min(safeCount, Math.floor(value)));
}

export function writePdfLocalState(identifier: string, state: PdfLocalState, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    if (!store) return;
    store.setItem(pdfStateKey(identifier), JSON.stringify(normalizePdfLocalState(state)));
  } catch {
    // PDF position and bookmarks are convenience data; a full/private storage must not block reading.
  }
}
