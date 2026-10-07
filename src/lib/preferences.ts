export type Theme = 'light' | 'dark';
export type AccentColor = 'violet' | 'blue' | 'mint' | 'rose';
export type ToolbarAction = 'search' | 'edit' | 'save' | 'group' | 'close';
export type RecentLimit = 4 | 8 | 12 | 20;
export type DraftRetentionDays = 1 | 7 | 30;

export interface Preferences {
  theme: Theme;
  accent: AccentColor;
  textSize: number;
  editorSize: number;
  lineNumbers: boolean;
  wordWrap: boolean;
  compactToolbar: boolean;
  sidebarCollapsed: boolean;
  restoreSession: boolean;
  recentLimit: RecentLimit;
  hidePaths: boolean;
  draftRecoveryEnabled: boolean;
  draftRetentionDays: DraftRetentionDays;
  toolbarOrder: ToolbarAction[];
  hiddenToolbarActions: ToolbarAction[];
}

export interface RecentFile {
  id: string;
  name: string;
  path: string;
  kind: string;
  lastOpened: number;
  pinned?: boolean;
  source?: 'browser' | 'desktop';
}

export const TOOLBAR_ACTIONS: ToolbarAction[] = ['search', 'edit', 'save', 'group', 'close'];
const PREFERENCES_KEY = 'noto.preferences.v1';
const RECENTS_KEY = 'noto.recents.v1';

export const defaultPreferences: Preferences = {
  theme: 'light',
  accent: 'violet',
  textSize: 16,
  editorSize: 14,
  lineNumbers: true,
  wordWrap: false,
  compactToolbar: false,
  sidebarCollapsed: false,
  restoreSession: false,
  recentLimit: 8,
  hidePaths: false,
  draftRecoveryEnabled: false,
  draftRetentionDays: 7,
  toolbarOrder: [...TOOLBAR_ACTIONS],
  hiddenToolbarActions: [],
};

export function loadPreferences(): Preferences {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}'));
  } catch {
    return { ...defaultPreferences, toolbarOrder: [...TOOLBAR_ACTIONS], hiddenToolbarActions: [] };
  }
}

export function normalizePreferences(value: unknown): Preferences {
  const parsed = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  const order = normalizeToolbarList(parsed.toolbarOrder);
  const hidden = normalizeToolbarList(parsed.hiddenToolbarActions);
  return {
    theme: parsed.theme === 'dark' ? 'dark' : 'light',
    accent: parsed.accent === 'blue' || parsed.accent === 'mint' || parsed.accent === 'rose' ? parsed.accent : 'violet',
    textSize: clampNumber(parsed.textSize, 14, 20, defaultPreferences.textSize),
    editorSize: clampNumber(parsed.editorSize, 12, 20, defaultPreferences.editorSize),
    lineNumbers: typeof parsed.lineNumbers === 'boolean' ? parsed.lineNumbers : defaultPreferences.lineNumbers,
    wordWrap: typeof parsed.wordWrap === 'boolean' ? parsed.wordWrap : defaultPreferences.wordWrap,
    compactToolbar: parsed.compactToolbar === true,
    sidebarCollapsed: parsed.sidebarCollapsed === true,
    restoreSession: parsed.restoreSession === true,
    recentLimit: parsed.recentLimit === 4 || parsed.recentLimit === 12 || parsed.recentLimit === 20 ? parsed.recentLimit : 8,
    hidePaths: parsed.hidePaths === true,
    draftRecoveryEnabled: parsed.draftRecoveryEnabled === true,
    draftRetentionDays: parsed.draftRetentionDays === 1 || parsed.draftRetentionDays === 30 ? parsed.draftRetentionDays : 7,
    toolbarOrder: [...order, ...TOOLBAR_ACTIONS.filter((action) => !order.includes(action))],
    hiddenToolbarActions: hidden,
  };
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are best-effort; private browsing or full storage must not block the app.
  }
}

export function loadRecentFiles(limit: RecentLimit = 8): RecentFile[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as RecentFile[];
    return Array.isArray(value) ? value.filter((item) => item && item.id && item.name).slice(0, limit) : [];
  } catch {
    return [];
  }
}

export function saveRecentFiles(files: RecentFile[], limit: RecentLimit = 8): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(files.slice(0, limit)));
  } catch {
    // Recents do not contain file contents and are only a convenience.
  }
}

export function upsertRecent(files: RecentFile[], next: RecentFile, limit: RecentLimit = 8): RecentFile[] {
  const existing = files.find((item) => item.id === next.id);
  return [{ ...next, pinned: next.pinned ?? existing?.pinned ?? false }, ...files.filter((item) => item.id !== next.id)].slice(0, limit);
}

function normalizeToolbarList(value: unknown): ToolbarAction[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((action): action is ToolbarAction => TOOLBAR_ACTIONS.includes(action as ToolbarAction)))];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
