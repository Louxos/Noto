import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createLocalOutputZip, extractArchiveEntries, isSafeArchivePath } from './archiveWriter';

describe('archives ZIP sûres', () => {
  it('crée une archive réellement lisible', () => {
    const result = createLocalOutputZip([
      { name: 'notes.md', bytes: strToU8('# Notes') },
      { name: 'data.csv', bytes: strToU8('a,b\n1,2') },
    ]);
    const extracted = extractArchiveEntries(result.bytes);
    expect(extracted.entries.map((entry) => entry.name).sort()).toEqual(['data.csv', 'notes.md']);
  });

  it('renomme les doublons au lieu de les écraser', () => {
    const result = createLocalOutputZip([
      { name: 'photo.jpg', bytes: strToU8('un') },
      { name: 'photo.jpg', bytes: strToU8('deux') },
    ]);
    const extracted = extractArchiveEntries(result.bytes);
    expect(extracted.entries).toHaveLength(2);
    expect(new Set(extracted.entries.map((entry) => entry.name)).size).toBe(2);
    expect(result.warnings.some((warning) => warning.includes('renommé'))).toBe(true);
  });

  it('refuse les chemins dangereux', () => {
    expect(isSafeArchivePath('dossier/fichier.txt')).toBe(true);
    expect(isSafeArchivePath('../evasion.txt')).toBe(false);
    expect(isSafeArchivePath('dossier/../../evasion.txt')).toBe(false);
    expect(isSafeArchivePath('/etc/passwd')).toBe(false);
    expect(isSafeArchivePath('C:/Windows/system32/cmd.exe')).toBe(false);
    expect(isSafeArchivePath('\\\\serveur\\partage\\fichier')).toBe(false);
    expect(isSafeArchivePath('dossier//fichier')).toBe(false);
  });

  it('écarte les entrées dangereuses d’une archive malveillante', () => {
    const malicious = zipSync({
      '../evasion.txt': strToU8('hors du dossier'),
      'ok.txt': strToU8('contenu normal'),
      'C:/windows.txt': strToU8('chemin absolu'),
    });
    const result = extractArchiveEntries(malicious);
    expect(result.entries.map((entry) => entry.name)).toEqual(['ok.txt']);
    expect(result.skipped.map((entry) => entry.name)).toContain('../evasion.txt');
    expect(result.skipped.map((entry) => entry.name)).toContain('C:/windows.txt');
  });

  it('limite le nombre d’entrées', () => {
    const files: Record<string, Uint8Array> = {};
    for (let index = 0; index < 30; index += 1) files[`f${index}.txt`] = strToU8('x');
    const archive = zipSync(files);
    expect(() => extractArchiveEntries(archive, { maxEntries: 10 })).toThrow(/plus de 10 entrées/u);
  });

  it('limite la taille d’une entrée', () => {
    const archive = zipSync({ 'gros.bin': new Uint8Array(500_000) });
    const result = extractArchiveEntries(archive, { maxEntryBytes: 1_000 });
    expect(result.entries).toHaveLength(0);
    expect(result.skipped[0].reason).toContain('Mo');
  });

  it('signale une archive corrompue', () => {
    expect(() => extractArchiveEntries(strToU8('ceci n’est pas une archive'))).toThrow(/invalide/u);
  });
});
