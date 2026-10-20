import { isTauri } from '@tauri-apps/api/core';

/**
 * Plein écran, en deux niveaux distincts.
 *
 * 1. **Fenêtre** — la fenêtre Noto occupe tout l’écran du système, sans barre de
 *    titre. Dans l’application de bureau, c’est la fenêtre Tauri qui bascule
 *    (`setFullscreen`) ; dans un navigateur, c’est l’API plein écran du
 *    document, avec repli explicite si elle est refusée ou indisponible.
 * 2. **Immersion** — la fenêtre garde sa taille, mais l’interface se retire
 *    (barre latérale, menus, onglets) pour ne laisser que le document et les
 *    actions utiles. Ce niveau est purement visuel : il vit dans l’application.
 *
 * Aucune des deux fonctions ne simule son résultat : elles renvoient l’état
 * réellement obtenu, ou lèvent une erreur explicite.
 */

export type FullscreenKind = 'window' | 'document';

export interface FullscreenSupport {
  /** Vrai si un basculement plein écran est réellement possible ici. */
  supported: boolean;
  /** Niveau qui serait utilisé, ou `null` si aucun n’est disponible. */
  kind: FullscreenKind | null;
}

export function fullscreenSupport(): FullscreenSupport {
  if (isTauri()) return { supported: true, kind: 'window' };
  const element = typeof document === 'undefined' ? null : document.documentElement;
  if (element && typeof element.requestFullscreen === 'function') return { supported: true, kind: 'document' };
  return { supported: false, kind: null };
}

async function setWindowFullscreen(value: boolean): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setFullscreen(value);
}

/** Entre en plein écran et renvoie le niveau réellement utilisé. */
export async function enterFullscreen(): Promise<FullscreenKind> {
  const support = fullscreenSupport();
  if (!support.supported || !support.kind) {
    throw new Error('Le plein écran n’est pas disponible dans cet environnement.');
  }
  if (support.kind === 'window') {
    await setWindowFullscreen(true);
    return 'window';
  }
  await document.documentElement.requestFullscreen();
  return 'document';
}

/** Quitte le plein écran du niveau indiqué. Ne fait rien s’il n’est pas actif. */
export async function exitFullscreen(kind: FullscreenKind | null): Promise<void> {
  if (kind === 'window') {
    await setWindowFullscreen(false);
    return;
  }
  if (kind === 'document' && typeof document !== 'undefined' && document.fullscreenElement) {
    await document.exitFullscreen();
  }
}

/**
 * Vérifie le niveau de plein écran réellement actif, sans se fier à l’état
 * mémorisé par l’interface : l’utilisateur peut basculer par un autre moyen
 * (raccourci du système, touche Échap du navigateur).
 */
export async function detectFullscreenKind(): Promise<FullscreenKind | null> {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return (await getCurrentWindow().isFullscreen()) ? 'window' : null;
  }
  if (typeof document === 'undefined') return null;
  return document.fullscreenElement ? 'document' : null;
}

/** S’abonne aux changements de plein écran du document (navigateur). */
export function onDocumentFullscreenChange(handler: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('fullscreenchange', handler);
  return () => document.removeEventListener('fullscreenchange', handler);
}
