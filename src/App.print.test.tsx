// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * Impression et mesures depuis l’application elle-même.
 *
 * Ces tests vérifient ce qui est observable : les boutons existent, ils ouvrent
 * une fenêtre réelle, et l’impression passe par la boîte de dialogue du système
 * avec une page produite par Noto. Le rendu papier, lui, ne s’observe que sur
 * une machine avec une imprimante.
 */
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }) }));

const ATTENTE = { timeout: 10_000 } as const;
const CORPS = 'Bonjour le monde\nDeuxième ligne\n';

beforeEach(() => {
  // Le guide de première ouverture capterait Échap : il est marqué comme déjà vu.
  localStorage.setItem('noto.first-run.v1', 'done');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * Ouvre un fichier texte par le champ de fichier de l’application.
 *
 * jsdom n’a pas de sélecteur natif : on remplace la liste de fichiers par une
 * liste d’un élément, puis on déclenche le même événement que le navigateur.
 */
async function openTextFile(name: string, body: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).toBeTruthy();
  const file = new File([body], name, { type: 'text/plain' });
  Object.defineProperty(input as HTMLInputElement, 'files', {
    value: { 0: file, length: 1, item: (index: number) => (index === 0 ? file : null) },
    configurable: true,
  });
  fireEvent.change(input as HTMLInputElement);
  await waitFor(() => expect(screen.getAllByText(name).length).toBeGreaterThan(0), ATTENTE);
}

describe('aperçu du lien survolé', () => {
  it('affiche l’adresse du lien en bas de la fenêtre, comme un navigateur', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTextFile('liens.md', '[Documentation](https://noto.example/docs)\n\n[Voir la section](#notes)\n\n# Notes\n');

    // La zone d’aperçu de lien est celle de la barre d’état, pas une autre
    // zone « status » de l’application (toast, chargement).
    const linkZone = () => document.querySelector('.status-link');
    const external = await screen.findByRole('link', { name: 'Documentation' });
    await user.hover(external);
    await waitFor(() => expect(linkZone()?.textContent).toContain('https://noto.example/docs'), ATTENTE);
    expect(linkZone()?.textContent).toContain('site web');

    const anchor = screen.getByRole('link', { name: 'Voir la section' });
    await user.hover(anchor);
    await waitFor(() => expect(linkZone()?.textContent).toContain('#notes'), ATTENTE);
    expect(linkZone()?.textContent).toContain('section de ce document');

    await user.unhover(anchor);
    await waitFor(() => expect(linkZone()).toBeNull(), ATTENTE);
  });

  it('signale une section introuvable au lieu d’une adresse qui ne mène nulle part', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTextFile('liens.md', '[Vers la conclusion](#conclusion)\n\n# Notes\n');
    await user.hover(await screen.findByRole('link', { name: 'Vers la conclusion' }));
    await waitFor(() => expect(document.querySelector('.status-link')?.textContent).toContain('#conclusion'), ATTENTE);
    expect(document.querySelector('.status-link')?.textContent).toContain('introuvable');
  });
});

describe('boutons d’impression et d’informations', () => {
  it('propose les deux boutons dans la barre d’outils et la barre d’état du fichier ouvert', { timeout: 20_000 }, async () => {
    render(<App />);
    await openTextFile('notes.txt', CORPS);

    const printButtons = screen.getAllByRole('button', { name: 'Imprimer ce fichier' });
    const infoButtons = screen.getAllByRole('button', { name: 'Informations sur le fichier' });
    expect(printButtons.length).toBeGreaterThanOrEqual(2);
    expect(infoButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('ouvre les informations sur le fichier et montre des mesures calculées', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTextFile('notes.txt', CORPS);

    await user.click(screen.getAllByRole('button', { name: 'Informations sur le fichier' })[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: 'Informations sur le fichier' });
    expect(dialog).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Caractères')).toBeTruthy(), ATTENTE);
    expect(screen.getByText(String(CORPS.length))).toBeTruthy(); // longueur réelle du contenu chargé
  });

  it('imprime ce qui est affiché, à la demande, via la boîte de dialogue du système', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    const originalCreateElement = window.document.createElement.bind(window.document);
    let written = '';
    const createElement = vi.spyOn(window.document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tag, options);
      if (tag === 'iframe') {
        Object.defineProperty(element, 'contentWindow', { value: { focus: vi.fn(), print } });
        Object.defineProperty(element, 'contentDocument', {
          value: { open: vi.fn(), close: vi.fn(), write: (html: string) => { written = html; }, images: [] },
        });
        Object.defineProperty(element, 'addEventListener', { value: (type: string, listener: () => void) => { if (type === 'load') window.setTimeout(listener, 0); } });
      }
      return element;
    }) as typeof window.document.createElement);

    render(<App />);
    await openTextFile('notes.txt', CORPS);
    await user.click(screen.getAllByRole('button', { name: 'Imprimer ce fichier' })[0] as HTMLElement);
    await screen.findByRole('dialog', { name: /Imprimer « notes\.txt »/u });
    await user.click(screen.getByRole('button', { name: 'Imprimer' }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce(), ATTENTE);
    expect(written).toContain('notes.txt');
    expect(written).toContain('Bonjour le monde');
    createElement.mockRestore();
  });

  it('répond aux raccourcis Ctrl+P et Ctrl+I', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTextFile('notes.txt', CORPS);

    await user.keyboard('{Control>}i{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Informations sur le fichier' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Informations sur le fichier' })).toBeNull(), ATTENTE);

    await user.keyboard('{Control>}p{/Control}');
    expect(await screen.findByRole('dialog', { name: /Imprimer « notes\.txt »/u })).toBeTruthy();
  });
});
