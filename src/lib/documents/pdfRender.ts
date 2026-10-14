import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Reconstruction d’un PDF à partir de blocs de contenu (texte, Markdown,
 * tableaux, images). C’est explicitement une reconstruction : Noto ne prétend
 * pas reproduire une mise en page d’origine, mais le résultat est un vrai PDF,
 * paginé avec des mesures réelles de police.
 */

export type DocumentBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; rows: string[][] }
  | { type: 'code'; text: string }
  | { type: 'image'; bytes: Uint8Array; width: number; height: number; caption?: string }
  | { type: 'pagebreak' };

export interface RenderOptions {
  pageSize: 'a4' | 'letter';
  landscape: boolean;
  margin: number;
  title?: string;
  author?: string;
  baseSize: number;
  lineHeight: number;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  pageSize: 'a4',
  landscape: false,
  margin: 56,
  baseSize: 11,
  lineHeight: 1.45,
};

interface RenderContext {
  document: PDFDocument;
  fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont };
  page: PDFPage;
  y: number;
  width: number;
  height: number;
  options: RenderOptions;
  warnings: Set<string>;
}

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

/** Remplace les caractères que les polices PDF standard (WinAnsi) ne savent pas écrire. */
export function sanitizeForStandardFont(text: string): { text: string; replaced: boolean } {
  let replaced = false;
  const output = [...text].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code === 9) return ' ';
    if (code === 10 || code === 13) return character;
    if (code >= 0x20 && code <= 0x7e) return character;
    if (code >= 0xa0 && code <= 0xff) return character;
    if (code >= 0x2000 && code <= 0x2030 && [0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026].includes(code)) return character;
    replaced = true;
    if (code === 0x2192) return '->';
    if (code === 0x2190) return '<-';
    if (code === 0x2264) return '<=';
    if (code === 0x2265) return '>=';
    if (code === 0x00a0) return ' ';
    return '?';
  }).join('');
  return { text: output, replaced };
}

function newPage(context: RenderContext): void {
  context.page = context.document.addPage(context.options.landscape ? [context.height, context.width] : [context.width, context.height]);
  context.y = (context.options.landscape ? context.width : context.height) - context.options.margin;
}

function ensureSpace(context: RenderContext, needed: number): void {
  if (context.y - needed < context.options.margin) newPage(context);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim()) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of rawLine.split(/\s+/u)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawParagraph(context: RenderContext, text: string, options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; indent?: number; spaceAfter?: number }): void {
  const cleaned = sanitizeForStandardFont(text);
  if (cleaned.replaced) context.warnings.add('Certains caractères absents des polices PDF standard ont été remplacés (les polices intégrées couvrent l’alphabet latin).');
  const width = context.width - context.options.margin * 2 - (options.indent ?? 0);
  const lineHeight = options.size * context.options.lineHeight;
  for (const line of wrapText(cleaned.text, options.font, options.size, width)) {
    ensureSpace(context, lineHeight);
    if (line) {
      context.page.drawText(line, {
        x: context.options.margin + (options.indent ?? 0),
        y: context.y - options.size,
        size: options.size,
        font: options.font,
        color: options.color ?? rgb(0.16, 0.17, 0.23),
      });
    }
    context.y -= lineHeight;
  }
  context.y -= options.spaceAfter ?? 0;
}

function drawTable(context: RenderContext, rows: string[][]): void {
  if (!rows.length) return;
  const columns = rows.reduce((maximum, row) => Math.max(maximum, row.length), 1);
  const available = context.width - context.options.margin * 2;
  const columnWidths = columnWidthsFor(rows, columns, available, context.options.baseSize);
  const fontSize = Math.min(context.options.baseSize, 10);
  const lineHeight = fontSize * 1.3;
  rows.forEach((row, rowIndex) => {
    const cells = Array.from({ length: columns }, (_, column) => wrapText(sanitizeForStandardFont(row[column] ?? '').text, rowIndex === 0 ? context.fonts.bold : context.fonts.regular, fontSize, columnWidths[column] - 8));
    const rowHeight = Math.max(lineHeight, ...cells.map((lines) => lines.length * lineHeight)) + 6;
    ensureSpace(context, rowHeight);
    const top = context.y;
    let x = context.options.margin;
    cells.forEach((lines, column) => {
      context.page.drawRectangle({
        x,
        y: top - rowHeight,
        width: columnWidths[column],
        height: rowHeight,
        borderColor: rgb(0.78, 0.79, 0.83),
        borderWidth: 0.5,
        color: rowIndex === 0 ? rgb(0.95, 0.95, 0.98) : undefined,
      });
      let textY = top - lineHeight;
      for (const line of lines) {
        context.page.drawText(line, {
          x: x + 4,
          y: textY,
          size: fontSize,
          font: rowIndex === 0 ? context.fonts.bold : context.fonts.regular,
          color: rgb(0.16, 0.17, 0.23),
        });
        textY -= lineHeight;
      }
      x += columnWidths[column];
    });
    context.y -= rowHeight;
  });
  context.y -= 8;
}

function columnWidthsFor(rows: string[][], columns: number, available: number, size: number): number[] {
  const natural: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    const longest = rows.reduce((maximum, row) => Math.max(maximum, (row[column] ?? '').length), 0);
    natural.push(Math.min(Math.max(longest * size * 0.52, 40), available * 0.5));
  }
  const total = natural.reduce((sum, value) => sum + value, 0) || 1;
  const scaled = natural.map((value) => (value / total) * available);
  const capped = scaled.map((value) => Math.min(value, available * 0.6));
  const capTotal = capped.reduce((sum, value) => sum + value, 0) || 1;
  return capped.map((value) => (value / capTotal) * available);
}

function drawCode(context: RenderContext, text: string): void {
  const cleaned = sanitizeForStandardFont(text);
  const size = Math.max(8, context.options.baseSize - 1.5);
  const lineHeight = size * 1.35;
  const width = context.width - context.options.margin * 2;
  const lines: string[] = [];
  for (const rawLine of cleaned.text.split('\n')) {
    const sanitized = sanitizeForStandardFont(rawLine).text.replaceAll('\t', '    ');
    for (const wrapped of wrapText(sanitized, context.fonts.mono, size, width - 12)) lines.push(wrapped);
  }
  const blockHeight = Math.min(lines.length * lineHeight + 10, context.height - context.options.margin * 2);
  const pages = Math.ceil((lines.length * lineHeight + 10) / (context.height - context.options.margin * 2));
  void pages;
  ensureSpace(context, Math.min(blockHeight, (context.height - context.options.margin * 2) * 0.6));
  let index = 0;
  while (index < lines.length) {
    const availableHeight = context.y - context.options.margin;
    const chunkHeight = Math.min(lines.length - index, Math.floor((availableHeight - 10) / lineHeight));
    if (chunkHeight < 1) {
      newPage(context);
      continue;
    }
    context.page.drawRectangle({
      x: context.options.margin,
      y: context.y - (chunkHeight * lineHeight + 8),
      width,
      height: chunkHeight * lineHeight + 8,
      color: rgb(0.96, 0.96, 0.98),
    });
    let textY = context.y - lineHeight;
    for (const line of lines.slice(index, index + chunkHeight)) {
      context.page.drawText(line, { x: context.options.margin + 6, y: textY, size, font: context.fonts.mono, color: rgb(0.2, 0.2, 0.28) });
      textY -= lineHeight;
    }
    context.y -= chunkHeight * lineHeight + 14;
    index += chunkHeight;
  }
}

export async function renderBlocksToPdf(blocks: DocumentBlock[], partial: Partial<RenderOptions> = {}): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS, ...partial };
  const document = await PDFDocument.create();
  const [width, height] = PAGE_SIZES[options.pageSize] ?? PAGE_SIZES.a4;
  const context: RenderContext = {
    document,
    fonts: {
      regular: await document.embedFont(StandardFonts.Helvetica),
      bold: await document.embedFont(StandardFonts.HelveticaBold),
      mono: await document.embedFont(StandardFonts.Courier),
    },
    page: undefined as unknown as PDFPage,
    y: 0,
    width,
    height,
    options,
    warnings: new Set<string>(),
  };
  context.page = document.addPage(options.landscape ? [height, width] : [width, height]);
  context.y = (options.landscape ? width : height) - options.margin;
  if (options.title) document.setTitle(options.title);
  if (options.author) document.setAuthor(options.author);
  document.setProducer('Noto');
  document.setCreator('Noto — reconstruction PDF');

  for (const block of blocks) {
    if (block.type === 'heading') {
      const sizes: Record<number, number> = { 1: 22, 2: 17, 3: 14, 4: 12 };
      context.y -= block.level === 1 ? 8 : 6;
      drawParagraph(context, block.text, { font: context.fonts.bold, size: sizes[block.level] ?? 12, spaceAfter: 6 });
    } else if (block.type === 'paragraph') {
      drawParagraph(context, block.text, { font: context.fonts.regular, size: options.baseSize, spaceAfter: 8 });
    } else if (block.type === 'list') {
      block.items.forEach((item, index) => {
        const bullet = block.ordered ? `${index + 1}.` : '•';
        drawParagraph(context, `${bullet}  ${item}`, { font: context.fonts.regular, size: options.baseSize, indent: 14, spaceAfter: 2 });
      });
      context.y -= 6;
    } else if (block.type === 'table') {
      drawTable(context, block.rows);
    } else if (block.type === 'code') {
      drawCode(context, block.text);
    } else if (block.type === 'pagebreak') {
      newPage(context);
    } else {
      try {
        const image = isPng(block.bytes) ? await document.embedPng(block.bytes) : await document.embedJpg(block.bytes);
        const maxWidth = context.width - options.margin * 2;
        const scale = Math.min(1, maxWidth / image.width);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        ensureSpace(context, Math.min(drawHeight, context.height - options.margin * 2) + 12);
        if (drawHeight > context.height - options.margin * 2) {
          context.warnings.add('Une image trop haute pour une page a été réduite pour tenir sur une page.');
        }
        const fittedHeight = Math.min(drawHeight, context.height - options.margin * 2);
        const fittedWidth = drawWidth * (fittedHeight / drawHeight);
        context.page.drawImage(image, { x: options.margin, y: context.y - fittedHeight, width: fittedWidth, height: fittedHeight });
        context.y -= fittedHeight + 10;
      } catch {
        context.warnings.add('Une image n’a pas pu être intégrée au PDF (format non pris en charge par l’encodeur).');
      }
    }
    if (context.document.getPageCount() > 2_000) throw new Error('Le document dépasse 2 000 pages : réduisez son contenu.');
  }

  return { bytes: await document.save({ useObjectStreams: true }), warnings: [...context.warnings] };
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/** Convertit du Markdown en blocs : titres, listes, tableaux, code, paragraphes. */
export function markdownToBlocks(source: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  let paragraph: string[] = [];
  let code: string[] | null = null;
  let table: string[][] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: stripInlineMarkdown(paragraph.join(' ').trim()) });
      paragraph = [];
    }
  };
  const flushTable = () => {
    if (table) {
      blocks.push({ type: 'table', rows: table });
      table = null;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code) {
        blocks.push({ type: 'code', text: code.join('\n') });
        code = null;
      } else {
        flushParagraph();
        flushTable();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading) {
      flushParagraph();
      flushTable();
      const level = Math.min(4, heading[1].length) as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, text: stripInlineMarkdown(heading[2].trim()) });
      continue;
    }
    if (/^\s*\|.*\|\s*$/u.test(line)) {
      flushParagraph();
      const cells = line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => stripInlineMarkdown(cell.trim()));
      if (cells.every((cell) => /^:?-{2,}:?$/u.test(cell) || cell === '')) continue;
      table = table ?? [];
      table.push(cells);
      continue;
    }
    flushTable();
    const listItem = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/u.exec(line);
    if (listItem) {
      flushParagraph();
      const ordered = /^\s*\d/u.test(line);
      const previous = blocks[blocks.length - 1];
      if (previous?.type === 'list' && Boolean(previous.ordered) === ordered) previous.items.push(stripInlineMarkdown(listItem[1].trim()));
      else blocks.push({ type: 'list', items: [stripInlineMarkdown(listItem[1].trim())], ordered });
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
      flushParagraph();
      blocks.push({ type: 'paragraph', text: '—' });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  if (code) blocks.push({ type: 'code', text: code.join('\n') });
  flushTable();
  flushParagraph();
  return blocks;
}

/**
 * Retire réellement le balisage Markdown : les titres perdent leurs `#`, les
 * listes gardent une puce simple et le texte reste lisible tel quel. C’est ce
 * qu’annonce l’outil « Convertir du Markdown en texte ».
 */
export function markdownToPlainText(source: string): string {
  return markdownToBlocks(source).map((block) => {
    if (block.type === 'heading') return block.text;
    if (block.type === 'paragraph') return block.text;
    if (block.type === 'code') return block.text;
    if (block.type === 'list') return block.items.map((item) => `• ${item}`).join('\n');
    if (block.type === 'table') return block.rows.map((row) => row.join('\t')).join('\n');
    if (block.type === 'image') return block.caption ?? '';
    return '';
  }).filter(Boolean).join('\n\n');
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/(\*\*\*|___)(.+?)\1/gu, '$2')
    .replace(/(\*\*|__)(.+?)\1/gu, '$2')
    .replace(/(\*|_)(.+?)\1/gu, '$2')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/^>\s?/u, '');
}

export function textToBlocks(source: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  for (const paragraph of source.replaceAll('\r\n', '\n').split(/\n{2,}/u)) {
    if (paragraph.trim()) blocks.push({ type: 'paragraph', text: paragraph.trim() });
  }
  return blocks.length ? blocks : [{ type: 'paragraph', text: '' }];
}
