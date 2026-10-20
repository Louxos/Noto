/**
 * Ancres des titres Markdown.
 *
 * Un lien écrit `[voir la section](#ma-section)` doit mener au titre
 * correspondant. Pour que de tels liens fonctionnent, il faut que chaque titre
 * porte un identifiant **et** que l’application sache faire la correspondance.
 *
 * La règle de fabrication suit celle de GitHub, afin que les liens copiés d’un
 * dépôt ou d’un éditeur en ligne fonctionnent ici : minuscules, ponctuation
 * retirée, espaces remplacés par des tirets, accents **conservés**
 * (`## Introduction générale` → `introduction-générale`), et un suffixe `-1`,
 * `-2`… lorsque deux titres se ressemblent.
 *
 * La correspondance, elle, est volontairement indulgente : un lien écrit à la
 * main fonctionne aussi s’il omet les accents, change la casse ou garde des
 * espaces. Une ancre introuvable est signalée, jamais devinée.
 */

/**
 * Fabrique l’identifiant d’un titre, selon la règle de GitHub.
 *
 * Seule différence assumée avec GitHub : les tirets de bord sont retirés
 * (`Questions ?` donne `questions` plutôt que `questions-`). Un lien copié
 * depuis GitHub reste valable, la correspondance ignorant les tirets de bord.
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/**
 * Attribue des identifiants uniques dans l’ordre du document.
 *
 * À créer pour chaque rendu : l’unicité dépend de l’ordre des titres, et un
 * compteur conservé entre deux rendus suffixerait des titres inchangés.
 */
export function createHeadingSlugger(): (text: string) => string {
  const used = new Map<string, number>();
  return (text: string) => {
    const base = slugifyHeading(text) || 'section';
    const seen = used.get(base);
    used.set(base, (seen ?? 0) + 1);
    return seen === undefined ? base : `${base}-${seen}`;
  };
}

/**
 * Clé de comparaison indulgente : sans casse, sans accents, sans ponctuation.
 * `« Ma Section ! »` et `#ma-section` donnent la même clé.
 */
export function normalizeAnchorKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

/** Identifiant contenu dans une adresse d’ancre (`#titre`, `#titre%20collé`). */
export function anchorIdFromHref(href: string): string | null {
  if (!href.startsWith('#')) return null;
  const raw = href.slice(1);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Titres candidats d’un nœud, dans l’ordre du document. */
function headingsOf(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')];
}

/**
 * Retrouve le titre visé par une ancre.
 *
 * Trois passes, de la plus stricte à la plus indulgente : identifiant exact,
 * identifiant comparé sans casse ni accents, puis texte du titre comparé de la
 * même façon. Rien n’est inventé : sans correspondance, la fonction renvoie
 * `null` et l’appelant l’annonce à l’utilisateur.
 */
export function resolveAnchorTarget(root: ParentNode | null, href: string): HTMLElement | null {
  const id = anchorIdFromHref(href);
  if (!root || !id) return null;

  const exact = [...root.querySelectorAll<HTMLElement>('[id]')].find((element) => element.id === id);
  if (exact) return exact;

  const wanted = normalizeAnchorKey(id);
  if (!wanted) return null;
  const headings = headingsOf(root);
  const byId = headings.find((heading) => normalizeAnchorKey(heading.id) === wanted);
  if (byId) return byId;
  return headings.find((heading) => normalizeAnchorKey(heading.textContent ?? '') === wanted) ?? null;
}
