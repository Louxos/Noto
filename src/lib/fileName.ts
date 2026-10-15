import { getFileKind, type FileKind } from './fileTypes';

/**
 * Noms de fichiers : validation et découpage nom / extension.
 *
 * Windows refuse certains noms et certains caractères. Noto applique les mêmes
 * règles partout (dialogue de renommage, opérations sur disque) afin qu’un nom
 * accepté par l’interface ne soit jamais refusé par le système, et qu’un nom
 * refusé soit expliqué avant l’écriture et non après.
 */

/** Caractères interdits dans un nom de fichier Windows, plus les contrôles. */
// eslint-disable-next-line no-control-regex -- les caractères de contrôle sont bien ce que l’on veut interdire ici.
const FORBIDDEN_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/u;

const RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** Longueur maximale d’un nom de fichier (limite du système de fichiers NTFS). */
export const MAX_FILE_NAME_LENGTH = 255;

/** Une extension acceptée : lettres, chiffres, et quelques signes courants. */
const VALID_EXTENSION = /^[A-Za-z0-9][A-Za-z0-9+_-]{0,15}$/u;

export interface NameValidation {
  ok: boolean;
  /** Explication en français, à afficher telle quelle ; vide si le nom est valide. */
  error: string;
  /** Nom nettoyé (espaces de bord retirés), lorsque le nom est utilisable. */
  name: string;
}

/**
 * Valide un nom de fichier complet (extension comprise).
 *
 * Sont refusés : un nom vide, une barre oblique ou une barre oblique inverse
 * (qui désigneraient un dossier), les caractères interdits par Windows, un nom
 * terminé par un point ou une espace (Windows les supprime en silence, ce qui
 * rendrait le fichier introuvable sous le nom annoncé), les noms réservés
 * (`CON`, `NUL`, `COM1`…, avec ou sans extension) et les noms trop longs.
 */
export function validateFileName(name: string): NameValidation {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Saisissez un nom de fichier.', name: trimmed };
  if (trimmed === '.' || trimmed === '..') return { ok: false, error: 'Choisissez un nom de fichier valide.', name: trimmed };
  if (FORBIDDEN_CHARACTERS.test(trimmed)) {
    return { ok: false, error: 'Le nom ne peut pas contenir les caractères < > : " / \\ | ? * .', name: trimmed };
  }
  if (/[. ]$/u.test(trimmed)) {
    return { ok: false, error: 'Le nom ne peut pas se terminer par un point ou une espace.', name: trimmed };
  }
  if (trimmed.length > MAX_FILE_NAME_LENGTH) {
    return { ok: false, error: `Le nom dépasse ${MAX_FILE_NAME_LENGTH} caractères.`, name: trimmed };
  }
  const base = trimmed.split('.')[0]?.toLowerCase() ?? '';
  if (RESERVED_NAMES.has(base)) {
    return { ok: false, error: `« ${base.toUpperCase()} » est un nom réservé par Windows : choisissez un autre nom.`, name: trimmed };
  }
  return { ok: true, error: '', name: trimmed };
}

/**
 * Découpe un nom en base et extension. `README` donne `{ base: 'README', extension: '' }`,
 * `archive.tar.gz` donne `{ base: 'archive.tar', extension: 'gz' }` : seule la
 * dernière extension compte, comme pour Windows.
 */
export function splitFileName(name: string): { base: string; extension: string } {
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) return { base: name, extension: '' };
  return { base: name.slice(0, index), extension: name.slice(index + 1) };
}

/** Recompose un nom à partir d’une base et d’une extension (sans point). */
export function composeFileName(base: string, extension: string): string {
  const trimmedBase = base.trim();
  const trimmedExtension = extension.trim().replace(/^\./u, '');
  return trimmedExtension ? `${trimmedBase}.${trimmedExtension}` : trimmedBase;
}

/** Valide une extension saisie seule (sans point), pour l’expliquer avant l’écriture. */
export function validateExtension(extension: string): string {
  const trimmed = extension.trim().replace(/^\./u, '');
  if (!trimmed) return 'Saisissez une extension, ou désactivez la modification de l’extension.';
  if (!VALID_EXTENSION.test(trimmed)) {
    return 'Une extension contient des lettres ou des chiffres, sans espace ni ponctuation (exemple : md, json, tar.gz n’est pas accepté).';
  }
  return '';
}

/**
 * Compare deux noms et décrit ce qui change réellement, pour l’annoncer avant
 * d’écrire : Windows ouvre un fichier renommé selon sa nouvelle extension, le
 * contenu n’étant pas converti.
 */
export interface NameChange {
  changesName: boolean;
  changesExtension: boolean;
  previousExtension: string;
  nextExtension: string;
  /** Nature du fichier avant et après, telle que Noto l’interprétera. */
  previousKind: FileKind;
  nextKind: FileKind;
  /**
   * Vrai si le renommage change le lecteur utilisé. Un `.txt` renommé en `.md`
   * s’affichera en Markdown : l’interface doit le dire avant d’appliquer.
   */
  opensWithDifferentReader: boolean;
}

export function describeNameChange(previousName: string, nextName: string): NameChange {
  const previous = splitFileName(previousName);
  const next = splitFileName(nextName);
  const previousKind = getFileKind(previousName);
  const nextKind = getFileKind(nextName);
  return {
    changesName: previousName !== nextName,
    changesExtension: previous.extension.toLowerCase() !== next.extension.toLowerCase(),
    previousExtension: previous.extension,
    nextExtension: next.extension,
    previousKind,
    nextKind,
    opensWithDifferentReader: previousKind !== nextKind,
  };
}
