import { normalizeGroups, type FileGroup } from './groups';
import { normalizePreferences, type Preferences } from './preferences';

export interface LocalBackup {
  format: 'noto-local-backup';
  version: 1;
  exportedAt: string;
  groups: FileGroup[];
  preferences: Preferences;
}

const MAX_BACKUP_CHARACTERS = 2_000_000;

export function createLocalBackup(groups: FileGroup[], preferences: Preferences, exportedAt = new Date()): LocalBackup {
  return {
    format: 'noto-local-backup',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    groups,
    preferences,
  };
}

export function parseLocalBackup(source: string): Pick<LocalBackup, 'groups' | 'preferences'> {
  if (source.length > MAX_BACKUP_CHARACTERS) throw new Error('Ce fichier de sauvegarde dépasse la taille autorisée.');
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { throw new Error('Le fichier de sauvegarde n’est pas un JSON valide.'); }
  if (!value || typeof value !== 'object') throw new Error('Le format du fichier de sauvegarde est invalide.');
  const backup = value as Partial<LocalBackup>;
  if (backup.format !== 'noto-local-backup' || backup.version !== 1 || !Array.isArray(backup.groups)) {
    throw new Error('Cette sauvegarde Noto n’est pas reconnue ou sa version n’est pas prise en charge.');
  }
  return {
    groups: normalizeGroups(backup.groups),
    preferences: normalizePreferences(backup.preferences),
  };
}
