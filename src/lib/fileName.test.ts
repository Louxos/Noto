import { describe, expect, it } from 'vitest';
import { composeFileName, describeNameChange, splitFileName, validateExtension, validateFileName } from './fileName';

describe('noms de fichiers', () => {
  it('accepte un nom ordinaire, accents et espaces compris', () => {
    expect(validateFileName('Rapport annuel 2026.md')).toEqual({ ok: true, error: '', name: 'Rapport annuel 2026.md' });
    expect(validateFileName('  notes.txt  ').name).toBe('notes.txt');
  });

  it('refuse ce que Windows refuse, avec une explication', () => {
    expect(validateFileName('').error).toContain('Saisissez un nom');
    expect(validateFileName('   ').ok).toBe(false);
    expect(validateFileName('dossier/fichier.txt').error).toContain('caractères');
    expect(validateFileName('dossier\\fichier.txt').ok).toBe(false);
    expect(validateFileName('notes?.txt').ok).toBe(false);
    expect(validateFileName('brouillon.').error).toContain('point ou une espace');
    // Une espace finale est retirée (Windows la supprimerait de toute façon),
    // un point final est refusé parce qu’il changerait le nom annoncé.
    expect(validateFileName('brouillon ')).toEqual({ ok: true, error: '', name: 'brouillon' });
    expect(validateFileName('brouillon .txt').ok).toBe(true);
    expect(validateFileName('CON').error).toContain('réservé');
    expect(validateFileName('com1.txt').ok).toBe(false);
    expect(validateFileName('x'.repeat(256)).error).toContain('255');
  });

  it('découpe la dernière extension seulement', () => {
    expect(splitFileName('archive.tar.gz')).toEqual({ base: 'archive.tar', extension: 'gz' });
    expect(splitFileName('README')).toEqual({ base: 'README', extension: '' });
    expect(splitFileName('.gitignore')).toEqual({ base: '.gitignore', extension: '' });
    expect(splitFileName('notes.')).toEqual({ base: 'notes.', extension: '' });
  });

  it('recompose un nom sans doubler le point', () => {
    expect(composeFileName('notes', 'md')).toBe('notes.md');
    expect(composeFileName('notes', '.md')).toBe('notes.md');
    expect(composeFileName('notes', '')).toBe('notes');
  });

  it('explique les extensions inutilisables', () => {
    expect(validateExtension('md')).toBe('');
    expect(validateExtension('.JSON')).toBe('');
    expect(validateExtension('')).toContain('Saisissez une extension');
    expect(validateExtension('tar.gz')).toContain('sans espace ni ponctuation');
    expect(validateExtension('m d')).not.toBe('');
    expect(validateExtension('md!')).not.toBe('');
  });

  it('distingue le changement de nom du changement de type', () => {
    expect(describeNameChange('notes.md', 'journal.md')).toEqual({
      changesName: true, changesExtension: false, previousExtension: 'md', nextExtension: 'md',
      previousKind: 'markdown', nextKind: 'markdown', opensWithDifferentReader: false,
    });
    expect(describeNameChange('notes.md', 'notes.MD')).toMatchObject({ changesName: true, changesExtension: false });
    expect(describeNameChange('notes.md', 'notes.txt')).toMatchObject({ changesExtension: true, nextExtension: 'txt' });
    expect(describeNameChange('notes.md', 'notes')).toMatchObject({ changesExtension: true, nextExtension: '' });
  });

  it('annonce le changement de lecteur quand l’extension change de nature', () => {
    // Un contenu Markdown renommé en .txt n’est pas converti : seul le lecteur change.
    expect(describeNameChange('notes.md', 'notes.txt')).toMatchObject({
      previousKind: 'markdown', nextKind: 'text', opensWithDifferentReader: true,
    });
    expect(describeNameChange('rapport.txt', 'rapport.pdf')).toMatchObject({
      previousKind: 'text', nextKind: 'pdf', opensWithDifferentReader: true,
    });
    expect(describeNameChange('image.png', 'image.PNG')).toMatchObject({ changesExtension: false, opensWithDifferentReader: false });
    expect(describeNameChange('code.ts', 'code.tsx')).toMatchObject({ previousKind: 'code', nextKind: 'code', opensWithDifferentReader: false });
  });
});
