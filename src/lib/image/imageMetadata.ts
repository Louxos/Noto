import type { FormatId } from '../documents/formats';

/**
 * Métadonnées d’image (EXIF, IPTC, XMP, profils).
 *
 * `exifr` (licence MIT) est chargé à la demande : la lecture des métadonnées
 * n’est proposée que dans les outils qui en ont besoin. Aucune donnée n’est
 * transmise, tout est analysé localement.
 */

export interface MetadataEntry {
  key: string;
  label: string;
  value: string;
}

export interface MetadataGroup {
  id: string;
  label: string;
  entries: MetadataEntry[];
}

export interface ImageMetadata {
  groups: MetadataGroup[];
  gps?: { latitude: number; longitude: number };
  /** Champs sensibles repérés, proposés à la suppression. */
  sensitive: string[];
  /** Vrai si le fichier contient des données parsées. */
  available: boolean;
  note: string;
}

const LABELS: Record<string, string> = {
  Make: 'Fabricant de l’appareil',
  Model: 'Modèle',
  LensModel: 'Objectif',
  Software: 'Logiciel utilisé',
  DateTimeOriginal: 'Date de prise de vue',
  CreateDate: 'Date de création',
  ModifyDate: 'Date de modification',
  Orientation: 'Orientation',
  Artist: 'Auteur',
  Copyright: 'Droits d’auteur',
  ImageDescription: 'Description',
  ExifImageWidth: 'Largeur (EXIF)',
  ExifImageHeight: 'Hauteur (EXIF)',
  ISO: 'Sensibilité ISO',
  FNumber: 'Ouverture',
  ExposureTime: 'Temps d’exposition',
  FocalLength: 'Focale',
  Flash: 'Flash',
  GPSLatitude: 'Latitude',
  GPSLongitude: 'Longitude',
  City: 'Ville',
  Country: 'Pays',
  Byline: 'Auteur (IPTC)',
  Credit: 'Crédit',
  Caption: 'Légende',
  Keywords: 'Mots-clés',
  Headline: 'Titre',
  ProfileDescription: 'Profil colorimétrique',
  ColorSpace: 'Espace colorimétrique',
  BitDepth: 'Profondeur de couleur',
  Compression: 'Compression',
  XResolution: 'Résolution horizontale',
  YResolution: 'Résolution verticale',
  ResolutionUnit: 'Unité de résolution',
  PixelXDimension: 'Largeur déclarée',
  PixelYDimension: 'Hauteur déclarée',
};

const SENSITIVE_KEYS = ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'Make', 'Model', 'SerialNumber', 'LensSerialNumber', 'Artist', 'Copyright', 'Software', 'DateTimeOriginal', 'CreateDate', 'ModifyDate'];

const GROUP_ORDER: { id: string; label: string; keys: string[] }[] = [
  { id: 'image', label: 'Identification de l’image', keys: ['ImageWidth', 'ImageHeight', 'ExifImageWidth', 'ExifImageHeight', 'PixelXDimension', 'PixelYDimension', 'BitDepth', 'ColorSpace', 'Compression', 'Orientation', 'XResolution', 'YResolution', 'ResolutionUnit', 'ProfileDescription'] },
  { id: 'camera', label: 'Appareil et prise de vue', keys: ['Make', 'Model', 'LensModel', 'Software', 'DateTimeOriginal', 'CreateDate', 'ModifyDate', 'ISO', 'FNumber', 'ExposureTime', 'FocalLength', 'Flash'] },
  { id: 'author', label: 'Auteur et droits', keys: ['Artist', 'Copyright', 'Byline', 'Credit', 'ImageDescription', 'Caption', 'Headline', 'Keywords'] },
  { id: 'gps', label: 'Localisation', keys: ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'City', 'Country'] },
];

type ExifrParse = (data: ArrayBuffer, options?: unknown) => Promise<unknown>;

export async function readImageMetadata(bytes: Uint8Array, options: { format?: FormatId; fileName?: string } = {}): Promise<ImageMetadata> {
  let parsed: Record<string, unknown> = {};
  try {
    const exifrModule = (await import('exifr')) as { parse?: ExifrParse; default?: { parse?: ExifrParse } };
    const parse = exifrModule.parse ?? exifrModule.default?.parse;
    if (!parse) throw new Error('Lecteur EXIF indisponible');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      icc: true,
      jfif: true,
      ihdr: true,
      interop: false,
      mergeOutput: true,
      translateKeys: true,
      translateValues: false,
      reviveValues: true,
      sanitize: true,
    });
    if (result && typeof result === 'object') parsed = result as Record<string, unknown>;
  } catch {
    return {
      groups: [],
      sensitive: [],
      available: false,
      note: 'Noto n’a pas pu lire de métadonnées EXIF/IPTC dans ce fichier. Les formats SVG, BMP et certains PNG n’en contiennent pas.',
    };
  }

  const groups: MetadataGroup[] = [];
  const used = new Set<string>();
  for (const group of GROUP_ORDER) {
    const entries: MetadataEntry[] = [];
    for (const key of group.keys) {
      if (!(key in parsed)) continue;
      const value = formatValue(parsed[key]);
      if (!value) continue;
      entries.push({ key, label: LABELS[key] ?? key, value });
      used.add(key);
    }
    if (entries.length) groups.push({ id: group.id, label: group.label, entries });
  }

  const other = Object.entries(parsed)
    .filter(([key, value]) => !used.has(key) && value !== undefined && value !== null && typeof value !== 'object' && !key.startsWith('_'))
    .slice(0, 40)
    .map(([key, value]) => ({ key, label: LABELS[key] ?? key, value: formatValue(value) }))
    .filter((entry) => entry.value);
  if (other.length) groups.push({ id: 'other', label: 'Autres données détectées', entries: other });

  const gps = extractGps(parsed);
  const available = groups.length > 0;
  return {
    groups,
    gps,
    sensitive: SENSITIVE_KEYS.filter((key) => key in parsed),
    available,
    note: available
      ? `Ces métadonnées proviennent du fichier « ${options.fileName ?? 'analysé'} » lui-même. La suppression par Noto se fait par ré-encodage : les pixels sont redessinés, les métadonnées ne sont pas recopiées.`
      : `Aucune métadonnée EXIF/IPTC n’a été trouvée dans ce fichier${options.format === 'svg' || options.format === 'bmp' ? ' (ce format n’en contient pas)' : ''}.`,
  };
}

function extractGps(parsed: Record<string, unknown>): { latitude: number; longitude: number } | undefined {
  const latitude = typeof parsed.latitude === 'number' ? parsed.latitude : typeof parsed.GPSLatitude === 'number' ? parsed.GPSLatitude : undefined;
  const longitude = typeof parsed.longitude === 'number' ? parsed.longitude : typeof parsed.GPSLongitude === 'number' ? parsed.GPSLongitude : undefined;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined;
  return { latitude, longitude };
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return value.toLocaleString('fr-FR');
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 6);
    return entries.map(([key, entry]) => `${key}: ${formatValue(entry)}`).join(' ; ');
  }
  return String(value).slice(0, 300);
}

export function metadataToLines(metadata: ImageMetadata): string[] {
  const lines: string[] = [metadata.note];
  for (const group of metadata.groups) {
    lines.push(`${group.label} :`);
    for (const entry of group.entries) lines.push(`  • ${entry.label} : ${entry.value}`);
  }
  if (metadata.gps) {
    lines.push(`Position : ${metadata.gps.latitude.toFixed(5)}, ${metadata.gps.longitude.toFixed(5)}`);
  }
  return lines;
}
