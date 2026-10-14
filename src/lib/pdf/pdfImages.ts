import { inflateSync } from 'fflate';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, type PDFPage } from 'pdf-lib';
import { hexToRgb, loadPdfForWrite } from './pdfWrite';

/**
 * Extraction des images incorporées dans un PDF.
 *
 * Noto lit directement les objets image du fichier :
 * - les images JPEG (filtre DCTDecode) sont extraites telles quelles, sans
 *   réencodage, donc sans perte ;
 * - les images en pixels bruts (FlateDecode) sont reconstruites ;
 * - les filtres exotiques (JPEG 2000, fax) sont signalés comme non pris en
 *   charge au lieu d’être ignorés en silence.
 */

export interface ExtractedImage {
  page: number;
  name: string;
  bytes: Uint8Array;
  extension: 'jpg' | 'png';
  width: number;
  height: number;
  note?: string;
}

export interface ImageExtractionResult {
  images: ExtractedImage[];
  unsupported: string[];
}

export async function extractPdfImages(bytes: Uint8Array, options: { onProgress?: (value: number, page: number) => void } = {}): Promise<ImageExtractionResult> {
  const document = await loadPdfForWrite(bytes);
  const images: ExtractedImage[] = [];
  const unsupported = new Set<string>();
  const seen = new Set<string>();

  for (let pageIndex = 0; pageIndex < document.getPageCount(); pageIndex += 1) {
    const page = document.getPage(pageIndex);
    const resources = resolveResources(page);
    if (!resources) continue;
    const xObjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xObjects) continue;
    for (const [, value] of xObjects.entries()) {
      const reference = value instanceof PDFRef ? value : undefined;
      const stream = document.context.lookupMaybe(reference ?? value, PDFStream);
      if (!(stream instanceof PDFRawStream)) continue;
      const key = reference ? reference.toString() : String(stream);
      if (seen.has(key)) continue;
      seen.add(key);
      const subtype = stream.dict.lookup(PDFName.of('Subtype'));
      if (subtype !== PDFName.of('Image')) {
        seen.delete(key);
        continue;
      }
      const width = numberFrom(stream.dict, 'Width');
      const height = numberFrom(stream.dict, 'Height');
      const filters = filterNames(stream.dict);
      const index = images.length + 1;
      if (filters.includes('DCTDecode')) {
        images.push({
          page: pageIndex + 1,
          name: `image-${index}.jpg`,
          bytes: stream.contents,
          extension: 'jpg',
          width,
          height,
          note: 'Image JPEG extraite telle quelle, sans réencodage.',
        });
        continue;
      }
      if (filters.includes('FlateDecode')) {
        const decoded = decodeFlateImage(stream, width, height);
        if (decoded) {
          images.push({ page: pageIndex + 1, name: `image-${index}.png`, bytes: decoded.bytes, extension: 'png', width, height, note: decoded.note });
        } else {
          unsupported.add(`page ${pageIndex + 1} : image en pixels bruts non prise en charge (espace colorimétrique ou profondeur particulière)`);
        }
        continue;
      }
      unsupported.add(`page ${pageIndex + 1} : filtre(s) ${filters.join(', ') || 'inconnu'} non pris en charge`);
    }
    options.onProgress?.((pageIndex + 1) / document.getPageCount(), pageIndex + 1);
  }

  return { images, unsupported: [...unsupported] };
}

function resolveResources(page: PDFPage): PDFDict | null {
  const direct = page.node.Resources();
  if (direct instanceof PDFDict) return direct;
  const inherited = page.node.get(PDFName.of('Resources'));
  if (inherited instanceof PDFRef) return page.node.context.lookupMaybe(inherited, PDFDict) ?? null;
  return null;
}

function numberFrom(dict: PDFDict, key: string): number {
  const value = dict.lookup(PDFName.of(key));
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'asNumber' in value && typeof (value as { asNumber: () => number }).asNumber === 'function') {
    try {
      return (value as { asNumber: () => number }).asNumber();
    } catch {
      return 0;
    }
  }
  return 0;
}

function filterNames(dict: PDFDict): string[] {
  const value = dict.get(PDFName.of('Filter'));
  const names: string[] = [];
  const collect = (entry: unknown): void => {
    if (entry instanceof PDFName) names.push(entry.asString().replace(/^\//u, ''));
    else if (entry instanceof PDFArray) for (const item of entry.asArray()) collect(item);
  };
  collect(value);
  return names;
}

function decodeFlateImage(stream: PDFRawStream, width: number, height: number): { bytes: Uint8Array; note: string } | null {
  if (!width || !height || width * height > 40_000_000) return null;
  const bitsPerComponent = numberFrom(stream.dict, 'BitsPerComponent');
  if (bitsPerComponent !== 8) return null;
  const colorSpace = stream.dict.lookup(PDFName.of('ColorSpace'));
  const colorSpaceName = colorSpace instanceof PDFName ? colorSpace.asString().replace(/^\//u, '') : '';
  const channels = colorSpaceName === 'DeviceGray' || colorSpaceName === 'G' ? 1 : colorSpaceName === 'DeviceRGB' ? 3 : colorSpaceName === 'DeviceCMYK' ? 4 : 0;
  if (!channels) return null;
  let raw: Uint8Array;
  try {
    raw = inflateSync(stream.contents);
  } catch {
    return null;
  }
  const expected = width * height * channels;
  if (raw.length < expected) return null;
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const imageData = context.createImageData(width, height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    if (channels === 1) {
      imageData.data[target] = raw[source];
      imageData.data[target + 1] = raw[source];
      imageData.data[target + 2] = raw[source];
      imageData.data[target + 3] = 255;
    } else if (channels === 3) {
      imageData.data[target] = raw[source];
      imageData.data[target + 1] = raw[source + 1];
      imageData.data[target + 2] = raw[source + 2];
      imageData.data[target + 3] = 255;
    } else {
      const c = raw[source] / 255;
      const m = raw[source + 1] / 255;
      const y = raw[source + 2] / 255;
      const k = raw[source + 3] / 255;
      imageData.data[target] = Math.round(255 * (1 - c) * (1 - k));
      imageData.data[target + 1] = Math.round(255 * (1 - m) * (1 - k));
      imageData.data[target + 2] = Math.round(255 * (1 - y) * (1 - k));
      imageData.data[target + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  canvas.width = 0;
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;
  const binary = typeof atob === 'function' ? atob(base64) : '';
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, note: 'Image en pixels bruts reconstruite en PNG sans perte.' };
}

export interface ImageToPdfOptions {
  pageSize: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: number;
  background: string;
  title?: string;
}

/** Compose un PDF à partir d’images déjà converties en PNG ou JPEG. */
export async function imagesToPdf(
  images: { bytes: Uint8Array; type: 'png' | 'jpg'; name?: string; width?: number; height?: number }[],
  options: ImageToPdfOptions,
): Promise<Uint8Array> {
  if (!images.length) throw new Error('Ajoutez au moins une image pour créer un PDF.');
  const document = await PDFDocument.create();
  document.setProducer('Noto');
  document.setCreator('Noto — composition PDF');
  if (options.title) document.setTitle(options.title);
  const sizes = { a4: [595.28, 841.89] as const, letter: [612, 792] as const };
  for (const image of images) {
    const embedded = image.type === 'png' ? await document.embedPng(image.bytes) : await document.embedJpg(image.bytes);
    if (options.pageSize === 'fit') {
      const page = document.addPage([embedded.width + options.margin * 2, embedded.height + options.margin * 2]);
      if (options.background !== 'transparent') {
        page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: hexColor(options.background) });
      }
      page.drawImage(embedded, { x: options.margin, y: options.margin, width: embedded.width, height: embedded.height });
      continue;
    }
    const [baseWidth, baseHeight] = sizes[options.pageSize];
    const landscape = options.orientation === 'landscape' || (options.orientation === 'auto' && embedded.width > embedded.height);
    const pageWidth = landscape ? baseHeight : baseWidth;
    const pageHeight = landscape ? baseWidth : baseHeight;
    const page = document.addPage([pageWidth, pageHeight]);
    if (options.background !== 'transparent') {
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: hexColor(options.background) });
    }
    const available = { width: pageWidth - options.margin * 2, height: pageHeight - options.margin * 2 };
    const scale = Math.min(available.width / embedded.width, available.height / embedded.height, 1);
    const drawWidth = embedded.width * scale;
    const drawHeight = embedded.height * scale;
    page.drawImage(embedded, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }
  return document.save({ useObjectStreams: true });
}

function hexColor(hex: string): ReturnType<typeof hexToRgb> {
  return hexToRgb(hex);
}
