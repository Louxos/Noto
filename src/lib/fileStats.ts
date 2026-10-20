import type { OpenDocument } from '../types';
import { formatBytes } from './files';
import { getFormatLabel } from './fileTypes';
import { parseCsv, detectDelimiter } from './csv';

/**
 * Informations mesurées sur un fichier ouvert.
 *
 * Deux principes :
 *  - **tout est mesuré**, jamais deviné : ce qui n’est pas calculable est absent
 *    ou accompagné d’une note qui l’explique ;
 *  - **rien n’est envoyé** : les mesures se font sur les octets et le texte déjà
 *    en mémoire, ou relus depuis le disque par l’application de bureau.
 */

export interface StatRow {
  label: string;
  value: string;
  /**
   * Valeur numérique quand la mesure en a une : sert aux calculs internes
   * (page courante d’un PDF) sans ré-analyser le texte affiché.
   */
  raw?: number;
}

export interface StatGroup {
  id: string;
  title: string;
  rows: StatRow[];
  /** Réserve honnête : ce que la mesure ne couvre pas. */
  note?: string;
}

export interface TextMetrics {
  characters: number;
  charactersWithoutSpaces: number;
  words: number;
  lines: number;
  paragraphs: number;
  longestLine: number;
  lineEndings: 'LF' | 'CRLF' | 'CR' | 'mixed';
  endsWithNewline: boolean;
}

/**
 * Compte les lignes sans allouer de tableau.
 *
 * La barre d’état affiche ce nombre pendant la frappe : pour un fichier de
 * plusieurs centaines de milliers de caractères, une découpe en tableau à chaque
 * touche se paierait en fluidité. Une ligne est comptée comme dans l’éditeur,
 * dernière ligne vide comprise.
 */
export function countLines(content: string): number {
  if (!content) return 0;
  let lines = 1;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 13) {
      lines += 1;
      // Une fin de ligne Windows (CRLF) compte pour une seule ligne.
      if (content.charCodeAt(index + 1) === 10) index += 1;
    } else if (code === 10) {
      lines += 1;
    }
  }
  return lines;
}

/** Compte caractères, mots, lignes et paragraphes d’un texte. */
export function textMetrics(content: string): TextMetrics {
  const characters = content.length;
  const words = content.match(/\S+/gu)?.length ?? 0;
  let charactersWithoutSpaces = 0;
  for (const character of content) {
    if (!/\s/u.test(character)) charactersWithoutSpaces += 1;
  }
  const crlf = (content.match(/\r\n/gu) ?? []).length;
  const lf = (content.match(/(?<!\r)\n/gu) ?? []).length;
  const cr = (content.match(/\r(?!\n)/gu) ?? []).length;
  const families = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  const lineEndings: TextMetrics['lineEndings'] = families > 1 ? 'mixed' : crlf > 0 ? 'CRLF' : cr > 0 ? 'CR' : 'LF';
  const lines = content.length ? content.split(/\r\n|\r|\n/u).length : 0;
  const paragraphs = content.split(/(?:\r\n|\r|\n)\s*(?:\r\n|\r|\n)/u).filter((block) => block.trim().length > 0).length;
  const longestLine = content.split(/\r\n|\r|\n/u).reduce((longest, line) => Math.max(longest, line.length), 0);
  return {
    characters,
    charactersWithoutSpaces,
    words,
    lines,
    paragraphs,
    longestLine,
    lineEndings,
    endsWithNewline: content.endsWith('\n'),
  };
}

const LINE_ENDING_LABELS: Record<TextMetrics['lineEndings'], string> = {
  LF: 'LF (Unix, macOS)',
  CRLF: 'CRLF (Windows)',
  CR: 'CR (ancien Mac)',
  mixed: 'fins de ligne mélangées',
};

/** Mesures de texte, présentées à l’utilisateur. */
export function textStatGroup(content: string, options: { truncated?: boolean; encoding?: string } = {}): StatGroup {
  const metrics = textMetrics(content);
  const number = (value: number) => value.toLocaleString('fr-FR');
  return {
    id: 'text',
    title: 'Texte',
    rows: [
      { label: 'Caractères', value: number(metrics.characters) },
      { label: 'Caractères hors espaces', value: number(metrics.charactersWithoutSpaces) },
      { label: 'Mots', value: number(metrics.words) },
      { label: 'Lignes', value: number(metrics.lines) },
      { label: 'Paragraphes', value: number(metrics.paragraphs) },
      { label: 'Ligne la plus longue', value: `${number(metrics.longestLine)} caractères` },
      { label: 'Fins de ligne', value: LINE_ENDING_LABELS[metrics.lineEndings] },
      ...(options.encoding ? [{ label: 'Encodage', value: options.encoding.toUpperCase() }] : []),
      { label: 'Saut de ligne final', value: metrics.endsWithNewline ? 'oui' : 'non' },
    ],
    note: options.truncated
      ? 'Le fichier est volumineux : ces mesures portent sur la partie chargée, pas sur le fichier entier.'
      : undefined,
  };
}

/** Mesures d’un tableau CSV ou TSV. */
export function tableStatGroup(content: string, extension: string): StatGroup {
  const delimiter = detectDelimiter(content);
  const parsed = parseCsv(content, delimiter);
  const columns = parsed.rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const names: Record<string, string> = { ',': 'virgule', ';': 'point-virgule', '\t': 'tabulation', '|': 'barre verticale' };
  return {
    id: 'table',
    title: 'Tableau',
    rows: [
      { label: 'Lignes', value: Math.max(0, parsed.rows.length - 1).toLocaleString('fr-FR') },
      { label: 'Colonnes', value: columns.toLocaleString('fr-FR') },
      { label: 'Cellules', value: Math.max(0, parsed.rows.length - 1).toLocaleString('fr-FR') + ' × ' + columns.toLocaleString('fr-FR') },
      { label: 'Séparateur détecté', value: names[delimiter] ?? `« ${delimiter} »` },
      { label: 'Format', value: extension.toUpperCase() },
    ],
  };
}

export interface ImageSize {
  width: number;
  height: number;
  format: string;
  note?: string;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] << 8 | bytes[offset + 1];
}

/** Lecture signée : une hauteur BMP négative signifie « image retournée ». */
function readInt32LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24)) >>> 0;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Dimensions lues dans l’en-tête du fichier, sans décoder l’image entière.
 *
 * Formats couverts : PNG, JPEG, GIF, BMP, WebP, ICO, TIFF et AVIF. Cette lecture
 * ne coûte rien même sur une image de 200 Mo, là où un décodage complet serait
 * long et gourmand — et l’image n’a pas besoin d’être affichée pour être décrite.
 */
export function imageSizeFromBytes(bytes: Uint8Array, extension = ''): ImageSize | null {
  const format = extension.toLowerCase();
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20), format: 'PNG' };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = readUint16BE(bytes, offset + 2);
      const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isFrame) {
        return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7), format: 'JPEG' };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      offset += 2 + length;
    }
    return null;
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return { width: readUint16LE(bytes, 6), height: readUint16LE(bytes, 8), format: 'GIF' };
  }
  if (startsWith(bytes, [0x42, 0x4d])) {
    const width = readUint32LE(bytes, 18);
    const height = readInt32LE(bytes, 22);
    return { width, height: Math.abs(height), format: 'BMP' };
  }
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X') {
      const width = 1 + (bytes[24] | bytes[25] << 8 | bytes[26] << 16);
      const height = 1 + (bytes[27] | bytes[28] << 8 | bytes[29] << 16);
      return { width, height, format: 'WebP', note: 'dimensions de l’image étendue' };
    }
    if (chunk === 'VP8L') {
      const bits = bytes[21] | bytes[22] << 8 | bytes[23] << 16 | bytes[24] << 24;
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: 'WebP' };
    }
    if (chunk === 'VP8 ') {
      return { width: readUint16LE(bytes, 26) & 0x3fff, height: readUint16LE(bytes, 28) & 0x3fff, format: 'WebP' };
    }
    return null;
  }
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) {
    return { width: bytes[6] || 256, height: bytes[7] || 256, format: 'ICO' };
  }
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    const little = bytes[0] === 0x49;
    const read16 = (offset: number) => (little ? readUint16LE(bytes, offset) : readUint16BE(bytes, offset));
    const read32 = (offset: number) => (little ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset));
    const ifd = read32(4);
    if (ifd + 2 > bytes.length) return null;
    const entries = read16(ifd);
    let width = 0;
    let height = 0;
    for (let index = 0; index < entries; index += 1) {
      const entry = ifd + 2 + index * 12;
      if (entry + 12 > bytes.length) break;
      const tag = read16(entry);
      const type = read16(entry + 2);
      const value = type === 3 ? read16(entry + 8) : read32(entry + 8);
      if (tag === 256) width = value;
      if (tag === 257) height = value;
    }
    return width && height ? { width, height, format: 'TIFF' } : null;
  }
  if (startsWith(bytes, [0x00, 0x00, 0x00], 4) && (format === 'avif' || format === 'heic')) {
    // ISOBMFF : on cherche la boîte `ispe` (image spatial extents) dans `meta`.
    for (let offset = 4; offset + 20 < bytes.length; offset += 1) {
      if (startsWith(bytes, [0x69, 0x73, 0x70, 0x65], offset)) {
        return { width: readUint32BE(bytes, offset + 8), height: readUint32BE(bytes, offset + 12), format: format.toUpperCase() };
      }
    }
    return null;
  }
  return null;
}

/** Dimensions d’un SVG : attributs `width`/`height` ou `viewBox`, sans DOM requis. */
export function svgSizeFromText(text: string): { width: number; height: number } | null {
  const tag = /<svg[^>]*>/iu.exec(text)?.[0];
  if (!tag) return null;
  const number = (value: string | undefined) => {
    if (!value) return 0;
    const trimmed = value.trim();
    // « 100% » décrit une taille relative, pas une dimension : la déclarer
    // comme une mesure en pixels serait une invention.
    if (trimmed.endsWith('%')) return 0;
    const parsed = Number.parseFloat(trimmed.replace(/px$/iu, '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  };
  const width = number(/\swidth=["']([^"']+)["']/iu.exec(tag)?.[1]);
  const height = number(/\sheight=["']([^"']+)["']/iu.exec(tag)?.[1]);
  if (width && height) return { width, height };
  const viewBox = /\sviewBox=["']([^"']+)["']/iu.exec(tag)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/u).map(Number);
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value)) && parts[2] > 0 && parts[3] > 0) {
      return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
    }
  }
  return null;
}

/** Groupe « Fichier » : nom, type, taille, dates — toujours disponible. */
export function fileStatGroup(document: OpenDocument): StatGroup {
  const rows: StatRow[] = [
    { label: 'Nom', value: document.name },
    { label: 'Type', value: getFormatLabel(document.kind) },
    { label: 'Extension', value: document.extension ? `.${document.extension}` : 'aucune' },
    { label: 'Taille', value: `${formatBytes(document.size)} (${document.size.toLocaleString('fr-FR')} octets)` },
  ];
  if (document.path) rows.push({ label: 'Emplacement', value: document.source === 'desktop' ? document.path : 'fichier local du navigateur' });
  if (document.modifiedAt) rows.push({ label: 'Modifié le', value: new Date(document.modifiedAt).toLocaleString('fr-FR') });
  if (document.textEncoding) rows.push({ label: 'Encodage du texte', value: document.textEncoding.toUpperCase() });
  if (document.loadedBytes && document.loadedBytes !== document.size) {
    rows.push({ label: 'Chargé', value: `${formatBytes(document.loadedBytes)} sur ${formatBytes(document.size)}` });
  }
  return {
    id: 'file',
    title: 'Fichier',
    rows,
    note: document.truncated ? 'Le fichier dépasse la taille de lecture complète : le contenu affiché est partiel.' : undefined,
  };
}
