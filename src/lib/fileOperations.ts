import { invoke, isTauri } from '@tauri-apps/api/core';

function directoryName(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/$/, '');
  const slash = normalized.lastIndexOf('/');
  if (slash < 0) return '';
  return path.includes('\\') && !path.includes('/') ? normalized.slice(0, slash).replaceAll('/', '\\') : normalized.slice(0, slash);
}

function fileName(path: string): string {
  return path.replaceAll('\\', '/').split('/').pop() ?? path;
}

function joinPath(directory: string, name: string, originalPath: string): string {
  const separator = originalPath.includes('\\') && !originalPath.includes('/') ? '\\' : '/';
  return `${directory.replace(/[\\/]$/, '')}${separator}${name}`;
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/\0]/.test(trimmed)) {
    throw new Error('Choisissez un nom de fichier valide, sans séparateur de dossier.');
  }
  return trimmed;
}

export async function renameDesktopFile(path: string, nextName: string): Promise<string> {
  const parent = directoryName(path);
  if (!parent) throw new Error('Impossible de déterminer le dossier de ce fichier.');
  return moveDesktopFile(path, parent, validateName(nextName));
}

export async function moveDesktopFile(path: string, destinationDirectory: string, nextName = fileName(path)): Promise<string> {
  if (!isTauri()) throw new Error('Le déplacement de fichiers est disponible dans l’application de bureau.');
  const safeName = validateName(nextName);
  if (!destinationDirectory.trim()) throw new Error('Choisissez un dossier de destination.');
  const destination = joinPath(destinationDirectory, safeName, path);
  if (destination === path) return path;

  await invoke('allow_file_access', { path });
  await invoke('allow_directory_access', { path: destinationDirectory });
  const fs = await import('@tauri-apps/plugin-fs');
  if (await fs.exists(destination)) throw new Error(`Un fichier nommé « ${safeName} » existe déjà à cet emplacement.`);
  await fs.rename(path, destination);
  return destination;
}

export function pathFileName(path: string): string {
  return fileName(path);
}
