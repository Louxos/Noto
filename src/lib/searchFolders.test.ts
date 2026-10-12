import { describe, expect, it } from 'vitest';
import { loadPinnedSearchFolders, normalizePinnedSearchFolders, savePinnedSearchFolders, togglePinnedSearchFolder } from './searchFolders';

describe('pinned local search folders', () => {
  it('normalizes, de-duplicates, and limits paths without storing file content', () => {
    const folders = normalizePinnedSearchFolders([
      { path: 'C:\\Work\\Docs', name: 'Docs' },
      { path: 'c:\\work\\docs', name: 'Duplicate' },
      { path: '/home/user/Project' },
      null,
    ]);
    expect(folders).toEqual([{ path: 'C:\\Work\\Docs', name: 'Docs' }, { path: '/home/user/Project', name: 'Project' }]);
  });

  it('toggles a path by explicit user request', () => {
    const once = togglePinnedSearchFolder([], '/home/user/docs');
    expect(once[0]).toEqual({ path: '/home/user/docs', name: 'docs' });
    expect(togglePinnedSearchFolder(once, '/HOME/USER/DOCS')).toEqual([]);
  });

  it('round-trips through local storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    savePinnedSearchFolders([{ path: '/work', name: 'work' }], storage);
    expect(loadPinnedSearchFolders(storage)).toEqual([{ path: '/work', name: 'work' }]);
  });
});
