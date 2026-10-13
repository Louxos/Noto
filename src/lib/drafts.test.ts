import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalDrafts, findLocalDraft, loadLocalDrafts, normalizeLocalDrafts, removeLocalDraft, saveLocalDraft } from './drafts';
import type { OpenDocument } from '../types';

let store: Record<string, string>;
beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
});
afterEach(() => vi.unstubAllGlobals());

function document(content: string, id = 'tab-1'): OpenDocument {
  return { id, name: 'notes.txt', path: '/notes.txt', extension: 'txt', kind: 'text', content, savedContent: '', size: 10, modifiedAt: 100, truncated: false, source: 'desktop', mimeType: 'text/plain' };
}

describe('local recovery drafts', () => {
  it('stores only a bounded local draft and retrieves it by source and path', () => {
    const doc = document('unfinished notes');
    const now = Date.now();
    saveLocalDraft(doc, 7, now);
    expect(findLocalDraft({ ...doc, id: 'new-tab' }, 7)?.content).toBe('unfinished notes');
    expect(JSON.stringify(loadLocalDrafts(7, now))).not.toContain('savedContent');
  });

  it('expires drafts and rejects malformed records', () => {
    const now = 10 * 24 * 60 * 60 * 1_000;
    const value = [
      { ...document('old'), savedAt: 0 },
      { ...document('valid'), savedAt: now },
      { ...document('bad'), source: 'remote', savedAt: now },
    ];
    expect(normalizeLocalDrafts(value, now, 1).map((draft) => draft.content)).toEqual(['valid']);
  });

  it('enforces the aggregate storage cap and removes a selected draft', () => {
    const now = Date.now();
    const drafts = ['/a.txt', '/b.txt', '/c.txt'].map((path, index) => ({
      ...document(String(index).repeat(600_000)),
      path,
      name: path.slice(1),
    }));
    drafts.forEach((draft) => saveLocalDraft(draft, 7, now));
    const bounded = loadLocalDrafts(7, now);
    expect(bounded).toHaveLength(2);
    expect(bounded.reduce((total, draft) => total + draft.content.length, 0)).toBeLessThanOrEqual(1_500_000);
    removeLocalDraft(bounded[0]);
    expect(loadLocalDrafts(7, now)).toHaveLength(1);
  });

  it('signals when a draft is too large and clears local recovery data', () => {
    const large = document('x'.repeat(750_001));
    expect(() => saveLocalDraft(large, 7, 1_000)).toThrow('ne peut pas être récupéré');
    saveLocalDraft(document('draft'), 7, 1_000);
    clearLocalDrafts();
    expect(loadLocalDrafts()).toEqual([]);
  });
});
