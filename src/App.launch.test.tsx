// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';

/**
 * Ouverture depuis l’Explorateur Windows.
 *
 * Windows lance Noto en lui passant le chemin du fichier double-cliqué
 * (`startup_paths`), ou le lui transmet si Noto tourne déjà (événement
 * `noto-open-files` de l’instance unique). Ces tests vérifient le seul effet
 * observable dans l’interface : le mode immersion s’active tout seul, et il
 * reste désactivable par le réglage.
 */
const listeners = new Map<string, (event: { payload: string[] }) => void>();
let startupPaths: string[] = [];
let pendingPaths: string[] = [];

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: vi.fn(async (command: string) => {
    if (command === 'startup_paths') return startupPaths;
    if (command === 'take_pending_open_files') return pendingPaths;
    return undefined;
  }),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: string[] }) => void) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  }),
}));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }) }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: vi.fn(async () => ({ size: 23 })),
  readFile: vi.fn(async () => new TextEncoder().encode('# Journal de bord\n')),
}));

const ATTENTE = { timeout: 10_000 } as const;
const SAMPLE = 'C:\\Users\\Ada\\Documents\\journal.md';

beforeEach(() => {
  localStorage.setItem('noto.first-run.v1', 'done');
  listeners.clear();
  startupPaths = [];
  pendingPaths = [];
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const shellClasses = () => document.querySelector('.app-shell')?.className ?? '';

describe('ouverture par Windows', () => {
  it('affiche le document seul quand Noto est lancé par un double-clic', { timeout: 20_000 }, async () => {
    startupPaths = [SAMPLE];
    const { container } = render(<App />);
    expect(container.querySelector('.app-shell')?.className).not.toContain('immersive');
    await waitFor(() => expect(shellClasses()).toContain('immersive'), ATTENTE);
    // La sortie d’immersion n’existe que dans ce mode : sa présence prouve l’état.
    expect(screen.getByRole('button', { name: 'Quitter le mode immersion' })).toBeTruthy();
  });

  it('active l’immersion quand un second fichier est transmis à Noto déjà ouvert', { timeout: 20_000 }, async () => {
    render(<App />);
    await waitFor(() => expect(listeners.has('noto-open-files')).toBe(true), ATTENTE);
    expect(shellClasses()).not.toContain('immersive');

    listeners.get('noto-open-files')?.({ payload: [SAMPLE] });
    await waitFor(() => expect(shellClasses()).toContain('immersive'), ATTENTE);
  });

  it('ne change rien quand le réglage est désactivé', { timeout: 20_000 }, async () => {
    localStorage.setItem('noto.preferences.v1', JSON.stringify({ immersiveOnFileOpen: false }));
    startupPaths = [SAMPLE];
    render(<App />);
    // La preuve que la séquence de démarrage a bien eu lieu : le document est ouvert.
    await screen.findByRole('tab', { name: /journal\.md/ }, ATTENTE);
    expect(shellClasses()).not.toContain('immersive');
  });
});
