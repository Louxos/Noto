import { describe, expect, it } from 'vitest';
import { countLines, fileStatGroup, imageSizeFromBytes, svgSizeFromText, tableStatGroup, textMetrics, textStatGroup } from './fileStats';
import type { OpenDocument } from '../types';

/** En-tête PNG minimal : signature + IHDR jusqu’aux dimensions. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('mesures de texte', () => {
  it('compte caractères, mots, lignes et paragraphes sans rien inventer', () => {
    const content = 'Bonjour le monde\n\nDeuxième paragraphe avec des mots\nligne suivante\n';
    const metrics = textMetrics(content);
    expect(metrics.characters).toBe(content.length);
    // Une dernière ligne vide compte comme une ligne, comme dans l’éditeur.
    expect(metrics.lines).toBe(5);
    expect(metrics.paragraphs).toBe(2);
    expect(metrics.words).toBe(10);
    expect(metrics.charactersWithoutSpaces).toBe(content.replace(/\s/gu, '').length);
    expect(metrics.lineEndings).toBe('LF');
    expect(metrics.endsWithNewline).toBe(true);
    expect(metrics.longestLine).toBe('Deuxième paragraphe avec des mots'.length);
  });

  it('compte les lignes comme l’éditeur, sans découper le texte', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\r\nb\rc')).toBe(3);
    expect(countLines('a\n'.repeat(50_000))).toBe(50_001);
    // Même convention que la découpe utilisée partout ailleurs dans Noto.
    for (const sample of ['', 'a', 'a\n', 'a\r\n', 'a\nb', 'a\r\nb\rc', '\n\n\n']) {
      expect(countLines(sample)).toBe(sample ? sample.split(/\r\n|\r|\n/u).length : 0);
    }
  });

  it('signale un mélange de fins de ligne', () => {
    const metrics = textMetrics('a\r\nb\nc\rd');
    expect(metrics.lineEndings).toBe('mixed');
    expect(metrics.lines).toBe(4);
    expect(metrics.endsWithNewline).toBe(false);
    expect(textMetrics('a\r\nb\r\n').lineEndings).toBe('CRLF');
    expect(textMetrics('a\rb\r').lineEndings).toBe('CR');
    expect(textMetrics('').lines).toBe(0);
  });

  it('présente les mesures et n’annonce pas un texte complet quand il est tronqué', () => {
    const group = textStatGroup('contenu partiel', { truncated: true, encoding: 'utf-8' });
    const value = (label: string) => group.rows.find((row) => row.label === label)?.value;
    expect(value('Caractères')).toBe('15');
    expect(value('Mots')).toBe('2');
    expect(value('Encodage')).toBe('UTF-8');
    expect(value('Fins de ligne')).toBe('LF (Unix, macOS)');
    expect(group.note).toContain('partie chargée');
    expect(textStatGroup('texte', {}).note).toBeUndefined();
  });

  it('décrit un tableau CSV avec son séparateur réel', () => {
    const group = tableStatGroup('nom;ville\nAda;Londres\nAlan;Manchester\n', 'csv');
    const value = (label: string) => group.rows.find((row) => row.label === label)?.value;
    expect(value('Lignes')).toBe('2');
    expect(value('Colonnes')).toBe('2');
    expect(value('Cellules')).toBe('2 × 2');
    expect(value('Séparateur détecté')).toBe('point-virgule');
    expect(value('Format')).toBe('CSV');
    expect(tableStatGroup('a\tb\n1\t2\n', 'tsv').rows.find((row) => row.label === 'Séparateur détecté')?.value).toBe('tabulation');
  });
});

describe('dimensions d’image lues dans l’en-tête', () => {
  it('lit un PNG sans décoder l’image', () => {
    expect(imageSizeFromBytes(png(1200, 800), 'png')).toEqual({ width: 1200, height: 800, format: 'PNG' });
  });

  it('lit un GIF et un BMP', () => {
    const gif = new Uint8Array(10);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    gif.set([0x40, 0x01, 0xf0, 0x00], 6);
    expect(imageSizeFromBytes(gif, 'gif')).toEqual({ width: 320, height: 240, format: 'GIF' });

    const bmp = new Uint8Array(30);
    bmp.set([0x42, 0x4d]);
    const bmpView = new DataView(bmp.buffer);
    bmpView.setUint32(18, 64, true);
    bmpView.setInt32(22, -32, true); // hauteur négative : image retournée
    expect(imageSizeFromBytes(bmp, 'bmp')).toEqual({ width: 64, height: 32, format: 'BMP' });
  });

  it('lit les trois variantes de WebP', () => {
    const extended = new Uint8Array(32);
    extended.set([0x52, 0x49, 0x46, 0x46]);
    extended.set([0x57, 0x45, 0x42, 0x50], 8);
    extended.set([0x56, 0x50, 0x38, 0x58], 12);
    extended.set([0x8f, 0x01, 0x00, 0x2b, 0x01, 0x00], 24);
    expect(imageSizeFromBytes(extended, 'webp')).toEqual({ width: 400, height: 300, format: 'WebP', note: 'dimensions de l’image étendue' });

    const lossless = new Uint8Array(30);
    lossless.set([0x52, 0x49, 0x46, 0x46]);
    lossless.set([0x57, 0x45, 0x42, 0x50], 8);
    lossless.set([0x56, 0x50, 0x38, 0x4c], 12);
    // Bit 0-13 : largeur − 1 ; bits 14-27 : hauteur − 1.
    lossless.set([0x2b, 0xc1, 0x4a, 0x00], 21);
    expect(imageSizeFromBytes(lossless, 'webp')).toEqual({ width: 300, height: 300, format: 'WebP' });
  });

  it('lit un JPEG en parcourant ses marqueurs', () => {
    const jpeg = new Uint8Array(40);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0); // SOI + APP0 (16 octets de segment)
    jpeg.set([0xff, 0xc0, 0x00, 0x11], 20);             // SOF0 : hauteur puis largeur
    const view = new DataView(jpeg.buffer);
    view.setUint16(20 + 5, 480);
    view.setUint16(20 + 7, 640);
    expect(imageSizeFromBytes(jpeg, 'jpg')).toEqual({ width: 640, height: 480, format: 'JPEG' });
  });

  it('lit un ICO et un TIFF, et ne devine rien pour le reste', () => {
    const ico = new Uint8Array(16);
    ico.set([0x00, 0x00, 0x01, 0x00]);
    ico[6] = 48;
    ico[7] = 32;
    expect(imageSizeFromBytes(ico, 'ico')).toEqual({ width: 48, height: 32, format: 'ICO' });

    const tiff = new Uint8Array(40);
    tiff.set([0x49, 0x49, 0x2a, 0x00]);            // « II », TIFF petit-boutiste
    const view = new DataView(tiff.buffer);
    view.setUint32(4, 8, true);                     // position du premier annuaire
    view.setUint16(8, 2, true);                     // deux entrées
    view.setUint16(10, 256, true); view.setUint16(12, 3, true); view.setUint16(18, 1024, true); // largeur
    view.setUint16(22, 257, true); view.setUint16(24, 3, true); view.setUint16(30, 768, true);  // hauteur
    expect(imageSizeFromBytes(tiff, 'tif')).toMatchObject({ width: 1024, height: 768, format: 'TIFF' });

    expect(imageSizeFromBytes(new Uint8Array([1, 2, 3]), 'png')).toBeNull();
    expect(imageSizeFromBytes(png(0, 0), 'png')).toEqual({ width: 0, height: 0, format: 'PNG' });
  });

  it('lit les dimensions déclarées d’un SVG', () => {
    expect(svgSizeFromText('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"></svg>')).toEqual({ width: 120, height: 40 });
    expect(svgSizeFromText('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="40px"></svg>')).toEqual({ width: 120, height: 40 });
    expect(svgSizeFromText('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"></svg>')).toEqual({ width: 64, height: 32 });
    expect(svgSizeFromText('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 0 0"></svg>')).toBeNull();
    // Une taille en pourcentage : ce sont les dimensions du viewBox qui décrivent le dessin.
    expect(svgSizeFromText('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 512 256"></svg>')).toEqual({ width: 512, height: 256 });
    expect(svgSizeFromText('pas un svg')).toBeNull();
  });
});

describe('groupe de base d’un fichier', () => {
  const base: OpenDocument = {
    id: 'desktop:C:\\docs\\notes.md', source: 'desktop', name: 'notes.md', path: 'C:\\docs\\notes.md',
    kind: 'markdown', extension: 'md', mimeType: 'text/markdown', content: 'x', savedContent: 'x',
    size: 4096, modifiedAt: Date.UTC(2026, 4, 2, 10, 30), textEncoding: 'utf-8', truncated: false,
  };

  it('affiche l’emplacement, la taille et la date réelles', () => {
    const rows = fileStatGroup(base).rows;
    const value = (label: string) => rows.find((row) => row.label === label)?.value;
    expect(value('Nom')).toBe('notes.md');
    expect(value('Type')).toBe('Markdown');
    expect(value('Extension')).toBe('.md');
    expect(value('Taille')).toBe(`4,1 Ko (${(4096).toLocaleString('fr-FR')} octets)`);
    expect(value('Emplacement')).toBe('C:\\docs\\notes.md');
    expect(value('Encodage du texte')).toBe('UTF-8');
    expect(value('Modifié le')).toBeTruthy();
    expect(fileStatGroup(base).note).toBeUndefined();
  });

  it('nomme les fichiers sans extension, indique la part chargée et la troncature', () => {
    const partial: OpenDocument = { ...base, name: 'LICENCE', extension: '', kind: 'text', truncated: true, loadedBytes: 1024 };
    const rows = fileStatGroup(partial).rows;
    const value = (label: string) => rows.find((row) => row.label === label)?.value;
    expect(value('Extension')).toBe('aucune');
    expect(value('Chargé')).toBe('1 Ko sur 4,1 Ko');
    expect(fileStatGroup(partial).note).toContain('partiel');
  });
});
