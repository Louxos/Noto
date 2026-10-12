import { describe, expect, it } from 'vitest';
import { compareTextLines } from './textDiff';

describe('compareTextLines', () => {
  it('marks unchanged lines and pairs a replacement', () => {
    const result = compareTextLines('alpha\nold\nomega', 'alpha\nnew\nomega');
    expect(result.rows.map((row) => row.kind)).toEqual(['equal', 'changed', 'equal']);
    expect(result.rows[1]).toMatchObject({ left: 'old', right: 'new', leftLine: 2, rightLine: 2 });
    expect(result).toMatchObject({ additions: 0, deletions: 0, changes: 1 });
  });

  it('keeps insertions and deletions on the correct side with line numbers', () => {
    const result = compareTextLines('one\ntwo\nthree', 'zero\none\nthree\nfour');
    expect(result.rows.map((row) => row.kind)).toEqual(['added', 'equal', 'removed', 'equal', 'added']);
    expect(result.rows[0]).toMatchObject({ right: 'zero', rightLine: 1 });
    expect(result.rows[2]).toMatchObject({ left: 'two', leftLine: 2 });
    expect(result).toMatchObject({ additions: 2, deletions: 1, changes: 0 });
  });

  it('normalizes Windows and Unix line endings', () => {
    expect(compareTextLines('a\r\nb\r\n', 'a\nb\n').rows.every((row) => row.kind === 'equal')).toBe(true);
  });

  it('can ignore whitespace while keeping the original line text visible', () => {
    const result = compareTextLines('A  B\r\nHello', 'A B\nHello', { ignoreWhitespace: true });
    expect(result.changes + result.additions + result.deletions).toBe(0);
    expect(result.rows.map((row) => [row.left, row.right])).toEqual([['A  B', 'A B'], ['Hello', 'Hello']]);
  });

  it('can report line-ending changes when that option is disabled', () => {
    const result = compareTextLines('first\r\nsecond', 'first\nsecond', { ignoreLineEndings: false });
    expect(result.rows.map((row) => row.kind)).toEqual(['changed', 'equal']);
  });

  it('rejects inputs above the safe comparison limits', () => {
    expect(() => compareTextLines(Array.from({ length: 3_001 }, () => 'x').join('\n'), 'x')).toThrow('limitée');
  });
});
