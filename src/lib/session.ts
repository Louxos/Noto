import type { OpenDocument } from '../types';

export interface SavedSessionFile {
  path: string;
  name: string;
}

export type SavedSessionPage = 'file' | 'group' | 'home';

export interface DesktopSessionState {
  files: SavedSessionFile[];
  activePath: string | null;
  activeGroupId: string | null;
  page: SavedSessionPage;
}

const SESSION_KEY = 'noto.session.v1';
const MAX_SESSION_FILES = 24;

export function loadDesktopSessionState(): DesktopSessionState {
  const empty: DesktopSessionState = { files: [], activePath: null, activeGroupId: null, page: 'home' };
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '[]') as unknown;
    const entries = Array.isArray(value)
      ? value
      : value && typeof value === 'object' && Array.isArray((value as { files?: unknown }).files)
        ? (value as { files: unknown[] }).files
        : [];
    const files = entries.flatMap((entry): SavedSessionFile[] => {
      if (!entry || typeof entry !== 'object') return [];
      const candidate = entry as Partial<SavedSessionFile>;
      if (typeof candidate.path !== 'string' || !candidate.path || typeof candidate.name !== 'string') return [];
      return [{ path: candidate.path.slice(0, 4_096), name: candidate.name.slice(0, 260) }];
    }).slice(0, MAX_SESSION_FILES);
    const state = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Partial<DesktopSessionState>
      : {};
    return {
      files,
      activePath: typeof state.activePath === 'string' ? state.activePath.slice(0, 4_096) : null,
      activeGroupId: typeof state.activeGroupId === 'string' ? state.activeGroupId.slice(0, 128) : null,
      page: state.page === 'file' || state.page === 'group' ? state.page : 'home',
    };
  } catch {
    return empty;
  }
}

export function loadDesktopSession(): SavedSessionFile[] {
  return loadDesktopSessionState().files;
}

export function saveDesktopSession(documents: OpenDocument[], context: { activeId?: string | null; activeGroupId?: string | null; page?: SavedSessionPage } = {}): void {
  try {
    const desktopDocuments = documents.filter((document) => document.source === 'desktop').slice(0, MAX_SESSION_FILES);
    const files = desktopDocuments.map(({ path, name }) => ({ path, name }));
    const activeDocument = desktopDocuments.find((document) => document.id === context.activeId);
    if (files.length || context.activeGroupId) {
      const state: DesktopSessionState = {
        files,
        activePath: activeDocument?.path ?? null,
        activeGroupId: context.activeGroupId ?? null,
        page: context.page === 'file' || context.page === 'group' ? context.page : 'home',
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Session recovery is opt-in and best-effort; it never stores document contents.
  }
}

export function clearDesktopSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* Best-effort cleanup. */ }
}
