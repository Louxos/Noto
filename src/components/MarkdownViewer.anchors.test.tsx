// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkdownViewer } from './MarkdownViewer';

beforeEach(() => {
  // jsdom n’implémente pas le défilement : on l’observe au lieu de le subir.
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('liens internes d’un document Markdown', () => {
  const source = [
    '[Aller à l’étape](#étape-2-installation)',
    '',
    '# Journal',
    '',
    '## Étape 2 : installation',
    '',
    'Contenu de l’étape.',
    '',
    '## Notes',
    '',
    '### Notes',
  ].join('\n');

  it('donne à chaque titre un identifiant unique, accents conservés', () => {
    render(<MarkdownViewer source={source} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Étape 2 : installation' }).id).toBe('étape-2-installation');
    // Deux titres « Notes » de niveaux différents : le second est suffixé.
    const titles = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((element) => element.id);
    expect(titles).toEqual(['journal', 'étape-2-installation', 'notes', 'notes-1']);
  });

  it('amène réellement à la section visée, sans recharger la page', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={source} />);
    const link = screen.getByRole('link', { name: 'Aller à l’étape' });
    // L’adresse est encodée par le rendu, comme dans un navigateur : c’est la
    // version décodée qui doit désigner le titre.
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toBe('#étape-2-installation');

    await user.click(link);
    const target = screen.getByRole('heading', { level: 2, name: 'Étape 2 : installation' });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(target);
    expect(target.classList.contains('is-anchor-target')).toBe(true);
    expect(window.location.hash).not.toContain('étape-2'); // aucun saut d’adresse
  });

  it('laisse le lien intact quand la section n’existe pas', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={'[Vers la conclusion](#conclusion)\n\n# Journal'} />);
    await user.click(screen.getByRole('link', { name: 'Vers la conclusion' }));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('ouvre les liens externes dans un nouvel onglet, sans référent', () => {
    render(<MarkdownViewer source="[Noto](https://noto.example/docs)" />);
    const link = screen.getByRole('link', { name: 'Noto' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
  });
});
