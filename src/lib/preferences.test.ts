import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPreferences, savePreferences } from './preferences';

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
  });

  it('normalizes toolbar order, hidden actions, and accent choices', () => {
    stored[KEY] = JSON.stringify({
      theme: 'dark',
      accent: 'mint',
      toolbarOrder: ['close', 'search', 'close', 'unknown'],
      hiddenToolbarActions: ['save', 'save', 'bad'],
      compactToolbar: true,
      sidebarCollapsed: true,
    });
    const preferences = loadPreferences();
    expect(preferences).toMatchObject({ theme: 'dark', accent: 'mint', compactToolbar: true, sidebarCollapsed: true });
    expect(preferences.toolbarOrder).toEqual(['close', 'search', 'edit', 'save', 'group']);
    expect(preferences.hiddenToolbarActions).toEqual(['save']);
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
