import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDesktopSession, loadDesktopSession, loadDesktopSessionState, saveDesktopSession } from './session';
import type { OpenDocument } from '../types';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

afterEach(() => { storage.clear(); });

describe('opt-in desktop session paths', () => {
  it('stores paths only and restores a bounded list', () => {
    const document = { id: 'desktop-tab', path: '/notes/a.md', name: 'a.md', source: 'desktop', content: 'secret text' } as OpenDocument;
    const browserDocument = { ...document, id: 'browser-tab', path: 'browser.md', source: 'browser' } as OpenDocument;
    saveDesktopSession([document, browserDocument], { activeId: 'desktop-tab', activeGroupId: 'group-1', page: 'group' });
    expect(loadDesktopSession()).toEqual([{ path: '/notes/a.md', name: 'a.md' }]);
    expect(loadDesktopSessionState()).toMatchObject({ activePath: '/notes/a.md', activeGroupId: 'group-1', page: 'group' });
    expect([...storage.values()].join(' ')).not.toContain('secret text');
  });

  it('migrates an older path-list-only session format', () => {
    storage.set('noto.session.v1', JSON.stringify([{ path: '/legacy.md', name: 'legacy.md' }]));
    expect(loadDesktopSessionState()).toMatchObject({ files: [{ path: '/legacy.md', name: 'legacy.md' }], page: 'home', activePath: null });
  });

  it('clears session paths when disabled', () => {
    saveDesktopSession([{ path: '/notes/a.md', name: 'a.md', source: 'desktop' } as OpenDocument]);
    clearDesktopSession();
    expect(loadDesktopSession()).toEqual([]);
  });
});
