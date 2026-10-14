/**
 * Règles de nommage sûres pour les fichiers produits.
 *
 * Noto n’écrase jamais silencieusement un fichier : les noms demandés passent
 * par `uniqueFileName`, qui ajoute un suffixe « (2) », « (3) »… en cas de
 * collision. Les noms sont nettoyés des caractères interdits par Windows.
 */

const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export const MAX_FILE_NAME_LENGTH = 180;

export interface NameTemplateContext {
  name: string;
  baseName: string;
  extension: string;
  index: number;
  total: number;
  page?: number;
  suffix?: string;
  date?: Date;
}

export function splitFileName(name: string): { baseName: string; extension: string } {
  const normalized = name.replaceAll('\\', '/').split('/').pop() ?? name;
  const dot = normalized.lastIndexOf('.');
  if (dot <= 0) return { baseName: normalized, extension: '' };
  return { baseName: normalized.slice(0, dot), extension: normalized.slice(dot + 1) };
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/^[.\s]+|[.\s]+$/gu, '');
  const safe = cleaned || 'sans-nom';
  const withoutExtension = splitFileName(safe);
  if (WINDOWS_RESERVED.has(withoutExtension.baseName.toLowerCase())) {
    return `${withoutExtension.baseName}-fichier${withoutExtension.extension ? `.${withoutExtension.extension}` : ''}`;
  }
  return safe;
}

export function uniqueFileName(requested: string, taken: Iterable<string>): string {
  const existing = new Set<string>();
  for (const name of taken) existing.add(name.normalize('NFC').toLowerCase());
  const normalized = sanitizeFileName(requested);
  if (!existing.has(normalized.normalize('NFC').toLowerCase())) return clipFileName(normalized);
  const { baseName, extension } = splitFileName(normalized);
  for (let counter = 2; counter < 10_000; counter += 1) {
    const candidate = `${baseName} (${counter})${extension ? `.${extension}` : ''}`;
    if (!existing.has(candidate.normalize('NFC').toLowerCase())) return clipFileName(candidate);
  }
  throw new Error(`Impossible de trouver un nom libre pour « ${requested} ».`);
}

function clipFileName(name: string): string {
  if (name.length <= MAX_FILE_NAME_LENGTH) return name;
  const { baseName, extension } = splitFileName(name);
  const keep = Math.max(1, MAX_FILE_NAME_LENGTH - extension.length - 1);
  return `${baseName.slice(0, keep)}${extension ? `.${extension}` : ''}`;
}

export function padIndex(index: number, total: number): string {
  const width = Math.max(2, String(total).length);
  return String(index).padStart(width, '0');
}

/** Remplace les jetons `{nom}`, `{ext}`, `{index}`, `{total}`, `{page}`, `{date}`, `{heure}`. */
export function applyNameTemplate(template: string, context: NameTemplateContext): string {
  const now = context.date ?? new Date();
  const total = Math.max(1, context.total);
  const replacements: Record<string, string> = {
    nom: context.baseName,
    name: context.baseName,
    ext: context.extension,
    extension: context.extension,
    index: padIndex(context.index, total),
    total: String(total),
    page: context.page !== undefined ? padIndex(context.page, total) : '',
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    heure: `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`,
    suffixe: context.suffix ?? '',
  };
  const expanded = template.replace(/\{(\w+)\}/gu, (match, token: string) => replacements[token.toLowerCase()] ?? match);
  return expanded.trim() || context.baseName;
}

export function buildOutputName(options: {
  template?: string;
  sourceName: string;
  index: number;
  total: number;
  suffix?: string;
  targetExtension: string;
  page?: number;
  date?: Date;
}): string {
  const { baseName, extension } = splitFileName(options.sourceName);
  const template = options.template?.trim()
    ? options.template
    : options.suffix
      ? '{nom}-{suffixe}'
      : '{nom}';
  const expanded = applyNameTemplate(template, {
    name: options.sourceName,
    baseName,
    extension: options.targetExtension || extension,
    index: options.index,
    total: options.total,
    page: options.page,
    suffix: options.suffix,
    date: options.date,
  });
  return sanitizeFileName(options.targetExtension ? `${expanded}.${options.targetExtension}` : expanded);
}

/** Extrait un préfixe commun utilisable comme nom de dossier ou de fichier groupé. */
export function commonPrefixBase(names: string[]): string {
  if (!names.length) return 'noto';
  const bases = names.map((name) => splitFileName(name).baseName).map((name) => name.replace(/[-_ ]?\d+$/u, ''));
  if (bases.length === 1) return bases[0] || 'noto';
  let prefix = bases[0];
  for (const base of bases.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < base.length && prefix[index].toLowerCase() === base[index].toLowerCase()) index += 1;
    prefix = prefix.slice(0, index);
    if (!prefix) break;
  }
  return prefix.replace(/[-_ ]+$/u, '').trim() || 'noto';
}
