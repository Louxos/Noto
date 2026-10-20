// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { collectFileStats, pdfStatGroup, statRowsToMarkdown } from './fileAnalysis';
import type { OpenDocument } from '../types';

function document(partial: Partial<OpenDocument> & Pick<OpenDocument, 'kind'>): OpenDocument {
  return {
    id: `test:${partial.name ?? 'fichier'}`,
    source: 'desktop',
    name: partial.name ?? 'fichier.txt',
    path: partial.path ?? 'C:\\docs\\fichier.txt',
    extension: partial.extension ?? 'txt',
    mimeType: partial.mimeType ?? 'text/plain',
    content: partial.content ?? '',
    savedContent: partial.content ?? '',
    size: partial.size ?? 0,
    modifiedAt: Date.UTC(2026, 0, 2),
    truncated: false,
    ...partial,
  } as OpenDocument;
}

describe('mesures complètes d’un fichier ouvert', () => {
  it('mesure un fichier texte et ajoute le relevé du lecteur', async () => {
    const file = document({ kind: 'code', name: 'app.ts', extension: 'ts', content: 'const a = 1;\nconst b = 2;\n', size: 26 });
    const groups = await collectFileStats(file, [{ label: 'Lignes affichées', value: '2' }]);
    expect(groups.map((group) => group.id)).toEqual(['file', 'text', 'viewer']);
    expect(groups[1]?.rows.find((row) => row.label === 'Lignes')?.value).toBe('3');
    expect(statRowsToMarkdown(file, groups)).toContain('# Informations sur app.ts');
  });

  it('mesure un tableau plutôt que de compter ses caractères', async () => {
    const file = document({ kind: 'csv', name: 'ventes.csv', extension: 'csv', content: 'nom;prix\nAda;10\nAlan;20\n' });
    const groups = await collectFileStats(file);
    expect(groups.map((group) => group.id)).toEqual(['file', 'table']);
    expect(groups[1]?.rows.find((row) => row.label === 'Lignes')?.value).toBe('2');
  });

  it('ne remplace jamais une mesure impossible par une valeur inventée', async () => {
    const broken = document({ kind: 'pdf', name: 'abime.pdf', extension: 'pdf', bytes: new Uint8Array([1, 2, 3, 4]) });
    const groups = await collectFileStats(broken);
    const pdfGroup = groups.find((group) => group.id === 'pdf');
    expect(pdfGroup?.rows).toEqual([]);
    expect(pdfGroup?.note).toContain('n’a pas pu être analysé');
  });

  it('décrit une mesure PDF impossible sans faire échouer le reste', async () => {
    expect((await pdfStatGroup(new Uint8Array(0))).note).toContain('Aucune donnée');
    const huge = await pdfStatGroup(new Uint8Array(200 * 1024 * 1024 + 1));
    expect(huge.rows).toEqual([]);
    expect(huge.note).toContain('ne sont pas calculées');
  });

  it('mesure une image à partir de son en-tête réel', async () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(bytes.buffer).setUint32(16, 1920);
    new DataView(bytes.buffer).setUint32(20, 1080);
    const file = document({ kind: 'image', name: 'photo.png', extension: 'png', mimeType: 'image/png', bytes, size: bytes.length });
    const group = (await collectFileStats(file)).find((item) => item.id === 'image');
    const value = (label: string) => group?.rows.find((row) => row.label === label)?.value;
    expect(value('Dimensions')).toBe('1920 × 1080 px');
    expect(value('Pixels')).toBe((1920 * 1080).toLocaleString('fr-FR'));
    expect(value('Format')).toBe('PNG');
  });

  it('lit les dimensions déclarées d’un SVG, sans les deviner', async () => {
    const svg = document({ kind: 'image', name: 'logo.svg', extension: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>', size: 68 });
    const group = (await collectFileStats(svg)).find((item) => item.id === 'image');
    expect(group?.rows.find((row) => row.label === 'Dimensions du dessin')?.value).toBe('64 × 64 px');
    const sansTaille = document({ kind: 'image', name: 'libre.svg', extension: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', size: 40 });
    const autre = (await collectFileStats(sansTaille)).find((item) => item.id === 'image');
    expect(autre?.rows.some((row) => row.label === 'Dimensions du dessin')).toBe(false);
    expect(autre?.note).toContain('s’adapte');
  });
});
