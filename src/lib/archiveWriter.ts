import { strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { sanitizeFileName, splitFileName, uniqueFileName } from './jobs/naming';

/**
 * Création et extraction d’archives ZIP sûres.
 *
 * Règles appliquées systématiquement :
 * - les chemins d’entrée sont normalisés et refusés s’ils sortent du dossier
 *   cible (« ../ », chemin absolu, lettre de lecteur, URL) ;
 * - les limites de taille, de nombre d’entrées et de taille décompressée sont
 *   vérifiées avant toute extraction ;
 * - aucune archive n’est exécutée, aucun fichier n’est écrasé silencieusement
 *   (les noms déjà utilisés reçoivent un suffixe).
 */

export const MAX_ARCHIVE_TOTAL_BYTES = 400 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 2_000;
export const MAX_ENTRY_BYTES = 100 * 1024 * 1024;
export const MAX_EXTRACTED_TOTAL_BYTES = 512 * 1024 * 1024;

export interface ArchiveInputFile {
  name: string;
  bytes: Uint8Array;
}

export interface ArchiveCreationResult {
  bytes: Uint8Array;
  warnings: string[];
  totalInput: number;
  entryCount: number;
}

export function createLocalOutputZip(files: ArchiveInputFile[], options: { level?: 0 | 1 | 6 | 9 } = {}): ArchiveCreationResult {
  if (!files.length) throw new Error('Sélectionnez au moins un fichier à archiver.');
  if (files.length > 5_000) throw new Error('Noto limite la création d’archive à 5 000 fichiers.');
  const totalInput = files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (totalInput > MAX_ARCHIVE_TOTAL_BYTES) {
    throw new Error(`L’ensemble fait ${Math.round(totalInput / (1024 * 1024))} Mo : la limite de création d’archive est de 400 Mo.`);
  }
  const warnings: string[] = [];
  const taken = new Set<string>();
  const entries: Zippable = {};
  for (const file of files) {
    const { baseName, extension } = splitFileName(file.name);
    const requested = sanitizeFileName(extension ? `${baseName}.${extension}` : baseName);
    const name = uniqueFileName(requested, taken);
    if (name !== requested) warnings.push(`« ${file.name} » a été renommé « ${name} » dans l’archive pour éviter un doublon.`);
    taken.add(name.toLowerCase());
    entries[name] = [file.bytes, { level: options.level ?? 6 }];
  }
  const bytes = zipSync(entries, { level: options.level ?? 6 });
  return { bytes, warnings, totalInput, entryCount: files.length };
}

export interface ExtractedEntry {
  name: string;
  bytes: Uint8Array;
}

export interface ArchiveExtractionResult {
  entries: ExtractedEntry[];
  skipped: { name: string; reason: string }[];
  totalBytes: number;
}

/** Vérifie qu’un chemin d’archive reste dans le dossier cible. */
export function isSafeArchivePath(path: string): boolean {
  if (!path || path.length > 512) return false;
  const normalized = path.replaceAll('\\', '/');
  if (/^[a-z]+:/iu.test(normalized)) return false;
  if (normalized.startsWith('/')) return false;
  const parts = normalized.split('/');
  for (const part of parts) {
    if (part === '..' || part === '.' || part === '') return false;
    if (/[\u0000-\u001f]/u.test(part)) return false;
  }
  return true;
}

export function extractArchiveEntries(
  bytes: Uint8Array,
  options: { maxEntries?: number; maxEntryBytes?: number; maxTotalBytes?: number } = {},
): ArchiveExtractionResult {
  const maxEntries = options.maxEntries ?? MAX_ARCHIVE_ENTRIES;
  const maxEntryBytes = options.maxEntryBytes ?? MAX_ENTRY_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_EXTRACTED_TOTAL_BYTES;
  if (!bytes.length) throw new Error('Cette archive est vide.');
  if (bytes.length > MAX_ARCHIVE_TOTAL_BYTES) {
    throw new Error('Cette archive dépasse la limite de 400 Mo prise en charge par Noto.');
  }

  const skipped: { name: string; reason: string }[] = [];
  let totalBytes = 0;
  let entryCount = 0;
  let rejectedAll = false;

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        entryCount += 1;
        if (!isSafeArchivePath(file.name)) {
          skipped.push({ name: file.name, reason: 'chemin dangereux ou hors du dossier cible' });
          return false;
        }
        if (entryCount > maxEntries) {
          skipped.push({ name: file.name, reason: `nombre d’entrées supérieur à la limite de ${maxEntries}` });
          rejectedAll = entryCount > maxEntries;
          return false;
        }
        if (file.originalSize > maxEntryBytes) {
          skipped.push({ name: file.name, reason: `entrée supérieure à ${Math.round(maxEntryBytes / (1024 * 1024))} Mo` });
          return false;
        }
        if (totalBytes + file.originalSize > maxTotalBytes) {
          skipped.push({ name: file.name, reason: 'taille décompressée totale dépassée' });
          return false;
        }
        totalBytes += file.originalSize;
        return true;
      },
    });
  } catch {
    throw new Error('Cette archive est invalide, chiffrée ou trop volumineuse pour être lue en sécurité.');
  }

  if (rejectedAll) {
    throw new Error(`Cette archive contient plus de ${maxEntries} entrées : Noto refuse de l’extraire en bloc.`);
  }

  const entries: ExtractedEntry[] = [];
  const taken = new Set<string>();
  for (const [name, content] of Object.entries(unzipped)) {
    const safeName = uniqueFileName(sanitizeFileName(name.replaceAll('/', '-')), taken);
    taken.add(safeName.toLowerCase());
    entries.push({ name: safeName, bytes: content });
  }
  return { entries, skipped, totalBytes };
}

/** Lit un fichier texte d’une archive (par exemple un fichier de métadonnées). */
export function readArchiveTextEntry(bytes: Uint8Array, name: string): string | undefined {
  const result = extractArchiveEntries(bytes, { maxEntries: 50, maxEntryBytes: 2 * 1024 * 1024 });
  const entry = result.entries.find((item) => item.name === name);
  return entry ? strFromU8(entry.bytes) : undefined;
}
