import { unzipSync, type Unzipped } from 'fflate';
import { decodeText } from './fileTypes';

export interface SlideImage {
  src: string;
  alt: string;
}

export interface PresentationSlide {
  number: number;
  title: string;
  paragraphs: string[];
  images: SlideImage[];
}

export interface DocumentChapter {
  title: string;
  text: string;
}

const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_XML_FILE_BYTES = 8 * 1024 * 1024;
const MAX_XML_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_TOTAL_BYTES = 32 * 1024 * 1024;
const OFFICE_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const ODF_DRAW_NS = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';
const ODF_TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

export function extractPresentation(bytes: Uint8Array, extension: string): PresentationSlide[] {
  if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES) throw new Error('Cette présentation est vide ou dépasse la limite de 80 Mo.');
  const slides = extension.toLowerCase() === 'odp' ? extractOdpSlides(bytes) : extractPptxSlides(bytes);
  if (!slides.length) throw new Error('Aucune diapositive lisible n’a été trouvée dans cette présentation.');
  return slides.slice(0, 300);
}

export function extractOfficeChapters(bytes: Uint8Array, extension: string): DocumentChapter[] {
  if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES) throw new Error('Ce document est vide ou dépasse la limite de 80 Mo.');
  const normalized = extension.toLowerCase();
  if (normalized === 'rtf') return extractRtf(bytes);
  if (normalized === 'epub') return extractEpub(bytes);
  const files = readArchive(bytes, (name) => name === 'word/document.xml' || name === 'content.xml', MAX_XML_FILE_BYTES, MAX_XML_TOTAL_BYTES);
  const xmlPath = normalized === 'docx' ? 'word/document.xml' : 'content.xml';
  const xml = getText(files, xmlPath);
  const parsed = parseXml(xml);
  const paragraphs = normalized === 'docx'
    ? extractWordParagraphs(parsed)
    : extractOdfParagraphs(parsed);
  const text = paragraphs.filter(Boolean).join('\n\n').trim();
  if (!text) throw new Error('Aucun texte lisible n’a été trouvé dans ce document.');
  return [{ title: normalized === 'docx' ? 'Document Word' : 'Document OpenDocument', text }];
}

function extractPptxSlides(bytes: Uint8Array): PresentationSlide[] {
  const xmlFiles = readArchive(bytes, (name) => name === 'ppt/presentation.xml'
    || name === 'ppt/_rels/presentation.xml.rels'
    || /^ppt\/slides\/slide\d+\.xml$/i.test(name)
    || /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/i.test(name), MAX_XML_FILE_BYTES, MAX_XML_TOTAL_BYTES);
  const presentation = parseXml(getText(xmlFiles, 'ppt/presentation.xml'));
  const rels = parseRelationships(getText(xmlFiles, 'ppt/_rels/presentation.xml.rels'), 'ppt/presentation.xml');
  const slideNodes = [...presentation.getElementsByTagNameNS(PRESENTATION_NS, 'sldId')];
  const slidePaths = slideNodes.flatMap((node) => {
    const relationId = node.getAttributeNS(OFFICE_NS, 'id') || node.getAttribute('r:id');
    const path = relationId ? rels.get(relationId) : undefined;
    return path && xmlFiles[path] ? [path] : [];
  });
  const orderedPaths = slidePaths.length ? slidePaths : Object.keys(xmlFiles).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort(naturalSlideOrder);
  const mediaTargets = new Set<string>();
  const slides = orderedPaths.slice(0, 300).map((path, index) => {
    const slideXml = parseXml(getText(xmlFiles, path));
    const paragraphs = extractDrawingParagraphs(slideXml);
    const slideRelsPath = relationshipFilePath(path);
    const slideRels = xmlFiles[slideRelsPath]
      ? parseRelationships(getText(xmlFiles, slideRelsPath), path)
      : new Map<string, string>();
    const images = [...slideXml.getElementsByTagNameNS(DRAWING_NS, 'blip')]
      .map((node) => node.getAttributeNS(OFFICE_NS, 'embed') || node.getAttribute('r:embed'))
      .filter((id): id is string => Boolean(id))
      .flatMap((id) => {
        const target = slideRels.get(id);
        if (!target || !isSafeRasterImagePath(target)) return [];
        mediaTargets.add(target);
        return [{ path: target, alt: `Image ${mediaTargets.size}` }];
      });
    const title = paragraphs.find((paragraph) => paragraph.trim())?.trim() ?? `Diapositive ${index + 1}`;
    return { number: index + 1, title, paragraphs, images: images.map((image) => ({ src: '', alt: image.alt, path: image.path })) };
  });

  const mediaFiles = mediaTargets.size
    ? readArchive(bytes, (name) => mediaTargets.has(name), MAX_IMAGE_BYTES, MAX_IMAGE_TOTAL_BYTES)
    : {};
  return slides.map((slide) => ({
    ...slide,
    images: slide.images.flatMap((image) => {
      const path = (image as SlideImage & { path?: string }).path;
      const data = path ? mediaFiles[path] : undefined;
      const mime = path ? imageMimeType(path) : null;
      return data && mime ? [{ src: `data:${mime};base64,${toBase64(data)}`, alt: image.alt }] : [];
    }),
  }));
}

function extractOdpSlides(bytes: Uint8Array): PresentationSlide[] {
  const files = readArchive(bytes, (name) => name === 'content.xml', MAX_XML_FILE_BYTES, MAX_XML_TOTAL_BYTES);
  const xml = parseXml(getText(files, 'content.xml'));
  const pages = [...xml.getElementsByTagNameNS(ODF_DRAW_NS, 'page')];
  const targets = new Set<string>();
  const slides = pages.slice(0, 300).map((page, index) => {
    const blocks = [
      ...page.getElementsByTagNameNS(ODF_TEXT_NS, 'h'),
      ...page.getElementsByTagNameNS(ODF_TEXT_NS, 'p'),
    ].sort((left, right) => left.compareDocumentPosition(right) & 4 ? -1 : 1);
    const paragraphs = blocks.map((node) => normalizeParagraph(node.textContent ?? '')).filter(Boolean);
    const images = [...page.getElementsByTagNameNS(ODF_DRAW_NS, 'image')].flatMap((node, imageIndex) => {
      const href = node.getAttributeNS(XLINK_NS, 'href') || node.getAttribute('xlink:href');
      const path = href ? resolveArchivePath('content.xml', href) : '';
      if (!path || !isSafeRasterImagePath(path)) return [];
      targets.add(path);
      return [{ path, alt: `Image ${imageIndex + 1}` }];
    });
    const title = paragraphs[0] ?? `Diapositive ${index + 1}`;
    return { number: index + 1, title, paragraphs, images };
  });
  const media = targets.size ? readArchive(bytes, (name) => targets.has(name), MAX_IMAGE_BYTES, MAX_IMAGE_TOTAL_BYTES) : {};
  return slides.map((slide) => ({
    ...slide,
    images: slide.images.flatMap((image) => {
      const bytes = media[image.path];
      const mime = imageMimeType(image.path);
      return bytes && mime ? [{ src: `data:${mime};base64,${toBase64(bytes)}`, alt: image.alt }] : [];
    }),
  }));
}

function extractWordParagraphs(xml: XMLDocument): string[] {
  const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return [...xml.getElementsByTagNameNS(wordNs, 'p')].map((paragraph) => {
    const parts = [...paragraph.getElementsByTagNameNS(wordNs, 't')].map((node) => node.textContent ?? '');
    const tabs = paragraph.getElementsByTagNameNS(wordNs, 'tab').length;
    return normalizeParagraph(parts.join('') + '\t'.repeat(tabs));
  });
}

function extractOdfParagraphs(xml: XMLDocument): string[] {
  const blocks = [
    ...xml.getElementsByTagNameNS(ODF_TEXT_NS, 'h'),
    ...xml.getElementsByTagNameNS(ODF_TEXT_NS, 'p'),
  ].sort((left, right) => left.compareDocumentPosition(right) & 4 ? -1 : 1);
  return blocks.map((node) => normalizeParagraph(node.textContent ?? '')).filter(Boolean);
}

function extractRtf(bytes: Uint8Array): DocumentChapter[] {
  let source = decodeText(bytes);
  source = source
    .replace(/\\'[0-9a-f]{2}/gi, (match) => String.fromCharCode(parseInt(match.slice(2), 16)))
    .replace(/\\(?:par|line)\b\s?/gi, '\n')
    .replace(/\\tab\b\s?/gi, '\t')
    .replace(/\\u(-?\d+)\??/g, (_, value: string) => String.fromCharCode((Number(value) + 65536) % 65536))
    .replace(/\\-[a-z]+\d* ?/gi, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/\\[^a-z\d]/gi, '')
    .replace(/[{}]/g, '');
  const text = source.split(/\r?\n/).map((line) => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean).join('\n\n');
  if (!text) throw new Error('Aucun texte lisible n’a été trouvé dans ce fichier RTF.');
  return [{ title: 'Document RTF', text }];
}

function extractEpub(bytes: Uint8Array): DocumentChapter[] {
  const files = readArchive(bytes, (name) => name === 'META-INF/container.xml' || /\.(?:opf|xhtml|html?)$/i.test(name), MAX_XML_FILE_BYTES, MAX_XML_TOTAL_BYTES);
  const container = parseXml(getText(files, 'META-INF/container.xml'));
  const rootFile = container.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path');
  if (!rootFile) throw new Error('La table des matières EPUB est introuvable.');
  const packagePath = normalizeArchivePath(rootFile);
  if (!packagePath) throw new Error('Le chemin de la table des matières EPUB est invalide.');
  const packageXml = parseXml(getText(files, packagePath));
  const manifest = new Map<string, string>();
  for (const item of [...packageXml.getElementsByTagNameNS('*', 'item')]) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const media = item.getAttribute('media-type') ?? '';
    if (id && href && (media.includes('xhtml') || /\.html?$/i.test(href))) {
      manifest.set(id, resolveArchivePath(rootFile, href));
    }
  }
  const chapters = [...packageXml.getElementsByTagNameNS('*', 'itemref')].flatMap((item, index) => {
    const path = manifest.get(item.getAttribute('idref') ?? '');
    const source = path ? files[path] : undefined;
    if (!path || !source) return [];
    const parsed = parseXml(decodeBytes(source));
    const title = normalizeParagraph(parsed.getElementsByTagName('title')[0]?.textContent ?? '') || `Chapitre ${index + 1}`;
    const body = parsed.getElementsByTagName('body')[0] ?? parsed.documentElement;
    for (const selector of ['script', 'style', 'nav']) {
      [...body.getElementsByTagName(selector)].forEach((node) => node.remove());
    }
    const blocks = [...body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre')]
      .map((node) => normalizeParagraph(node.textContent ?? '')).filter(Boolean);
    const text = blocks.length ? blocks.join('\n\n') : normalizeParagraph(body.textContent ?? '');
    return text ? [{ title, text }] : [];
  });
  if (!chapters.length) throw new Error('Aucun chapitre EPUB lisible n’a été trouvé.');
  return chapters;
}

function parseRelationships(xml: string, sourcePath: string): Map<string, string> {
  const parsed = parseXml(xml);
  const result = new Map<string, string>();
  for (const node of [...parsed.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationship')]) {
    if (node.getAttribute('TargetMode') === 'External') continue;
    const id = node.getAttribute('Id');
    const target = node.getAttribute('Target');
    if (id && target) result.set(id, resolveArchivePath(sourcePath, target));
  }
  return result;
}

function readArchive(bytes: Uint8Array, accept: (name: string) => boolean, maxFileSize: number, maxTotalSize: number): Unzipped {
  let total = 0;
  try {
    return unzipSync(bytes, {
      filter: (file) => {
        const safeName = normalizeArchivePath(file.name);
        if (!safeName || safeName !== file.name || !accept(safeName) || file.originalSize > maxFileSize) return false;
        if (total + file.originalSize > maxTotalSize) return false;
        total += file.originalSize;
        return true;
      },
    });
  } catch {
    throw new Error('L’archive est invalide, chiffrée ou trop volumineuse pour être lue en sécurité.');
  }
}

function parseXml(source: string): XMLDocument {
  const parsed = new DOMParser().parseFromString(source, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length) throw new Error('Le contenu XML de cette archive est invalide.');
  return parsed;
}

function getText(files: Unzipped, path: string): string {
  const content = files[path];
  if (!content) throw new Error(`La partie « ${path} » est absente ou trop volumineuse.`);
  return decodeBytes(content);
}

function decodeBytes(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function normalizeParagraph(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function normalizeArchivePath(path: string): string | null {
  const clean = path.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!clean || /^[a-z]+:/i.test(clean)) return null;
  const parts: string[] = [];
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

function resolveArchivePath(sourceFile: string, target: string): string {
  if (/^(?:https?:|file:|\/\/)/i.test(target)) return '';
  const base = target.startsWith('/') ? '' : sourceFile.split('/').slice(0, -1).join('/');
  return normalizeArchivePath(`${base}/${target.split('#')[0]}`) ?? '';
}

function relationshipFilePath(path: string): string {
  const parts = path.split('/');
  const name = parts.pop() ?? '';
  return `${parts.join('/')}/_rels/${name}.rels`;
}

function extractDrawingParagraphs(xml: XMLDocument): string[] {
  return [...xml.getElementsByTagNameNS(DRAWING_NS, 'p')].map((paragraph) =>
    normalizeParagraph([...paragraph.getElementsByTagNameNS(DRAWING_NS, 't')].map((node) => node.textContent ?? '').join('')),
  ).filter(Boolean);
}

function isSafeRasterImagePath(path: string): boolean {
  return /\.(?:png|jpe?g|gif|webp)$/i.test(path) && normalizeArchivePath(path) === path;
}

function imageMimeType(path: string): string | null {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function naturalSlideOrder(left: string, right: string): number {
  const leftNumber = Number(left.match(/slide(\d+)/i)?.[1] ?? 0);
  const rightNumber = Number(right.match(/slide(\d+)/i)?.[1] ?? 0);
  return leftNumber - rightNumber;
}
