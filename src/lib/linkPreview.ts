import { useSyncExternalStore } from 'react';
import { anchorIdFromHref, resolveAnchorTarget } from './markdownAnchors';

/**
 * Aperçu du lien survolé, comme dans un navigateur.
 *
 * Le survol d’un lien publie ici son adresse ; l’interface l’affiche en bas de
 * la fenêtre. Un magasin minuscule plutôt qu’un contexte : n’importe quel
 * lecteur (Markdown aujourd’hui, un autre demain) en profite sans être
 * réorganisé, et la barre d’état n’a rien à faire remonter.
 *
 * Une ancre interne est résolue pour de vrai : si le titre visé n’existe pas
 * dans le document, c’est écrit tel quel au lieu d’afficher une adresse qui ne
 * mènerait nulle part.
 */

export type LinkPreviewKind = 'external' | 'anchor' | 'anchor-missing' | 'local' | 'other';

export interface LinkPreview {
  /** Adresse affichée (relative telle qu’écrite pour les documents locaux). */
  label: string;
  /** Adresse complète, pour l’infobulle et la copie. */
  href: string;
  kind: LinkPreviewKind;
  /** Texte du lien, quand il diffère de l’adresse. */
  text?: string;
}

let current: LinkPreview | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Publie l’aperçu courant (ou le retire avec `null`). */
export function setLinkPreview(next: LinkPreview | null): void {
  if (current === next) return;
  if (current && next && current.href === next.href && current.kind === next.kind && current.label === next.label) return;
  current = next;
  emit();
}

export function getLinkPreview(): LinkPreview | null {
  return current;
}

export function subscribeLinkPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Aperçu courant, pour la barre d’état. */
export function useLinkPreview(): LinkPreview | null {
  return useSyncExternalStore(subscribeLinkPreview, getLinkPreview, () => null);
}

/** Conteneurs dans lesquels une ancre interne peut être cherchée. */
const ANCHOR_ROOT_SELECTOR = '.markdown-document';

/**
 * Décrit un lien survolé à partir de son élément.
 *
 * Fonction pure vis-à-vis du magasin : elle observe le document, elle ne le
 * modifie pas.
 */
export function previewForAnchor(anchor: HTMLAnchorElement): LinkPreview | null {
  const href = anchor.getAttribute('href')?.trim() ?? '';
  const text = (anchor.textContent ?? '').trim();
  if (!href) return null;
  const withText = text && text !== href ? { text } : {};

  if (href.startsWith('#')) {
    const id = anchorIdFromHref(href);
    if (!id) return null;
    const root = anchor.closest(ANCHOR_ROOT_SELECTOR) ?? anchor.ownerDocument;
    const target = resolveAnchorTarget(root, href);
    return {
      label: `#${id}`,
      href: `#${id}`,
      kind: target ? 'anchor' : 'anchor-missing',
      ...withText,
    };
  }

  const absolute = (() => {
    try {
      return new URL(href, anchor.ownerDocument.baseURI).href;
    } catch {
      return href;
    }
  })();
  // La nature du lien se lit dans l’adresse écrite, pas dans la version absolue :
  // un chemin relatif résolu devient une adresse du document, pas un site web.
  if (/^https?:\/\//iu.test(href)) return { label: absolute, href: absolute, kind: 'external', ...withText };
  if (/^[a-z][a-z0-9+.-]*:/iu.test(href)) return { label: href, href: absolute, kind: 'other', ...withText };
  return { label: href, href: absolute, kind: 'local', ...withText };
}

/** Libellé court expliquant la nature du lien, affiché après l’adresse. */
export function describeLinkKind(kind: LinkPreviewKind): string {
  if (kind === 'anchor') return 'section de ce document';
  if (kind === 'anchor-missing') return 'section introuvable dans ce document';
  if (kind === 'external') return 'site web';
  if (kind === 'local') return 'fichier local';
  return 'lien';
}
