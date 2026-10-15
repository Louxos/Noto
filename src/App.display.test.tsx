// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * Les appels IPC de la fenêtre de bureau sont neutralisés : ce test porte sur
 * l’affichage, et rien ne doit dépendre d’un pont Tauri absent dans jsdom.
 */
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn(async () => []) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }) }));

/** Les attentes sont explicites : un exécuteur d’intégration continue lent ne
 *  doit pas transformer une attente par défaut d’une seconde en échec. */
const ATTENTE = { timeout: 10_000 } as const;

/**
 * Tests d’affichage de la coque : plein écran de la fenêtre et mode immersion.
 *
 * Ils vérifient ce que l’utilisateur voit réellement dans le document :
 * l’absence de commande inutile quand le plein écran n’existe pas, sa présence
 * et son état quand il existe, et la disparition de l’interface en immersion.
 * L’effet produit par le système (fenêtre Tauri ou plein écran du navigateur)
 * ne peut pas être simulé ici : il est vérifié dans l’application de bureau.
 */
// Le guide de première ouverture s’affiche au premier lancement : il
// intercepterait Échap, qui doit d’abord fermer une fenêtre ouverte.
beforeEach(() => localStorage.setItem('noto.first-run.v1', 'done'));

afterEach(() => {
  cleanup();
  localStorage.clear();
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  Reflect.deleteProperty(document, 'fullscreenElement');
});

const fullscreenButton = () => screen.queryByRole('button', { name: /plein écran/i });

describe('affichage', () => {
  it('ne propose aucune commande de plein écran quand l’environnement ne sait pas le faire', () => {
    render(<App />);
    expect(fullscreenButton()).toBeNull();
  });

  it('propose le plein écran dès que l’environnement le permet, et suit son état réel', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    let element: Element | null = null;
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(() => {
        element = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      }),
    });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });

    render(<App />);
    const enter = screen.getByRole('button', { name: 'Passer en plein écran' });
    expect(enter.getAttribute('aria-pressed')).toBe('false');

    await user.click(enter);
    const exit = await screen.findByRole('button', { name: 'Quitter le plein écran' }, ATTENTE);
    await waitFor(() => expect(exit.getAttribute('aria-pressed')).toBe('true'), ATTENTE);
  });

  it('retire l’interface en mode immersion et laisse une sortie visible', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const shell = container.querySelector('.app-shell');
    expect(shell?.className).not.toContain('immersive');
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeTruthy();

    await user.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');
    expect(container.querySelector('.app-shell')?.className).toContain('immersive');
    const exitImmersive = screen.getByRole('button', { name: 'Quitter le mode immersion' });
    expect(exitImmersive).toBeTruthy();

    await user.click(exitImmersive);
    expect(container.querySelector('.app-shell')?.className).not.toContain('immersive');
  });

  it('sort de l’immersion avec Échap', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');
    expect(container.querySelector('.app-shell')?.className).toContain('immersive');
    await user.keyboard('{Escape}');
    expect(container.querySelector('.app-shell')?.className).not.toContain('immersive');
  });
});
