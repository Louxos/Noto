import type { OpenDocument } from '../types';

export interface LocalDraft {
  id: string;
  source: 'browser' | 'desktop';
  path: string;
  name: string;
  content: string;
  savedAt: number;
  originalModifiedAt?: number;
  originalSize: number;
}

const DRAFTS_KEY = 'noto.recovery-drafts.v1';
export const MAX_DRAFT_CONTENT_CHARACTERS = 750_000;
const MAX_TOTAL_DRAFT_CHARACTERS = 1_500_000;
const MAX_DRAFTS = 20;

export function draftId(document: Pick<OpenDocument, 'source' | 'path'>): string {
  return `${document.source}:${document.path}`;
}

export function normalizeLocalDrafts(value: unknown, now = Date.now(), retentionDays = 7): LocalDraft[] {
  if (!Array.isArray(value)) return [];
  const cutoff = now - Math.max(1, retentionDays) * 24 * 60 * 60 * 1_000;
  const unique = new Map<string, LocalDraft>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Partial<LocalDraft>;
    if (candidate.source !== 'browser' && candidate.source !== 'desktop') continue;
    if (typeof candidate.path !== 'string' || !candidate.path || typeof candidate.name !== 'string' || typeof candidate.content !== 'string') continue;
    if (candidate.content.length > MAX_DRAFT_CONTENT_CHARACTERS || typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt) || candidate.savedAt < cutoff || candidate.savedAt > now + 60_000) continue;
    const id = draftId({ source: candidate.source, path: candidate.path });
    if (unique.has(id)) continue;
    unique.set(id, {
      id,
      source: candidate.source,
      path: candidate.path.slice(0, 4_096),
      name: candidate.name.slice(0, 260),
      content: candidate.content,
      savedAt: candidate.savedAt,
      originalModifiedAt: typeof candidate.originalModifiedAt === 'number' && Number.isFinite(candidate.originalModifiedAt) ? candidate.originalModifiedAt : undefined,
      originalSize: typeof candidate.originalSize === 'number' && Number.isFinite(candidate.originalSize) && candidate.originalSize >= 0 ? candidate.originalSize : 0,
    });
  }
  let totalCharacters = 0;
  return [...unique.values()].sort((left, right) => right.savedAt - left.savedAt).filter((draft) => {
    if (totalCharacters + draft.content.length > MAX_TOTAL_DRAFT_CHARACTERS) return false;
    totalCharacters += draft.content.length;
    return true;
  }).slice(0, MAX_DRAFTS);
}

export function loadLocalDrafts(retentionDays = 7, now = Date.now()): LocalDraft[] {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '[]') as unknown;
    const normalized = normalizeLocalDrafts(stored, now, retentionDays);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return [];
  }
}

export function findLocalDraft(document: OpenDocument, retentionDays = 7): LocalDraft | null {
  return loadLocalDrafts(retentionDays).find((draft) => draft.id === draftId(document)) ?? null;
}

export function saveLocalDraft(document: OpenDocument, retentionDays = 7, now = Date.now()): void {
  if (document.content.length > MAX_DRAFT_CONTENT_CHARACTERS) {
    throw new Error(`Ce brouillon dépasse la limite locale de ${MAX_DRAFT_CONTENT_CHARACTERS.toLocaleString('fr-FR')} caractères et ne peut pas être récupéré automatiquement.`);
  }
  const drafts = loadLocalDrafts(retentionDays, now);
  const id = draftId(document);
  const draft: LocalDraft = {
    id,
    source: document.source,
    path: document.path,
    name: document.name,
    content: document.content,
    savedAt: now,
    originalModifiedAt: document.modifiedAt ?? drafts.find((item) => item.id === id)?.originalModifiedAt,
    originalSize: document.size,
  };
  const normalized = normalizeLocalDrafts([draft, ...drafts.filter((item) => item.id !== id)], now, retentionDays);
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(normalized));
  } catch {
    throw new Error('Le stockage local est indisponible ou saturé ; ce brouillon ne pourra pas être récupéré automatiquement.');
  }
}

export function removeLocalDraft(document: Pick<OpenDocument, 'source' | 'path'>): void {
  try {
    const current = loadLocalDrafts(30);
    const next = current.filter((draft) => draft.id !== draftId(document));
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
  } catch { /* Recovery is best-effort and must not block saving or closing. */ }
}

export function clearLocalDrafts(): void {
  try { localStorage.removeItem(DRAFTS_KEY); } catch { /* Best-effort cleanup. */ }
}
