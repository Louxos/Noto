import { describe, expect, it } from 'vitest';
import { decodeTextChunkBuffer, formatBytes, loadBrowserFile, saveDocument } from './files';
import type { BrowserFileHandle } from '../types';

describe('file utilities', () => {
  it('formats readable local file sizes', () => {
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(2_400)).toBe('2,4 Ko');
    expect(formatBytes(2_000_000)).toBe('2 Mo');
  });

  it('preserves UTF-8 characters that span progressive-read chunk boundaries', () => {
    const bytes = new TextEncoder().encode('AéB');
    expect(decodeTextChunkBuffer(bytes, 0, 2, 'utf-8')).toEqual({ content: 'éB', nextOffset: 4 });
    expect(decodeTextChunkBuffer(bytes.subarray(0, 2), 0, 1, 'utf-8')).toEqual({ content: '', nextOffset: 1 });
  });

  it('opens and saves a local text file through an explicitly granted handle', async () => {
    let written = '';
    const handle: BrowserFileHandle = {
      getFile: async () => new File(['initial'], 'note.txt'),
      createWritable: async () => ({
        write: async (value) => { written = typeof value === 'string' ? value : 'binary'; },
        close: async () => undefined,
      }),
    };
    const document = await loadBrowserFile(new File(['Bonjour'], 'note.txt'), handle);
    expect(document?.content).toBe('Bonjour');
    const saved = await saveDocument(document!, 'Bonjour, Noto.');
    expect(written).toBe('Bonjour, Noto.');
    expect(saved.savedContent).toBe('Bonjour, Noto.');
  });
});
