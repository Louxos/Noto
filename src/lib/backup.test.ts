import { describe, expect, it } from 'vitest';
import { createLocalBackup, parseLocalBackup } from './backup';
import { defaultPreferences } from './preferences';

const exportedAt = new Date('2026-10-06T12:00:00.000Z');

describe('local settings backups', () => {
  it('round-trips groups and preferences without document contents', () => {
    const groups = [{
      id: 'group-1', name: 'À lire', color: 'mint' as const, createdAt: 1,
      files: [{ id: 'desktop:/tmp/note.md', name: 'note.md', path: '/tmp/note.md', kind: 'markdown', lastOpened: 1, source: 'desktop' as const }],
    }];
    const backup = createLocalBackup(groups, { ...defaultPreferences, theme: 'dark' }, exportedAt);
    const parsed = parseLocalBackup(JSON.stringify(backup));
    expect(parsed.groups[0].name).toBe('À lire');
    expect(parsed.preferences.theme).toBe('dark');
    expect(JSON.stringify(backup)).not.toContain('document contents');
  });

  it('rejects unsupported backup files and oversized data', () => {
    expect(() => parseLocalBackup('{"format":"other","version":1,"groups":[]}')).toThrow(/pas reconnue/);
    expect(() => parseLocalBackup('x'.repeat(2_000_001))).toThrow(/taille/);
  });
});
