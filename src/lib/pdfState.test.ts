import { describe, expect, it } from 'vitest';
import { normalizePdfLocalState, pdfStateKey, readPdfLocalState, writePdfLocalState } from './pdfState';

describe('PDF local state', () => {
  it('keeps state keys stable without exposing the path', () => {
    const path = 'C:\\Users\\Ariane\\Private\\report.pdf';
    expect(pdfStateKey(path)).toBe(pdfStateKey(path));
    expect(pdfStateKey(path)).not.toContain('Private');
  });

  it('normalizes pages, duplicate bookmarks, and invalid values', () => {
    expect(normalizePdfLocalState({ lastPage: 99, bookmarks: [3, 2, 3, 0, '4'] }, 12)).toEqual({ lastPage: 12, bookmarks: [2, 3] });
  });

  it('stores and reads state through the provided local storage adapter', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    };
    writePdfLocalState('/example.pdf', { lastPage: 7, bookmarks: [2, 7] }, storage);
    expect(readPdfLocalState('/example.pdf', storage)).toEqual({ lastPage: 7, bookmarks: [2, 7] });
  });
});
