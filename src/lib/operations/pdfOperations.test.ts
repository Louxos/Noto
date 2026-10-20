import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PDF_OPERATIONS } from './pdfOperations';
import { defaultParamValues, type Operation, type ParamValues } from './types';
import type { FormatId } from '../documents/formats';

async function buildPdf(pages: { text: string }[], options: { title?: string; author?: string; footer?: boolean } = {}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  if (options.title) document.setTitle(options.title);
  if (options.author) document.setAuthor(options.author);
  for (const [index, page] of pages.entries()) {
    const target = document.addPage([595.28, 841.89]);
    if (page.text) target.drawText(page.text, { x: 60, y: 700, size: 14, font, color: rgb(0, 0, 0) });
    if (options.footer !== false) target.drawText(`Noto — page ${index + 1}`, { x: 60, y: 660, size: 9, font });
  }
  return document.save();
}

function findOperation(id: string): Operation {
  const operation = PDF_OPERATIONS.find((entry) => entry.id === id);
  if (!operation) throw new Error(`Opération manquante : ${id}`);
  return operation;
}

function makeInput(name: string, bytes: Uint8Array) {
  return { name, bytes, format: 'pdf' as FormatId, size: bytes.length };
}

function context() {
  const messages: string[] = [];
  const warnings: string[] = [];
  return {
    signal: new AbortController().signal,
    progress: () => undefined,
    report: (message: string) => messages.push(message),
    warn: (message: string) => warnings.push(message),
    messages,
    warnings,
  };
}

async function runWith(operation: Operation, inputs: { name: string; bytes: Uint8Array }[], overrides: ParamValues = {}) {
  const params = { ...defaultParamValues(operation.params), ...overrides };
  return operation.run(inputs.map((input) => makeInput(input.name, input.bytes)), params, context());
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

async function textOf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loaded = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const page = await loaded.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  await loaded.destroy();
  return text;
}

describe('opérations PDF', () => {
  it('fusionne plusieurs PDF dans l’ordre fourni', async () => {
    const first = await buildPdf([{ text: 'Document A' }]);
    const second = await buildPdf([{ text: 'Document B' }, { text: 'Document B page 2' }]);
    const result = await runWith(findOperation('pdf.merge'), [{ name: 'a.pdf', bytes: first }, { name: 'b.pdf', bytes: second }]);
    expect(result.outputs).toHaveLength(1);
    expect(await pageCount(result.outputs[0].bytes)).toBe(3);
    expect(result.outputs[0].name).toBe('a-fusion.pdf');
  });

  it('divise un PDF en une page par fichier', async () => {
    const source = await buildPdf([{ text: 'Un' }, { text: 'Deux' }, { text: 'Trois' }]);
    const result = await runWith(findOperation('pdf.split'), [{ name: 'rapport.pdf', bytes: source }], { mode: 'pages' });
    expect(result.outputs).toHaveLength(3);
    expect(await pageCount(result.outputs[1].bytes)).toBe(1);
    expect(result.outputs.map((output) => output.name)).toEqual(['rapport-p1.pdf', 'rapport-p2.pdf', 'rapport-p3.pdf']);
  });

  it('découpe par paquets de pages', async () => {
    const source = await buildPdf([{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }]);
    const result = await runWith(findOperation('pdf.split'), [{ name: 'scan.pdf', bytes: source }], { mode: 'chunks', chunkSize: 2 });
    expect(result.outputs).toHaveLength(3);
    expect(await pageCount(result.outputs[2].bytes)).toBe(1);
  });

  it('extrait une plage de pages et refuse une plage invalide', async () => {
    const source = await buildPdf([{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }]);
    const result = await runWith(findOperation('pdf.extract'), [{ name: 'doc.pdf', bytes: source }], { pages: '2-3' });
    expect(await pageCount(result.outputs[0].bytes)).toBe(2);
    await expect(runWith(findOperation('pdf.extract'), [{ name: 'doc.pdf', bytes: source }], { pages: '9-12' }))
      .rejects.toThrow(/Aucune page valide/u);
  });

  it('supprime des pages sans toucher à l’original', async () => {
    const source = await buildPdf([{ text: '1' }, { text: '2' }, { text: '3' }]);
    const before = source.slice();
    const result = await runWith(findOperation('pdf.remove-pages'), [{ name: 'doc.pdf', bytes: source }], { pages: '2' });
    expect(await pageCount(result.outputs[0].bytes)).toBe(2);
    expect(Array.from(source)).toEqual(Array.from(before));
  });

  it('fait pivoter uniquement les pages demandées', async () => {
    const source = await buildPdf([{ text: '1' }, { text: '2' }]);
    const result = await runWith(findOperation('pdf.rotate'), [{ name: 'doc.pdf', bytes: source }], { angle: '90', pages: '2' });
    const document = await PDFDocument.load(result.outputs[0].bytes);
    expect(document.getPage(0).getRotation().angle).toBe(0);
    expect(document.getPage(1).getRotation().angle).toBe(90);
  });

  it('réorganise les pages selon un ordre explicite', async () => {
    const source = await buildPdf([{ text: 'Un' }, { text: 'Deux' }, { text: 'Trois' }]);
    const result = await runWith(findOperation('pdf.reorder'), [{ name: 'doc.pdf', bytes: source }], { mode: 'custom', order: '3, 1, 2' });
    expect(await textOf(result.outputs[0].bytes)).toContain('Trois');
  });

  it('ajoute un numéro de page écrit dans le contenu', async () => {
    const source = await buildPdf([{ text: 'Rapport' }]);
    const result = await runWith(findOperation('pdf.page-numbers'), [{ name: 'doc.pdf', bytes: source }], { format: 'Page {page}/{pages}', position: 'bottom-center' });
    expect(await textOf(result.outputs[0].bytes)).toContain('Page 1/1');
  });

  it('ajoute un filigrane par-dessus le contenu', async () => {
    const source = await buildPdf([{ text: 'Interne' }]);
    const result = await runWith(findOperation('pdf.watermark'), [{ name: 'doc.pdf', bytes: source }], { text: 'CONFIDENTIEL', opacity: 0.3, rotation: 0 });
    const text = await textOf(result.outputs[0].bytes);
    expect(text).toContain('CONFIDENTIEL');
    expect(text).toContain('Interne');
  });

  it('met à jour et supprime les métadonnées', async () => {
    const source = await buildPdf([{ text: 'Bonjour' }], { title: 'Origine', author: 'Service' });
    const updated = await runWith(findOperation('pdf.metadata-write'), [{ name: 'doc.pdf', bytes: source }], { title: 'Nouveau titre', author: 'Noto' });
    const document = await PDFDocument.load(updated.outputs[0].bytes);
    expect(document.getTitle()).toBe('Nouveau titre');
    expect(document.getAuthor()).toBe('Noto');
    const stripped = await runWith(findOperation('pdf.metadata-strip'), [{ name: 'doc.pdf', bytes: updated.outputs[0].bytes }]);
    const cleaned = await PDFDocument.load(stripped.outputs[0].bytes);
    expect(cleaned.getTitle()).toBe('');
    expect(cleaned.getAuthor()).toBe('');
  });

  it('lit les métadonnées sans modifier le fichier', async () => {
    const source = await buildPdf([{ text: 'Rapport annuel' }], { title: 'Rapport annuel', author: 'Noto' });
    const result = await runWith(findOperation('pdf.metadata-read'), [{ name: 'rapport.pdf', bytes: source }]);
    expect(result.report?.title).toContain('rapport.pdf');
    const table = result.report?.sections[0].table ?? [];
    expect(table.some((row) => row[0] === 'Titre' && row[1] === 'Rapport annuel')).toBe(true);
    expect(table.some((row) => row[0] === 'Pages' && row[1] === '1')).toBe(true);
  });

  it('extrait le texte page par page', async () => {
    const source = await buildPdf([{ text: 'Noto conserve vos fichiers en local.' }, { text: 'Deuxième page.' }]);
    const result = await runWith(findOperation('pdf.to-text'), [{ name: 'doc.pdf', bytes: source }], { separators: true });
    const text = new TextDecoder().decode(result.outputs[0].bytes);
    expect(text).toContain('--- Page 1 ---');
    expect(text).toContain('Noto conserve vos fichiers en local.');
    expect(text).toContain('Deuxième page.');
  });

  it('signale un PDF scanné sans texte au lieu de produire un fichier vide', async () => {
    const source = await buildPdf([{ text: '' }], { footer: false });
    await expect(runWith(findOperation('pdf.to-text'), [{ name: 'scan.pdf', bytes: source }]))
      .rejects.toThrow(/Aucun texte/u);
  });

  it('convertit en Markdown en détectant les titres', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const page = document.addPage([595.28, 841.89]);
    page.drawText('Titre principal', { x: 60, y: 760, size: 26, font: bold, color: rgb(0, 0, 0) });
    page.drawText('Ce paragraphe décrit le document en quelques mots.', { x: 60, y: 720, size: 11, font });
    page.drawText('Une seconde ligne du même paragraphe.', { x: 60, y: 700, size: 11, font });
    const result = await runWith(findOperation('pdf.to-markdown'), [{ name: 'doc.pdf', bytes: await document.save() }]);
    const markdown = new TextDecoder().decode(result.outputs[0].bytes);
    expect(markdown).toContain('## Titre principal');
    expect(markdown).toContain('Ce paragraphe décrit le document');
  });

  it('produit un DOCX valide à partir du PDF', async () => {
    const source = await buildPdf([{ text: 'Contenu à exporter' }]);
    const result = await runWith(findOperation('pdf.to-docx'), [{ name: 'doc.pdf', bytes: source }], { includeImages: false });
    const bytes = result.outputs[0].bytes;
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain('word/document.xml');
    expect(strFromU8(files['word/document.xml'])).toContain('Contenu à exporter');
  });

  it('analyse la qualité et détecte les pages sans texte', async () => {
    const withText = await buildPdf([{ text: 'Page avec du texte exploitable.' }]);
    const result = await runWith(findOperation('pdf.analyze'), [{ name: 'doc.pdf', bytes: withText }]);
    const rows = result.report?.sections[0].table ?? [];
    expect(rows.some((row) => row[0] === 'Pages' && row[1] === '1')).toBe(true);
    expect(rows.some((row) => row[0] === 'Pages numérisées' && row[1] === 'aucune')).toBe(true);
  });

  it('compare deux PDF et signale les pages ajoutées', async () => {
    const left = await buildPdf([{ text: 'Première version du contrat.' }]);
    const right = await buildPdf([{ text: 'Deuxième version du contrat.' }, { text: 'Nouvelle clause ajoutée.' }]);
    const result = await runWith(findOperation('pdf.compare'), [
      { name: 'avant.pdf', bytes: left },
      { name: 'apres.pdf', bytes: right },
    ], { mode: 'text' });
    const table = result.report?.sections[0].table ?? [];
    expect(table.some((row) => row[1] === 'modifiée')).toBe(true);
    expect(table.some((row) => row[1] === 'page ajoutée')).toBe(true);
  });

  it('remplit un formulaire PDF', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage([595.28, 841.89]);
    page.drawText('Formulaire Noto', { x: 60, y: 780, size: 16, font });
    const form = document.getForm();
    const field = form.createTextField('nom');
    field.addToPage(page, { x: 60, y: 700, width: 200, height: 24 });
    const source = await document.save();

    const listed = await runWith(findOperation('pdf.form-list'), [{ name: 'form.pdf', bytes: source }]);
    expect(listed.report?.sections[0].table?.some((row) => row[0] === 'nom')).toBe(true);

    const filled = await runWith(findOperation('pdf.form-fill'), [{ name: 'form.pdf', bytes: source }], { values: 'nom = Marie Dupont' });
    const reloaded = await PDFDocument.load(filled.outputs[0].bytes);
    expect(reloaded.getForm().getTextField('nom').getText()).toBe('Marie Dupont');
    expect(filled.warnings).toEqual([]);
  });

  it('explique clairement un PDF illisible au lieu d’échouer sans message', async () => {
    const corrupted = new TextEncoder().encode('ceci n’est pas un PDF du tout');
    await expect(runWith(findOperation('pdf.rotate'), [{ name: 'casse.pdf', bytes: corrupted }], { angle: '90' }))
      .rejects.toThrow(/valide ou est endommagé|illisible/u);
  });
});
