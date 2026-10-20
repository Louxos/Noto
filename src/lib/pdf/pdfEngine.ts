import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/**
 * Moteur PDF commun.
 *
 * Deux bibliothèques sont utilisées, chacune pour ce qu’elle fait réellement :
 * - `pdfjs-dist` (Apache-2.0) pour la lecture, le rendu, l’extraction de texte
 *   et la détection des pages numérisées ;
 * - `pdf-lib` (MIT) pour l’écriture : fusion, découpe, rotation, superpositions,
 *   métadonnées et formulaires.
 *
 * Noto sépare volontairement ces rôles : un PDF protégé par mot de passe est
 * lisible (avec le mot de passe fourni par l’utilisateur) mais n’est pas
 * modifiable, car `pdf-lib` ne déchiffre pas les documents. Cette limite est
 * annoncée dans l’interface au lieu d’être masquée.
 */

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * Charge pdf.js une seule fois, avec le bon moteur selon l’environnement :
 * build navigateur + worker dédié dans l’application, build « legacy » en
 * environnement sans DOM (tests automatisés) où le worker s’exécute en ligne.
 */
export function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= (async () => {
    const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (hasDom) {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    }
    const legacy = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return legacy as unknown as PdfjsModule;
  })();
  return pdfjsPromise;
}

export const MAX_PDF_BYTES = 512 * 1024 * 1024;
/** En dessous de ce nombre de caractères, une page est considérée comme numérisée. */
export const SCANNED_PAGE_CHARACTER_THRESHOLD = 24;

export class PdfPasswordRequiredError extends Error {
  constructor() {
    super('Ce PDF est protégé par un mot de passe. Saisissez-le pour l’ouvrir.');
    this.name = 'PdfPasswordRequiredError';
  }
}

export class PdfPasswordIncorrectError extends Error {
  constructor() {
    super('Le mot de passe fourni ne permet pas d’ouvrir ce PDF.');
    this.name = 'PdfPasswordIncorrectError';
  }
}

export class PdfCorruptError extends Error {
  constructor(detail?: string) {
    super(detail ? `Ce fichier PDF est illisible ou endommagé (${detail}).` : 'Ce fichier PDF est illisible ou endommagé.');
    this.name = 'PdfCorruptError';
  }
}

export interface OpenPdfOptions {
  password?: string;
  signal?: AbortSignal;
  onProgress?: (value: number) => void;
}

export async function openPdf(bytes: Uint8Array, options: OpenPdfOptions = {}): Promise<PDFDocumentProxy> {
  if (!bytes.length) throw new PdfCorruptError('fichier vide');
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error(`Ce PDF dépasse la limite de ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} Mo prise en charge par Noto.`);
  }
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password: options.password,
    isEvalSupported: false,
    disableFontFace: true,
    // Les polices standard ne sont jamais téléchargées : le rendu texte reste local.
    useSystemFonts: true,
    stopAtErrors: false,
  });
  const onAbort = () => void task.destroy();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.onProgress) {
    task.onProgress = (progress: { loaded: number; total: number }) => {
      if (progress.total) options.onProgress?.(Math.min(1, progress.loaded / progress.total));
    };
  }
  try {
    return await task.promise;
  } catch (error) {
    void task.destroy();
    throw toPdfReadError(error);
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export function toPdfReadError(error: unknown): Error {
  const name = (error as { name?: string })?.name;
  if (name === 'PasswordException') {
    const code = (error as { code?: number }).code;
    return code === 2 ? new PdfPasswordIncorrectError() : new PdfPasswordRequiredError();
  }
  if (name === 'InvalidPDFException' || name === 'MissingPDFException') return new PdfCorruptError(name);
  if (name === 'AbortException') return new DOMException('Opération annulée.', 'AbortError');
  if (error instanceof Error) return error;
  return new PdfCorruptError();
}

export interface TextBox {
  text: string;
  /** Coordonnées PDF (origine en bas à gauche) en points. */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface PageText {
  pageNumber: number;
  text: string;
  items: TextBox[];
  width: number;
  height: number;
  rotation: number;
}

export interface DocumentText {
  pageCount: number;
  pages: PageText[];
  scannedPages: number[];
  characterCount: number;
}

export async function readPageText(page: PDFPageProxy): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: TextBox[] = [];
  const lines: string[] = [];
  let currentLine: string[] = [];
  let previousY: number | null = null;
  for (const raw of content.items) {
    if (!('str' in raw)) continue;
    const item = raw as { str: string; transform: number[]; width: number; height: number };
    const x = item.transform[4];
    const y = item.transform[5];
    const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || item.height || 10;
    items.push({ text: item.str, x, y, width: item.width, height: item.height || fontSize, fontSize });
    if (previousY === null || Math.abs(previousY - y) > fontSize * 0.35) {
      if (currentLine.length) lines.push(currentLine.join('').replace(/\s+$/u, ''));
      currentLine = [item.str];
      previousY = y;
    } else {
      currentLine.push(item.str);
    }
  }
  if (currentLine.length) lines.push(currentLine.join('').replace(/\s+$/u, ''));
  return {
    pageNumber: page.pageNumber,
    text: lines.join('\n'),
    items,
    width: viewport.width,
    height: viewport.height,
    rotation: viewport.rotation,
  };
}

export async function readDocumentText(
  pdf: PDFDocumentProxy,
  options: { onProgress?: (value: number, page: number) => void; signal?: AbortSignal; pages?: number[] } = {},
): Promise<DocumentText> {
  const pageNumbers = options.pages ?? Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  const pages: PageText[] = [];
  const scannedPages: number[] = [];
  let characterCount = 0;
  for (let index = 0; index < pageNumbers.length; index += 1) {
    if (options.signal?.aborted) throw new DOMException('Opération annulée.', 'AbortError');
    const pageNumber = pageNumbers[index];
    const page = await pdf.getPage(pageNumber);
    const text = await readPageText(page);
    page.cleanup();
    const meaningful = text.text.replace(/\s/gu, '').length;
    characterCount += meaningful;
    if (meaningful < SCANNED_PAGE_CHARACTER_THRESHOLD) scannedPages.push(pageNumber);
    pages.push(text);
    options.onProgress?.((index + 1) / pageNumbers.length, pageNumber);
  }
  return { pageCount: pdf.numPages, pages, scannedPages, characterCount };
}

export interface RenderedPage {
  pageNumber: number;
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: string;
}

export type RasterMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export function canvasToBytes(canvas: HTMLCanvasElement, mimeType: RasterMimeType, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Le rendu d’image n’est pas disponible dans cet environnement.'));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(mimeType === 'image/webp'
          ? 'L’encodage WebP n’est pas pris en charge par ce moteur.'
          : 'Le rendu de la page a échoué.'));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
    }, mimeType, quality);
  });
}

export async function renderPageToBytes(
  page: PDFPageProxy,
  options: { scale: number; mimeType: RasterMimeType; quality?: number; signal?: AbortSignal },
): Promise<RenderedPage> {
  const viewport = page.getViewport({ scale: options.scale });
  if (viewport.width * viewport.height > 40_000_000) {
    throw new Error('La résolution demandée produit une image trop grande. Réduisez la résolution ou la qualité.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Le moteur graphique local n’est pas disponible pour le rendu.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: context, viewport, intent: 'display' });
  const onAbort = () => task.cancel();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await task.promise;
  } catch (error) {
    if ((error as { name?: string })?.name === 'RenderingCancelledException' || options.signal?.aborted) {
      throw new DOMException('Opération annulée.', 'AbortError');
    }
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
  const bytes = await canvasToBytes(canvas, options.mimeType, options.quality ?? 0.85);
  const width = canvas.width;
  const height = canvas.height;
  canvas.width = 0;
  canvas.height = 0;
  return { pageNumber: page.pageNumber, bytes, width, height, mimeType: options.mimeType };
}

export function dpiToScale(dpi: number): number {
  return Math.max(0.2, Math.min(6, dpi / 72));
}

export interface PdfInfo {
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pdfVersion?: string;
  linearized: boolean;
  encrypted: boolean;
  hasAcroForm: boolean;
  hasSignatures: boolean;
  pageSizes: { pageNumber: number; width: number; height: number; rotation: number }[];
}

export async function readPdfInfo(pdf: PDFDocumentProxy): Promise<PdfInfo> {
  const info = await pdf.getMetadata().catch(() => ({ info: {} as Record<string, unknown>, metadata: null }));
  const details = info.info as Record<string, unknown>;
  const pageSizes: PdfInfo['pageSizes'] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pageSizes.push({
      pageNumber,
      width: Math.round(viewport.width * 100) / 100,
      height: Math.round(viewport.height * 100) / 100,
      rotation: viewport.rotation,
    });
    page.cleanup();
  }
  return {
    pageCount: pdf.numPages,
    title: asText(details.Title),
    author: asText(details.Author),
    subject: asText(details.Subject),
    keywords: asText(details.Keywords),
    creator: asText(details.Creator),
    producer: asText(details.Producer),
    creationDate: asText(details.CreationDate),
    modificationDate: asText(details.ModDate),
    pdfVersion: asText(details.PDFFormatVersion),
    linearized: details.IsLinearized === true,
    encrypted: typeof details.EncryptFilterName === 'string' && details.EncryptFilterName.length > 0,
    hasAcroForm: details.IsAcroFormPresent === true,
    hasSignatures: details.IsSignaturesPresent === true,
    pageSizes,
  };
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

/** Liste les polices référencées par le fichier, sans dépendre du rendu. */
export function readPdfFontNames(bytes: Uint8Array): string[] {
  const source = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024)));
  const names = new Set<string>();
  const pattern = /\/BaseFont\s*\/([A-Za-z0-9+\-_,.]{1,80})/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    names.add(match[1].replace(/^[A-Z]{6}\+/u, ''));
    if (names.size > 60) break;
  }
  return [...names].sort((left, right) => left.localeCompare(right, 'fr'));
}

/** Analyse légère des pages : détecte les pages blanches et la résolution des images. */
export interface PageAnalysis {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  characterCount: number;
  blank: boolean;
  scanned: boolean;
}

export async function analyzePdfPages(
  pdf: PDFDocumentProxy,
  options: { onProgress?: (value: number) => void; signal?: AbortSignal } = {},
): Promise<PageAnalysis[]> {
  const analysis: PageAnalysis[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (options.signal?.aborted) throw new DOMException('Opération annulée.', 'AbortError');
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const text = await readPageText(page);
    const characters = text.text.replace(/\s/gu, '').length;
    const drawnItems = await countDrawOperators(page);
    page.cleanup();
    analysis.push({
      pageNumber,
      width: Math.round(viewport.width * 100) / 100,
      height: Math.round(viewport.height * 100) / 100,
      rotation: viewport.rotation,
      characterCount: characters,
      blank: characters === 0 && drawnItems === 0,
      scanned: characters < SCANNED_PAGE_CHARACTER_THRESHOLD,
    });
    options.onProgress?.(pageNumber / pdf.numPages);
  }
  return analysis;
}

async function countDrawOperators(page: PDFPageProxy): Promise<number> {
  try {
    const operators = await page.getOperatorList();
    const drawing = new Set([1, 2, 3, 4, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 85, 86, 87, 88]);
    return operators.fnArray.filter((operation) => drawing.has(operation)).length;
  } catch {
    // Si la page ne peut pas être analysée, Noto ne la déclare pas blanche.
    return 1;
  }
}

export function formatPageRangeInput(input: string, pageCount: number): number[] {
  const pages = new Set<number>();
  for (const chunk of input.split(',')) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const range = trimmed.split('-').map((value) => value.trim());
    if (range.length === 1) {
      const page = Number.parseInt(range[0], 10);
      if (Number.isFinite(page) && page >= 1 && page <= pageCount) pages.add(page);
      continue;
    }
    if (range.length === 2) {
      const start = Number.parseInt(range[0], 10) || 1;
      const end = Number.parseInt(range[1], 10) || pageCount;
      for (let page = Math.max(1, start); page <= Math.min(pageCount, end); page += 1) pages.add(page);
    }
  }
  if (!pages.size) throw new Error(`Aucune page valide dans « ${input} ». Utilisez par exemple 1-3,5,8-10 (document de ${pageCount} pages).`);
  return [...pages].sort((left, right) => left - right);
}
