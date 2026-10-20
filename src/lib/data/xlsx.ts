import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Lecture et écriture XLSX minimales, sans dépendance externe.
 *
 * Noto lit les cellules texte, nombres et booléens de la première feuille et
 * écrit un classeur valide à partir d’un tableau. Formules, styles, graphiques
 * et plusieurs feuilles ne sont pas conservés : cette limite est annoncée dans
 * l’interface et la documentation.
 */

export const MAX_SHEET_CELLS = 200_000;
const MAX_CELL_TEXT = 32_000;

export interface SheetData {
  name: string;
  rows: string[][];
  truncated: boolean;
  cellCount: number;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function xmlUnescape(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

export function columnLetter(index: number): string {
  let value = index + 1;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

export function readXlsx(bytes: Uint8Array): SheetData {
  if (!bytes.length) throw new Error('Ce classeur est vide.');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => file.originalSize < 40 * 1024 * 1024,
    });
  } catch {
    throw new Error('Ce classeur XLSX est invalide, chiffré ou trop volumineux pour être lu en sécurité.');
  }

  const workbook = files['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : '';
  const sheetName = /<sheet[^>]*name="([^"]*)"/u.exec(workbook)?.[1] ?? 'Feuille 1';

  const sharedStrings: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    const source = strFromU8(files['xl/sharedStrings.xml']);
    const matches = source.matchAll(/<si>([\s\S]*?)<\/si>/gu);
    for (const match of matches) {
      const texts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)].map((entry) => xmlUnescape(entry[1]));
      sharedStrings.push(texts.join(''));
    }
  }

  const sheetEntry = files['xl/worksheets/sheet1.xml']
    ? 'xl/worksheets/sheet1.xml'
    : Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name));
  if (!sheetEntry) throw new Error('Aucune feuille lisible n’a été trouvée dans ce classeur.');
  const sheet = strFromU8(files[sheetEntry]);

  const rows: string[][] = [];
  let cellCount = 0;
  let truncated = false;
  for (const rowMatch of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/gu)) {
    const row: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/gu)) {
      const attributes = cellMatch[1] ?? cellMatch[3] ?? '';
      const body = cellMatch[2] ?? '';
      const reference = /r="([A-Z]+)\d+"/u.exec(attributes)?.[1];
      const columnIndex = reference ? columnIndexFromLetters(reference) : row.length;
      const type = /t="([^"]+)"/u.exec(attributes)?.[1] ?? 'n';
      let value = '';
      if (type === 's') {
        const index = Number.parseInt(/<v>([\s\S]*?)<\/v>/u.exec(body)?.[1] ?? '', 10);
        value = Number.isFinite(index) ? sharedStrings[index] ?? '' : '';
      } else if (type === 'inlineStr') {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)].map((entry) => xmlUnescape(entry[1])).join('');
      } else if (type === 'b') {
        value = /<v>1<\/v>/u.test(body) ? 'oui' : 'non';
      } else if (type === 'str') {
        value = xmlUnescape(/<v>([\s\S]*?)<\/v>/u.exec(body)?.[1] ?? '');
      } else {
        value = xmlUnescape(/<v>([\s\S]*?)<\/v>/u.exec(body)?.[1] ?? '');
      }
      if (value.length > MAX_CELL_TEXT) {
        value = `${value.slice(0, MAX_CELL_TEXT)}…`;
        truncated = true;
      }
      while (row.length < columnIndex) row.push('');
      row[columnIndex] = value;
      cellCount += 1;
      if (cellCount > MAX_SHEET_CELLS) {
        truncated = true;
        break;
      }
    }
    rows.push(row);
    if (cellCount > MAX_SHEET_CELLS) break;
  }

  // Supprime les lignes vides finales.
  while (rows.length && rows[rows.length - 1].every((cell) => cell === '')) rows.pop();
  return { name: sheetName.trim() || 'Feuille 1', rows, truncated, cellCount };
}

function columnIndexFromLetters(letters: string): number {
  let index = 0;
  for (const character of letters) index = index * 26 + (character.charCodeAt(0) - 64);
  return index - 1;
}

export function writeXlsx(rows: string[][], sheetName = 'Feuille 1'): Uint8Array {
  const limited = rows.slice(0, 50_000).map((row) => row.slice(0, 512).map((cell) => String(cell ?? '').slice(0, MAX_CELL_TEXT)));
  const sheetRows = limited.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      if (cell === '') return '';
      const reference = `${columnLetter(columnIndex)}${rowIndex + 1}`;
      const numeric = /^-?\d+(?:[.,]\d+)?$/u.test(cell.trim()) && cell.trim().length < 15;
      if (numeric) {
        return `<c r="${reference}"><v>${cell.trim().replace(',', '.')}</v></c>`;
      }
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  const safeSheetName = xmlEscape(sheetName.slice(0, 31) || 'Feuille 1');
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Noto</dc:creator><cp:lastModifiedBy>Noto</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`),
  };

  return zipSync(files, { level: 6 });
}
