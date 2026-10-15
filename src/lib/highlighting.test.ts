import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import hljs from 'highlight.js/lib/core';
import { escapeHtml, highlightCode, registeredLanguages } from './highlighting';
import { getExtension, LANGUAGE_BY_EXTENSION, languageForExtension } from './fileTypes';

const root = resolve(__dirname, '../..');

/**
 * Extensions déclarées dans les associations de fichiers de l’installeur :
 * tout ce que Windows peut ouvrir dans Noto doit être coloré ou assumé comme
 * du texte simple, jamais silencieusement oublié.
 */
function associatedExtensions(): string[] {
  const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
    bundle?: { fileAssociations?: { ext?: string[] }[] };
  };
  return (config.bundle?.fileAssociations ?? []).flatMap((association) => association.ext ?? []);
}

/** Formats ouverts par un lecteur dédié (PDF, image, bureautique) : la
 *  coloration de code ne s’y applique pas. */
const DEDICATED_VIEWER_EXTENSIONS = new Set([
  'pdf', 'png', 'apng', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'avif',
  'pptx', 'odp', 'docx', 'odt', 'rtf', 'epub', 'csv', 'tsv',
]);

/** Extensions de texte sans grammaire fiable, affichées en texte simple. */
const TEXT_WITHOUT_GRAMMAR = new Set(['txt', 'text', 'log', 'readme', 'license', 'rst', 'lock']);

describe('coloration syntaxique', () => {
  it('enregistre chaque langage utilisé par une extension connue', () => {
    const missing = Object.entries(LANGUAGE_BY_EXTENSION)
      .filter(([, language]) => !registeredLanguages().includes(language))
      .map(([extension, language]) => `${extension} → ${language}`);
    expect(missing).toEqual([]);
  });

  it('couvre ou assume chaque extension associée à Noto dans l’installeur', () => {
    const uncovered = associatedExtensions()
      .filter((extension) => !LANGUAGE_BY_EXTENSION[extension]
        && !TEXT_WITHOUT_GRAMMAR.has(extension)
        && !DEDICATED_VIEWER_EXTENSIONS.has(extension));
    expect(uncovered).toEqual([]);
  });

  it('reconnaît les extensions au-delà du texte et du Markdown', () => {
    expect(languageForExtension('rs')).toBe('rust');
    expect(languageForExtension('VUE')).toBe('xml');
    expect(languageForExtension('jsonc')).toBe('jsonc');
    expect(languageForExtension('tf')).toBe('hcl');
    expect(languageForExtension('sh')).toBe('bash');
    expect(languageForExtension('hpp')).toBe('cpp');
    expect(languageForExtension('psm1')).toBe('powershell');
    expect(languageForExtension('unknown-format')).toBeUndefined();
  });

  it('colorce du vrai code JavaScript, mots-clés compris', () => {
    const { html, simplified } = highlightCode('const total = 42;\n', 'js');
    expect(simplified).toBe(false);
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('hljs-number');
  });

  it('colorce les langages ajoutés qui ne viennent pas des mêmes familles', () => {
    const samples: [string, string][] = [
      ['rs', 'fn main() { let x = 1; }'],
      ['sql', 'SELECT id FROM users WHERE name = \'Ada\';'],
      ['lua', 'local function sum(a, b) return a + b end'],
      ['hs', 'main :: IO ()\nmain = putStrLn "bonjour"'],
      ['tf', 'resource "aws_instance" "web" {\n  count = 2\n}'],
      ['jsonc', '{\n  // commentaire\n  "clé": true,\n}'],
      ['diff', '@@ -1,3 +1,3 @@\n-ancien\n+nouveau'],
      ['dockerfile', 'FROM node:22\nRUN npm ci'],
    ];
    for (const [extension, sample] of samples) {
      const { html, simplified } = highlightCode(sample, extension);
      expect(simplified, `${extension} ne doit pas être simplifié`).toBe(false);
      expect(html, `${extension} doit produire des marques de coloration`).toMatch(/hljs-(keyword|string|number|comment|attr|literal|section|meta|tag|selector|built_in|title|variable|type|bullet|addition|deletion)/u);
    }
  });

  it('retombe en texte échappé, sans balise, quand le format est inconnu', () => {
    const { html, simplified } = highlightCode('<script>alert(1)</script>', 'inconnu');
    expect(simplified).toBe(false);
    expect(html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('protège l’affichage des fichiers énormes sans coloration', () => {
    const huge = 'const x = 1;\n'.repeat(40_000);
    const { html, simplified } = highlightCode(huge, 'js');
    expect(simplified).toBe(true);
    expect(html).not.toContain('hljs-');
  });

  it('échappe les cinq caractères sensibles', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#x27;');
  });

  it('reste aligné sur le contenu réellement coloré par highlight.js', () => {
    // Les grammaires locales sont écrites à la main : ce test vérifie qu’elles
    // produisent bien du HTML sans erreur sur des extraits réalistes.
    for (const extension of ['hcl', 'jsonc']) {
      const language = languageForExtension(extension) ?? '';
      expect(() => hljs.highlight('{ "a": [1, 2] }', { language, ignoreIllegals: true })).not.toThrow();
    }
    expect(getExtension('TERRAFORM.tf')).toBe('tf');
  });
});
