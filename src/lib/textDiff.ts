import { diffArrays } from 'diff';

export type DiffRowKind = 'equal' | 'changed' | 'removed' | 'added';

export interface DiffRow {
  kind: DiffRowKind;
  left?: string;
  right?: string;
  leftLine?: number;
  rightLine?: number;
}

export interface TextDiffResult {
  rows: DiffRow[];
  additions: number;
  deletions: number;
  changes: number;
}

export interface TextDiffOptions {
  ignoreWhitespace?: boolean;
  ignoreLineEndings?: boolean;
}

interface SourceLine {
  text: string;
  ending: string;
}

interface DiffToken extends SourceLine {
  comparison: string;
}

export const MAX_DIFF_LINES = 3_000;
const MAX_DIFF_CELLS = 6_000_000;

export function compareTextLines(leftText: string, rightText: string, options: TextDiffOptions = {}): TextDiffResult {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  if (leftLines.length > MAX_DIFF_LINES || rightLines.length > MAX_DIFF_LINES) {
    throw new Error(`La comparaison est limitée à ${MAX_DIFF_LINES.toLocaleString('fr-FR')} lignes par fichier.`);
  }
  if (leftLines.length * rightLines.length > MAX_DIFF_CELLS) {
    throw new Error('Ces fichiers sont trop différents ou volumineux pour une comparaison sûre. Réduisez leur taille ou comparez une partie plus courte.');
  }

  const makeTokens = (lines: SourceLine[]): DiffToken[] => lines.map(({ text, ending }) => ({
    text,
    ending,
    comparison: `${normalizeComparisonLine(text, options)}${options.ignoreLineEndings === false ? `\u0000${ending}` : ''}`,
  }));
  const leftTokens = makeTokens(leftLines);
  const rightTokens = makeTokens(rightLines);
  const parts = diffArrays(leftTokens, rightTokens, {
    comparator: (left, right) => left.comparison === right.comparison,
  });
  const rows: DiffRow[] = [];
  let leftLine = 1;
  let rightLine = 1;
  let leftIndex = 0;
  let rightIndex = 0;
  let additions = 0;
  let deletions = 0;
  let changes = 0;
  let index = 0;

  while (index < parts.length) {
    const part = parts[index];
    if (!part.added && !part.removed) {
      for (let offset = 0; offset < part.value.length; offset += 1) {
        const left = leftTokens[leftIndex++];
        const right = rightTokens[rightIndex++];
        rows.push({ kind: 'equal', left: left.text, right: right.text, leftLine, rightLine });
        leftLine += 1;
        rightLine += 1;
      }
      index += 1;
      continue;
    }

    const removed: DiffToken[] = [];
    const added: DiffToken[] = [];
    while (index < parts.length && (parts[index].added || parts[index].removed)) {
      const change = parts[index];
      if (change.removed) {
        removed.push(...change.value);
        leftIndex += change.value.length;
      } else if (change.added) {
        added.push(...change.value);
        rightIndex += change.value.length;
      }
      index += 1;
    }

    const paired = Math.min(removed.length, added.length);
    for (let lineIndex = 0; lineIndex < paired; lineIndex += 1) {
      rows.push({ kind: 'changed', left: removed[lineIndex].text, right: added[lineIndex].text, leftLine, rightLine });
      leftLine += 1;
      rightLine += 1;
      changes += 1;
    }
    for (let lineIndex = paired; lineIndex < removed.length; lineIndex += 1) {
      rows.push({ kind: 'removed', left: removed[lineIndex].text, leftLine });
      leftLine += 1;
      deletions += 1;
    }
    for (let lineIndex = paired; lineIndex < added.length; lineIndex += 1) {
      rows.push({ kind: 'added', right: added[lineIndex].text, rightLine });
      rightLine += 1;
      additions += 1;
    }
  }

  return { rows, additions, deletions, changes };
}

function normalizeComparisonLine(line: string, options: TextDiffOptions): string {
  return options.ignoreWhitespace ? line.replace(/\s+/gu, '') : line;
}

function splitLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== '\r' && character !== '\n') continue;
    let ending = character;
    if (character === '\r' && text[index + 1] === '\n') {
      ending = '\r\n';
      index += 1;
    }
    lines.push({ text: text.slice(start, index + 1 - ending.length), ending });
    start = index + 1;
  }
  lines.push({ text: text.slice(start), ending: '' });
  return lines;
}
