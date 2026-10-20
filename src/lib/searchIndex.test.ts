import { beforeEach, describe, expect, it } from 'vitest';
import { buildSearchIndex, clearSearchIndex, hydrateSearchIndex, querySearchIndex } from './searchIndex';
import type { IndexableDocument } from './indexFolder';

const documents: IndexableDocument[] = [
  { path: 'C:/notes/strategie.md', name: 'strategie.md', kind: 'markdown', content: 'Une stratégie de projet, locale et privée.' },
  { path: 'C:/notes/outil.ts', name: 'outil.ts', kind: 'code', content: 'export function calculerSomme() { return 42; }' },
  { path: 'C:/notes/tableau.csv', name: 'tableau.csv', kind: 'csv', content: 'nom,ville\nAlice,Amsterdam' },
];

beforeEach(async () => {
  await clearSearchIndex();
});

describe('index de recherche local', () => {
  it('retourne les fichiers correspondants au contenu ou au nom', async () => {
    await buildSearchIndex(documents, 'C:/notes');
    expect(querySearchIndex('strategie').map((hit) => hit.name)).toContain('strategie.md');
    expect(querySearchIndex('outil').map((hit) => hit.name)).toContain('outil.ts');
  });

  it('ne retourne rien pour une requête vide ou trop longue', async () => {
    await buildSearchIndex(documents, 'C:/notes');
    expect(querySearchIndex('   ')).toEqual([]);
    expect(querySearchIndex('a'.repeat(201))).toEqual([]);
  });

  it('remplace l’index précédent par celui du nouveau dossier', async () => {
    await buildSearchIndex(documents, 'C:/notes');
    await buildSearchIndex([{ path: '/other/only.txt', name: 'only.txt', kind: 'text', content: 'unique' }], '/other');
    expect(querySearchIndex('strategie')).toEqual([]);
    expect(querySearchIndex('unique')[0]?.path).toBe('/other/only.txt');
  });

  it('conserve les métadonnées après hydratation du stockage local disponible', async () => {
    await buildSearchIndex(documents, 'C:/notes');
    const meta = await hydrateSearchIndex();
    expect(meta?.documentCount).toBe(3);
    expect(meta?.rootPath).toBe('C:/notes');
  });
});
