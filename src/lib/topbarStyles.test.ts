import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Garde-fou contre le retour du bug d’icônes superposées dans la barre du haut.
 *
 * La cause était connue : la zone des menus pouvait être comprimée sans borne,
 * son contenu débordait alors par-dessus les actions. Deux invariants de style
 * l’empêchent, et une règle de réduction progressive évite qu’il manque de la
 * place. Ce test lit la feuille de style réelle : si l’un des invariants
 * disparaît, la vérification continue échoue.
 */
const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

function rulesFor(selector: string): string[] {
  const pattern = new RegExp(`(^|[,}])\\s*${selector.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'gmu');
  return [...css.matchAll(pattern)].map((match) => match[2]);
}

describe('styles de la barre supérieure', () => {
  it('empêche les zones fixes d’être comprimées sous leur largeur naturelle', () => {
    // Sans ces deux règles, le contenu des menus déborde sur les actions.
    expect(rulesFor('.app-menubar').some((body) => /flex-shrink:\s*0/.test(body))).toBe(true);
    expect(rulesFor('.topbar-actions').some((body) => /flex-shrink:\s*0/.test(body))).toBe(true);
  });

  it('laisse le titre se tronquer plutôt que pousser les autres zones', () => {
    expect(rulesFor('.topbar-title').some((body) => /min-width:\s*0/.test(body) && /overflow:\s*hidden/.test(body))).toBe(true);
  });

  it('masque les libellés plutôt que les icônes quand la place manque', () => {
    const compact = css.slice(css.indexOf('.topbar-compact-actions'));
    for (const label of ['.edit-action span', '.save-action span', '.group-toolbar-action span', '.command-trigger span', '.topbar-compare-button span', '.editor-mode-toggle button span']) {
      expect(compact).toContain(label);
    }
    // Les commandes restent accessibles : le menu regroupé est bien stylé.
    expect(rulesFor('.menu-trigger-all').length).toBeGreaterThan(0);
    expect(rulesFor('.menu-popover-all').length).toBeGreaterThan(0);
  });
});
