import { describe, expect, it } from 'vitest';
import { searchFolderFile } from './folderSearch';

describe('searchFolderFile', () => {
  it('returns the first content match with a line preview', () => {
    expect(searchFolderFile('readme.md', '/docs/readme.md', 'Alpha\nNoto keeps files local\nOmega', 'LOCAL')).toMatchObject({
      path: '/docs/readme.md', name: 'readme.md', line: 2, matches: 1, preview: 'Noto keeps files local',
    });
  });

  it('finds a filename even if its content does not match', () => {
    expect(searchFolderFile('noto-config.json', '/docs/noto-config.json', '{"enabled":true}', 'noto')).toMatchObject({
      line: null, matches: 0, preview: 'Le nom du fichier correspond à la recherche.',
    });
  });

  it('caps long previews so one-line files cannot bloat the results panel', () => {
    const hit = searchFolderFile('long.txt', '/docs/long.txt', `${'x'.repeat(800)}needle${'x'.repeat(800)}`, 'needle');
    expect(hit?.preview.length).toBe(240);
  });

  it('returns null for non-matching or empty queries', () => {
    expect(searchFolderFile('readme.md', '/docs/readme.md', 'Nothing here', 'missing')).toBeNull();
    expect(searchFolderFile('readme.md', '/docs/readme.md', 'Anything', '   ')).toBeNull();
  });
});
