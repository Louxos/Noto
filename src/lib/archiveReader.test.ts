import { describe, expect, it } from 'vitest';
import { extractOfficeChapters, extractPresentation } from './archiveReader';

describe('local office archive reader', () => {
  it('extracts readable paragraphs from RTF without modifying the source bytes', () => {
    const source = '{\\rtf1\\ansi Bonjour\\par Noto \\b gras\\b0.}';
    const bytes = new TextEncoder().encode(source);
    const original = bytes.slice();
    const chapters = extractOfficeChapters(bytes, 'rtf');
    expect(chapters).toEqual([{ title: 'Document RTF', text: 'Bonjour\n\nNoto gras.' }]);
    expect(bytes).toEqual(original);
  });

  it('rejects an oversized presentation before attempting to parse its archive', () => {
    expect(() => extractPresentation(new Uint8Array(80 * 1024 * 1024 + 1), 'pptx')).toThrow(/80 Mo/);
  });
});
