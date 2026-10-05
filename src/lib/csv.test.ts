import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv';

describe('parseCsv', () => {
  it('detects common delimiters, including French semicolon files', () => {
    expect(detectDelimiter('nom,ville\nAda,Paris')).toBe(',');
    expect(detectDelimiter('nom;ville\nAda;Paris')).toBe(';');
    expect(detectDelimiter('nom\tville\nAda\tParis')).toBe('\t');
  });

  it('handles quoted separators, escaped quotes and line breaks', () => {
    const result = parseCsv('nom;note\n"Dupont; Alice";"dit ""bonjour""\nà tous"');
    expect(result.rows).toEqual([
      ['nom', 'note'],
      ['Dupont; Alice', 'dit "bonjour"\nà tous'],
    ]);
    expect(result.columns).toBe(2);
  });

  it('keeps empty cells and does not add a row for the final newline', () => {
    expect(parseCsv('a,b,\n1,,3\n').rows).toEqual([
      ['a', 'b', ''],
      ['1', '', '3'],
    ]);
  });

  it('returns no rows for an empty file', () => {
    expect(parseCsv('')).toEqual({ rows: [], delimiter: ',', columns: 0 });
  });
});
