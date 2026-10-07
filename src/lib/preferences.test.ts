import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPreferences, savePreferences, upsertRecent, type RecentFile } from './preferences';

const KEY = 'noto.preferences.v1';
let stored: Record<string, string>;

beforeEach(() => {
  stored = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored[key] ?? null,
    setItem: (key: string, value: string) => { stored[key] = value; },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('preferences', () => {
  it('provides safe defaults when no settings are stored', () => {
    const preferences = loadPreferences();
    expect(preferences.theme).toBe('light');
    expect(preferences.accent).toBe('violet');
    expect(preferences.toolbarOrder).toEqual(['search', 'edit', 'save', 'group', 'close']);
    expect(preferences.hiddenToolbarActions).toEqual([]);
    expect(preferences.restoreSession).toBe(false);
    expect(preferences.recentLimit).toBe(8);
    expect(preferences.hidePaths).toBe(false);
    expect(preferences.draftRecoveryEnabled).toBe(false);
    expect(preferences.draftRetentionDays).toBe(7);
  });

  it('normalizes toolbar order, hidden actions, and accent choices', () => {
    stored[KEY] = JSON.stringify({
      theme: 'dark',
      accent: 'mint',
      toolbarOrder: ['close', 'search', 'close', 'unknown'],
      hiddenToolbarActions: ['save', 'save', 'bad'],
      compactToolbar: true,
      sidebarCollapsed: true,
      recentLimit: 12,
      hidePaths: true,
      draftRecoveryEnabled: true,
      draftRetentionDays: 30,
    });
    const preferences = loadPreferences();
    expect(preferences).toMatchObject({ theme: 'dark', accent: 'mint', compactToolbar: true, sidebarCollapsed: true, recentLimit: 12, hidePaths: true, draftRecoveryEnabled: true, draftRetentionDays: 30 });
    expect(preferences.toolbarOrder).toEqual(['close', 'search', 'edit', 'save', 'group']);
    expect(preferences.hiddenToolbarActions).toEqual(['save']);
  });

  it('preserves a pinned recent item when it is reopened', () => {
    const original: RecentFile = { id: 'desktop:/notes.md', name: 'notes.md', path: '/notes.md', kind: 'markdown', lastOpened: 1, pinned: true };
    const updated = upsertRecent([original], { ...original, lastOpened: 2, pinned: undefined });
    expect(updated[0]).toMatchObject({ id: original.id, lastOpened: 2, pinned: true });
  });

  it('applies a user-selected recent-file limit', () => {
    const files: RecentFile[] = Array.from({ length: 7 }, (_, index) => ({
      id: `file-${index}`, name: `file-${index}.txt`, path: `/file-${index}.txt`, kind: 'text', lastOpened: index,
    }));
    expect(upsertRecent(files, { ...files[0], lastOpened: 20 }, 4)).toHaveLength(4);
  });

  it('recovers from corrupt storage and persists new settings', () => {
    stored[KEY] = '{not json';
    expect(loadPreferences().theme).toBe('light');
    const preferences = loadPreferences();
    preferences.theme = 'dark';
    savePreferences(preferences);
    expect(JSON.parse(stored[KEY]).theme).toBe('dark');
  });
});
