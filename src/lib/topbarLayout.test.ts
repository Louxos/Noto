import { describe, expect, it } from 'vitest';
import {
  TOPBAR_FIT_RECOVER_MARGIN,
  initialTopbarFit,
  nextTopbarFit,
  topbarFitClasses,
  type TopbarFitState,
} from './topbarLayout';

const roomy = { availableWidth: 1600, overflowing: false };
const tight = { availableWidth: 900, overflowing: true };

describe('répartition de la barre supérieure', () => {
  it('ne touche à rien tant que le contenu tient', () => {
    expect(nextTopbarFit(initialTopbarFit(), roomy)).toEqual(initialTopbarFit());
  });

  it('réduit les libellés, puis les menus, quand le contenu dépasse', () => {
    const first = nextTopbarFit(initialTopbarFit(), tight);
    expect(first.stage).toBe('compact-actions');
    expect(first.overflowedAt.normal).toBe(900);

    const second = nextTopbarFit(first, tight);
    expect(second.stage).toBe('menu-button');
    expect(second.overflowedAt['compact-actions']).toBe(900);

    // Dernière étape : plus rien à réduire, l’état reste stable.
    expect(nextTopbarFit(second, tight)).toEqual(second);
  });

  it('ne restaure une étape qu’avec une vraie marge, jamais au clignotement', () => {
    let state: TopbarFitState = initialTopbarFit();
    state = nextTopbarFit(state, { availableWidth: 1000, overflowing: true });
    state = nextTopbarFit(state, { availableWidth: 1000, overflowing: true });
    expect(state.stage).toBe('menu-button');

    // 1 047 px dépasse la largeur fautive (1 000) mais pas la marge : on attend.
    const almost = { availableWidth: 1000 + TOPBAR_FIT_RECOVER_MARGIN - 1, overflowing: false };
    expect(nextTopbarFit(state, almost)).toEqual(state);

    // Assez de place : retour d’une étape seulement, pas des deux.
    const restored = nextTopbarFit(state, { availableWidth: 1000 + TOPBAR_FIT_RECOVER_MARGIN, overflowing: false });
    expect(restored.stage).toBe('compact-actions');

    // Les menus ne reviennent qu’au-delà de leur propre largeur fautive.
    expect(nextTopbarFit(restored, { availableWidth: 1000 + TOPBAR_FIT_RECOVER_MARGIN, overflowing: false }).stage).toBe('normal');
    expect(nextTopbarFit(restored, almost).stage).toBe('compact-actions');

    // Revenu au départ, plus rien ne bouge tant que le contenu tient.
    expect(nextTopbarFit(initialTopbarFit(), roomy).stage).toBe('normal');
  });

  it('n’affiche les classes de réduction que dans les étapes concernées', () => {
    expect(topbarFitClasses('normal')).toBe('');
    expect(topbarFitClasses('compact-actions')).toBe('topbar-compact-actions');
    expect(topbarFitClasses('menu-button')).toBe('topbar-compact-actions topbar-menu-button');
  });
});
