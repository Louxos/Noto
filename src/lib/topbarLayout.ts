/**
 * Répartition de la barre supérieure.
 *
 * La barre supérieure contient quatre zones : le titre du fichier, les menus,
 * les actions (mode d’édition, barre d’outils, paramètres) et, sur la page
 * Fichier, la bande d’onglets juste en dessous. Les menus et les actions
 * gardent leur largeur naturelle : sans règle, ils finissent par se superposer
 * lorsque la fenêtre est étroite ou que beaucoup d’actions sont affichées
 * (cas typique : passage en édition d’un Markdown, qui ajoute le sélecteur de
 * mode à trois boutons).
 *
 * Ce module décrit la seule chose difficile : **quand** réduire l’affichage.
 * Trois étapes, dans cet ordre :
 *
 * 1. `normal` — libellés visibles partout.
 * 2. `compact-actions` — les actions et les sélecteurs passent en icônes (leur
 *    infobulle et leur libellé accessible sont conservés).
 * 3. `menu-button` — les menus sont regroupés derrière un seul bouton.
 *
 * La décision est fondée sur une mesure réelle (`scrollWidth > clientWidth`),
 * jamais sur la largeur de la fenêtre : la largeur nécessaire dépend des
 * fichiers ouverts, donc une règle en pixels de fenêtre serait fausse.
 *
 * Le retour en arrière est volontairement prudent : chaque débordement est
 * mémorisé avec la largeur exacte à laquelle il s’est produit, et l’étape
 * précédente n’est restaurée que lorsque la place disponible dépasse cette
 * largeur d’une marge. Cela évite tout clignotement entre deux étapes.
 */

export type TopbarFitStage = 'normal' | 'compact-actions' | 'menu-button';

/** Étapes, de la plus spacieuse à la plus réduite. */
export const TOPBAR_FIT_STAGES: readonly TopbarFitStage[] = ['normal', 'compact-actions', 'menu-button'];

/** Marge, en pixels, avant de restaurer une étape qui avait débordé. */
export const TOPBAR_FIT_RECOVER_MARGIN = 48;

export interface TopbarFitState {
  stage: TopbarFitStage;
  /**
   * Largeur à laquelle chaque étape a débordé. Une étape absente n’a jamais
   * débordé depuis le démarrage : on ne la restaure donc pas « à l’aveugle ».
   */
  overflowedAt: Partial<Record<TopbarFitStage, number>>;
}

export interface TopbarMeasurement {
  /** Largeur réellement disponible dans la barre (`clientWidth`). */
  availableWidth: number;
  /** Vrai lorsque le contenu dépasse la largeur disponible. */
  overflowing: boolean;
}

export function initialTopbarFit(): TopbarFitState {
  return { stage: 'normal', overflowedAt: {} };
}

export function topbarFitIndex(stage: TopbarFitStage): number {
  return TOPBAR_FIT_STAGES.indexOf(stage);
}

/**
 * Calcule l’étape suivante.
 *
 * - débordement : on réduit d’une étape (et on note la largeur fautive) ;
 * - place suffisante pour restaurer l’étape précédente : on la restaure ;
 * - sinon : rien ne change.
 */
export function nextTopbarFit(state: TopbarFitState, measurement: TopbarMeasurement): TopbarFitState {
  const index = topbarFitIndex(state.stage);

  if (measurement.overflowing) {
    if (index >= TOPBAR_FIT_STAGES.length - 1) return state;
    return {
      stage: TOPBAR_FIT_STAGES[index + 1],
      overflowedAt: { ...state.overflowedAt, [state.stage]: measurement.availableWidth },
    };
  }

  if (index === 0) return state;

  const previous = TOPBAR_FIT_STAGES[index - 1];
  const failureWidth = state.overflowedAt[previous];
  if (failureWidth === undefined) return state;
  if (measurement.availableWidth < failureWidth + TOPBAR_FIT_RECOVER_MARGIN) return state;

  const { [previous]: _restore, ...rest } = state.overflowedAt;
  return { stage: previous, overflowedAt: rest };
}

/**
 * Classe CSS à appliquer à la coque de l’application pour une étape donnée.
 * Les étapes sont cumulatives : `menu-button` implique `compact-actions`.
 */
export function topbarFitClasses(stage: TopbarFitStage): string {
  if (stage === 'normal') return '';
  return stage === 'compact-actions' ? 'topbar-compact-actions' : 'topbar-compact-actions topbar-menu-button';
}
