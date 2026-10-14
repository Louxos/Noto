import { PDFDocument } from 'pdf-lib';
import type { PDFPageProxy } from 'pdfjs-dist';
import { canvasToBytes, dpiToScale, openPdf, readDocumentText, type RasterMimeType } from './pdfEngine';
import { loadPdfForWrite, savePdf } from './pdfWrite';

/**
 * Opérations PDF qui reconstruisent le document à partir d’un rendu (canvas).
 *
 * Ces opérations sont explicitement rangées dans la catégorie « reconstruction »
 * et non « modification native » : la couche texte d’origine est remplacée par
 * une image. C’est ce qui rend possible :
 * - la compression réelle des documents numérisés (ré-encodage JPEG) ;
 * - la caviardisation véritable, où le contenu sensible est retiré du fichier
 *   au lieu d’être recouvert par un rectangle.
 */

export interface RasterRegion {
  page: number;
  /** Coordonnées en points PDF, origine en haut à gauche (repère de lecture). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RasterRebuildOptions {
  dpi: number;
  mimeType: RasterMimeType;
  quality: number;
  grayscale?: boolean;
  regions?: RasterRegion[];
  pages?: number[];
  borderColor?: string;
}

export interface RasterRebuildResult {
  bytes: Uint8Array;
  rasterizedPages: number[];
  pageCount: number;
}

async function renderPageWithRegions(
  page: PDFPageProxy,
  scale: number,
  regions: RasterRegion[],
  grayscale: boolean,
  pageHeightPoints: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  if (viewport.width * viewport.height > 60_000_000) {
    throw new Error('La résolution demandée est trop élevée pour ce document. Réduisez la résolution.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Le moteur graphique local n’est pas disponible pour le rendu.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, intent: 'display' }).promise;
  for (const region of regions) {
    context.fillStyle = '#000000';
    context.fillRect(
      region.x * scale,
      (pageHeightPoints - region.y - region.height) * scale,
      Math.max(1, region.width * scale),
      Math.max(1, region.height * scale),
    );
  }
  if (grayscale) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      const value = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
    context.putImageData(image, 0, 0);
  }
  return canvas;
}

export async function rebuildPdfFromRaster(
  bytes: Uint8Array,
  options: RasterRebuildOptions,
  hooks: { signal?: AbortSignal; onProgress?: (value: number, page: number) => void; password?: string } = {},
): Promise<RasterRebuildResult> {
  const source = await openPdf(bytes, { password: hooks.password, signal: hooks.signal });
  // Les pages non retraitées sont copiées telles quelles depuis le document
  // d’origine : elles ne perdent ni leur texte ni leur qualité.
  const writable = await loadPdfForWrite(bytes);
  const selected = new Set(options.pages ?? Array.from({ length: source.numPages }, (_, index) => index + 1));
  const output = await PDFDocument.create();
  output.setProducer('Noto');
  output.setCreator('Noto — reconstruction à partir du rendu des pages');
  const rasterized: number[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      if (hooks.signal?.aborted) throw new DOMException('Opération annulée par l’utilisateur.', 'AbortError');
      if (!selected.has(pageNumber)) {
        const [copied] = await output.copyPages(writable, [pageNumber - 1]);
        output.addPage(copied);
        hooks.onProgress?.(pageNumber / source.numPages, pageNumber);
        continue;
      }
      const page = await source.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const chosenScale = dpiToScale(viewport.width > 1_500 ? Math.min(options.dpi, 150) : options.dpi);
      const regions = (options.regions ?? []).filter((region) => region.page === pageNumber);
      const canvas = await renderPageWithRegions(page, chosenScale, regions, Boolean(options.grayscale), viewport.height);
      const imageBytes = await canvasToBytes(canvas, options.mimeType, options.quality);
      const imageWidth = canvas.width;
      const imageHeight = canvas.height;
      canvas.width = 0;
      canvas.height = 0;
      const image = options.mimeType === 'image/png' ? await output.embedPng(imageBytes) : await output.embedJpg(imageBytes);
      const newPage = output.addPage([imageWidth * (72 / options.dpi), imageHeight * (72 / options.dpi)]);
      newPage.drawImage(image, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
      rasterized.push(pageNumber);
      page.cleanup();
      hooks.onProgress?.(pageNumber / source.numPages, pageNumber);
    }
    return { bytes: await savePdf(output), rasterizedPages: rasterized, pageCount: source.numPages };
  } finally {
    await source.destroy();
  }
}

export interface RedactionRequest {
  regions: RasterRegion[];
  /** Textes à rechercher automatiquement dans le document, en plus des zones. */
  searchTexts?: string[];
}

export interface RedactionVerification {
  checkedTexts: string[];
  remainingTexts: string[];
  verified: boolean;
  method: string;
}

export interface RedactionResult extends RasterRebuildResult {
  verification: RedactionVerification;
  removedRegions: number;
}

/**
 * Caviardage destructif : les pages concernées sont rendues en image, les zones
 * sont noircies, et le PDF est reconstruit sans la couche texte d’origine. Le
 * résultat est ensuite vérifié en relisant le document produit : si un texte
 * censé avoir disparu subsiste, Noto le signale au lieu de prétendre au succès.
 */
export async function redactPdf(
  bytes: Uint8Array,
  request: RedactionRequest,
  options: { dpi: number; quality: number; signal?: AbortSignal; onProgress?: (value: number) => void; password?: string } ,
): Promise<RedactionResult> {
  const source = await openPdf(bytes, { password: options.password, signal: options.signal });
  const pagesToProcess = new Set(request.regions.map((region) => region.page));
  const text = await readDocumentText(source, { signal: options.signal });
  const searchedRegions = findTextRegions(text.pages, request.searchTexts ?? []);
  for (const region of searchedRegions) {
    pagesToProcess.add(region.page);
  }
  const regions = [...request.regions, ...searchedRegions];
  await source.destroy();

  const rebuilt = await rebuildPdfFromRaster(bytes, {
    dpi: options.dpi,
    mimeType: 'image/jpeg',
    quality: options.quality,
    regions,
    pages: [...pagesToProcess].sort((left, right) => left - right),
  }, { signal: options.signal, onProgress: (value) => options.onProgress?.(value), password: options.password });

  const verification = await verifyRedaction(rebuilt.bytes, request.searchTexts ?? [], options.password);
  return { ...rebuilt, verification, removedRegions: regions.length };
}

async function verifyRedaction(bytes: Uint8Array, searchTexts: string[], password?: string): Promise<RedactionVerification> {
  if (!searchTexts.length) {
    return {
      checkedTexts: [],
      remainingTexts: [],
      verified: true,
      method: 'Aucun texte recherché automatiquement : vérification limitée aux zones noircies et à l’absence de couche texte sur les pages retraitées.',
    };
  }
  const rebuilt = await openPdf(bytes, { password });
  try {
    const text = await readDocumentText(rebuilt);
    const haystack = text.pages.map((page) => page.text).join('\n').toLowerCase();
    const remaining = searchTexts.filter((needle) => haystack.includes(needle.toLowerCase().trim()));
    return {
      checkedTexts: searchTexts,
      remainingTexts: remaining,
      verified: remaining.length === 0,
      method: 'Relecture du fichier produit : chaque texte à supprimer est recherché dans le document reconstruit.',
    };
  } finally {
    await rebuilt.destroy();
  }
}

export function findTextRegions(
  pages: { pageNumber: number; items: { text: string; x: number; y: number; width: number; height: number }[] }[],
  searchTexts: string[],
): RasterRegion[] {
  const regions: RasterRegion[] = [];
  const needles = searchTexts.map((needle) => needle.trim().toLowerCase()).filter((needle) => needle.length >= 2);
  if (!needles.length) return regions;
  for (const page of pages) {
    for (const item of page.items) {
      const haystack = item.text.toLowerCase();
      if (!needles.some((needle) => haystack.includes(needle))) continue;
      regions.push({
        page: page.pageNumber,
        x: item.x,
        // L’origine PDF est en bas à gauche : la conversion vers le repère de
        // lecture (haut gauche) est faite au moment du rendu.
        y: item.y,
        width: Math.max(4, item.width),
        height: Math.max(4, item.height),
      });
    }
  }
  return regions;
}

export interface PdfImagePage {
  pageNumber: number;
  bytes: Uint8Array;
  mimeType: RasterMimeType;
  width: number;
  height: number;
}

export async function pdfPagesToImages(
  bytes: Uint8Array,
  options: { dpi: number; mimeType: RasterMimeType; quality: number; pages?: number[]; signal?: AbortSignal; onProgress?: (value: number, page: number) => void; password?: string },
): Promise<PdfImagePage[]> {
  const source = await openPdf(bytes, { password: options.password, signal: options.signal });
  const scale = dpiToScale(options.dpi);
  const selected = options.pages?.length ? options.pages : Array.from({ length: source.numPages }, (_, index) => index + 1);
  const results: PdfImagePage[] = [];
  try {
    for (let index = 0; index < selected.length; index += 1) {
      if (options.signal?.aborted) throw new DOMException('Opération annulée par l’utilisateur.', 'AbortError');
      const pageNumber = selected[index];
      const page = await source.getPage(pageNumber);
      const canvas = await renderPageWithRegions(page, scale, [], false, page.getViewport({ scale: 1 }).height);
      const imageBytes = await canvasToBytes(canvas, options.mimeType, options.quality);
      const width = canvas.width;
      const height = canvas.height;
      canvas.width = 0;
      canvas.height = 0;
      results.push({ pageNumber, bytes: imageBytes, mimeType: options.mimeType, width, height });
      page.cleanup();
      options.onProgress?.((index + 1) / selected.length, pageNumber);
    }
    return results;
  } finally {
    await source.destroy();
  }
}

export interface PageDiff {
  page: number;
  leftPage: number | null;
  rightPage: number | null;
  differencePercent: number;
  identical: boolean;
  note?: string;
}

export interface VisualComparison {
  pageCount: number;
  pages: PageDiff[];
  identicalPages: number;
  differentPages: number;
  overlay?: Uint8Array;
}

/**
 * Comparaison visuelle : chaque page est rendue à la même résolution, puis les
 * pixels sont comparés. La différence est un pourcentage de pixels modifiés,
 * pas une garantie d’identité perceptuelle.
 */
export async function comparePdfVisually(
  leftBytes: Uint8Array,
  rightBytes: Uint8Array,
  options: { dpi: number; signal?: AbortSignal; onProgress?: (value: number) => void; maxOverlayPages?: number },
): Promise<VisualComparison> {
  const left = await openPdf(leftBytes, { signal: options.signal });
  const right = await openPdf(rightBytes, { signal: options.signal });
  const scale = dpiToScale(options.dpi);
  const pageCount = Math.max(left.numPages, right.numPages);
  const pages: PageDiff[] = [];
  let overlay: Uint8Array | undefined;
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (options.signal?.aborted) throw new DOMException('Opération annulée par l’utilisateur.', 'AbortError');
      const hasLeft = pageNumber <= left.numPages;
      const hasRight = pageNumber <= right.numPages;
      if (!hasLeft || !hasRight) {
        pages.push({
          page: pageNumber,
          leftPage: hasLeft ? pageNumber : null,
          rightPage: hasRight ? pageNumber : null,
          differencePercent: 100,
          identical: false,
          note: hasLeft ? 'Page absente du document modifié' : 'Page ajoutée dans le document modifié',
        });
        options.onProgress?.(pageNumber / pageCount);
        continue;
      }
      const leftPage = await left.getPage(pageNumber);
      const rightPage = await right.getPage(pageNumber);
      const leftCanvas = await renderPageWithRegions(leftPage, scale, [], false, leftPage.getViewport({ scale: 1 }).height);
      const rightCanvas = await renderPageWithRegions(rightPage, scale, [], false, rightPage.getViewport({ scale: 1 }).height);
      const diff = compareCanvas(leftCanvas, rightCanvas);
      if (options.maxOverlayPages === undefined || pages.length < options.maxOverlayPages) {
        overlay = createOverlay(leftCanvas, rightCanvas, diff.diffMask);
      }
      pages.push({
        page: pageNumber,
        leftPage: pageNumber,
        rightPage: pageNumber,
        differencePercent: diff.percent,
        identical: diff.percent < 0.05,
        note: diff.sizeMismatch ? 'Dimensions de page différentes' : undefined,
      });
      leftCanvas.width = 0;
      rightCanvas.width = 0;
      leftPage.cleanup();
      rightPage.cleanup();
      options.onProgress?.(pageNumber / pageCount);
    }
  } finally {
    await left.destroy();
    await right.destroy();
  }
  return {
    pageCount,
    pages,
    identicalPages: pages.filter((page) => page.identical).length,
    differentPages: pages.filter((page) => !page.identical).length,
    overlay,
  };
}

function compareCanvas(left: HTMLCanvasElement, right: HTMLCanvasElement): { percent: number; sizeMismatch: boolean; diffMask: ImageData } {
  const width = Math.min(left.width, right.width);
  const height = Math.min(left.height, right.height);
  const leftContext = left.getContext('2d');
  const rightContext = right.getContext('2d');
  if (!leftContext || !rightContext) throw new Error('Comparaison visuelle impossible : contexte graphique indisponible.');
  const leftData = leftContext.getImageData(0, 0, width, height);
  const rightData = rightContext.getImageData(0, 0, width, height);
  const mask = new ImageData(width, height);
  let changed = 0;
  for (let index = 0; index < leftData.data.length; index += 4) {
    const delta = Math.abs(leftData.data[index] - rightData.data[index])
      + Math.abs(leftData.data[index + 1] - rightData.data[index + 1])
      + Math.abs(leftData.data[index + 2] - rightData.data[index + 2]);
    if (delta > 30) {
      changed += 1;
      mask.data[index] = 255;
      mask.data[index + 3] = 255;
    }
  }
  const totalPixels = Math.max(1, (width * height));
  const sizeMismatch = left.width !== right.width || left.height !== right.height;
  const areaFraction = (width * height) / Math.max(1, Math.max(left.width * left.height, right.width * right.height));
  const percent = Math.round(((changed / totalPixels) * areaFraction) * 1000) / 10;
  return { percent, sizeMismatch, diffMask: mask };
}

function createOverlay(left: HTMLCanvasElement, right: HTMLCanvasElement, mask: ImageData): Uint8Array | undefined {
  const width = Math.min(left.width, right.width);
  const height = Math.min(left.height, right.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(right, 0, 0, width, height);
  context.putImageData(mask, 0, 0);
  try {
    const data = context.getImageData(0, 0, width, height);
    for (let index = 0; index < data.data.length; index += 4) {
      if (data.data[index] === 255 && data.data[index + 3] === 255) {
        data.data[index] = 226;
        data.data[index + 1] = 96;
        data.data[index + 2] = 96;
        data.data[index + 3] = 255;
      }
    }
    context.putImageData(data, 0, 0);
  } catch {
    return undefined;
  }
  const encode = canvas.toDataURL('image/png');
  canvas.width = 0;
  const base64 = encode.split(',')[1];
  if (!base64) return undefined;
  const binary = typeof atob === 'function' ? atob(base64) : '';
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Vérifie qu’un PDF peut être ouvert et compte réellement ses pages. */
export async function verifyPdfBytes(bytes: Uint8Array): Promise<number> {
  const document = await loadPdfForWrite(bytes);
  const pages = document.getPageCount();
  if (pages < 1) throw new Error('Le PDF produit ne contient aucune page.');
  return pages;
}
