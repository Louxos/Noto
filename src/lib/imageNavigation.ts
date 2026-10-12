import { invoke } from '@tauri-apps/api/core';
import { getExtension } from './fileTypes';

const imageExtensions = new Set(['png', 'apng', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'avif']);
const imageNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface AdjacentImageNames {
  previousName: string | null;
  nextName: string | null;
}

export function findAdjacentImageNames(currentName: string, siblingNames: string[]): AdjacentImageNames {
  const images = siblingNames
    .filter((name) => imageExtensions.has(getExtension(name)))
    .sort(imageNameCollator.compare);
  const currentIndex = images.findIndex((name) => imageNameCollator.compare(name, currentName) === 0);
  return {
    previousName: currentIndex > 0 ? images[currentIndex - 1] : null,
    nextName: currentIndex >= 0 && currentIndex < images.length - 1 ? images[currentIndex + 1] : null,
  };
}

export async function findAdjacentImagePaths(path: string): Promise<{ previousPath: string | null; nextPath: string | null }> {
  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (separatorIndex < 0) return { previousPath: null, nextPath: null };

  const pathPrefix = path.slice(0, separatorIndex + 1);
  const currentName = path.slice(separatorIndex + 1);
  const siblingPaths = await invoke<string[]>('adjacent_image_paths', { path });
  const names = siblingPaths.map((siblingPath) => siblingPath.slice(Math.max(siblingPath.lastIndexOf('/'), siblingPath.lastIndexOf('\\')) + 1));
  const adjacent = findAdjacentImageNames(currentName, names);
  return {
    previousPath: adjacent.previousName ? pathPrefix + adjacent.previousName : null,
    nextPath: adjacent.nextName ? pathPrefix + adjacent.nextName : null,
  };
}
