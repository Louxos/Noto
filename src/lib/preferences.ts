export type Theme = 'light' | 'dark';

export interface Preferences {
  theme: Theme;
  textSize: number;
  editorSize: number;
  lineNumbers: boolean;
  wordWrap: boolean;
}

export interface RecentFile {
  id: string;
  name: string;
  path: string;
  kind: string;
  lastOpened: number;
  source?: 'browser' | 'desktop';
}

const PREFERENCES_KEY = 'noto.preferences.v1';
const RECENTS_KEY = 'noto.recents.v1';

export const defaultPreferences: Preferences = {
  theme: 'light',
  textSize: 16,
  editorSize: 14,
  lineNumbers: true,
  wordWrap: false,
};

export function loadPreferences(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<Preferences>;
    return {
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      textSize: clampNumber(parsed.textSize, 14, 20, defaultPreferences.textSize),
      editorSize: clampNumber(parsed.editorSize, 12, 20, defaultPreferences.editorSize),
      lineNumbers: parsed.lineNumbers ?? defaultPreferences.lineNumbers,
      wordWrap: parsed.wordWrap ?? defaultPreferences.wordWrap,
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function loadRecentFiles(): RecentFile[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as RecentFile[];
    return Array.isArray(value) ? value.filter((item) => item && item.id && item.name).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function saveRecentFiles(files: RecentFile[]): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(files.slice(0, 8)));
}

export function upsertRecent(files: RecentFile[], next: RecentFile): RecentFile[] {
  return [next, ...files.filter((item) => item.id !== next.id)].slice(0, 8);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
