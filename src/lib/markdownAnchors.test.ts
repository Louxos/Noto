// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { anchorIdFromHref, createHeadingSlugger, normalizeAnchorKey, resolveAnchorTarget, slugifyHeading } from './markdownAnchors';

describe('identifiants de titres', () => {
  it('suit la règle de GitHub, accents conservés', () => {
    expect(slugifyHeading('Notes de version')).toBe('notes-de-version');
    expect(slugifyHeading('Introduction générale')).toBe('introduction-générale');
    expect(slugifyHeading('Étape 2 : installation')).toBe('étape-2-installation');
    expect(slugifyHeading('  Espaces   multiples  ')).toBe('espaces-multiples');
    expect(slugifyHeading('Questions ?')).toBe('questions');
    expect(slugifyHeading('API_v2')).toBe('api_v2');
    expect(slugifyHeading('🎉 Fête')).toBe('fête');
    // Seule différence avec GitHub, assumée : les tirets de bord sont retirés.
    expect(slugifyHeading('---')).toBe('');
  });

  it('suffixe les titres qui se répètent', () => {
    const slug = createHeadingSlugger();
    expect([slug('Notes'), slug('Détails'), slug('Notes'), slug('Notes')]).toEqual(['notes', 'détails', 'notes-1', 'notes-2']);
  });

  it('donne un identifiant de repli à un titre vide de contenu', () => {
    expect(createHeadingSlugger()('   ')).toBe('section');
  });

  it('compare les ancres sans casse ni accents', () => {
    expect(normalizeAnchorKey('Introduction générale !')).toBe('introduction-generale');
    expect(normalizeAnchorKey('#introduction-generale')).toBe('introduction-generale');
    expect(normalizeAnchorKey('introduction-générale')).toBe('introduction-generale');
    expect(normalizeAnchorKey('   ')).toBe('');
  });

  it('lit l’identifiant d’une adresse d’ancre, y compris encodé', () => {
    expect(anchorIdFromHref('#section')).toBe('section');
    expect(anchorIdFromHref('#caf%C3%A9')).toBe('café');
    expect(anchorIdFromHref('#')).toBeNull();
    expect(anchorIdFromHref('page.md')).toBeNull();
    expect(anchorIdFromHref('#%E0%A4%A')).toBe('%E0%A4%A');
  });
});

describe('résolution d’une ancre dans un document', () => {
  function root(): HTMLElement {
    const element = window.document.createElement('div');
    element.className = 'markdown-document';
    element.innerHTML = `
      <h1 id="journal-2026">Journal 2026</h1>
      <h2 id="notes">Notes</h2>
      <h2 id="notes-1">Notes</h2>
      <h2 id="introduction-générale">Introduction générale</h2>
      <h3 id="étape-2-installation">Étape 2 : installation</h3>`;
    return element;
  }

  it('trouve une ancre par identifiant exact', () => {
    expect(resolveAnchorTarget(root(), '#notes-1')?.textContent).toBe('Notes');
    expect(resolveAnchorTarget(root(), '#journal-2026')?.tagName).toBe('H1');
  });

  it('reste indulgent : casse, accents et espaces écrits à la main', () => {
    expect(resolveAnchorTarget(root(), '#Introduction-Generale')?.id).toBe('introduction-générale');
    expect(resolveAnchorTarget(root(), '#Introduction générale')?.id).toBe('introduction-générale');
    expect(resolveAnchorTarget(root(), '#ETAPE-2-INSTALLATION')?.id).toBe('étape-2-installation');
  });

  it('ne devine rien quand la section n’existe pas', () => {
    expect(resolveAnchorTarget(root(), '#conclusion')).toBeNull();
    expect(resolveAnchorTarget(root(), '#')).toBeNull();
    expect(resolveAnchorTarget(null, '#notes')).toBeNull();
  });
});
