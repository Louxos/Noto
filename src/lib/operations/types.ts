import type { FormatId } from '../documents/formats';

/**
 * Modèle commun des opérations documentaires de Noto.
 *
 * Une opération est déclarée une seule fois, puis réutilisée par l’atelier, les
 * traitements par lots et les workflows. Chaque opération annonce honnêtement
 * ses entrées, ses sorties, ses limites et la nature de son travail
 * (modification native, calque superposé, reconstruction).
 */

export type ParamValue = string | number | boolean;

export interface ParamOption {
  value: string;
  label: string;
  help?: string;
}

interface ParamBase {
  id: string;
  label: string;
  help?: string;
  /** Les paramètres avancés restent masqués tant que l’utilisateur ne les demande pas. */
  advanced?: boolean;
}

export type ParamDefinition =
  | (ParamBase & { kind: 'boolean'; default: boolean })
  | (ParamBase & { kind: 'number'; default: number; min: number; max: number; step?: number; unit?: string })
  | (ParamBase & { kind: 'text'; default: string; placeholder?: string; maxLength?: number })
  | (ParamBase & { kind: 'select'; default: string; options: ParamOption[] })
  | (ParamBase & { kind: 'color'; default: string });

export type ParamValues = Record<string, ParamValue>;

export interface OperationInput {
  name: string;
  path?: string;
  bytes: Uint8Array;
  format: FormatId;
  size: number;
}

export interface OperationOutput {
  name: string;
  bytes: Uint8Array;
  format: FormatId;
  /** Précision affichée à l’utilisateur (limite constatée, transformation appliquée). */
  note?: string;
}

export interface OperationMeasurement {
  label: string;
  before: number;
  after: number;
  unit: 'bytes' | 'pages' | 'items' | 'percent';
}

export interface ReportSection {
  title: string;
  lines: string[];
  /** Tableau facultatif : la première ligne sert d’en-tête. */
  table?: string[][];
}

export interface OperationReport {
  title: string;
  summary: string;
  sections: ReportSection[];
  /** Fichiers produits en complément du rapport (par exemple une image de différences). */
  artifacts?: OperationOutput[];
}

export interface OperationResult {
  outputs: OperationOutput[];
  warnings: string[];
  measurements?: OperationMeasurement[];
  report?: OperationReport;
}

export interface OperationProgress {
  /** Progression réelle entre 0 et 1, fondée sur le travail effectué. */
  value: number;
  label: string;
}

export interface OperationContext {
  signal: AbortSignal;
  progress: (progress: OperationProgress) => void;
  report: (message: string) => void;
  /** Mot de passe fourni par l’utilisateur pour un document protégé. */
  password?: string;
  /** Enregistre un avertissement non bloquant. */
  warn: (message: string) => void;
}

export interface OperationInputRequirement {
  /** Formats acceptés ; `any` indique que l’opération inspecte elle-même le contenu. */
  formats: FormatId[] | 'any';
  min: number;
  /** Absent = illimité. */
  max?: number;
  /** Attente décrite à l’utilisateur, par exemple « un ou plusieurs PDF ». */
  label: string;
}

export interface OperationOutputDescription {
  /** Format produit : un format précis, `same` (celui de l’entrée) ou `report`. */
  format: FormatId | 'same' | 'report';
  /** `one` regroupe les entrées, `per-input` produit un fichier par entrée, `many` peut en produire plusieurs. */
  cardinality: 'one' | 'per-input' | 'many';
  label: string;
}

export type OperationCategory =
  | 'pdf-pages' | 'pdf-optimize' | 'pdf-annotate' | 'pdf-secure' | 'pdf-convert'
  | 'image-convert' | 'image-edit' | 'image-analyze'
  | 'table-convert' | 'text-convert' | 'office-convert'
  | 'ocr' | 'compare' | 'organize' | 'report';

export interface Operation {
  id: string;
  label: string;
  description: string;
  category: OperationCategory;
  inputs: OperationInputRequirement;
  output: OperationOutputDescription;
  params: ParamDefinition[];
  /** Limites connues, affichées dans les outils et reprises dans la documentation. */
  limits: string[];
  /** Nature réelle de l’opération, affichée telle quelle dans l’interface. */
  nature?: 'native' | 'overlay' | 'rebuild' | 'measure';
  run: (inputs: OperationInput[], params: ParamValues, context: OperationContext) => Promise<OperationResult>;
}

export function defaultParamValues(params: ParamDefinition[]): ParamValues {
  const values: ParamValues = {};
  for (const param of params) values[param.id] = param.default;
  return values;
}

export function normalizeParamValues(params: ParamDefinition[], values: ParamValues): ParamValues {
  const normalized: ParamValues = {};
  for (const param of params) {
    const value = values[param.id];
    if (param.kind === 'boolean') {
      normalized[param.id] = typeof value === 'boolean' ? value : param.default;
    } else if (param.kind === 'number') {
      const numeric = typeof value === 'number' ? value : Number(value);
      normalized[param.id] = Number.isFinite(numeric) ? Math.min(param.max, Math.max(param.min, numeric)) : param.default;
    } else if (param.kind === 'select') {
      const allowed = param.options.map((option) => option.value);
      normalized[param.id] = typeof value === 'string' && allowed.includes(value) ? value : param.default;
    } else {
      normalized[param.id] = typeof value === 'string' ? value : param.default;
    }
  }
  return normalized;
}

export function readNumber(params: ParamValues, id: string, fallback: number): number {
  const value = params[id];
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function readText(params: ParamValues, id: string, fallback = ''): string {
  const value = params[id];
  return typeof value === 'string' ? value : fallback;
}

export function readBoolean(params: ParamValues, id: string, fallback = false): boolean {
  const value = params[id];
  return typeof value === 'boolean' ? value : fallback;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' : (error as { name?: string } | undefined)?.name === 'AbortError';
}

export function abortError(): Error {
  return typeof DOMException === 'function'
    ? new DOMException('Opération annulée par l’utilisateur.', 'AbortError')
    : Object.assign(new Error('Opération annulée par l’utilisateur.'), { name: 'AbortError' });
}
