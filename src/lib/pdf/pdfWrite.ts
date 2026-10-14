import { degrees, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

/**
 * Écriture PDF avec `pdf-lib` (licence MIT).
 *
 * Toutes les fonctions de ce module produisent un nouveau document : la source
 * n’est jamais modifiée. Elles sont pures (octets en entrée, octets en sortie)
 * et donc testables sans interface graphique.
 */

export type PdfWriteDocument = PDFDocument;

export interface PdfOperationOptions {
  name?: string;
}

export async function loadPdfForWrite(bytes: Uint8Array, name = 'document.pdf'): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (error) {
    const message = String((error as Error)?.message ?? '');
    if (/encrypt/iu.test(message)) {
      throw new Error(`« ${name} » est protégé par un mot de passe. L’ouverture et l’impression restent possibles avec le mot de passe, mais la modification d’un PDF chiffré n’est pas prise en charge.`);
    }
    throw new Error(`« ${name} » n’est pas un PDF valide ou est endommagé (${message || 'structure illisible'}).`);
  }
}

export async function savePdf(document: PDFDocument): Promise<Uint8Array> {
  return document.save({ useObjectStreams: true, addDefaultPage: false });
}

export function pageCountOf(document: PDFDocument): number {
  return document.getPageCount();
}

function assertRange(pages: number[], count: number, label = 'plage'): number[] {
  const unique = [...new Set(pages)];
  for (const page of unique) {
    if (!Number.isInteger(page) || page < 1 || page > count) {
      throw new Error(`Page ${page} hors du document (1 à ${count}).`);
    }
  }
  if (!unique.length) throw new Error(`Aucune page sélectionnée pour la ${label}.`);
  return unique.sort((left, right) => left - right);
}

export async function mergePdfs(inputs: { bytes: Uint8Array; name: string }[]): Promise<Uint8Array> {
  if (inputs.length < 2) throw new Error('La fusion demande au moins deux fichiers PDF.');
  const merged = await PDFDocument.create();
  for (const input of inputs) {
    const source = await loadPdfForWrite(input.bytes, input.name);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return savePdf(merged);
}

export async function extractPages(bytes: Uint8Array, pages: number[], name = 'document.pdf'): Promise<Uint8Array> {
  const source = await loadPdfForWrite(bytes, name);
  const indices = assertRange(pages, source.getPageCount()).map((page) => page - 1);
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, indices);
  for (const page of copied) output.addPage(page);
  return savePdf(output);
}

export async function removePages(bytes: Uint8Array, pages: number[], name = 'document.pdf'): Promise<Uint8Array> {
  const source = await loadPdfForWrite(bytes, name);
  const count = source.getPageCount();
  const removed = new Set(assertRange(pages, count));
  if (removed.size >= count) throw new Error('Impossible de supprimer toutes les pages du document.');
  const keep = source.getPageIndices().filter((index) => !removed.has(index + 1));
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, keep);
  for (const page of copied) output.addPage(page);
  return savePdf(output);
}

export async function rotatePages(bytes: Uint8Array, pages: number[], angle: 90 | 180 | 270, name = 'document.pdf'): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  const targets = assertRange(pages, document.getPageCount());
  for (const pageNumber of targets) {
    const page = document.getPage(pageNumber - 1);
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return savePdf(document);
}

export async function reorderPages(bytes: Uint8Array, order: number[], name = 'document.pdf'): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  const count = document.getPageCount();
  if (order.length !== count) {
    throw new Error(`L’ordre fourni contient ${order.length} pages alors que le document en compte ${count}.`);
  }
  const sorted = [...order].sort((left, right) => left - right);
  for (let index = 0; index < count; index += 1) {
    if (sorted[index] !== index + 1) throw new Error('L’ordre des pages doit contenir chaque page exactement une fois.');
  }
  return reorderWithLayout(document, order);
}

async function reorderWithLayout(document: PDFDocument, order: number[]): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  const copied = await output.copyPages(document, order.map((page) => page - 1));
  for (const page of copied) output.addPage(page);
  return savePdf(output);
}

export async function duplicatePages(bytes: Uint8Array, pages: number[], copies = 1, name = 'document.pdf'): Promise<Uint8Array> {
  if (copies < 1) throw new Error('Le nombre de copies doit être supérieur ou égal à 1.');
  const document = await loadPdfForWrite(bytes, name);
  const targets = new Set(assertRange(pages, document.getPageCount()));
  const order: number[] = [];
  for (let index = 0; index < document.getPageCount(); index += 1) {
    const pageNumber = index + 1;
    for (let copy = 0; copy <= (targets.has(pageNumber) ? copies : 0); copy += 1) order.push(pageNumber);
  }
  return reorderWithLayout(document, order);
}

export async function reversePages(bytes: Uint8Array, name = 'document.pdf'): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  const order = document.getPageIndices().map((index) => index + 1).reverse();
  return reorderWithLayout(document, order);
}

export async function insertPdfPages(
  baseBytes: Uint8Array,
  insertedBytes: Uint8Array,
  position: number,
  baseName = 'document.pdf',
  insertedName = 'insertion.pdf',
): Promise<Uint8Array> {
  const base = await loadPdfForWrite(baseBytes, baseName);
  const inserted = await loadPdfForWrite(insertedBytes, insertedName);
  const total = base.getPageCount();
  if (position < 0 || position > total) {
    throw new Error(`La position d’insertion doit être comprise entre 0 et ${total} (0 = début, ${total} = fin).`);
  }
  const output = await PDFDocument.create();
  const first = await output.copyPages(base, Array.from({ length: position }, (_, index) => index));
  const middle = await output.copyPages(inserted, inserted.getPageIndices());
  const last = await output.copyPages(base, Array.from({ length: total - position }, (_, index) => position + index));
  for (const page of [...first, ...middle, ...last]) output.addPage(page);
  return savePdf(output);
}

/** Imposition : plusieurs pages du document par feuille (2, 4, 6 ou 9 par page). */
export async function imposePages(
  bytes: Uint8Array,
  options: { perSheet: 2 | 4 | 6 | 9; margin: number; gap: number },
  name = 'document.pdf',
): Promise<Uint8Array> {
  const source = await loadPdfForWrite(bytes, name);
  const output = await PDFDocument.create();
  const columns = options.perSheet === 2 ? 1 : options.perSheet === 4 ? 2 : options.perSheet === 6 ? 2 : 3;
  const rows = options.perSheet === 2 ? 2 : options.perSheet === 4 ? 2 : options.perSheet === 6 ? 3 : 3;
  const sheetWidth = 595.28;
  const sheetHeight = 841.89;
  const cellWidth = (sheetWidth - options.margin * 2 - options.gap * (columns - 1)) / columns;
  const cellHeight = (sheetHeight - options.margin * 2 - options.gap * (rows - 1)) / rows;
  const pages = source.getPageIndices();
  const totalSheets = Math.ceil(pages.length / options.perSheet);
  for (let sheet = 0; sheet < totalSheets; sheet += 1) {
    const target = output.addPage([sheetWidth, sheetHeight]);
    for (let slot = 0; slot < options.perSheet; slot += 1) {
      const pageIndex = sheet * options.perSheet + slot;
      if (pageIndex >= pages.length) break;
      const sourcePage = source.getPage(pages[pageIndex]);
      const embedded = await output.embedPage(sourcePage);
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      const scale = Math.min(cellWidth / embedded.width, cellHeight / embedded.height);
      const drawnWidth = embedded.width * scale;
      const drawnHeight = embedded.height * scale;
      target.drawPage(embedded, {
        x: options.margin + column * (cellWidth + options.gap) + (cellWidth - drawnWidth) / 2,
        y: sheetHeight - options.margin - (row + 1) * cellHeight - row * options.gap + (cellHeight - drawnHeight) / 2,
        xScale: scale,
        yScale: scale,
      });
    }
  }
  return savePdf(output);
}

export type OverlayPosition = 'center' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface OverlayOptions {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  position: OverlayPosition;
  margin: number;
  pages?: number[];
  font?: 'Helvetica' | 'TimesRoman' | 'Courier';
}

export function hexToRgb(hex: string): RGB {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3 ? normalized.split('').map((value) => value + value).join('') : normalized.padEnd(6, '0');
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return rgb(0, 0, 0);
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255);
}

export async function addTextOverlay(
  bytes: Uint8Array,
  options: OverlayOptions,
  name = 'document.pdf',
): Promise<{ bytes: Uint8Array; warning?: string }> {
  if (!options.text.trim()) throw new Error('Saisissez un texte à ajouter.');
  const document = await loadPdfForWrite(bytes, name);
  const font = await embedOverlayFont(document, options.font ?? 'Helvetica');
  const targets = options.pages?.length ? assertRange(options.pages, document.getPageCount()) : document.getPageIndices().map((index) => index + 1);
  let warning: string | undefined;
  for (const pageNumber of targets) {
    const page = document.getPage(pageNumber - 1);
    const lines = options.text.split('\n');
    const { width } = page.getSize();
    lines.forEach((line, index) => {
      let textWidth: number;
      try {
        textWidth = font.widthOfTextAtSize(line, options.fontSize);
      } catch {
        throw new Error('Ce texte contient des caractères que la police PDF intégrée ne peut pas écrire. Utilisez des caractères latins.');
      }
      if (textWidth > width - options.margin * 2) {
        warning = 'Une ligne ajoutée dépasse la largeur de la page : le texte peut être coupé à l’impression.';
      }
      const { x, y } = overlayCoordinates(options, page, textWidth, options.fontSize, lines.length, index);
      page.drawText(line, {
        x,
        y,
        size: options.fontSize,
        font,
        color: hexToRgb(options.color),
        opacity: options.opacity,
        rotate: degrees(options.rotation),
      });
    });
  }
  return { bytes: await savePdf(document), warning };
}

function overlayCoordinates(
  options: OverlayOptions,
  page: PDFPage,
  textWidth: number,
  fontSize: number,
  lineCount: number,
  lineIndex: number,
): { x: number; y: number } {
  const { width, height } = page.getSize();
  const blockHeight = fontSize * 1.2 * lineCount;
  const centerX = (width - textWidth) / 2;
  const centerY = (height - blockHeight) / 2 + (lineCount - 1 - lineIndex) * fontSize * 1.2;
  const positions: Record<OverlayPosition, { x: number; y: number }> = {
    center: { x: centerX, y: centerY },
    'top-left': { x: options.margin, y: height - options.margin - fontSize - lineIndex * fontSize * 1.2 },
    'top-center': { x: centerX, y: height - options.margin - fontSize - lineIndex * fontSize * 1.2 },
    'top-right': { x: width - options.margin - textWidth, y: height - options.margin - fontSize - lineIndex * fontSize * 1.2 },
    'bottom-left': { x: options.margin, y: options.margin + (lineCount - 1 - lineIndex) * fontSize * 1.2 },
    'bottom-center': { x: centerX, y: options.margin + (lineCount - 1 - lineIndex) * fontSize * 1.2 },
    'bottom-right': { x: width - options.margin - textWidth, y: options.margin + (lineCount - 1 - lineIndex) * fontSize * 1.2 },
  };
  return positions[options.position];
}

async function embedOverlayFont(document: PDFDocument, name: 'Helvetica' | 'TimesRoman' | 'Courier'): Promise<PDFFont> {
  const standard = name === 'TimesRoman' ? StandardFonts.TimesRoman : name === 'Courier' ? StandardFonts.Courier : StandardFonts.Helvetica;
  return document.embedFont(standard);
}

export interface HeaderFooterTokens {
  header?: string;
  footer?: string;
  margin: number;
  fontSize: number;
  color: string;
  pages?: number[];
}

export function expandPageTokens(template: string, pageNumber: number, totalPages: number, date = new Date()): string {
  return template
    .replaceAll('{page}', String(pageNumber))
    .replaceAll('{pages}', String(totalPages))
    .replaceAll('{date}', date.toLocaleDateString('fr-FR'))
    .replaceAll('{heure}', date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    .replaceAll('{nom}', '');
}

export async function addHeaderFooter(bytes: Uint8Array, options: HeaderFooterTokens, name = 'document.pdf'): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const total = document.getPageCount();
  const targets = options.pages?.length ? assertRange(options.pages, total) : document.getPageIndices().map((index) => index + 1);
  for (const pageNumber of targets) {
    const page = document.getPage(pageNumber - 1);
    const { height } = page.getSize();
    const color = hexToRgb(options.color);
    if (options.header?.trim()) {
      const text = expandPageTokens(options.header, pageNumber, total);
      page.drawText(text, { x: options.margin, y: height - options.margin - options.fontSize, size: options.fontSize, font, color });
    }
    if (options.footer?.trim()) {
      const text = expandPageTokens(options.footer, pageNumber, total);
      page.drawText(text, { x: options.margin, y: options.margin, size: options.fontSize, font, color });
    }
  }
  return savePdf(document);
}

export interface PageNumberOptions {
  position: 'bottom-center' | 'bottom-right' | 'top-center' | 'top-right';
  format: string;
  startAt: number;
  fontSize: number;
  margin: number;
  color: string;
  pages?: number[];
}

export async function numberPdfPages(bytes: Uint8Array, options: PageNumberOptions, name = 'document.pdf'): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const total = document.getPageCount();
  const targets = options.pages?.length ? assertRange(options.pages, total) : document.getPageIndices().map((index) => index + 1);
  targets.forEach((pageNumber, index) => {
    const page = document.getPage(pageNumber - 1);
    const { width, height } = page.getSize();
    const displayed = options.startAt + index;
    const text = options.format.replaceAll('{page}', String(displayed)).replaceAll('{pages}', String(total));
    const textWidth = font.widthOfTextAtSize(text, options.fontSize);
    const bottom = options.position.startsWith('bottom');
    const right = options.position.endsWith('right');
    page.drawText(text, {
      x: right ? width - options.margin - textWidth : (width - textWidth) / 2,
      y: bottom ? options.margin : height - options.margin - options.fontSize,
      size: options.fontSize,
      font,
      color: hexToRgb(options.color),
    });
  });
  return savePdf(document);
}

export interface PdfMetadataUpdate {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export async function updatePdfMetadata(bytes: Uint8Array, metadata: PdfMetadataUpdate, name = 'document.pdf'): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  if (metadata.title !== undefined) document.setTitle(metadata.title);
  if (metadata.author !== undefined) document.setAuthor(metadata.author);
  if (metadata.subject !== undefined) document.setSubject(metadata.subject);
  if (metadata.keywords !== undefined) document.setKeywords(metadata.keywords.split(/[,;]/u).map((value) => value.trim()).filter(Boolean));
  document.setModificationDate(new Date());
  return savePdf(document);
}

export async function stripPdfMetadata(bytes: Uint8Array, name = 'document.pdf'): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  document.setTitle('');
  document.setAuthor('');
  document.setSubject('');
  document.setKeywords([]);
  document.setCreator('');
  document.setProducer('');
  document.setCreationDate(new Date(0));
  document.setModificationDate(new Date(0));
  return savePdf(document);
}

export async function embedImageOnPage(
  bytes: Uint8Array,
  options: { page: number; imageBytes: Uint8Array; imageType: 'png' | 'jpg'; x: number; y: number; width: number; height?: number; opacity?: number },
  name = 'document.pdf',
): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  const total = document.getPageCount();
  if (options.page < 1 || options.page > total) throw new Error(`Page ${options.page} hors du document (1 à ${total}).`);
  const page = document.getPage(options.page - 1);
  const image = options.imageType === 'png' ? await document.embedPng(options.imageBytes) : await document.embedJpg(options.imageBytes);
  const scale = options.width / image.width;
  const height = options.height ?? image.height * scale;
  // Les coordonnées sont saisies depuis le coin supérieur gauche, comme dans un lecteur.
  page.drawImage(image, {
    x: options.x,
    y: page.getSize().height - options.y - height,
    width: options.width,
    height,
    opacity: options.opacity ?? 1,
  });
  return savePdf(document);
}

export interface PdfFormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'other';
  value: string;
  options?: string[];
}

export async function listPdfFormFields(bytes: Uint8Array, name = 'document.pdf'): Promise<PdfFormFieldInfo[]> {
  const document = await loadPdfForWrite(bytes, name);
  let fields;
  try {
    fields = document.getForm().getFields();
  } catch {
    return [];
  }
  return fields.map((field) => {
    const constructor = field.constructor.name;
    const type: PdfFormFieldInfo['type'] = constructor === 'PDFTextField'
      ? 'text'
      : constructor === 'PDFCheckBox'
        ? 'checkbox'
        : constructor === 'PDFDropdown'
          ? 'dropdown'
          : constructor === 'PDFRadioGroup'
            ? 'radio'
            : 'other';
    let value = '';
    const options: string[] = [];
    try {
      if (type === 'text') value = (field as unknown as { getText(): string | undefined }).getText() ?? '';
      if (type === 'checkbox') value = (field as unknown as { isChecked(): boolean }).isChecked() ? 'oui' : 'non';
      if (type === 'dropdown') {
        const dropdown = field as unknown as { getSelected(): string[]; getOptions(): string[] };
        value = dropdown.getSelected().join(', ');
        options.push(...dropdown.getOptions());
      }
      if (type === 'radio') value = (field as unknown as { getSelected(): string | undefined }).getSelected() ?? '';
    } catch {
      value = '';
    }
    return { name: field.getName(), type, value, options: options.length ? options : undefined };
  });
}

export async function fillPdfFormFields(
  bytes: Uint8Array,
  values: Record<string, string>,
  name = 'document.pdf',
): Promise<{ bytes: Uint8Array; applied: string[]; skipped: string[] }> {
  const document = await loadPdfForWrite(bytes, name);
  const form = document.getForm();
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const [fieldName, rawValue] of Object.entries(values)) {
    const field = form.getFieldMaybe(fieldName);
    if (!field) {
      skipped.push(fieldName);
      continue;
    }
    const constructor = field.constructor.name;
    try {
      if (constructor === 'PDFTextField') (field as unknown as { setText(value: string): void }).setText(rawValue);
      else if (constructor === 'PDFCheckBox') {
        const checked = ['oui', 'true', '1', 'x', 'yes'].includes(rawValue.trim().toLowerCase());
        const box = field as unknown as { check(): void; uncheck(): void };
        if (checked) box.check();
        else box.uncheck();
      } else if (constructor === 'PDFDropdown') (field as unknown as { select(value: string): void }).select(rawValue);
      else if (constructor === 'PDFRadioGroup') (field as unknown as { select(value: string): void }).select(rawValue);
      else {
        skipped.push(fieldName);
        continue;
      }
      applied.push(fieldName);
    } catch {
      skipped.push(fieldName);
    }
  }
  form.updateFieldAppearances();
  return { bytes: await savePdf(document), applied, skipped };
}

/** Réécriture du fichier avec les flux d’objets : optimisation sans perte de qualité. */
export async function optimizePdfStructure(bytes: Uint8Array, name = 'document.pdf', useObjectStreams = true): Promise<Uint8Array> {
  const document = await loadPdfForWrite(bytes, name);
  return document.save({ useObjectStreams, addDefaultPage: false });
}

export async function countPdfPages(bytes: Uint8Array, name = 'document.pdf'): Promise<number> {
  const document = await loadPdfForWrite(bytes, name);
  return document.getPageCount();
}
