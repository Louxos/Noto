import { describe, expect, it } from 'vitest';
import {
  addPage,
  addSection,
  createNotebookManifest,
  createPageRecord,
  createSectionRecord,
  normalizeNotebookManifest,
  removeNotebookPageTree,
  removeNotebookSection,
  renameNotebookPage,
} from './notebookModel';

function sample() {
  const manifest = createNotebookManifest('Cours', 'notebook-1', 10);
  const section = manifest.sections[0]!;
  const page = createPageRecord('Première page', manifest, section.id, null, 'page-0001', 20);
  const withPage = addPage(manifest, page, 20);
  const child = createPageRecord('Sous-page', withPage, section.id, page.id, 'page-0002', 30);
  return { manifest: addPage(withPage, child, 30), section, page, child };
}

describe('notebook model', () => {
  it('creates readable Markdown paths contained inside a section folder', () => {
    const manifest = createNotebookManifest('Cours', 'book', 1);
    const page = createPageRecord('Révision – été 2026', manifest, manifest.sections[0]!.id, null, 'page-12345678', 2);
    expect(page.relativePath).toMatch(/^sections\/[a-zA-Z0-9-]+\/revision-ete-2026-page12345678\.md$/);
    expect(page.relativePath.endsWith('.md')).toBe(true);
  });

  it('normalizes an existing valid manifest and rejects paths escaping the notebook', () => {
    const { manifest, page } = sample();
    expect(normalizeNotebookManifest(manifest)).toEqual(manifest);
    expect(() => normalizeNotebookManifest({
      ...manifest,
      pages: [{ ...page, relativePath: 'sections/../../outside.md' }],
    })).toThrow(/chemin.*invalide/i);
  });

  it('rejects unsafe record ids and two pages pointing to the same Markdown file', () => {
    const { manifest, section, page, child } = sample();
    expect(() => normalizeNotebookManifest({
      ...manifest,
      sections: [{ ...section, id: '../outside' }],
      pages: [],
    })).toThrow(/section.*invalide/i);
    expect(() => normalizeNotebookManifest({
      ...manifest,
      pages: [page, { ...child, parentId: null, relativePath: page.relativePath }],
    })).toThrow(/chemin.*partagé/i);
  });

  it('rejects cross-section parents and cyclic page hierarchies', () => {
    const { manifest, page, child } = sample();
    const other = createSectionRecord('Autre section', manifest, 'section-2', 40);
    const withSection = addSection(manifest, other, 40);
    expect(() => createPageRecord('Mauvais parent', withSection, other.id, page.id, 'page-3', 50)).toThrow(/parent/i);
    expect(() => normalizeNotebookManifest({
      ...manifest,
      pages: [
        { ...page, parentId: child.id },
        { ...child, parentId: page.id },
      ],
    })).toThrow(/boucle/i);
  });

  it('renames page metadata without changing its on-disk path', () => {
    const { manifest, page } = sample();
    const renamed = renameNotebookPage(manifest, page.id, 'Leçon 1', 100);
    expect(renamed.pages.find((item) => item.id === page.id)?.title).toBe('Leçon 1');
    expect(renamed.pages.find((item) => item.id === page.id)?.relativePath).toBe(page.relativePath);
  });

  it('removes a page and all its descendants while preserving unrelated pages', () => {
    const { manifest, section, page, child } = sample();
    const unrelated = createPageRecord('À part', manifest, section.id, null, 'page-0003', 40);
    const extended = addPage(manifest, unrelated, 40);
    const result = removeNotebookPageTree(extended, page.id, 50);
    expect(result.removed.map((item) => item.id)).toEqual([page.id, child.id]);
    expect(result.manifest.pages.map((item) => item.id)).toEqual([unrelated.id]);
  });

  it('removes all pages in a section but leaves pages in other sections', () => {
    const { manifest, section } = sample();
    const other = createSectionRecord('Autre', manifest, 'section-2', 40);
    const withSection = addSection(manifest, other, 40);
    const otherPage = createPageRecord('Autre page', withSection, other.id, null, 'page-0003', 50);
    const result = removeNotebookSection(addPage(withSection, otherPage, 50), section.id, 60);
    expect(result.removed).toHaveLength(2);
    expect(result.manifest.sections.map((item) => item.id)).toEqual([other.id]);
    expect(result.manifest.pages.map((item) => item.id)).toEqual([otherPage.id]);
  });
});
