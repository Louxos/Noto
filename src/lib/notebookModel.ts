export interface NotebookSection {
  id: string;
  title: string;
  order: number;
  createdAt: number;
}

export interface NotebookPage {
  id: string;
  title: string;
  sectionId: string;
  parentId: string | null;
  relativePath: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface NotebookManifest {
  format: 'noto-notebook';
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sections: NotebookSection[];
  pages: NotebookPage[];
}

export interface NotebookReference {
  id: string;
  name: string;
  path: string;
  lastOpened: number;
}

export const MAX_NOTEBOOKS = 50;
export const MAX_NOTEBOOK_SECTIONS = 100;
export const MAX_NOTEBOOK_PAGES = 10_000;
export const NOTEBOOK_MANIFEST_NAME = '.noto-notebook.json';
const SAFE_RECORD_ID = /^[a-zA-Z0-9-]{1,100}$/;
const SAFE_SECTION_ID = /^[a-zA-Z0-9-]{1,80}$/;

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `noto-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function safeNotebookTitle(value: string, maximum = 100): string {
  return value.trim().replace(/[\u0000-\u001f]/g, '').slice(0, maximum);
}

export function slugifyNotebookFile(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52);
  return slug || 'note';
}

export function createNotebookManifest(name: string, id = makeId(), now = Date.now()): NotebookManifest {
  const title = safeNotebookTitle(name);
  if (!title) throw new Error('Donnez un nom au carnet.');
  if (!SAFE_RECORD_ID.test(id)) throw new Error('Identifiant de carnet invalide.');
  const sectionId = makeId();
  return {
    format: 'noto-notebook',
    version: 1,
    id,
    name: title,
    createdAt: now,
    updatedAt: now,
    sections: [{ id: sectionId, title: 'Général', order: 0, createdAt: now }],
    pages: [],
  };
}

export function createSectionRecord(title: string, manifest: NotebookManifest, id = makeId(), now = Date.now()): NotebookSection {
  const normalized = safeNotebookTitle(title);
  if (!normalized) throw new Error('Donnez un nom à la section.');
  if (!SAFE_SECTION_ID.test(id)) throw new Error('Identifiant de section invalide.');
  if (manifest.sections.some((section) => section.id === id)) throw new Error('Identifiant de section déjà utilisé. Réessayez.');
  if (manifest.sections.length >= MAX_NOTEBOOK_SECTIONS) throw new Error('Ce carnet contient déjà le nombre maximal de sections.');
  return { id, title: normalized, order: manifest.sections.length, createdAt: now };
}

export function createPageRecord(
  title: string,
  manifest: NotebookManifest,
  sectionId: string,
  parentId: string | null = null,
  id = makeId(),
  now = Date.now(),
): NotebookPage {
  const normalized = safeNotebookTitle(title);
  if (!normalized) throw new Error('Donnez un nom à la page.');
  if (!SAFE_RECORD_ID.test(id) || !SAFE_SECTION_ID.test(sectionId)) throw new Error('Identifiant de page ou de section invalide.');
  if (manifest.pages.length >= MAX_NOTEBOOK_PAGES) throw new Error('Ce carnet contient déjà le nombre maximal de pages.');
  if (!manifest.sections.some((section) => section.id === sectionId)) throw new Error('La section sélectionnée n’existe plus.');
  if (parentId) {
    const parent = manifest.pages.find((page) => page.id === parentId);
    if (!parent || parent.sectionId !== sectionId) throw new Error('La page parente ne fait pas partie de cette section.');
  }
  if (manifest.pages.some((page) => page.id === id)) throw new Error('Identifiant de page déjà utilisé. Réessayez.');
  const siblings = manifest.pages.filter((page) => page.sectionId === sectionId && page.parentId === parentId);
  const shortId = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || makeId().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const relativePath = `sections/${sectionId}/${slugifyNotebookFile(normalized)}-${shortId}.md`;
  if (manifest.pages.some((page) => page.relativePath === relativePath)) throw new Error('Nom de fichier de page déjà utilisé. Réessayez.');
  return {
    id,
    title: normalized,
    sectionId,
    parentId,
    relativePath,
    order: siblings.length,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeNotebookManifest(value: unknown): NotebookManifest {
  if (!value || typeof value !== 'object') throw new Error('Le fichier de carnet est invalide.');
  const input = value as Partial<NotebookManifest>;
  if (input.format !== 'noto-notebook' || input.version !== 1 || typeof input.id !== 'string' || !SAFE_RECORD_ID.test(input.id)) {
    throw new Error('Ce dossier ne contient pas un carnet Noto reconnu.');
  }
  const name = typeof input.name === 'string' ? safeNotebookTitle(input.name) : '';
  if (!name) throw new Error('Le carnet n’a pas de nom valide.');
  if (!Array.isArray(input.sections) || input.sections.length > MAX_NOTEBOOK_SECTIONS) throw new Error('La liste des sections du carnet est invalide.');
  if (!Array.isArray(input.pages) || input.pages.length > MAX_NOTEBOOK_PAGES) throw new Error('La liste des pages du carnet est invalide.');

  const sectionIds = new Set<string>();
  const sections = input.sections.map((raw, index): NotebookSection => {
    if (!raw || typeof raw.id !== 'string' || !SAFE_SECTION_ID.test(raw.id) || sectionIds.has(raw.id) || typeof raw.title !== 'string' || !safeNotebookTitle(raw.title)) {
      throw new Error('Une section du carnet est invalide.');
    }
    sectionIds.add(raw.id);
    return {
      id: raw.id,
      title: safeNotebookTitle(raw.title),
      order: safeOrder(raw.order, index),
      createdAt: safeTimestamp(raw.createdAt, safeTimestamp(input.createdAt, Date.now())),
    };
  });

  const pageIds = new Set<string>();
  const pagePaths = new Set<string>();
  const pages = input.pages.map((raw, index): NotebookPage => {
    if (!raw || typeof raw.id !== 'string' || !SAFE_RECORD_ID.test(raw.id) || pageIds.has(raw.id) || typeof raw.title !== 'string' || !safeNotebookTitle(raw.title)) {
      throw new Error('Une page du carnet est invalide.');
    }
    if (typeof raw.sectionId !== 'string' || !SAFE_SECTION_ID.test(raw.sectionId) || !sectionIds.has(raw.sectionId)) throw new Error('Une page référence une section inconnue.');
    if (typeof raw.relativePath !== 'string') throw new Error('Le chemin d’une page du carnet est invalide.');
    const relativePath = raw.relativePath.replaceAll('\\', '/');
    if (!isSafePagePath(relativePath, raw.sectionId) || pagePaths.has(relativePath)) throw new Error('Le chemin d’une page du carnet est invalide ou partagé.');
    if (raw.parentId !== null && (typeof raw.parentId !== 'string' || !SAFE_RECORD_ID.test(raw.parentId))) throw new Error('La hiérarchie des pages est invalide.');
    pageIds.add(raw.id);
    pagePaths.add(relativePath);
    return {
      id: raw.id,
      title: safeNotebookTitle(raw.title),
      sectionId: raw.sectionId,
      parentId: raw.parentId,
      relativePath,
      order: safeOrder(raw.order, index),
      createdAt: safeTimestamp(raw.createdAt, Date.now()),
      updatedAt: safeTimestamp(raw.updatedAt, safeTimestamp(raw.createdAt, Date.now())),
    };
  });

  const pageMap = new Map(pages.map((page) => [page.id, page]));
  for (const page of pages) {
    if (page.parentId) {
      const parent = pageMap.get(page.parentId);
      if (!parent || parent.sectionId !== page.sectionId || parent.id === page.id) throw new Error('Une page parente est invalide.');
      const visited = new Set<string>([page.id]);
      let ancestor: NotebookPage | undefined = parent;
      while (ancestor) {
        if (visited.has(ancestor.id)) throw new Error('La hiérarchie des pages contient une boucle.');
        visited.add(ancestor.id);
        ancestor = ancestor.parentId ? pageMap.get(ancestor.parentId) : undefined;
      }
    }
  }

  return {
    format: 'noto-notebook',
    version: 1,
    id: input.id,
    name,
    createdAt: safeTimestamp(input.createdAt, Date.now()),
    updatedAt: safeTimestamp(input.updatedAt, Date.now()),
    sections: sections.sort((left, right) => left.order - right.order),
    pages: pages.sort((left, right) => left.sectionId.localeCompare(right.sectionId) || left.order - right.order),
  };
}

export function addSection(manifest: NotebookManifest, section: NotebookSection, now = Date.now()): NotebookManifest {
  if (manifest.sections.some((item) => item.id === section.id)) return manifest;
  return { ...manifest, updatedAt: now, sections: [...manifest.sections, section].sort((a, b) => a.order - b.order) };
}

export function addPage(manifest: NotebookManifest, page: NotebookPage, now = Date.now()): NotebookManifest {
  if (manifest.pages.some((item) => item.id === page.id)) return manifest;
  return { ...manifest, updatedAt: now, pages: [...manifest.pages, page] };
}

export function renameNotebookSection(manifest: NotebookManifest, sectionId: string, title: string, now = Date.now()): NotebookManifest {
  const normalized = safeNotebookTitle(title);
  if (!normalized) throw new Error('Donnez un nom à la section.');
  return {
    ...manifest,
    updatedAt: now,
    sections: manifest.sections.map((section) => section.id === sectionId ? { ...section, title: normalized } : section),
  };
}

export function renameNotebookPage(manifest: NotebookManifest, pageId: string, title: string, now = Date.now()): NotebookManifest {
  const normalized = safeNotebookTitle(title);
  if (!normalized) throw new Error('Donnez un nom à la page.');
  return {
    ...manifest,
    updatedAt: now,
    pages: manifest.pages.map((page) => page.id === pageId ? { ...page, title: normalized, updatedAt: now } : page),
  };
}

export function removeNotebookPageTree(manifest: NotebookManifest, pageId: string, now = Date.now()): { manifest: NotebookManifest; removed: NotebookPage[] } {
  const removedIds = new Set<string>([pageId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of manifest.pages) {
      if (page.parentId && removedIds.has(page.parentId) && !removedIds.has(page.id)) {
        removedIds.add(page.id);
        changed = true;
      }
    }
  }
  const removed = manifest.pages.filter((page) => removedIds.has(page.id));
  if (!removed.length) return { manifest, removed };
  return { manifest: { ...manifest, updatedAt: now, pages: manifest.pages.filter((page) => !removedIds.has(page.id)) }, removed };
}

export function removeNotebookSection(manifest: NotebookManifest, sectionId: string, now = Date.now()): { manifest: NotebookManifest; removed: NotebookPage[] } {
  if (!manifest.sections.some((section) => section.id === sectionId)) return { manifest, removed: [] };
  const removed = manifest.pages.filter((page) => page.sectionId === sectionId);
  return {
    manifest: {
      ...manifest,
      updatedAt: now,
      sections: manifest.sections.filter((section) => section.id !== sectionId),
      pages: manifest.pages.filter((page) => page.sectionId !== sectionId),
    },
    removed,
  };
}

export function isSafePagePath(path: string, sectionId: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  if (!SAFE_SECTION_ID.test(sectionId) || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || normalized.includes('\0')) return false;
  const parts = normalized.split('/');
  return parts.length === 3
    && parts[0] === 'sections'
    && parts[1] === sectionId
    && parts[2].endsWith('.md')
    && parts[2] !== '.md'
    && !/[<>:"|?*\u0000-\u001f]/.test(parts[2])
    && parts.every((part) => Boolean(part) && part !== '.' && part !== '..');
}

function safeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function safeOrder(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
