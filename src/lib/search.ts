export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface TextSearchMatch {
  index: number;
  length: number;
  line: number;
  column: number;
  occurrence: number;
  preview: string;
  text: string;
}

export interface TextSearchResult {
  matches: TextSearchMatch[];
  total: number;
  truncated: boolean;
  error: string | null;
}

const MAX_QUERY_LENGTH = 500;
const MAX_MATCHES = 10_000;
const MAX_PREVIEW_MATCHES = 300;

export function createSearchRegExp(query: string, options: SearchOptions): RegExp | null {
  if (!query || query.length > MAX_QUERY_LENGTH) return null;
  const escaped = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = options.wholeWord
    ? `(?<![\\p{L}\\p{N}_])(?:${escaped})(?![\\p{L}\\p{N}_])`
    : escaped;
  return new RegExp(source, `gu${options.caseSensitive ? '' : 'i'}`);
}

export function searchText(text: string, query: string, options: SearchOptions): TextSearchResult {
  if (!query) return { matches: [], total: 0, truncated: false, error: null };
  if (query.length > MAX_QUERY_LENGTH) {
    return { matches: [], total: 0, truncated: false, error: `La recherche est limitée à ${MAX_QUERY_LENGTH} caractères.` };
  }

  let expression: RegExp;
  try {
    const compiled = createSearchRegExp(query, options);
    if (!compiled) return { matches: [], total: 0, truncated: false, error: 'La recherche est vide.' };
    expression = compiled;
  } catch {
    return { matches: [], total: 0, truncated: false, error: 'Cette expression régulière est invalide.' };
  }

  const matches: TextSearchMatch[] = [];
  let total = 0;
  let occurrence = 0;
  let currentLine = 1;
  let lineStart = 0;
  let found: RegExpExecArray | null;

  while ((found = expression.exec(text)) !== null) {
    total += 1;
    occurrence += 1;
    const index = found.index;
    while (lineStart < text.length) {
      const newline = text.indexOf('\n', lineStart);
      if (newline < 0 || newline >= index) break;
      currentLine += 1;
      lineStart = newline + 1;
    }
    if (matches.length < MAX_PREVIEW_MATCHES) {
      const lineEndIndex = text.indexOf('\n', index);
      const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
      const preview = text.slice(lineStart, lineEnd).trim();
      matches.push({
        index,
        length: found[0].length,
        line: currentLine,
        column: index - lineStart + 1,
        occurrence,
        preview,
        text: found[0],
      });
    }
    if (total >= MAX_MATCHES) break;
    if (found[0].length === 0) {
      const nextCodePoint = text.codePointAt(expression.lastIndex);
      expression.lastIndex += nextCodePoint !== undefined && nextCodePoint > 0xffff ? 2 : 1;
    }
  }

  return {
    matches,
    total,
    truncated: total >= MAX_MATCHES || total > matches.length,
    error: null,
  };
}

export function countTextMatches(text: string, query: string, options: SearchOptions): number {
  return searchText(text, query, options).total;
}
