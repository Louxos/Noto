import type { RecentFile } from './preferences';

export type GroupColor = 'violet' | 'blue' | 'mint' | 'amber' | 'rose';

export interface FileGroup {
  id: string;
  name: string;
  color: GroupColor;
  files: RecentFile[];
  createdAt: number;
}

export const GROUP_COLORS: GroupColor[] = ['violet', 'blue', 'mint', 'amber', 'rose'];
const GROUPS_KEY = 'noto.groups.v1';
const MAX_GROUPS = 30;
const MAX_FILES_PER_GROUP = 500;
const MAX_GROUP_NAME = 48;

export function loadGroups(): FileGroup[] {
  try {
    return normalizeGroups(JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveGroups(groups: FileGroup[]): void {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups.slice(0, MAX_GROUPS)));
  } catch {
    // Local grouping is a convenience; storage quota or privacy mode must not break file viewing.
  }
}

export function normalizeGroups(value: unknown): FileGroup[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((entry): FileGroup[] => {
    if (!entry || typeof entry !== 'object') return [];
    const group = entry as Partial<FileGroup>;
    if (typeof group.id !== 'string' || !group.id || ids.has(group.id)) return [];
    if (typeof group.name !== 'string' || !group.name.trim()) return [];
    ids.add(group.id);
    const files = Array.isArray(group.files)
      ? group.files.map(normalizeRecentFile).filter((file): file is RecentFile => file !== null).slice(0, MAX_FILES_PER_GROUP)
      : [];
    const uniqueFiles = [...new Map(files.map((file) => [file.id, file])).values()];
    const color = GROUP_COLORS.includes(group.color as GroupColor) ? group.color as GroupColor : 'violet';
    return [{
      id: group.id,
      name: group.name.trim().slice(0, MAX_GROUP_NAME),
      color,
      files: uniqueFiles,
      createdAt: typeof group.createdAt === 'number' && Number.isFinite(group.createdAt) ? group.createdAt : 0,
    }];
  }).slice(0, MAX_GROUPS);
}

function normalizeRecentFile(value: unknown): RecentFile | null {
  if (!value || typeof value !== 'object') return null;
  const file = value as Partial<RecentFile>;
  if (typeof file.id !== 'string' || !file.id || typeof file.name !== 'string' || !file.name) return null;
  if (typeof file.path !== 'string' || typeof file.kind !== 'string') return null;
  if (file.source !== undefined && file.source !== 'browser' && file.source !== 'desktop') return null;
  return {
    id: file.id,
    name: file.name.slice(0, 260),
    path: file.path.slice(0, 2048),
    kind: file.kind.slice(0, 40),
    lastOpened: typeof file.lastOpened === 'number' && Number.isFinite(file.lastOpened) ? file.lastOpened : 0,
    source: file.source,
  };
}

export function createGroup(name: string, color: GroupColor = 'violet', id = createId()): FileGroup | null {
  const normalized = name.trim().slice(0, MAX_GROUP_NAME);
  if (!normalized) return null;
  return { id, name: normalized, color, files: [], createdAt: Date.now() };
}

export function duplicateGroup(groups: FileGroup[], id: string): FileGroup[] {
  if (groups.length >= MAX_GROUPS) return groups;
  const source = groups.find((group) => group.id === id);
  if (!source) return groups;
  const copy = createGroup(`${source.name} (copie)`, source.color);
  return copy ? [{ ...copy, files: [...source.files] }, ...groups] : groups;
}

export function renameGroup(groups: FileGroup[], id: string, name: string, color?: GroupColor): FileGroup[] {
  const normalized = name.trim().slice(0, MAX_GROUP_NAME);
  if (!normalized) return groups;
  return groups.map((group) => group.id === id ? { ...group, name: normalized, ...(color ? { color } : {}) } : group);
}

export function deleteGroup(groups: FileGroup[], id: string): FileGroup[] {
  return groups.filter((group) => group.id !== id);
}

export function addGroupFile(groups: FileGroup[], groupId: string, file: RecentFile): FileGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    const exists = group.files.some((item) => item.id === file.id);
    const files = exists
      ? group.files.map((item) => item.id === file.id ? file : item)
      : [file, ...group.files].slice(0, MAX_FILES_PER_GROUP);
    return { ...group, files };
  });
}

export function toggleGroupFile(groups: FileGroup[], groupId: string, file: RecentFile): FileGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    const exists = group.files.some((item) => item.id === file.id);
    const files = exists ? group.files.filter((item) => item.id !== file.id) : [file, ...group.files].slice(0, MAX_FILES_PER_GROUP);
    return { ...group, files };
  });
}

export function removeGroupFile(groups: FileGroup[], groupId: string, fileId: string): FileGroup[] {
  return removeGroupFiles(groups, groupId, [fileId]);
}

export function removeGroupFiles(groups: FileGroup[], groupId: string, fileIds: string[]): FileGroup[] {
  const removals = new Set(fileIds);
  return groups.map((group) => group.id === groupId
    ? { ...group, files: group.files.filter((file) => !removals.has(file.id)) }
    : group);
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
