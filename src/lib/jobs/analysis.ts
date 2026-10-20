import type { FormatId } from '../documents/formats';
import { familyOf } from '../documents/formats';
import { sha256Bytes } from '../hash';
import { applyNameTemplate, sanitizeFileName, splitFileName, uniqueFileName } from './naming';

/**
 * Analyse d’un ensemble de fichiers, sans jamais modifier les originaux.
 *
 * Deux niveaux de rapprochement, annoncés honnêtement à l’utilisateur :
 * - « identique » : empreinte SHA-256 égale, donc contenu bit à bit identique ;
 * - « ressemblance » : estimation perceptuelle, qui n’est jamais présentée
 *   comme une preuve d’égalité.
 */

export interface AnalyzedFile {
  id: string;
  name: string;
  path?: string;
  format: FormatId;
  size: number;
  /** Empreinte SHA-256 du contenu, en minuscules. */
  sha256: string;
}

export function analyzeFile(file: { id: string; name: string; path?: string; format: FormatId; bytes: Uint8Array }): AnalyzedFile {
  return {
    id: file.id,
    name: file.name,
    path: file.path,
    format: file.format,
    size: file.bytes.length,
    sha256: sha256Bytes(file.bytes),
  };
}

export interface DuplicateGroup {
  sha256: string;
  /** Taille d’un exemplaire, tous identiques par définition. */
  size: number;
  files: AnalyzedFile[];
  /** Octets récupérables si un seul exemplaire est conservé. */
  reclaimableBytes: number;
}

export function findExactDuplicates(files: AnalyzedFile[]): DuplicateGroup[] {
  const byHash = new Map<string, AnalyzedFile[]>();
  for (const file of files) {
    const bucket = byHash.get(file.sha256);
    if (bucket) bucket.push(file);
    else byHash.set(file.sha256, [file]);
  }
  return [...byHash.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([sha256, bucket]) => ({
      sha256,
      size: bucket[0].size,
      files: [...bucket].sort((left, right) => left.name.localeCompare(right.name, 'fr')),
      reclaimableBytes: bucket[0].size * (bucket.length - 1),
    }))
    .sort((left, right) => right.reclaimableBytes - left.reclaimableBytes);
}

/** Signature d’un nom : mêmes fragments de lettres et de chiffres, ordre conservé. */
export function nameSignature(name: string): string {
  const { baseName } = splitFileName(name);
  const normalized = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
  const tokens: string[] = [];
  for (const part of normalized.split(' ')) {
    if (!part) continue;
    if (/^\d+$/u.test(part)) tokens.push('#');
    else if (part.startsWith('#')) continue;
    else tokens.push(part);
  }
  const collapsed = tokens.filter((token, index) => token !== '#' || tokens[index - 1] !== '#');
  return collapsed.join(' ');
}

export interface SimilarNameGroup {
  signature: string;
  files: AnalyzedFile[];
}

export function findSimilarNames(files: AnalyzedFile[]): SimilarNameGroup[] {
  const bySignature = new Map<string, AnalyzedFile[]>();
  for (const file of files) {
    const signature = nameSignature(file.name);
    if (signature.length < 3) continue;
    const bucket = bySignature.get(signature);
    if (bucket) bucket.push(file);
    else bySignature.set(signature, [file]);
  }
  return [...bySignature.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([signature, bucket]) => ({
      signature,
      files: [...bucket].sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    }))
    .sort((left, right) => right.files.length - left.files.length);
}

export interface RenamePlanEntry {
  id: string;
  currentName: string;
  nextName: string;
  /** `true` quand le nom ne change pas. */
  unchanged: boolean;
  warning?: string;
}

/**
 * Prépare un renommage en série : les noms obtenus restent uniques au sein du
 * lot (les collisions reçoivent un suffixe), aucun fichier n’est renommé ici.
 */
export function buildRenamePlan(
  files: { id: string; name: string }[],
  template: string,
  options: { date?: Date } = {},
): RenamePlanEntry[] {
  const taken = new Set<string>();
  const total = files.length;
  return files.map((file, index) => {
    const { baseName, extension } = splitFileName(file.name);
    const expanded = template.trim()
      ? applyNameTemplate(template, {
        name: file.name,
        baseName,
        extension,
        index: index + 1,
        total,
        date: options.date,
      })
      : baseName;
    const withExtension = extension ? `${expanded}.${extension}` : expanded;
    const safe = sanitizeFileName(withExtension);
    const unique = uniqueFileName(safe, taken);
    taken.add(unique.toLowerCase());
    const entry: RenamePlanEntry = {
      id: file.id,
      currentName: file.name,
      nextName: unique,
      unchanged: unique === file.name,
    };
    if (unique !== safe) entry.warning = `« ${safe} » était déjà pris dans ce lot : renommé « ${unique} ».`;
    return entry;
  });
}

export type SortKey = 'name' | 'size' | 'format' | 'added';

export interface ListFilter {
  query: string;
  /** Familles de formats acceptées ; vide = toutes. */
  families: string[];
  sort: SortKey;
  descending: boolean;
}

export function filterFileList<T extends { name: string; size: number; format: FormatId; addedAt?: number }>(files: T[], filter: ListFilter): T[] {
  const query = filter.query.trim().toLowerCase();
  const filtered = files.filter((file) => {
    if (query && !file.name.toLowerCase().includes(query)) return false;
    if (filter.families.length && !filter.families.includes(familyOf(file.format))) return false;
    return true;
  });
  const direction = filter.descending ? -1 : 1;
  return [...filtered].sort((left, right) => {
    if (filter.sort === 'size') return (left.size - right.size) * direction;
    if (filter.sort === 'format') return (familyOf(left.format).localeCompare(familyOf(right.format), 'fr') || left.name.localeCompare(right.name, 'fr')) * direction;
    if (filter.sort === 'added') return ((left.addedAt ?? 0) - (right.addedAt ?? 0)) * direction;
    return left.name.localeCompare(right.name, 'fr') * direction;
  });
}
