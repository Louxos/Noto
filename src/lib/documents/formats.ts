/**
 * Catalogue des formats reconnus par Noto.
 *
 * Chaque format décrit son identité (extensions, type MIME, famille) et le
 * niveau de prise en charge réel de Noto. Les opérations concrètes sont
 * déclarées dans le registre des opérations (`src/lib/operations/registry.ts`) :
 * ce fichier ne promet aucune conversion, il sert à identifier et classer les
 * fichiers.
 */

export type FormatId =
  | 'pdf' | 'txt' | 'md' | 'html' | 'csv' | 'tsv' | 'json' | 'rtf' | 'log'
  | 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp' | 'tiff' | 'svg' | 'ico' | 'avif' | 'heic'
  | 'docx' | 'odt' | 'pptx' | 'odp' | 'xlsx' | 'ods' | 'epub'
  | 'zip' | 'unknown';

export type FormatFamily = 'pdf' | 'image' | 'text' | 'table' | 'office' | 'ebook' | 'archive' | 'unknown';

/** Niveau de prise en charge : ce que Noto peut réellement faire aujourd’hui. */
export type SupportLevel = 'full' | 'partial' | 'read-only' | 'none';

export interface FormatDescriptor {
  id: FormatId;
  label: string;
  family: FormatFamily;
  extensions: string[];
  mimeTypes: string[];
  /** Lecture du contenu dans l’application. */
  read: SupportLevel;
  /** Écriture d’un fichier de ce format (conversion ou export). */
  write: SupportLevel;
  /** Explication affichée à l’utilisateur. */
  notes: string;
}

export const FORMATS: Record<FormatId, FormatDescriptor> = {
  pdf: {
    id: 'pdf', label: 'PDF', family: 'pdf', extensions: ['pdf'], mimeTypes: ['application/pdf'],
    read: 'full', write: 'full',
    notes: 'Lecture, réorganisation des pages, annotations superposées, compression et reconstruction. L’édition du texte PDF natif lui-même n’est pas proposée (voir la caviardisation, destructive et vérifiée).',
  },
  txt: {
    id: 'txt', label: 'Texte brut', family: 'text', extensions: ['txt', 'text', 'log'], mimeTypes: ['text/plain'],
    read: 'full', write: 'full', notes: 'Lecture et écriture.', 
  },
  md: {
    id: 'md', label: 'Markdown', family: 'text', extensions: ['md', 'markdown', 'mdown', 'mkd'], mimeTypes: ['text/markdown'],
    read: 'full', write: 'full', notes: 'Lecture, édition et export PDF reconstruit à partir des blocs Markdown.',
  },
  html: {
    id: 'html', label: 'HTML', family: 'text', extensions: ['html', 'htm'], mimeTypes: ['text/html'],
    read: 'full', write: 'full', notes: 'Lecture en bac à sable sans script. L’export HTML est du balisage autonome.',
  },
  csv: {
    id: 'csv', label: 'CSV', family: 'table', extensions: ['csv'], mimeTypes: ['text/csv'],
    read: 'full', write: 'full', notes: 'Lecture, édition, conversion XLSX et export PDF tabulaire.',
  },
  tsv: {
    id: 'tsv', label: 'TSV', family: 'table', extensions: ['tsv'], mimeTypes: ['text/tab-separated-values'],
    read: 'full', write: 'full', notes: 'Tableau séparé par des tabulations.',
  },
  json: {
    id: 'json', label: 'JSON', family: 'text', extensions: ['json', 'jsonc', 'json5'], mimeTypes: ['application/json'],
    read: 'full', write: 'full', notes: 'Lecture, édition et formatage.',
  },
  rtf: {
    id: 'rtf', label: 'RTF', family: 'office', extensions: ['rtf'], mimeTypes: ['application/rtf'],
    read: 'partial', write: 'none', notes: 'Lecture du texte (commandes RTF simples). Écriture non prise en charge.',
  },
  log: {
    id: 'log', label: 'Journal', family: 'text', extensions: ['log', 'diff', 'patch'], mimeTypes: ['text/plain'],
    read: 'full', write: 'full', notes: 'Texte brut.',
  },
  png: {
    id: 'png', label: 'PNG', family: 'image', extensions: ['png'], mimeTypes: ['image/png'],
    read: 'full', write: 'full', notes: 'Transparence conservée.',
  },
  jpeg: {
    id: 'jpeg', label: 'JPEG', family: 'image', extensions: ['jpg', 'jpeg', 'jpe'], mimeTypes: ['image/jpeg'],
    read: 'full', write: 'full', notes: 'Pas de transparence ; qualité réglable.',
  },
  webp: {
    id: 'webp', label: 'WebP', family: 'image', extensions: ['webp'], mimeTypes: ['image/webp'],
    read: 'full', write: 'full', notes: 'Transparence et animation. L’animation n’est conservée qu’en copie sans retraitement.',
  },
  gif: {
    id: 'gif', label: 'GIF', family: 'image', extensions: ['gif'], mimeTypes: ['image/gif'],
    read: 'full', write: 'partial', notes: 'Les images animées ne sont réencodées que sur la première image : Noto l’indique et propose de conserver l’original.',
  },
  bmp: {
    id: 'bmp', label: 'BMP', family: 'image', extensions: ['bmp'], mimeTypes: ['image/bmp'],
    read: 'full', write: 'partial', notes: 'Écriture dépendante du navigateur/WebView2 ; Noto vérifie la prise en charge avant d’annoncer l’export.',
  },
  tiff: {
    id: 'tiff', label: 'TIFF', family: 'image', extensions: ['tif', 'tiff'], mimeTypes: ['image/tiff'],
    read: 'partial', write: 'none', notes: 'Lecture de la première page via le décodeur intégré. Les fichiers multipages et l’écriture ne sont pas pris en charge.',
  },
  svg: {
    id: 'svg', label: 'SVG', family: 'image', extensions: ['svg'], mimeTypes: ['image/svg+xml'],
    read: 'full', write: 'none', notes: 'Lecture après nettoyage des scripts et des références externes. L’export matriciel passe par le raster.',
  },
  ico: {
    id: 'ico', label: 'ICO', family: 'image', extensions: ['ico'], mimeTypes: ['image/x-icon'],
    read: 'partial', write: 'partial', notes: 'Noto écrit des icônes ICO encapsulant une image PNG (limite documentée).',
  },
  avif: {
    id: 'avif', label: 'AVIF', family: 'image', extensions: ['avif'], mimeTypes: ['image/avif'],
    read: 'partial', write: 'partial', notes: 'Dépend du support AVIF du moteur. Noto teste le décodage et l’encodage réels.',
  },
  heic: {
    id: 'heic', label: 'HEIC/HEIF', family: 'image', extensions: ['heic', 'heif'], mimeTypes: ['image/heic'],
    read: 'none', write: 'none', notes: 'Pas de décodeur libre intégré : Noto signale le format et propose de convertir hors de l’application.',
  },
  docx: {
    id: 'docx', label: 'Document Word', family: 'office', extensions: ['docx'], mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    read: 'partial', write: 'partial', notes: 'Lecture du texte et des images courantes. L’export reconstruit un DOCX valide (paragraphes, titres, images, tableaux simples) sans reproduire une mise en page complexe.',
  },
  odt: {
    id: 'odt', label: 'Document OpenDocument', family: 'office', extensions: ['odt'], mimeTypes: ['application/vnd.oasis.opendocument.text'],
    read: 'partial', write: 'none', notes: 'Lecture du texte. Écriture ODT non prise en charge.',
  },
  pptx: {
    id: 'pptx', label: 'Présentation PowerPoint', family: 'office', extensions: ['pptx'], mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    read: 'partial', write: 'none', notes: 'Extraction du texte et des images ; export PDF reconstruit, sans animations ni transitions.',
  },
  odp: {
    id: 'odp', label: 'Présentation OpenDocument', family: 'office', extensions: ['odp'], mimeTypes: ['application/vnd.oasis.opendocument.presentation'],
    read: 'partial', write: 'none', notes: 'Extraction du texte et des images ; export PDF reconstruit.',
  },
  xlsx: {
    id: 'xlsx', label: 'Classeur Excel', family: 'table', extensions: ['xlsx'], mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    read: 'partial', write: 'partial', notes: 'Lecture des cellules texte/nombre de la première feuille. Écriture d’un classeur simple à partir de tableaux. Formules, styles et graphiques ne sont pas conservés.',
  },
  ods: {
    id: 'ods', label: 'Tableur OpenDocument', family: 'table', extensions: ['ods'], mimeTypes: ['application/vnd.oasis.opendocument.spreadsheet'],
    read: 'partial', write: 'none', notes: 'Lecture des cellules de la première feuille. Écriture non prise en charge.',
  },
  epub: {
    id: 'epub', label: 'Livre numérique EPUB', family: 'ebook', extensions: ['epub'], mimeTypes: ['application/epub+zip'],
    read: 'partial', write: 'none', notes: 'Lecture des chapitres (texte). Export PDF reconstruit chapitre par chapitre.',
  },
  zip: {
    id: 'zip', label: 'Archive ZIP', family: 'archive', extensions: ['zip'], mimeTypes: ['application/zip'],
    read: 'partial', write: 'full', notes: 'Création et extraction avec limites de taille, de nombre d’entrées et protection contre les chemins dangereux.',
  },
  unknown: {
    id: 'unknown', label: 'Format inconnu', family: 'unknown', extensions: [], mimeTypes: ['application/octet-stream'],
    read: 'partial', write: 'none', notes: 'Noto tente une lecture texte et propose l’ouverture avec l’application associée sur le poste.',
  },
};

const EXTENSION_TO_FORMAT = new Map<string, FormatId>();
for (const descriptor of Object.values(FORMATS)) {
  for (const extension of descriptor.extensions) EXTENSION_TO_FORMAT.set(extension, descriptor.id);
}
EXTENSION_TO_FORMAT.set('htm', 'html');
EXTENSION_TO_FORMAT.set('jpe', 'jpeg');

export function formatFromExtension(extension: string): FormatId {
  return EXTENSION_TO_FORMAT.get(extension.toLowerCase()) ?? 'unknown';
}

export function fileNameExtension(name: string): string {
  const normalized = name.replaceAll('\\', '/').split('/').pop() ?? name;
  const dot = normalized.lastIndexOf('.');
  return dot <= 0 ? '' : normalized.slice(dot + 1).toLowerCase();
}

export function formatFromFileName(name: string): FormatId {
  return formatFromExtension(fileNameExtension(name));
}

export function formatForDocument(name: string, declaredKind?: string): FormatId {
  const detected = formatFromFileName(name);
  if (detected !== 'unknown') return detected;
  if (declaredKind && declaredKind in FORMATS) return declaredKind as FormatId;
  return 'unknown';
}

export function describeFormat(format: FormatId): FormatDescriptor {
  return FORMATS[format] ?? FORMATS.unknown;
}

export function familyOf(format: FormatId): FormatFamily {
  return describeFormat(format).family;
}

export function mimeTypeOf(format: FormatId): string {
  return describeFormat(format).mimeTypes[0] ?? 'application/octet-stream';
}

export function extensionOf(format: FormatId): string {
  return describeFormat(format).extensions[0] ?? '';
}

export interface FormatSignature {
  format: FormatId;
  offset: number;
  bytes: number[];
}

const SIGNATURES: FormatSignature[] = [
  { format: 'pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { format: 'png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { format: 'jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { format: 'gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { format: 'bmp', offset: 0, bytes: [0x42, 0x4d] },
  { format: 'tiff', offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { format: 'tiff', offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { format: 'webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { format: 'ico', offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] },
];

/**
 * Détecte un format d’après les octets d’en-tête. Le nom du fichier sert
 * uniquement de repli : une extension trompeuse est signalée à l’utilisateur.
 */
export function sniffFormat(bytes: Uint8Array, name = ''): { format: FormatId; declared: FormatId; mismatch: boolean } {
  const declared = formatFromFileName(name);
  let detected: FormatId = 'unknown';
  for (const signature of SIGNATURES) {
    if (bytes.length < signature.offset + signature.bytes.length) continue;
    if (signature.bytes.every((value, index) => bytes[signature.offset + index] === value)) {
      detected = signature.format;
      break;
    }
  }
  if (detected === 'unknown' && bytes.length > 11 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = new TextDecoder('latin1').decode(bytes.subarray(8, 12));
    if (brand.startsWith('avif') || brand.startsWith('avis')) detected = 'avif';
    else if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) detected = 'heic';
  }
  if (detected === 'unknown' && isZipContainer(bytes)) {
    const zipKind = sniffZipKind(bytes);
    if (zipKind) detected = zipKind;
  }
  if (detected === 'unknown' && declared !== 'unknown') return { format: declared, declared, mismatch: false };
  return { format: detected, declared, mismatch: detected !== 'unknown' && declared !== 'unknown' && detected !== declared };
}

function isZipContainer(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

/**
 * Reconnaît le type réel d’une archive ZIP/OpenDocument sans extraction
 * complète : Noto cherche les chemins caractéristiques du conteneur et le
 * type déclaré dans l’entrée `mimetype` des fichiers OpenDocument.
 */
export function sniffZipKind(bytes: Uint8Array): FormatId | 'zip' | null {
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 65_536)));
  if (header.includes('word/document.xml') || header.includes('word/styles.xml')) return 'docx';
  if (header.includes('ppt/presentation.xml') || header.includes('ppt/slides/slide1.xml')) return 'pptx';
  if (header.includes('xl/workbook.xml') || header.includes('xl/worksheets/sheet1.xml')) return 'xlsx';
  if (header.includes('META-INF/container.xml')) return 'epub';
  const mimetype = readStoredZipEntry(bytes, 'mimetype');
  if (mimetype?.includes('opendocument.text')) return 'odt';
  if (mimetype?.includes('opendocument.spreadsheet')) return 'ods';
  if (mimetype?.includes('opendocument.presentation')) return 'odp';
  return bytes.length > 0 ? 'zip' : null;
}

/** Lit une entrée ZIP stockée sans compression (cas de l’entrée `mimetype`). */
function readStoredZipEntry(bytes: Uint8Array, entryName: string): string | null {
  for (let index = 0; index + 30 < bytes.length && index < 4_096; index += 1) {
    if (bytes[index] !== 0x50 || bytes[index + 1] !== 0x4b || bytes[index + 2] !== 0x03 || bytes[index + 3] !== 0x04) continue;
    const method = bytes[index + 8] | (bytes[index + 9] << 8);
    const compressedSize = bytes[index + 18] | (bytes[index + 19] << 8) | (bytes[index + 20] << 16) | (bytes[index + 21] << 24);
    const nameLength = bytes[index + 26] | (bytes[index + 27] << 8);
    const extraLength = bytes[index + 28] | (bytes[index + 29] << 8);
    if (index + 30 + nameLength > bytes.length) return null;
    const name = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(index + 30, index + 30 + nameLength));
    const contentStart = index + 30 + nameLength + extraLength;
    if (name !== entryName || method !== 0 || compressedSize <= 0 || contentStart + compressedSize > bytes.length) return null;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(contentStart, contentStart + compressedSize));
  }
  return null;
}

export function isImageFormat(format: FormatId): boolean {
  return familyOf(format) === 'image';
}

export function isRasterImageFormat(format: FormatId): boolean {
  return ['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'ico'].includes(format);
}
