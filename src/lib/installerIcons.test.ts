import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Icônes par type de fichier : trois fichiers doivent rester d’accord entre eux,
 * faute de quoi Windows afficherait une icône générique ou un chemin mort :
 *   - `src-tauri/tauri.conf.json` : les classes de fichiers déclarées à
 *     l’installeur et les ressources embarquées dans `$INSTDIR\filetypes` ;
 *   - `src-tauri/windows/installer/hooks.nsh` : la table classe → icône écrite
 *     dans le registre, et la reprise des sauvegardes d’association ;
 *   - `src-tauri/icons/filetypes/*.ico` : les images réellement livrées.
 *
 * Ce test lit les fichiers comme le fait l’installeur, sans dépendre de Windows :
 * il vérifie la cohérence, la structure des `.ico` et l’absence d’orphelins.
 */
const root = resolve(__dirname, '../..');
const hooks = readFileSync(resolve(root, 'src-tauri/windows/installer/hooks.nsh'), 'utf8');
const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
  bundle?: { resources?: Record<string, string>; fileAssociations?: { ext: string[]; name: string; role: string }[] };
};
const associations = config.bundle?.fileAssociations ?? [];
const iconDirectory = resolve(root, 'src-tauri/icons/filetypes');

/** Classes → icônes telles que le crochet NSIS les écrit. */
function iconMappings(): { className: string; icon: string }[] {
  return [...hooks.matchAll(/!insertmacro NOTO_SET_FILE_ICON "([^"]+)" "([^"]+)"/gu)]
    .map(([, className, icon]) => ({ className, icon }));
}

/** Extensions dont la sauvegarde d’association est reprise, et leurs classes. */
function flattenMappings(): { extension: string; className: string; previousClass: string }[] {
  return [...hooks.matchAll(/!insertmacro NOTO_FLATTEN_BACKUP "([^"]+)" "([^"]+)" "([^"]+)"/gu)]
    .map(([, extension, className, previousClass]) => ({ extension, className, previousClass }));
}

/** Classes de fichiers livrées avant le passage aux icônes par type (0.2.0). */
const LEGACY_CLASSES: Record<string, string[]> = {
  'Fichier texte': ['txt', 'text', 'log', 'diff', 'patch', 'ini', 'env', 'toml', 'conf', 'editorconfig',
    'gitignore', 'gitattributes', 'properties', 'tex', 'rst', 'adoc', 'asciidoc'],
  'Fichier de code': ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'css', 'scss', 'sass', 'less', 'json', 'jsonc',
    'json5', 'xml', 'yaml', 'yml', 'py', 'pyw', 'java', 'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'hxx', 'cs', 'php',
    'sql', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'rs', 'go', 'rb', 'swift', 'kt', 'kts',
    'vue', 'svelte', 'astro', 'r', 'lua', 'scala', 'dart', 'ex', 'exs', 'erl', 'hs', 'clj', 'groovy', 'gradle',
    'vb', 'fs', 'proto', 'graphql', 'dockerfile', 'makefile', 'cmake', 'tf', 'hcl', 'nix', 'sol', 'pkl', 'lock'],
  'Document HTML': ['html', 'htm'],
};

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZES = new Set([48, 64, 128, 256]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Lecture structurelle d’un `.ico` : répertoire, tailles, profondeur, charges. */
function readIco(file: string) {
  const data = readFileSync(resolve(iconDirectory, file));
  expect(data.readUInt16LE(0), `${file} : en-tête réservé`).toBe(0);
  expect(data.readUInt16LE(2), `${file} : type ICO`).toBe(1);
  const count = data.readUInt16LE(4);
  const entries: { size: number; format: 'PNG' | 'DIB'; bitCount: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = data.readUInt8(entry) || 256;
    const height = data.readUInt8(entry + 1) || 256;
    const bitCount = data.readUInt16LE(entry + 6);
    const length = data.readUInt32LE(entry + 8);
    const offset = data.readUInt32LE(entry + 12);
    expect(width, `${file} : largeur de l’entrée ${index}`).toBe(height);
    expect(bitCount, `${file} : profondeur de l’entrée ${index}`).toBe(32);
    expect(offset + length, `${file} : charge utile dans le fichier`).toBeLessThanOrEqual(data.length);
    const payload = data.subarray(offset, offset + length);
    if (PNG_SIZES.has(width)) {
      expect(payload.subarray(0, 8).equals(PNG_MAGIC), `${file} : PNG attendu à ${width} px`).toBe(true);
      entries.push({ size: width, format: 'PNG', bitCount });
    } else {
      expect(payload.readUInt32LE(0), `${file} : en-tête DIB à ${width} px`).toBe(40);
      entries.push({ size: width, format: 'DIB', bitCount });
    }
  }
  return entries;
}

describe('icônes par type de fichier', () => {
  it('livre une icône pour chaque classe de fichiers déclarée', () => {
    const mapped = iconMappings();
    expect(new Set(mapped.map((entry) => entry.className)).size).toBe(mapped.length);
    const classes = associations.map((association) => association.name).sort();
    expect(mapped.map((entry) => entry.className).sort()).toEqual(classes);
  });

  it('n’a ni icône orpheline ni icône manquante sur le disque', () => {
    const files = readdirSync(iconDirectory).filter((file) => file.endsWith('.ico')).sort();
    expect(iconMappings().map((entry) => entry.icon).sort()).toEqual(files);
  });

  it('embarque le dossier d’icônes dans l’installeur', () => {
    expect(config.bundle?.resources?.['icons/filetypes']).toBe('filetypes');
    // Le crochet écrit dans $INSTDIR\filetypes : c’est bien cette cible.
    expect(hooks).toContain('"$INSTDIR\\filetypes\\${ICON}"');
  });

  it('produit des .ico multi-tailles lisibles par Windows', () => {
    for (const file of readdirSync(iconDirectory).filter((name) => name.endsWith('.ico'))) {
      const entries = readIco(file);
      expect(entries.map((entry) => entry.size), file).toEqual(SIZES);
    }
  });

  it('reprend la sauvegarde d’association pour chaque extension qui change de classe', () => {
    const current = new Map(associations.flatMap((association) => association.ext.map((ext) => [ext, association.name])));
    const legacy = new Map(Object.entries(LEGACY_CLASSES).flatMap(([className, extensions]) => extensions.map((ext) => [ext, className])));
    const moved = [...legacy].filter(([ext, className]) => current.has(ext) && current.get(ext) !== className);
    expect(moved.length).toBeGreaterThan(0);

    const handled = flattenMappings();
    expect(new Set(handled.map((entry) => entry.extension)).size).toBe(handled.length);
    for (const [extension, previousClass] of moved) {
      expect(handled.find((entry) => entry.extension === extension), `reprise manquante pour .${extension}`)
        .toEqual({ extension, className: current.get(extension), previousClass });
    }
    expect(handled.map((entry) => entry.extension).sort()).toEqual(moved.map(([ext]) => ext).sort());
  });

  it('supprime la classe devenue inutilisée, et seulement si elle appartient à Noto', () => {
    const obsolete = Object.keys(LEGACY_CLASSES).filter((className) =>
      !associations.some((association) => association.name === className));
    expect(obsolete).toEqual(['Document HTML']);
    expect(hooks).toContain('ReadRegStr $R0 SHCTX "Software\\Classes\\Document HTML\\shell\\open\\command" ""');
    expect(hooks).toContain('${If} $R0 == \'"$INSTDIR\\${MAINBINARYNAME}.exe" "%1"\'');
  });

  it('applique les icônes après l’écriture des associations, jamais avant', () => {
    const postinstall = hooks.slice(hooks.indexOf('!macro NSIS_HOOK_POSTINSTALL'), hooks.indexOf('!macro NSIS_HOOK_PREUNINSTALL'));
    expect(postinstall).toContain('!insertmacro NOTO_APPLY_FILE_TYPE_ICONS');
    expect(postinstall).toContain('!insertmacro NOTO_MIGRATE_FILE_TYPE_ICONS');
    expect(postinstall).toContain('!insertmacro UPDATEFILEASSOC');
    expect(postinstall.indexOf('NOTO_APPLY_FILE_TYPE_ICONS')).toBeLessThan(postinstall.indexOf('UPDATEFILEASSOC'));
  });

  it('ne signale aux utilisateurs que ce qui existe réellement', () => {
    // Chaque classe garde une icône unique : deux classes avec la même image
    // rendraient la distinction inutile.
    const icons = iconMappings().map((entry) => entry.icon);
    expect(new Set(icons).size).toBe(icons.length);
    // Chaque extension déclarée appartient à une seule classe.
    const extensions = associations.flatMap((association) => association.ext);
    expect(new Set(extensions).size).toBe(extensions.length);
  });
});
