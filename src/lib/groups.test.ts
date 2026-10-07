import { describe, expect, it } from 'vitest';
import { addGroupFile, createGroup, deleteGroup, duplicateGroup, normalizeGroups, removeGroupFile, removeGroupFiles, renameGroup, toggleGroupFile, type FileGroup } from './groups';
import type { RecentFile } from './preferences';

const sampleFile: RecentFile = {
  id: 'desktop:C:/notes/readme.md',
  name: 'readme.md',
  path: 'C:/notes/readme.md',
  kind: 'markdown',
  lastOpened: 123,
  source: 'desktop',
};

function group(id = 'g1'): FileGroup {
  return { id, name: 'Projet', color: 'violet', files: [], createdAt: 1 };
}

describe('file groups', () => {
  it('creates a trimmed group and rejects an empty name', () => {
    expect(createGroup('  Mes notes  ', 'blue', 'g1')).toMatchObject({ id: 'g1', name: 'Mes notes', color: 'blue', files: [] });
    expect(createGroup('   ', 'blue', 'g2')).toBeNull();
  });

  it('duplicates group metadata without moving or copying file contents', () => {
    const source = { ...group(), files: [sampleFile] };
    const duplicated = duplicateGroup([source], source.id);
    expect(duplicated).toHaveLength(2);
    expect(duplicated[0].id).not.toBe(source.id);
    expect(duplicated[0].name).toBe('Projet (copie)');
    expect(duplicated[0].files).toEqual([sampleFile]);
  });

  it('renames and deletes only the requested group', () => {
    const groups = [group('g1'), group('g2')];
    expect(renameGroup(groups, 'g2', '  Archive  ')[1].name).toBe('Archive');
    expect(deleteGroup(groups, 'g1').map((item) => item.id)).toEqual(['g2']);
  });

  it('toggles a file without duplicates and can remove it', () => {
    const first = toggleGroupFile([group()], 'g1', sampleFile);
    const second = toggleGroupFile(first, 'g1', sampleFile);
    expect(first[0].files).toHaveLength(1);
    expect(second[0].files).toHaveLength(0);
    expect(removeGroupFile(first, 'g1', sampleFile.id)[0].files).toHaveLength(0);
  });

  it('removes several selected memberships without deleting the originals', () => {
    const secondFile = { ...sampleFile, id: 'desktop:C:/notes/second.md', name: 'second.md' };
    const groups = [{ ...group(), files: [sampleFile, secondFile] }];
    const updated = removeGroupFiles(groups, 'g1', [sampleFile.id, secondFile.id]);
    expect(updated[0].files).toEqual([]);
    expect(groups[0].files).toHaveLength(2);
  });

  it('adds files idempotently when opening several files into a group', () => {
    const first = addGroupFile([group()], 'g1', sampleFile);
    const second = addGroupFile(first, 'g1', { ...sampleFile, lastOpened: 456 });
    expect(second[0].files).toHaveLength(1);
    expect(second[0].files[0].lastOpened).toBe(456);
  });

  it('sanitizes stored group metadata and de-duplicates memberships', () => {
    const normalized = normalizeGroups([{
      ...group(),
      color: 'not-a-color',
      files: [sampleFile, sampleFile, { id: '', name: 'invalid' }],
    }]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].color).toBe('violet');
    expect(normalized[0].files).toEqual([sampleFile]);
    expect(normalizeGroups([{ id: 'bad', name: '   ' }])).toEqual([]);
  });
});
