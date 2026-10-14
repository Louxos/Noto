import type { OperationMeasurement } from './operations/types';

/**
 * Historique local des opérations Noto.
 *
 * L’historique ne conserve que des métadonnées (noms, chemins, tailles,
 * paramètres résumés). Aucun contenu de document n’est copié, aucune donnée
 * n’est transmise : tout reste dans le stockage local du poste.
 */

export interface HistorySourceFile {
  name: string;
  path?: string;
  size: number;
}

export interface HistoryProducedFile {
  name: string;
  location?: string;
  size: number;
}

export type HistoryStatus = 'success' | 'partial' | 'failed' | 'cancelled';

export interface HistoryEntry {
  id: string;
  operationId: string;
  operationLabel: string;
  startedAt: number;
  finishedAt: number;
  status: HistoryStatus;
  sourceFiles: HistorySourceFile[];
  producedFiles: HistoryProducedFile[];
  paramsSummary: string;
  measurements?: OperationMeasurement[];
  warnings: string[];
  errors: string[];
}

const HISTORY_KEY = 'noto.history.v1';
export const MAX_HISTORY_ENTRIES = 200;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadHistory(): HistoryEntry[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(HISTORY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)));
  } catch {
    // Stockage plein ou indisponible : Noto continue sans historique.
  }
}

export function appendHistory(entry: HistoryEntry, entries = loadHistory()): HistoryEntry[] {
  const next = [entry, ...entries].slice(0, MAX_HISTORY_ENTRIES);
  saveHistory(next);
  return next;
}

export function removeHistoryEntry(id: string, entries = loadHistory()): HistoryEntry[] {
  const next = entries.filter((entry) => entry.id !== id);
  saveHistory(next);
  return next;
}

export function clearHistory(): void {
  const store = storage();
  try {
    store?.removeItem(HISTORY_KEY);
  } catch {
    // Rien à faire : l’historique reste simplement inchangé.
  }
}

export function describeParams(params: Record<string, string | number | boolean>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== '' && value !== false)
    .map(([key, value]) => `${key}=${value === true ? 'oui' : String(value)}`);
  return parts.join(', ');
}

export function historyEntryId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<HistoryEntry>;
  return typeof entry.id === 'string'
    && typeof entry.operationId === 'string'
    && typeof entry.operationLabel === 'string'
    && typeof entry.startedAt === 'number'
    && Array.isArray(entry.sourceFiles)
    && Array.isArray(entry.producedFiles);
}
