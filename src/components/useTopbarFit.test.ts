// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { measureTopbar } from './useTopbarFit';

/**
 * La mise en page n’existe pas dans un environnement de test : ces tests
 * portent donc sur la règle de mesure elle-même, avec des boîtes aux
 * coordonnées choisies. La règle appliquée en production est la suivante : tant
 * que tout tient, le bord droit de la dernière zone coïncide avec le bord droit
 * du contenu de la barre ; dès qu’une zone ne rentre plus, ce bord le dépasse.
 */
const BAR = { left: 100, width: 1200, padding: 27 };
const GAP = 18;
const TITLE = 300;
const MENUS = 400;
// Décalages, relatifs au bord gauche de la barre.
const TITLE_LEFT = BAR.padding;
const MENUS_LEFT = TITLE_LEFT + TITLE + GAP;
const ACTIONS_LEFT = MENUS_LEFT + MENUS + GAP;
// Place réellement disponible entre les marges internes.
const CONTENT_WIDTH = BAR.width - BAR.padding * 2;
// Largeur qui amène exactement la dernière zone au bord droit du contenu.
const ACTIONS_FILLING = BAR.padding + CONTENT_WIDTH - ACTIONS_LEFT;

function box(className: string, width: number, left: number): HTMLElement {
  const element = document.createElement('div');
  if (className) element.className = className;
  const absoluteLeft = BAR.left + left;
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      left: absoluteLeft, right: absoluteLeft + width, width, x: absoluteLeft,
      top: 0, bottom: 0, height: 0, y: 0, toJSON: () => ({}),
    }),
  });
  return element;
}

function bar(children: HTMLElement[], scrollWidth = BAR.width): HTMLElement {
  const element = document.createElement('header');
  for (const child of children) element.append(child);
  Object.defineProperty(element, 'clientWidth', { value: BAR.width, configurable: true });
  Object.defineProperty(element, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      left: BAR.left, right: BAR.left + BAR.width, width: BAR.width, x: BAR.left,
      top: 0, bottom: 0, height: 0, y: 0, toJSON: () => ({}),
    }),
  });
  return element;
}

const title = (width = TITLE) => box('topbar-title', width, TITLE_LEFT);
const menus = (width = MENUS) => box('app-menubar', width, MENUS_LEFT);
const actions = (width: number) => box('topbar-actions', width, ACTIONS_LEFT);

describe('mesure de la barre supérieure', () => {
  it('ne signale rien quand la dernière zone s’arrête au bord du contenu', () => {
    const measure = measureTopbar(bar([title(), menus(), actions(ACTIONS_FILLING)]));
    expect(measure.availableWidth).toBe(BAR.width);
    expect(measure.overflowing).toBe(false);
  });

  it('signale le chevauchement dès que les zones dépassent le bord du contenu', () => {
    // La tolérance de 1 px absorbe les arrondis du moteur de rendu.
    expect(measureTopbar(bar([title(), menus(), actions(ACTIONS_FILLING + 1)])).overflowing).toBe(false);
    expect(measureTopbar(bar([title(), menus(), actions(ACTIONS_FILLING + 2)])).overflowing).toBe(true);
    expect(measureTopbar(bar([title(), menus(), actions(ACTIONS_FILLING + 200)])).overflowing).toBe(true);
  });

  it('reconnaît un débordement signalé par le moteur de rendu', () => {
    expect(measureTopbar(bar([title()], BAR.width + 120)).overflowing).toBe(true);
  });

  it('ignore une zone masquée (mode immersion) au lieu de la compter comme nulle', () => {
    const hidden = box('app-menubar', 0, 0);
    expect(measureTopbar(bar([title(), hidden, actions(400)])).overflowing).toBe(false);
    // Les menus revenus, la même barre ne suffit plus.
    expect(measureTopbar(bar([title(), menus(), actions(500)])).overflowing).toBe(true);
  });

  it('ne conclut rien quand aucune zone n’est mesurable', () => {
    expect(measureTopbar(bar([box('topbar-title', 0, 0)])).overflowing).toBe(false);
  });
});
