import * as UTIF from 'utif';
import type { FormatId } from '../documents/formats';

/**
 * Moteur image commun.
 *
 * Le traitement passe par le canevas du moteur local : aucune image n’est
 * envoyée ailleurs. Les formats pris en charge à l’écriture sont testés au
 * moment de l’exécution (`canEncode`) plutôt que supposés : Noto n’annonce
 * jamais un export qui échouerait.
 */

export interface DecodedImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Nombre de pages pour un TIFF multipage, de cadres pour un GIF animé. */
  frameCount: number;
  /** Vrai si Noto n’a lu que la première image d’un fichier animé ou multipage. */
  truncated: boolean;
  source: 'canvas' | 'tiff';
}

export interface ImageEncodeOptions {
  format: FormatId;
  quality: number;
  background?: string;
}

const MIME_BY_FORMAT: Partial<Record<FormatId, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  gif: 'image/gif',
};

export const MAX_IMAGE_PIXELS = 64_000_000;

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('Dimensions d’image invalides.');
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`Cette image dépasse la limite de ${Math.round(MAX_IMAGE_PIXELS / 1_000_000)} millions de pixels prise en charge par Noto.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement, willReadFrequently = false): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently });
  if (!context) throw new Error('Le moteur graphique local n’est pas disponible.');
  return context;
}

/** Détecte réellement les formats d’écriture disponibles dans ce moteur. */
export function canEncode(format: FormatId): boolean {
  const mime = MIME_BY_FORMAT[format];
  if (!mime) return false;
  if (format === 'png' || format === 'jpeg') return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const data = canvas.toDataURL(mime);
    return data.startsWith(`data:${mime}`);
  } catch {
    return false;
  }
}

/**
 * Aplatit la transparence sur un fond uni. Le JPEG n’a pas de canal alpha :
 * sans aplatissement, les zones transparentes deviennent noires. Le fond blanc
 * est appliqué par défaut pour le JPEG, et seulement si l’appelant en demande
 * un pour les formats qui gèrent la transparence.
 */
export function flattenCanvas(canvas: HTMLCanvasElement, background: string): HTMLCanvasElement {
  const output = createCanvas(canvas.width, canvas.height);
  const context = context2d(output);
  context.fillStyle = background;
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0);
  return output;
}

export async function canvasToBytes(canvas: HTMLCanvasElement, options: ImageEncodeOptions): Promise<Uint8Array> {
  if (options.format === 'ico') return encodeIco(canvas);
  const mime = MIME_BY_FORMAT[options.format];
  if (!mime) {
    throw new Error(`Le format ${options.format.toUpperCase()} n’est pas disponible à l’écriture.`);
  }
  if (!canEncode(options.format)) {
    throw new Error(`Ce moteur ne sait pas encoder en ${options.format.toUpperCase()}. Choisissez PNG, JPEG ou WebP.`);
  }
  const background = options.background ?? (options.format === 'jpeg' ? '#ffffff' : undefined);
  const source = background ? flattenCanvas(canvas, background) : canvas;
  return new Promise((resolve, reject) => {
    source.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`L’encodage ${options.format.toUpperCase()} a échoué.`));
        return;
      }
      if (source !== canvas) {
        source.width = 0;
        source.height = 0;
      }
      blob.arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, mime, Math.max(0, Math.min(1, options.quality)));
  });
}

/** ICO : Noto encapsule une image PNG, seule variante lisible par Windows sans codec externe. */
export async function encodeIco(canvas: HTMLCanvasElement, size = 256): Promise<Uint8Array> {
  const target = createCanvas(size, size);
  const context = context2d(target);
  context.imageSmoothingQuality = 'high';
  const square = Math.min(canvas.width, canvas.height);
  context.drawImage(canvas, (canvas.width - square) / 2, (canvas.height - square) / 2, square, square, 0, 0, size, size);
  const png = await new Promise<Uint8Array>((resolve, reject) => {
    target.toBlob((blob) => {
      if (!blob) {
        reject(new Error('L’encodage ICO a échoué.'));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
    }, 'image/png');
  });
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  header[6] = size >= 256 ? 0 : size;
  header[7] = size >= 256 ? 0 : size;
  header[8] = 0;
  header[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  const output = new Uint8Array(22 + png.length);
  output.set(header, 0);
  output.set(png, 22);
  return output;
}

export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 512)).trim().toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

/**
 * Nettoyage SVG : les scripts, gestionnaires d’événements et références
 * externes sont retirés avant tout rendu, l’image restant purement locale.
 */
export function sanitizeSvg(source: string): string {
  return source
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/giu, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/giu, '')
    .replace(/\son\w+\s*=\s*'[^']*'/giu, '')
    .replace(/javascript:/giu, '')
    .replace(/<image[^>]+href\s*=\s*"(?!#|data:)[^"]*"[^>]*>/giu, '');
}

async function loadHtmlImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Cette image ne peut pas être décodée par le moteur local.'));
      image.src = url;
    });
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}

export function decodeTiff(bytes: Uint8Array): DecodedImage {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const frames = UTIF.decode(buffer);
  if (!frames.length) throw new Error('Ce fichier TIFF ne contient aucune page lisible.');
  const first = frames[0];
  UTIF.decodeImage(buffer, first);
  const rgba = UTIF.toRGBA8(first);
  const canvas = createCanvas(first.width, first.height);
  const context = context2d(canvas, true);
  const pixels = new Uint8ClampedArray(first.width * first.height * 4);
  pixels.set(rgba.subarray(0, pixels.length));
  const imageData = new ImageData(pixels, first.width, first.height);
  context.putImageData(imageData, 0, 0);
  return {
    canvas,
    width: first.width,
    height: first.height,
    frameCount: frames.length,
    truncated: frames.length > 1,
    source: 'tiff',
  };
}

export async function decodeImage(bytes: Uint8Array, options: { name?: string; format?: FormatId } = {}): Promise<DecodedImage> {
  if (!bytes.length) throw new Error('Ce fichier image est vide.');
  const format = options.format;
  const name = options.name?.toLowerCase() ?? '';
  if (format === 'tiff' || name.endsWith('.tif') || name.endsWith('.tiff')) return decodeTiff(bytes);
  if (format === 'svg' || name.endsWith('.svg') || looksLikeSvg(bytes)) {
    const sanitized = sanitizeSvg(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
    const image = await loadHtmlImage(new Blob([sanitized], { type: 'image/svg+xml' }));
    const width = image.naturalWidth || 512;
    const height = image.naturalHeight || 512;
    const canvas = createCanvas(width, height);
    context2d(canvas).drawImage(image, 0, 0, width, height);
    return { canvas, width, height, frameCount: 1, truncated: false, source: 'canvas' };
  }
  const mime = mimeForBytes(bytes, format);
  const blob = new Blob([toBlobPart(bytes)], mime ? { type: mime } : undefined);
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    bitmap = null;
  }
  if (bitmap) {
    const canvas = createCanvas(bitmap.width, bitmap.height);
    context2d(canvas).drawImage(bitmap, 0, 0);
    const animated = format === 'gif' || format === 'webp' ? looksAnimated(bytes, format) : false;
    const result = { canvas, width: bitmap.width, height: bitmap.height, frameCount: 1, truncated: animated, source: 'canvas' as const };
    bitmap.close?.();
    return result;
  }
  const image = await loadHtmlImage(blob);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error('Cette image ne peut pas être décodée (dimensions illisibles).');
  const canvas = createCanvas(width, height);
  context2d(canvas).drawImage(image, 0, 0, width, height);
  return { canvas, width, height, frameCount: 1, truncated: false, source: 'canvas' };
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function mimeForBytes(bytes: Uint8Array, format?: FormatId): string | undefined {
  if (format && MIME_BY_FORMAT[format]) return MIME_BY_FORMAT[format];
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42) return 'image/webp';
  return undefined;
}

export function looksAnimated(bytes: Uint8Array, format: FormatId): boolean {
  if (format === 'gif') {
    // Deux blocs d’extension graphique ou plus = animation probable.
    let count = 0;
    for (let index = 0; index + 8 < bytes.length && count < 2; index += 1) {
      if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) count += 1;
    }
    return count > 1;
  }
  if (format === 'webp') {
    const source = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4_096)));
    return source.includes('ANIM');
  }
  return false;
}

export interface ImageTransform {
  rotate?: 0 | 90 | 180 | 270;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  crop?: { x: number; y: number; width: number; height: number };
  resize?: { width?: number; height?: number; mode: 'fit' | 'cover' | 'exact' };
  grayscale?: boolean;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  border?: { width: number; color: string };
  watermark?: { text: string; fontSize: number; color: string; opacity: number; position: 'center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'; rotation: number };
  background?: string;
}

export function targetSize(
  width: number,
  height: number,
  resize: NonNullable<ImageTransform['resize']>,
): { width: number; height: number } {
  const requestedWidth = resize.width && resize.width > 0 ? Math.round(resize.width) : undefined;
  const requestedHeight = resize.height && resize.height > 0 ? Math.round(resize.height) : undefined;
  if (!requestedWidth && !requestedHeight) return { width, height };
  if (resize.mode === 'exact') {
    return { width: requestedWidth ?? width, height: requestedHeight ?? height };
  }
  if (resize.mode === 'fit') {
    // Respecte les proportions : l’image tient dans la boîte demandée.
    const scale = Math.min(
      requestedWidth ? requestedWidth / width : Number.POSITIVE_INFINITY,
      requestedHeight ? requestedHeight / height : Number.POSITIVE_INFINITY,
    );
    const safeScale = Number.isFinite(scale) ? scale : 1;
    return { width: Math.max(1, Math.round(width * safeScale)), height: Math.max(1, Math.round(height * safeScale)) };
  }
  const scale = Math.max(
    requestedWidth ? requestedWidth / width : 0,
    requestedHeight ? requestedHeight / height : 0,
  );
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { width: Math.max(1, Math.round(width * safeScale)), height: Math.max(1, Math.round(height * safeScale)) };
}

export function applyTransform(source: HTMLCanvasElement, transform: ImageTransform): HTMLCanvasElement {
  const crop = transform.crop ?? { x: 0, y: 0, width: source.width, height: source.height };
  const clamped = clampCrop(crop, source.width, source.height);
  const rotated = (transform.rotate ?? 0) % 360;
  const swap = rotated === 90 || rotated === 270;
  const resized = transform.resize
    ? targetSize(clamped.width, clamped.height, transform.resize)
    : { width: clamped.width, height: clamped.height };
  const outputWidth = resized.width;
  const outputHeight = resized.height;

  const intermediate = createCanvas(swap ? outputHeight : outputWidth, swap ? outputWidth : outputHeight);
  const intermediateContext = context2d(intermediate, true);
  intermediateContext.save();
  if (transform.background) {
    intermediateContext.fillStyle = transform.background;
    intermediateContext.fillRect(0, 0, intermediate.width, intermediate.height);
  }
  intermediateContext.translate(intermediate.width / 2, intermediate.height / 2);
  intermediateContext.rotate((rotated * Math.PI) / 180);
  if (transform.flipHorizontal) intermediateContext.scale(-1, 1);
  if (transform.flipVertical) intermediateContext.scale(1, -1);
  const drawWidth = swap ? outputHeight : outputWidth;
  const drawHeight = swap ? outputWidth : outputHeight;
  intermediateContext.drawImage(
    source,
    clamped.x,
    clamped.y,
    clamped.width,
    clamped.height,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  );
  intermediateContext.restore();

  const output = createCanvas(outputWidth, outputHeight);
  const context = context2d(output, true);
  if (transform.background) {
    context.fillStyle = transform.background;
    context.fillRect(0, 0, output.width, output.height);
  }
  context.drawImage(intermediate, 0, 0, output.width, output.height);

  if (transform.brightness !== undefined || transform.contrast !== undefined || transform.saturation !== undefined || transform.grayscale) {
    applyColorAdjustments(context, output.width, output.height, transform);
  }
  if (transform.border && transform.border.width > 0) {
    context.strokeStyle = transform.border.color;
    context.lineWidth = transform.border.width;
    context.strokeRect(transform.border.width / 2, transform.border.width / 2, output.width - transform.border.width, output.height - transform.border.width);
  }
  if (transform.watermark?.text?.trim()) {
    drawWatermark(context, output.width, output.height, transform.watermark);
  }
  intermediate.width = 0;
  intermediate.height = 0;
  return output;
}

export function clampCrop(crop: { x: number; y: number; width: number; height: number }, width: number, height: number): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.min(width - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(crop.y)));
  const cropWidth = Math.max(1, Math.min(width - x, Math.round(crop.width)));
  const cropHeight = Math.max(1, Math.min(height - y, Math.round(crop.height)));
  return { x, y, width: cropWidth, height: cropHeight };
}

function drawWatermark(context: CanvasRenderingContext2D, width: number, height: number, watermark: NonNullable<ImageTransform['watermark']>): void {
  const padding = Math.round(Math.max(12, Math.min(width, height) * 0.04));
  context.save();
  context.globalAlpha = watermark.opacity;
  context.fillStyle = watermark.color;
  context.font = `600 ${watermark.fontSize}px 'Segoe UI', system-ui, sans-serif`;
  context.textBaseline = 'middle';
  const metrics = context.measureText(watermark.text);
  const positions: Record<NonNullable<ImageTransform['watermark']>['position'], { x: number; y: number }> = {
    center: { x: (width - metrics.width) / 2, y: height / 2 },
    'bottom-right': { x: width - metrics.width - padding, y: height - padding },
    'bottom-left': { x: padding, y: height - padding },
    'top-right': { x: width - metrics.width - padding, y: padding },
    'top-left': { x: padding, y: padding },
  };
  const position = positions[watermark.position];
  if (watermark.rotation) {
    context.translate(width / 2, height / 2);
    context.rotate((watermark.rotation * Math.PI) / 180);
    context.fillText(watermark.text, -metrics.width / 2, 0);
  } else {
    context.fillText(watermark.text, position.x, position.y);
  }
  context.restore();
}

function applyColorAdjustments(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  transform: ImageTransform,
): void {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const brightness = transform.brightness ?? 0;
  const contrast = (transform.contrast ?? 100) / 100;
  const saturation = (transform.saturation ?? 100) / 100;
  for (let index = 0; index < data.length; index += 4) {
    let red = data[index] + brightness * 255;
    let green = data[index + 1] + brightness * 255;
    let blue = data[index + 2] + brightness * 255;
    red = ((red / 255 - 0.5) * contrast + 0.5) * 255;
    green = ((green / 255 - 0.5) * contrast + 0.5) * 255;
    blue = ((blue / 255 - 0.5) * contrast + 0.5) * 255;
    if (saturation !== 1 || transform.grayscale) {
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const factor = transform.grayscale ? 0 : saturation;
      red = luminance + (red - luminance) * factor;
      green = luminance + (green - luminance) * factor;
      blue = luminance + (blue - luminance) * factor;
    }
    data[index] = Math.max(0, Math.min(255, red));
    data[index + 1] = Math.max(0, Math.min(255, green));
    data[index + 2] = Math.max(0, Math.min(255, blue));
  }
  context.putImageData(image, 0, 0);
}

export interface SheetOptions {
  columns: number;
  cellSize: number;
  gap: number;
  background: string;
  label?: boolean;
  labelColor: string;
}

export function sheetSize(count: number, options: SheetOptions): { width: number; height: number; columns: number; rows: number } {
  const columns = Math.max(1, Math.min(options.columns, count));
  const rows = Math.ceil(count / columns);
  return {
    columns,
    rows,
    width: columns * options.cellSize + (columns + 1) * options.gap,
    height: rows * (options.cellSize + (options.label ? 22 : 0)) + (rows + 1) * options.gap,
  };
}

export function drawSheet(
  images: { canvas: HTMLCanvasElement; label?: string }[],
  options: SheetOptions,
): HTMLCanvasElement {
  if (!images.length) throw new Error('Aucune image à disposer.');
  const { width, height, columns } = sheetSize(images.length, options);
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  context.fillStyle = options.background;
  context.fillRect(0, 0, width, height);
  images.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellTop = options.gap + row * (options.cellSize + (options.label ? 22 : 0) + options.gap);
    const cellLeft = options.gap + column * (options.cellSize + options.gap);
    const scale = Math.min(options.cellSize / entry.canvas.width, options.cellSize / entry.canvas.height);
    const drawWidth = entry.canvas.width * scale;
    const drawHeight = entry.canvas.height * scale;
    context.fillStyle = '#ffffff';
    context.fillRect(cellLeft, cellTop, options.cellSize, options.cellSize);
    context.drawImage(
      entry.canvas,
      cellLeft + (options.cellSize - drawWidth) / 2,
      cellTop + (options.cellSize - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    if (options.label && entry.label) {
      context.fillStyle = options.labelColor;
      context.font = '11px "Segoe UI", system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(entry.label.slice(0, 40), cellLeft + options.cellSize / 2, cellTop + options.cellSize + 15, options.cellSize);
      context.textAlign = 'start';
    }
  });
  return canvas;
}

export function tileRegions(width: number, height: number, columns: number, rows: number): { x: number; y: number; width: number; height: number }[] {
  const safeColumns = Math.max(1, Math.min(20, Math.round(columns)));
  const safeRows = Math.max(1, Math.min(20, Math.round(rows)));
  const regions: { x: number; y: number; width: number; height: number }[] = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeColumns; column += 1) {
      const x = Math.round((column * width) / safeColumns);
      const y = Math.round((row * height) / safeRows);
      const nextX = Math.round(((column + 1) * width) / safeColumns);
      const nextY = Math.round(((row + 1) * height) / safeRows);
      regions.push({ x, y, width: nextX - x, height: nextY - y });
    }
  }
  return regions;
}

/**
 * Empreinte perceptuelle simple (moyenne 8×8). Elle sert à repérer des images
 * visuellement proches : c’est une similarité probable, jamais une preuve de
 * duplication.
 */
export function perceptualHash(canvas: HTMLCanvasElement): string {
  const size = 8;
  const small = createCanvas(size, size);
  const context = context2d(small, true);
  context.drawImage(canvas, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  const luminance: number[] = [];
  for (let index = 0; index < data.length; index += 4) {
    luminance.push(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]);
  }
  const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  let bits = '';
  for (const value of luminance) bits += value >= average ? '1' : '0';
  let hex = '';
  for (let index = 0; index < bits.length; index += 4) hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  return hex;
}

export function hammingDistance(left: string, right: string): number {
  if (left.length !== right.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number.parseInt(left[index], 16);
    const b = Number.parseInt(right[index], 16);
    let xor = a ^ b;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export interface ImageDifference {
  identical: boolean;
  differencePercent: number;
  sizeMismatch: boolean;
  width: number;
  height: number;
}

export function compareCanvases(left: HTMLCanvasElement, right: HTMLCanvasElement): ImageDifference {
  const width = Math.min(left.width, right.width);
  const height = Math.min(left.height, right.height);
  const leftData = context2d(left, true).getImageData(0, 0, width, height);
  const rightData = context2d(right, true).getImageData(0, 0, width, height);
  let changed = 0;
  for (let index = 0; index < leftData.data.length; index += 4) {
    const delta = Math.abs(leftData.data[index] - rightData.data[index])
      + Math.abs(leftData.data[index + 1] - rightData.data[index + 1])
      + Math.abs(leftData.data[index + 2] - rightData.data[index + 2]);
    if (delta > 30) changed += 1;
  }
  const percent = Math.round((changed / Math.max(1, width * height)) * 1000) / 10;
  return {
    identical: percent < 0.05 && left.width === right.width && left.height === right.height,
    differencePercent: percent,
    sizeMismatch: left.width !== right.width || left.height !== right.height,
    width: left.width,
    height: left.height,
  };
}

export function formatDescriptorIsRaster(format: FormatId): boolean {
  return ['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'ico'].includes(format);
}
