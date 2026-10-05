export interface ParsedCsv {
  rows: string[][];
  delimiter: string;
  columns: number;
}

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'];

function countDelimiters(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 12_000);
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? '';
  const ranked = CANDIDATE_DELIMITERS
    .map((delimiter, index) => ({ delimiter, count: countDelimiters(firstLine, delimiter), index }))
    .sort((a, b) => b.count - a.count || a.index - b.index);
  return ranked[0]?.count ? ranked[0].delimiter : ',';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): ParsedCsv {
  if (text.length === 0) return { rows: [], delimiter, columns: 0 };

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      continue;
    }

    field += char;
  }

  const endedWithNewline = /(?:\r\n|\r|\n)$/.test(text);
  if (!endedWithNewline || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const columns = rows.reduce((maximum, current) => Math.max(maximum, current.length), 0);
  return { rows, delimiter, columns };
}
