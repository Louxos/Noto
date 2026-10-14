import { describe, expect, it } from 'vitest';
import { applyNameTemplate, buildOutputName, commonPrefixBase, padIndex, sanitizeFileName, splitFileName, uniqueFileName } from './naming';

describe('nommage des fichiers produits', () => {
  it('nettrie les caractères interdits par Windows', () => {
    expect(sanitizeFileName('rapport: final?.pdf')).toBe('rapport- final-.pdf');
    expect(sanitizeFileName('  espaces  ')).toBe('espaces');
    expect(sanitizeFileName('')).toBe('sans-nom');
  });

  it('refuse les noms réservés de Windows', () => {
    expect(sanitizeFileName('CON.txt')).toBe('CON-fichier.txt');
    expect(sanitizeFileName('lpt1')).toBe('lpt1-fichier');
  });

  it('n’écrase jamais un nom existant', () => {
    const taken = new Set(['rapport.pdf', 'rapport (2).pdf']);
    expect(uniqueFileName('rapport.pdf', taken)).toBe('rapport (3).pdf');
    expect(uniqueFileName('nouveau.pdf', taken)).toBe('nouveau.pdf');
  });

  it('compare les noms sans tenir compte de la casse ni des accents composés', () => {
    const taken = new Set(['résumé.pdf']);
    expect(uniqueFileName('Re\u0301sume\u0301.pdf', taken)).toBe('Re\u0301sume\u0301 (2).pdf');
  });

  it('tronque les noms trop longs en conservant l’extension', () => {
    const name = uniqueFileName(`${'a'.repeat(300)}.pdf`, []);
    expect(name.length).toBeLessThanOrEqual(180);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('applique les jetons de gabarit', () => {
    const date = new Date(2026, 9, 13, 9, 5);
    const name = applyNameTemplate('{nom}-{index}-{total}-{date}-{heure}', {
      name: 'photo.jpg',
      baseName: 'photo',
      extension: 'jpg',
      index: 2,
      total: 12,
      date,
    });
    expect(name).toBe('photo-02-12-2026-10-13-09h05');
  });

  it('construit un nom de sortie avec gabarit ou suffixe par défaut', () => {
    expect(buildOutputName({ sourceName: 'notes.md', index: 1, total: 1, targetExtension: 'pdf' })).toBe('notes.pdf');
    expect(buildOutputName({ sourceName: 'notes.md', index: 3, total: 10, targetExtension: 'png', page: 3, template: '{nom}-page{page}' }))
      .toBe('notes-page03.png');
    expect(buildOutputName({ sourceName: 'scan.pdf', index: 1, total: 1, targetExtension: 'jpg', suffix: 'compressé' })).toBe('scan-compressé.jpg');
  });

  it('calcule un préfixe commun lisible', () => {
    expect(commonPrefixBase(['vacances-1.jpg', 'vacances-2.jpg', 'vacances-3.jpg'])).toBe('vacances');
    expect(commonPrefixBase(['a.png', 'b.png'])).toBe('noto');
  });

  it('découpe un nom avec chemin', () => {
    expect(splitFileName('C:\\Users\\noto\\document.final.pdf')).toEqual({ baseName: 'document.final', extension: 'pdf' });
    expect(padIndex(7, 3)).toBe('07');
    expect(padIndex(7, 120)).toBe('007');
  });
});
