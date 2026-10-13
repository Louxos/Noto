import { describe, expect, it } from 'vitest';
import { searchText, type SearchOptions } from './search';

const defaults: SearchOptions = { caseSensitive: false, wholeWord: false, regex: false };

describe('searchText', () => {
  it('finds literal matches with line, column, and context', () => {
    const result = searchText('first match\nsecond Match', 'match', defaults);
    expect(result.total).toBe(2);
    expect(result.matches.map(({ line, column, preview }) => ({ line, column, preview }))).toEqual([
      { line: 1, column: 7, preview: 'first match' },
      { line: 2, column: 8, preview: 'second Match' },
    ]);
  });

  it('supports case-sensitive and whole-word matching with Unicode letters', () => {
    expect(searchText('École école', 'école', { ...defaults, caseSensitive: true }).total).toBe(1);
    expect(searchText('chat chats méchat chat_ chat!', 'chat', { ...defaults, wholeWord: true }).total).toBe(2);
  });

  it('supports regular expressions and reports invalid patterns', () => {
    expect(searchText('item-12 item-4', 'item-\\d+', { ...defaults, regex: true }).total).toBe(2);
    expect(searchText('anything', '[', { ...defaults, regex: true }).error).toContain('invalide');
  });

  it('advances after zero-width matches instead of looping forever', () => {
    const result = searchText('aba', '(?=a)', { ...defaults, regex: true });
    expect(result.total).toBe(2);
    expect(result.matches.map((match) => match.index)).toEqual([0, 2]);
  });

  it('returns no matches for an empty query', () => {
    expect(searchText('some text', '', defaults)).toMatchObject({ total: 0, matches: [], error: null });
  });
});
