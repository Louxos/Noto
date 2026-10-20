import MiniSearch from 'minisearch';
import type { IndexableDocument } from './indexFolder';

export interface SearchIndexMeta {
  builtAt: number;
  documentCount: number;
  charactersIndexed: number;
  rootPath: string;
}

export interface SearchIndexHit {
  path: string;
  name: string;
  kind: string;
  score: number;
}

interface StoredIndex {
  serialized: string;
  meta: SearchIndexMeta;
}

const DATABASE_NAME = 'noto-local-search';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'current';
const FIELDS = ['name', 'content'] as const;
const STORE_FIELDS = ['path', 'name', 'kind'] as const;

let mini: MiniSearch<IndexDocument> = createMiniSearch();
let meta: SearchIndexMeta | null = null;
let hydrated = false;
let hydration: Promise<SearchIndexMeta | null> | null = null;

interface IndexDocument {
  id: string;
  path: string;
  name: string;
  kind: string;
  content: string;
}

function createMiniSearch(): MiniSearch<IndexDocument> {
  return new MiniSearch<IndexDocument>({
    fields: [...FIELDS],
    storeFields: [...STORE_FIELDS],
    idField: 'id',
    searchOptions: { boost: { name: 3 }, prefix: true, fuzzy: 0.15 },
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB indisponible.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Ouverture de l’index local impossible.'));
    request.onblocked = () => reject(new Error('La base de recherche locale est bloquée par un autre onglet.'));
  });
}

function readSnapshot(database: IDBDatabase): Promise<StoredIndex | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    request.onsuccess = () => resolve((request.result as StoredIndex | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Lecture de l’index local impossible.'));
  });
}

export async function hydrateSearchIndex(): Promise<SearchIndexMeta | null> {
  if (hydrated) return meta;
  if (hydration) return hydration;
  hydration = (async () => {
    try {
      const database = await openDatabase();
      const snapshot = await readSnapshot(database);
      database.close();
      if (snapshot?.serialized && snapshot.meta) {
        mini = MiniSearch.loadJSON<IndexDocument>(snapshot.serialized, {
          fields: [...FIELDS],
          storeFields: [...STORE_FIELDS],
          idField: 'id',
          searchOptions: { boost: { name: 3 }, prefix: true, fuzzy: 0.15 },
        });
        meta = snapshot.meta;
      }
    } catch {
      // L’index reste utilisable en mémoire pour cette session si le stockage local
      // est désactivé ou indisponible ; aucune erreur n’empêche l’ouverture de Noto.
    }
    hydrated = true;
    return meta;
  })();
  return hydration;
}

export async function persistSearchIndex(): Promise<boolean> {
  if (!hydrated) await hydrateSearchIndex();
  const currentMeta = meta;
  if (!currentMeta) return false;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ serialized: JSON.stringify(mini.toJSON()), meta: currentMeta } satisfies StoredIndex, SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Enregistrement de l’index impossible.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Enregistrement de l’index annulé.'));
    });
    database.close();
    return true;
  } catch {
    return false;
  }
}

export async function buildSearchIndex(
  documents: IndexableDocument[],
  rootPath: string,
  onProgress?: (indexed: number, total: number) => void,
): Promise<SearchIndexMeta> {
  await hydrateSearchIndex();
  const next = createMiniSearch();
  let charactersIndexed = 0;
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    // L’index conserve les termes nécessaires à la recherche, pas le corps complet
    // du document. Une fenêtre limitée maintient le stockage prévisible.
    const content = document.content.slice(0, 16_000);
    charactersIndexed += content.length;
    next.add({
      id: document.path,
      path: document.path,
      name: document.name,
      kind: document.kind,
      content,
    });
    if ((index + 1) % 50 === 0 || index + 1 === documents.length) {
      onProgress?.(index + 1, documents.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  mini = next;
  meta = { builtAt: Date.now(), documentCount: documents.length, charactersIndexed, rootPath };
  hydrated = true;
  hydration = Promise.resolve(meta);
  return meta;
}

export function querySearchIndex(query: string, limit = 50): SearchIndexHit[] {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 200 || !hydrated) return [];
  return mini.search(trimmed, { prefix: true, fuzzy: 0.15 })
    .slice(0, Math.max(1, Math.min(limit, 200)))
    .map((result) => ({
      path: String(result.path ?? result.id),
      name: String(result.name ?? result.id),
      kind: String(result.kind ?? 'unknown'),
      score: result.score,
    }));
}

export function getSearchIndexMeta(): SearchIndexMeta | null {
  return meta;
}

export async function clearSearchIndex(): Promise<void> {
  mini = createMiniSearch();
  meta = null;
  hydrated = true;
  hydration = Promise.resolve(null);
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Suppression de l’index impossible.'));
    });
    database.close();
  } catch {
    // L’index mémoire est tout de même effacé.
  }
}
