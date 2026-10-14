import { parseCsv, serializeCsvRows } from '../csv';
import { readXlsx, writeXlsx } from '../data/xlsx';
import { writeDocx, type DocxBlock } from '../data/docx';
import { markdownToBlocks, markdownToPlainText, renderBlocksToPdf, textToBlocks, type DocumentBlock } from '../documents/pdfRender';
import { importOfficeDocument } from '../documents/officeImport';
import { decodeText } from '../fileTypes';
import { buildOutputName, commonPrefixBase, splitFileName } from '../jobs/naming';
import { createLocalOutputZip } from '../archiveWriter';
import { formatSize } from '../jobs/output';
import type { Operation, OperationInput } from './types';
import { readBoolean, readNumber, readText } from './types';

/**
 * Opérations sur le texte, les tableaux et les documents bureautiques.
 *
 * Les conversions complexes sont explicitement des reconstructions : Noto
 * n’annonce jamais une reproduction fidèle d’une mise en page bureautique.
 */

function textOf(input: OperationInput): string {
  return decodeText(input.bytes);
}

function outputFor(input: OperationInput, suffix: string, extension: string, index = 1, total = 1, template = ''): string {
  return buildOutputName({ template, sourceName: input.name, index, total, suffix, targetExtension: extension });
}

const TEXT_INPUTS = ['txt', 'md', 'log', 'json', 'html'] as const;

const textToPdfOperation: Operation = {
  id: 'text.to-pdf',
  label: 'Convertir un texte en PDF',
  description: 'Reconstruit un PDF paginé à partir d’un fichier texte, Markdown ou code, avec des mesures de police réelles.',
  category: 'text-convert',
  nature: 'rebuild',
  inputs: { formats: [...TEXT_INPUTS], min: 1, max: 1, label: 'un fichier texte ou Markdown' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF' },
  params: [
    { id: 'pageSize', label: 'Format de page', kind: 'select', default: 'a4', options: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }] },
    { id: 'landscape', label: 'Orientation paysage', kind: 'boolean', default: false },
    { id: 'margin', label: 'Marge (points)', kind: 'number', default: 56, min: 18, max: 120 },
    { id: 'baseSize', label: 'Taille de texte', kind: 'number', default: 11, min: 7, max: 20 },
  ],
  limits: ['Reconstruction : les polices PDF standard couvrent l’alphabet latin, les autres caractères sont remplacés et signalés'],
  run: async (inputs, params, context) => {
    const input = inputs[0];
    const source = textOf(input);
    context.progress({ value: 0.3, label: 'Préparation du contenu…' });
    const blocks = input.format === 'md' ? markdownToBlocks(source) : textToBlocks(source);
    const rendered = await renderBlocksToPdf(blocks.length ? blocks : [{ type: 'paragraph', text: '' }], {
      pageSize: readText(params, 'pageSize', 'a4') as 'a4' | 'letter',
      landscape: readBoolean(params, 'landscape'),
      margin: readNumber(params, 'margin', 56),
      baseSize: readNumber(params, 'baseSize', 11),
      title: splitFileName(input.name).baseName,
    });
    return {
      outputs: [{ name: outputFor(input, '', 'pdf'), bytes: rendered.bytes, format: 'pdf' }],
      warnings: rendered.warnings,
      measurements: [{ label: 'Taille', before: input.size, after: rendered.bytes.length, unit: 'bytes' as const }],
    };
  },
};

const textToDocxOperation: Operation = {
  id: 'text.to-docx',
  label: 'Convertir un texte en Word (DOCX)',
  description: 'Produit un document Word réel : titres, paragraphes, listes et tableaux Markdown.',
  category: 'text-convert',
  nature: 'rebuild',
  inputs: { formats: ['txt', 'md', 'log', 'csv', 'tsv'], min: 1, max: 1, label: 'un fichier texte ou Markdown' },
  output: { format: 'docx', cardinality: 'one', label: 'un document Word' },
  params: [],
  limits: ['Reconstruction : aucun style d’origine n’existe pour un fichier texte'],
  run: async (inputs, _params, context) => {
    const input = inputs[0];
    context.progress({ value: 0.4, label: 'Écriture du document Word…' });
    const blocks: DocxBlock[] = input.format === 'md'
      ? markdownToBlocks(textOf(input)).map(toDocxBlock)
      : input.format === 'csv' || input.format === 'tsv'
        ? [{ type: 'table', rows: parseCsv(textOf(input), input.format === 'tsv' ? '\t' : undefined).rows }]
        : textToBlocks(textOf(input)).map(toDocxBlock);
    const bytes = writeDocx(blocks, splitFileName(input.name).baseName);
    return { outputs: [{ name: outputFor(input, '', 'docx'), bytes, format: 'docx' }], warnings: [], measurements: [] };
  },
};

function toDocxBlock(block: DocumentBlock): DocxBlock {
  if (block.type === 'heading') return { type: 'heading', level: block.level, text: block.text };
  if (block.type === 'list') return { type: 'list', items: block.items, ordered: block.ordered };
  if (block.type === 'table') return { type: 'table', rows: block.rows };
  if (block.type === 'paragraph') return { type: 'paragraph', text: block.text };
  if (block.type === 'code') return { type: 'paragraph', text: block.text };
  return { type: 'paragraph', text: '' };
}

const textToHtmlOperation: Operation = {
  id: 'text.to-html',
  label: 'Convertir un texte en HTML',
  description: 'Produit une page HTML autonome, sans script, à partir de Markdown ou de texte.',
  category: 'text-convert',
  nature: 'rebuild',
  inputs: { formats: [...TEXT_INPUTS], min: 1, max: 1, label: 'un fichier texte ou Markdown' },
  output: { format: 'html', cardinality: 'one', label: 'une page HTML' },
  params: [],
  limits: ['Aucun script n’est produit : la page est purement statique'],
  run: async (inputs, _params, context) => {
    const input = inputs[0];
    context.progress({ value: 0.4, label: 'Génération du HTML…' });
    const html = input.format === 'md' ? markdownToHtmlPage(textOf(input), input.name) : textToHtmlPage(textOf(input), input.name);
    return { outputs: [{ name: outputFor(input, 'page', 'html'), bytes: new TextEncoder().encode(html), format: 'html' }], warnings: [], measurements: [] };
  },
};

function markdownToHtmlPage(markdown: string, title: string): string {
  const escape = (value: string) => value.replace(/[&<>"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] ?? character));
  const body: string[] = [];
  let inList = false;
  let inCode = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) {
      body.push(inCode ? '</pre>' : '<pre>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      body.push(escape(line));
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading) {
      if (inList) { body.push('</ul>'); inList = false; }
      body.push(`<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const item = /^\s*[-*+]\s+(.*)$/u.exec(line);
    if (item) {
      if (!inList) { body.push('<ul>'); inList = true; }
      body.push(`<li>${escape(item[1])}</li>`);
      continue;
    }
    if (!line.trim()) {
      if (inList) { body.push('</ul>'); inList = false; }
      continue;
    }
    if (inList) { body.push('</ul>'); inList = false; }
    body.push(`<p>${escape(line)}</p>`);
  }
  if (inCode) body.push('</pre>');
  if (inList) body.push('</ul>');
  return htmlShell(title, body.join('\n'));
}

function textToHtmlPage(text: string, title: string): string {
  const escape = (value: string) => value.replace(/[&<>"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] ?? character));
  const body = text.split(/\n{2,}/u).map((paragraph) => `<p>${escape(paragraph).replaceAll('\n', '<br>')}</p>`).join('\n');
  return htmlShell(title, body);
}

function htmlShell(title: string, body: string): string {
  const escape = (value: string) => value.replace(/[&<>"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] ?? character));
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:'Segoe UI',system-ui,sans-serif;line-height:1.65;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#292b3a}pre{background:#f4f4f8;padding:.8rem;overflow:auto;border-radius:6px}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

const tableToPdfOperation: Operation = {
  id: 'table.to-pdf',
  label: 'Convertir un tableau en PDF',
  description: 'Met en page un CSV/TSV en tableau PDF paginé, avec en-tête et colonnes ajustées.',
  category: 'table-convert',
  nature: 'rebuild',
  inputs: { formats: ['csv', 'tsv'], min: 1, max: 1, label: 'un fichier CSV ou TSV' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF tabulaire' },
  params: [
    { id: 'landscape', label: 'Orientation paysage', kind: 'boolean', default: true },
    { id: 'title', label: 'Titre du document', kind: 'text', default: '', maxLength: 120 },
  ],
  limits: ['Les lignes sont limitées à ce que le PDF peut contenir (2 000 pages maximum)'],
  run: async (inputs, params, context) => {
    const input = inputs[0];
    const parsed = parseCsv(textOf(input), input.format === 'tsv' ? '\t' : undefined);
    if (!parsed.rows.length) throw new Error('Ce tableau ne contient aucune ligne exploitable.');
    context.progress({ value: 0.4, label: 'Mise en page du tableau…' });
    const title = readText(params, 'title') || splitFileName(input.name).baseName;
    const blocks: DocumentBlock[] = [{ type: 'heading', level: 1, text: title }];
    const chunkSize = 250;
    for (let start = 0; start < parsed.rows.length; start += chunkSize) {
      const chunk = parsed.rows.slice(start, start + chunkSize);
      const header = start === 0 ? chunk[0] : parsed.rows[0];
      blocks.push({ type: 'table', rows: start === 0 ? chunk : [header, ...chunk] });
      if (start + chunkSize < parsed.rows.length) blocks.push({ type: 'pagebreak' });
    }
    const rendered = await renderBlocksToPdf(blocks, { landscape: readBoolean(params, 'landscape', true), baseSize: 9 });
    return {
      outputs: [{ name: outputFor(input, '', 'pdf'), bytes: rendered.bytes, format: 'pdf' }],
      warnings: rendered.warnings,
      measurements: [{ label: 'Lignes', before: 0, after: parsed.rows.length, unit: 'items' as const }],
    };
  },
};

const tableToXlsxOperation: Operation = {
  id: 'table.to-xlsx',
  label: 'Convertir en XLSX',
  description: 'Transforme un CSV/TSV en classeur Excel réel (une feuille, texte et nombres détectés).',
  category: 'table-convert',
  nature: 'rebuild',
  inputs: { formats: ['csv', 'tsv'], min: 1, max: 1, label: 'un fichier CSV ou TSV' },
  output: { format: 'xlsx', cardinality: 'one', label: 'un classeur XLSX' },
  params: [],
  limits: ['Une seule feuille, sans formules, styles ni graphiques'],
  run: async (inputs, _params, context) => {
    const input = inputs[0];
    const parsed = parseCsv(textOf(input), input.format === 'tsv' ? '\t' : undefined);
    if (!parsed.rows.length) throw new Error('Ce tableau ne contient aucune ligne exploitable.');
    context.progress({ value: 0.5, label: 'Écriture du classeur…' });
    const bytes = writeXlsx(parsed.rows, splitFileName(input.name).baseName.slice(0, 31));
    return {
      outputs: [{ name: outputFor(input, '', 'xlsx'), bytes, format: 'xlsx' }],
      warnings: [],
      measurements: [{ label: 'Taille', before: input.size, after: bytes.length, unit: 'bytes' as const }],
    };
  },
};

const xlsxToCsvOperation: Operation = {
  id: 'xlsx.to-csv',
  label: 'Convertir un classeur en CSV',
  description: 'Extrait la première feuille du classeur en CSV (ou TSV).',
  category: 'table-convert',
  nature: 'rebuild',
  inputs: { formats: ['xlsx', 'ods'], min: 1, max: 1, label: 'un classeur XLSX' },
  output: { format: 'csv', cardinality: 'one', label: 'un fichier CSV' },
  params: [
    { id: 'delimiter', label: 'Séparateur', kind: 'select', default: ',', options: [{ value: ',', label: 'Virgule (,)' }, { value: ';', label: 'Point-virgule (;)' }, { value: '\t', label: 'Tabulation' }] },
  ],
  limits: ['Noto lit la première feuille : les autres feuilles, formules et styles ne sont pas conservés'],
  run: async (inputs, params, context) => {
    const input = inputs[0];
    context.progress({ value: 0.4, label: 'Lecture du classeur…' });
    const sheet = readXlsx(input.bytes);
    if (!sheet.rows.length) throw new Error('Ce classeur ne contient aucune cellule exploitable.');
    const delimiter = readText(params, 'delimiter', ',');
    const content = serializeCsvRows(sheet.rows, delimiter);
    const extension = delimiter === '\t' ? 'tsv' : 'csv';
    return {
      outputs: [{ name: outputFor(input, sheet.name, extension), bytes: new TextEncoder().encode(content), format: extension === 'tsv' ? 'tsv' : 'csv' }],
      warnings: sheet.truncated ? ['Le classeur a été tronqué : Noto limite la lecture à 200 000 cellules.'] : [],
      measurements: [{ label: 'Lignes', before: 0, after: sheet.rows.length, unit: 'items' as const }],
    };
  },
};

const tableToMarkdownOperation: Operation = {
  id: 'table.to-markdown',
  label: 'Convertir un tableau en Markdown',
  description: 'Produit un tableau Markdown (GFM) à partir d’un CSV/TSV.',
  category: 'table-convert',
  nature: 'rebuild',
  inputs: { formats: ['csv', 'tsv'], min: 1, max: 1, label: 'un fichier CSV ou TSV' },
  output: { format: 'md', cardinality: 'one', label: 'un fichier Markdown' },
  params: [{ id: 'title', label: 'Titre', kind: 'text', default: '', maxLength: 120 }],
  limits: ['Les tableaux très larges restent lisibles mais longs'],
  run: async (inputs, params) => {
    const input = inputs[0];
    const parsed = parseCsv(textOf(input), input.format === 'tsv' ? '\t' : undefined);
    if (!parsed.rows.length) throw new Error('Ce tableau ne contient aucune ligne exploitable.');
    const [header, ...rows] = parsed.rows;
    const columns = Math.max(header.length, ...rows.map((row) => row.length));
    const lines: string[] = [];
    const title = readText(params, 'title');
    if (title) lines.push(`# ${title}`, '');
    lines.push(`| ${Array.from({ length: columns }, (_, index) => (header[index] ?? '').replaceAll('|', '\\|')).join(' | ')} |`);
    lines.push(`| ${Array.from({ length: columns }, () => '---').join(' | ')} |`);
    for (const row of rows) {
      lines.push(`| ${Array.from({ length: columns }, (_, index) => (row[index] ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ')} |`);
    }
    return {
      outputs: [{ name: outputFor(input, 'tableau', 'md'), bytes: new TextEncoder().encode(`${lines.join('\n')}\n`), format: 'md' }],
      warnings: [],
      measurements: [{ label: 'Lignes', before: 0, after: rows.length, unit: 'items' as const }],
    };
  },
};

const officeToPdfOperation: Operation = {
  id: 'office.to-pdf',
  label: 'Convertir un document bureautique en PDF',
  description: 'Reconstruit un PDF à partir du contenu réel d’un DOCX, ODT, RTF, PPTX, ODP ou EPUB.',
  category: 'office-convert',
  nature: 'rebuild',
  inputs: { formats: ['docx', 'odt', 'rtf', 'pptx', 'odp', 'epub'], min: 1, max: 1, label: 'un document bureautique ou un livre numérique' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF reconstruit' },
  params: [
    { id: 'pageSize', label: 'Format de page', kind: 'select', default: 'a4', options: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }] },
  ],
  limits: [
    'Reconstruction : le texte et les images courantes sont conservés, la mise en page d’origine ne l’est pas',
    'Les macros, scripts et objets intégrés ne sont jamais exécutés',
  ],
  run: async (inputs, params, context) => {
    const input = inputs[0];
    context.progress({ value: 0.3, label: 'Lecture du document…' });
    const imported = importOfficeDocument(input.bytes, input.format, input.name);
    context.progress({ value: 0.6, label: 'Mise en page du PDF…' });
    const rendered = await renderBlocksToPdf(imported.blocks, {
      pageSize: readText(params, 'pageSize', 'a4') as 'a4' | 'letter',
      title: splitFileName(input.name).baseName,
    });
    return {
      outputs: [{ name: outputFor(input, '', 'pdf'), bytes: rendered.bytes, format: 'pdf' }],
      warnings: [...imported.warnings, ...rendered.warnings],
      measurements: [{ label: 'Taille', before: input.size, after: rendered.bytes.length, unit: 'bytes' as const }],
    };
  },
};

const officeToTextOperation: Operation = {
  id: 'office.to-text',
  label: 'Extraire le texte d’un document bureautique',
  description: 'Extrait le contenu texte d’un DOCX, ODT, RTF, PPTX, ODP ou EPUB en TXT ou Markdown.',
  category: 'office-convert',
  nature: 'measure',
  inputs: { formats: ['docx', 'odt', 'rtf', 'pptx', 'odp', 'epub'], min: 1, max: 1, label: 'un document bureautique ou un livre numérique' },
  output: { format: 'txt', cardinality: 'one', label: 'un fichier texte' },
  params: [
    { id: 'markdown', label: 'Conserver la structure (Markdown)', kind: 'boolean', default: true },
  ],
  limits: ['Les tableaux et colonnes ne sont pas reconstruits fidèlement'],
  run: async (inputs, params, context) => {
    const input = inputs[0];
    context.progress({ value: 0.4, label: 'Extraction du texte…' });
    const imported = importOfficeDocument(input.bytes, input.format, input.name);
    const asMarkdown = readBoolean(params, 'markdown', true);
    const content = imported.blocks.map((block) => {
      if (block.type === 'heading') return `${asMarkdown ? '#'.repeat(Math.min(4, block.level)) + ' ' : ''}${block.text}`;
      if (block.type === 'paragraph') return block.text;
      if (block.type === 'code') return block.text;
      if (block.type === 'list') return block.items.map((item) => `- ${item}`).join('\n');
      if (block.type === 'table') return block.rows.map((row) => row.join('\t')).join('\n');
      if (block.type === 'image') return `[image] ${block.caption ?? ''}`.trim();
      return '';
    }).filter(Boolean).join('\n\n');
    if (!content.trim()) throw new Error('Aucun texte exploitable n’a été trouvé dans ce document.');
    return {
      outputs: [{ name: outputFor(input, 'texte', asMarkdown ? 'md' : 'txt'), bytes: new TextEncoder().encode(content), format: asMarkdown ? 'md' : 'txt' }],
      warnings: [...imported.warnings],
      measurements: [{ label: 'Caractères', before: 0, after: content.length, unit: 'items' as const }],
    };
  },
};

const markdownToPlainTextOperation: Operation = {
  id: 'markdown.to-text',
  label: 'Convertir du Markdown en texte',
  description: 'Retire le balisage Markdown pour obtenir un texte lisible.',
  category: 'text-convert',
  nature: 'rebuild',
  inputs: { formats: ['md'], min: 1, max: 1, label: 'un fichier Markdown' },
  output: { format: 'txt', cardinality: 'one', label: 'un fichier texte' },
  params: [],
  limits: ['Le balisage est retiré : l’alignement des tableaux et des blocs de code n’est pas conservé'],
  run: async (inputs) => {
    const input = inputs[0];
    const text = markdownToPlainText(textOf(input));
    return {
      outputs: [{ name: outputFor(input, 'texte', 'txt'), bytes: new TextEncoder().encode(text), format: 'txt' }],
      warnings: [],
      measurements: [{ label: 'Caractères', before: 0, after: text.length, unit: 'items' as const }],
    };
  },
};

const zipCreateOperation: Operation = {
  id: 'archive.create',
  label: 'Créer une archive ZIP',
  description: 'Regroupe plusieurs fichiers dans une archive ZIP compressée, sans jamais modifier les originaux.',
  category: 'organize',
  nature: 'rebuild',
  inputs: { formats: 'any', min: 1, max: 500, label: 'un ou plusieurs fichiers' },
  output: { format: 'zip', cardinality: 'one', label: 'une archive ZIP' },
  params: [
    { id: 'name', label: 'Nom de l’archive', kind: 'text', default: '', placeholder: 'noto-archive', maxLength: 80 },
    { id: 'level', label: 'Compression', kind: 'select', default: '6', options: [{ value: '0', label: 'Aucune (rapide)' }, { value: '6', label: 'Standard' }, { value: '9', label: 'Maximale (lente)' }] },
  ],
  limits: ['L’archive est construite en mémoire : Noto limite le total à 400 Mo'],
  run: async (inputs, params, context) => {
    context.progress({ value: 0.2, label: 'Préparation de l’archive…' });
    const level = Number.parseInt(readText(params, 'level', '6'), 10);
    const result = await createLocalOutputZip(
      inputs.map((input) => ({ name: input.name, bytes: input.bytes })),
      { level: Number.isFinite(level) ? (level as 0 | 6 | 9) : 6 },
    );
    const baseName = readText(params, 'name').trim() || commonPrefixBase(inputs.map((input) => input.name));
    return {
      outputs: [{
        name: `${baseName}.zip`,
        bytes: result.bytes,
        format: 'zip',
        note: `${formatSize(result.totalInput)} compressés en ${formatSize(result.bytes.length)}`,
      }],
      warnings: result.warnings,
      measurements: [{ label: 'Taille', before: result.totalInput, after: result.bytes.length, unit: 'bytes' as const }],
    };
  },
};

export const DOCUMENT_OPERATIONS: Operation[] = [
  textToPdfOperation,
  textToDocxOperation,
  textToHtmlOperation,
  markdownToPlainTextOperation,
  tableToPdfOperation,
  tableToXlsxOperation,
  xlsxToCsvOperation,
  tableToMarkdownOperation,
  officeToPdfOperation,
  officeToTextOperation,
  zipCreateOperation,
];
