import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { analyzeFile, buildRenamePlan, filterFileList, findExactDuplicates, findSimilarNames, nameSignature } from './analysis';

function analyzed(name: string, content: string, id = name) {
  return analyzeFile({ id, name, format: 'txt', bytes: strToU8(content) });
}

function imageFile(name: string, content: string, format: 'png' | 'jpeg' = 'png') {
  return analyzeFile({ id: name, name, format, bytes: strToU8(content) });
}

describe('analyse des lots de fichiers', () => {
  it('repère les doublons réellement identiques par empreinte SHA-256', () => {
    const files = [
      analyzed('rapport.pdf', 'contenu identique', 'a'),
      analyzed('copie.pdf', 'contenu identique', 'b'),
      analyzed('autre.pdf', 'contenu différent', 'c'),
    ];
    const groups = findExactDuplicates(files);
    expect(groups).toHaveLength(1);
    expect(groups[0].files.map((file) => file.name)).toEqual(['copie.pdf', 'rapport.pdf']);
    expect(groups[0].reclaimableBytes).toBe(strToU8('contenu identique').length);
  });

  it('ne signale aucun doublon quand tous les contenus diffèrent', () => {
    expect(findExactDuplicates([analyzed('a.txt', '1'), analyzed('b.txt', '2')])).toEqual([]);
  });

  it('normalise la signature des noms pour un rapprochement prudent', () => {
    expect(nameSignature('Photo-2024-01.jpg')).toBe('photo #');
    expect(nameSignature('photo 2024 02.jpg')).toBe('photo #');
    expect(nameSignature('facture_client.pdf')).toBe('facture client');
    expect(nameSignature('facture_client.pdf')).toBe(nameSignature('Facture Client (2).pdf'.replace(' (2)', '')));
  });

  it('regroupe les noms voisins sans affirmer qu’ils sont identiques', () => {
    const files = [imageFile('IMG-001.png', 'a'), imageFile('IMG-002.png', 'b'), imageFile('doc.png', 'c')];
    const groups = findSimilarNames(files);
    expect(groups).toHaveLength(1);
    expect(groups[0].files).toHaveLength(2);
    expect(groups[0].signature).toBe('img #');
  });

  it('construit un plan de renommage unique et sans écrasement', () => {
    const plan = buildRenamePlan(
      [{ id: '1', name: 'notes.txt' }, { id: '2', name: 'rapport.txt' }, { id: '3', name: 'notes.md' }],
      '{nom}-{index}',
    );
    // `{index}` est aligné sur la largeur du lot : « 01 », « 02 », « 03 ».
    expect(plan.map((entry) => entry.nextName)).toEqual(['notes-01.txt', 'rapport-02.txt', 'notes-03.md']);
    expect(plan.every((entry) => !entry.unchanged)).toBe(true);
  });

  it('signale les collisions de noms produit par le modèle', () => {
    const plan = buildRenamePlan([{ id: '1', name: 'a.txt' }, { id: '2', name: 'b.txt' }], 'constante');
    expect(plan[0].nextName).toBe('constante.txt');
    expect(plan[1].nextName).toBe('constante (2).txt');
    expect(plan[1].warning).toContain('déjà pris');
  });

  it('nettoie les noms interdits par Windows', () => {
    const plan = buildRenamePlan([{ id: '1', name: 'a.txt' }], 'rapport<2024>:final?');
    expect(plan[0].nextName).toBe('rapport-2024--final-.txt');
  });

  it('filtre et trie la liste de travail', () => {
    const files = [
      { ...analyzeFile({ id: 'b', name: 'b.txt', format: 'txt', bytes: strToU8('xx') }), addedAt: 2 },
      { ...analyzeFile({ id: 'a', name: 'a.png', format: 'png', bytes: strToU8('xxxx') }), addedAt: 1 },
      { ...analyzeFile({ id: 'c', name: 'c.log', format: 'log', bytes: strToU8('x') }), addedAt: 3 },
    ];
    const byName = filterFileList(files, { query: '', families: [], sort: 'name', descending: false });
    expect(byName.map((file) => file.name)).toEqual(['a.png', 'b.txt', 'c.log']);
    const bySizeDesc = filterFileList(files, { query: '', families: [], sort: 'size', descending: true });
    expect(bySizeDesc[0].name).toBe('a.png');
    const imagesOnly = filterFileList(files, { query: '', families: ['image'], sort: 'name', descending: false });
    expect(imagesOnly.map((file) => file.name)).toEqual(['a.png']);
    const searched = filterFileList(files, { query: 'b.', families: [], sort: 'name', descending: false });
    expect(searched.map((file) => file.name)).toEqual(['b.txt']);
  });
});
