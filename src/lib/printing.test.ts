// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildPrintHtml, createPrintUrl, textPrintSection, tablePrintSections, collectAppStyles, cloneRenderedForPrint, extractRenderedImage } from './printing';
import { describePrintScope, preparePrintJob } from './printJobs';
import { sanitizeHtmlForPrint } from './security';
import type { OpenDocument } from '../types';

function document(partial: Partial<OpenDocument> & Pick<OpenDocument, 'kind'>): OpenDocument {
  return {
    id: `test:${partial.name ?? 'fichier'}`,
    source: 'browser',
    name: partial.name ?? 'fichier.txt',
    path: partial.path ?? 'fichier.txt',
    extension: partial.extension ?? 'txt',
    mimeType: partial.mimeType ?? 'text/plain',
    content: partial.content ?? '',
    savedContent: partial.content ?? '',
    size: partial.size ?? 0,
    modifiedAt: Date.UTC(2026, 0, 2),
    truncated: false,
    ...partial,
  } as OpenDocument;
}

describe('page imprimée', () => {
  it('assemble une page autonome, sans script possible', () => {
    const html = buildPrintHtml({ title: 'notes.md', sections: ['<p>Bonjour</p>'], subtitle: 'Imprimé depuis Noto' });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>notes.md</title>');
    expect(html).toContain('<p>Bonjour</p>');
    expect(html).toContain('lang="fr"');
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script');
    // Sans cette remise à zéro, les styles de l’application couperaient la page.
    expect(html).toContain('overflow: visible !important');
    expect(html).toContain('height: auto !important');
  });

  it('échappe le titre et le contenu', () => {
    const html = buildPrintHtml({ title: '<script>alert(1)</script>', sections: [textPrintSection('<b>&</b>')] });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;&amp;&lt;/b&gt;');
  });

  it('numérote les lignes sans casser la copie du contenu', () => {
    const html = textPrintSection('a\nb\n', { lineNumbers: true });
    expect(html).toContain('1 │ a');
    expect(html).toContain('2 │ b');
    expect(textPrintSection('', {})).toContain('<pre');
    expect(textPrintSection('x', { wrap: false })).toContain('is-nowrap');
  });

  it('met un tableau en page avec son en-tête et prévient quand il est borné', () => {
    const csv = ['a;b', ...Array.from({ length: 12 }, (_, index) => `${index};${index}`)].join('\n');
    const bounded = tablePrintSections(csv, { maxRows: 5 });
    expect(bounded.sections[0]).toContain('<th>a</th>');
    expect(bounded.sections[0]?.match(/<tr>/gu)?.length).toBe(6);
    expect(bounded.note).toContain('5 lignes sur 12');
    expect(tablePrintSections('', {}).sections[0]).toContain('vide');
  });
});

describe('travaux d’impression par format', () => {
  it('imprime le code source d’un fichier texte', async () => {
    const file = document({ kind: 'code', name: 'app.ts', extension: 'ts', content: 'const a = 1;', size: 12 });
    const { job, notes } = await preparePrintJob({ document: file, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: true });
    expect(job.title).toBe('app.ts');
    expect(job.sections[0]).toContain('1 │ const a = 1;');
    expect(notes).toEqual([]);
    expect(describePrintScope({ document: file, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: true }, { job, notes, urls: [] })).toContain('caractères');
  });

  it('imprime un tableau CSV dans sa limite de lignes', async () => {
    const file = document({ kind: 'csv', name: 'ventes.csv', extension: 'csv', content: 'nom;prix\nAda;10\nAlan;20\n' });
    const { job } = await preparePrintJob({ document: file, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: false });
    expect(job.sections[0]).toContain('<table class="print-table">');
    expect(job.sections[0]).toContain('<td>Ada</td>');
  });

  it('copie le rendu Markdown quand il est fourni, sinon retombe sur la source', async () => {
    const file = document({ kind: 'markdown', name: 'notes.md', extension: 'md', content: '# Titre' });
    const rendered = await preparePrintJob({ document: file, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: false, renderedHtml: '<h1>Titre</h1>' });
    expect(rendered.job.sections).toEqual(['<h1>Titre</h1>']);
    const source = await preparePrintJob({ document: file, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: false });
    expect(source.job.sections[0]).toContain('# Titre');
  });

  it('assainit un fichier HTML avant de l’imprimer', async () => {
    const file = document({
      kind: 'html', name: 'page.html', extension: 'html',
      content: '<style>h1{color:red}</style><h1 onclick="alert(1)">Titre</h1><script>alert(2)</script><img src="https://exemple.test/a.png">',
    });
    const { job, notes } = await preparePrintJob({ document: file, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: false });
    expect(job.sections[0]).toContain('<h1>Titre</h1>');
    expect(job.sections[0]).not.toContain('onclick');
    expect(job.sections[0]).not.toContain('<script');
    expect(job.sections[0]).not.toContain('https://exemple.test');
    expect(job.styles).toContain('color:red');
    expect(notes.join(' ')).toContain('assaini');
  });

  it('transmet un HTML sans code actif à la fonction d’assainissement', () => {
    const { html, styles } = sanitizeHtmlForPrint('<style>p{margin:0}</style><p onclick="x()">ok</p><script>bad()</script>');
    expect(html).toContain('<p>ok</p>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(styles).toContain('p{margin:0}');
  });

  it('prépare une image, une présentation et un document bureautique', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const image = document({ kind: 'image', name: 'photo.png', extension: 'png', mimeType: 'image/png', bytes, size: bytes.length });
    const imageJob = await preparePrintJob({ document: image, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: false });
    const urls = imageJob.urls;
    expect(urls).toHaveLength(1);
    expect(urls[0]?.startsWith('blob:')).toBe(true);
    expect(imageJob.job.sections[0]).toContain('src="' + urls[0]);
    for (const url of urls) URL.revokeObjectURL(url);
    expect(describePrintScope({ document: image, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: false }, imageJob)).toContain('largeur de la page');

    // Une présentation illisible est refusée avec une explication, jamais
    // remplacée par une page blanche qui laisserait croire à une impression réussie.
    const deck = document({ kind: 'presentation', name: 'deck.pptx', extension: 'pptx', bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) });
    await expect(preparePrintJob({ document: deck, scope: 'current', currentPage: 1, quality: 'normale', lineNumbers: false }))
      .rejects.toThrow(/invalide|chiffrée|volumineuse/u);
  });

  it('annonce l’étendue d’impression d’un PDF sans mentir sur ce qui sera imprimé', async () => {
    const pdf = document({ kind: 'pdf', name: 'rapport.pdf', extension: 'pdf', content: '', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) });
    const job = { job: { title: 'rapport.pdf', sections: [] }, notes: [], urls: [] };
    expect(describePrintScope({ document: pdf, scope: 'all', currentPage: 3, quality: 'haute', lineNumbers: false }, job)).toContain('Toutes les pages');
    expect(describePrintScope({ document: pdf, scope: 'current', currentPage: 3, quality: 'haute', lineNumbers: false }, job)).toContain('Page 3');
  });
});

describe('copie du contenu affiché', () => {
  it('retire les commandes et remplace les canvas par une image', () => {
    const host = window.document.createElement('div');
    host.innerHTML = '<button>Imprimer</button><nav>menu</nav><p>Texte</p>';
    expect(cloneRenderedForPrint(host)).toBe('<p>Texte</p>');
  });

  it('conserve la rotation d’une image sans son zoom', () => {
    const host = window.document.createElement('div');
    host.innerHTML = '<img src="blob:exemple" alt="photo" style="transform: scale(2) rotate(90deg)" />';
    expect(extractRenderedImage(host)).toBe('<img class="print-image" src="blob:exemple" alt="photo" style="transform: rotate(90deg)" />');
    expect(extractRenderedImage(window.document.createElement('div'))).toBeNull();
  });

  it('collecte les styles de l’application sans les inventer', () => {
    const style = window.document.createElement('style');
    style.textContent = '.exemple { color: red; }';
    window.document.head.appendChild(style);
    try {
      // Les règles sont recopiées, jamais liées par une adresse : la page
      // imprimée n’a rien à charger.
      expect(collectAppStyles()).toContain('.exemple');
      expect(collectAppStyles()).not.toContain('@import');
      expect(collectAppStyles()).not.toContain('<script');
    } finally {
      style.remove();
    }
  });

  it('crée une adresse locale pour un contenu binaire', () => {
    const url = createPrintUrl(new Uint8Array([1, 2, 3]), 'application/pdf');
    expect(url.startsWith('blob:')).toBe(true);
    URL.revokeObjectURL(url);
  });
});
