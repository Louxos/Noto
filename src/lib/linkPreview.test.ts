// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { describeLinkKind, getLinkPreview, previewForAnchor, setLinkPreview, subscribeLinkPreview } from './linkPreview';

afterEach(() => setLinkPreview(null));

function anchor(html: string, className = 'markdown-document'): HTMLAnchorElement {
  const host = window.document.createElement('div');
  host.className = className;
  host.innerHTML = html;
  window.document.body.appendChild(host);
  const element = host.querySelector('a');
  if (!element) throw new Error('lien absent');
  return element;
}

describe('aperçu du lien survolé', () => {
  it('décrit un lien externe par son adresse complète', () => {
    const preview = previewForAnchor(anchor('<a href="https://noto.example/docs">Documentation</a>'));
    expect(preview).toMatchObject({ kind: 'external', label: 'https://noto.example/docs', text: 'Documentation' });
    expect(describeLinkKind(preview!.kind)).toBe('site web');
  });

  it('décrit un lien relatif comme un fichier local, sans le rendre absolu', () => {
    const preview = previewForAnchor(anchor('<a href="chapitre-2.md">Chapitre 2</a>'));
    expect(preview).toMatchObject({ kind: 'local', label: 'chapitre-2.md' });
    expect(describeLinkKind(preview!.kind)).toBe('fichier local');
  });

  it('reconnaît une ancre dont la section existe', () => {
    const preview = previewForAnchor(anchor('<h2 id="introduction">Introduction</h2><a href="#introduction">Voir</a>'));
    expect(preview).toMatchObject({ kind: 'anchor', label: '#introduction' });
    expect(describeLinkKind(preview!.kind)).toBe('section de ce document');
  });

  it('signale une section introuvable au lieu d’une adresse qui ne mène nulle part', () => {
    const preview = previewForAnchor(anchor('<h2 id="introduction">Introduction</h2><a href="#conclusion">Voir</a>'));
    expect(preview).toMatchObject({ kind: 'anchor-missing', label: '#conclusion' });
    expect(describeLinkKind(preview!.kind)).toContain('introuvable');
  });

  it('laisse de côté les liens sans adresse', () => {
    expect(previewForAnchor(anchor('<a>sans adresse</a>'))).toBeNull();
    expect(previewForAnchor(anchor('<a href="#">ancre vide</a>'))).toBeNull();
  });

  it('ne notifie les abonnés que lorsque l’aperçu change vraiment', () => {
    let notifications = 0;
    const unsubscribe = subscribeLinkPreview(() => { notifications += 1; });
    setLinkPreview({ label: 'https://a.example', href: 'https://a.example', kind: 'external' });
    // Même lien à nouveau (le survol d’un enfant du lien, par exemple) : rien ne bouge.
    setLinkPreview({ label: 'https://a.example', href: 'https://a.example', kind: 'external' });
    expect(notifications).toBe(1);

    setLinkPreview({ label: '#notes', href: '#notes', kind: 'anchor' });
    setLinkPreview(null);
    expect(notifications).toBe(3);
    expect(getLinkPreview()).toBeNull();
    unsubscribe();
  });
});
