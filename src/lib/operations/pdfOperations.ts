import { analyzePdfPages, formatPageRangeInput, openPdf, readDocumentText, readPdfFontNames, readPdfInfo, toPdfReadError } from '../pdf/pdfEngine';
import { extractPdfImages, imagesToPdf } from '../pdf/pdfImages';
import { comparePdfVisually, pdfPagesToImages, redactPdf, rebuildPdfFromRaster } from '../pdf/pdfRaster';
import {
  addHeaderFooter,
  addTextOverlay,
  duplicatePages,
  fillPdfFormFields,
  imposePages,
  insertPdfPages,
  listPdfFormFields,
  mergePdfs,
  numberPdfPages,
  optimizePdfStructure,
  removePages as removePdfPages,
  reorderPages,
  reversePages,
  rotatePages,
  stripPdfMetadata,
  updatePdfMetadata,
  type OverlayPosition,
} from '../pdf/pdfWrite';
import { buildOutputName, commonPrefixBase } from '../jobs/naming';
import { formatSize } from '../jobs/output';
import { writeDocx, type DocxBlock } from '../data/docx';
import type { Operation, OperationContext, OperationInput, OperationOutput, ParamValues } from './types';
import { readBoolean, readNumber, readText } from './types';

/**
 * Opérations PDF de Noto.
 *
 * Chaque opération annonce sa nature réelle :
 * - `native` : le document PDF est modifié (pages, rotation, métadonnées) ;
 * - `overlay` : un élément est ajouté par-dessus le contenu existant ;
 * - `rebuild` : le document est reconstruit (rendu des pages, couche texte
 *   remplacée) — utilisé pour la compression forte et la caviardisation ;
 * - `measure` : l’opération ne produit qu’un rapport.
 */

function ensurePdfInputs(inputs: OperationInput[], minimum = 1): void {
  if (inputs.length < minimum) {
    throw new Error(minimum > 1 ? `Cette opération demande au moins ${minimum} fichiers PDF.` : 'Sélectionnez un fichier PDF.');
  }
  for (const input of inputs) {
    if (input.format !== 'pdf') throw new Error(`« ${input.name} » n’est pas un PDF.`);
    if (!input.bytes.length) throw new Error(`« ${input.name} » est vide.`);
  }
}

function outputNameFor(input: OperationInput, suffix: string, targetExtension: string, index = 1, total = 1, template = '', page?: number): string {
  return buildOutputName({
    template,
    sourceName: input.name,
    index,
    total,
    suffix,
    targetExtension,
    page,
  });
}

function pageSelection(value: string, pageCount: number): number[] {
  if (!value.trim()) return Array.from({ length: pageCount }, (_, index) => index + 1);
  return formatPageRangeInput(value, pageCount);
}

function measurement(label: string, before: number, after: number, unit: 'bytes' | 'pages' | 'items' | 'percent' = 'bytes') {
  return { label, before, after, unit };
}

function totalBytes(outputs: OperationOutput[]): number {
  return outputs.reduce((sum, output) => sum + output.bytes.length, 0);
}

function progressHelper(context: OperationContext) {
  return (value: number, label: string) => context.progress({ value, label });
}

/* ------------------------------------------------------------------ */
/* Pages                                                              */
/* ------------------------------------------------------------------ */

const mergeOperation: Operation = {
  id: 'pdf.merge',
  label: 'Fusionner des PDF',
  description: 'Regroupe plusieurs PDF en un seul document, dans l’ordre choisi.',
  category: 'pdf-pages',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 2, max: 50, label: 'au moins deux PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF fusionné' },
  params: [
    { id: 'template', label: 'Nom du fichier produit', kind: 'text', default: '{nom}.pdf', help: 'Les jetons {nom}, {date} et {heure} sont remplacés.', advanced: true },
  ],
  limits: ['50 fichiers maximum par fusion', 'Les signets, formulaires et pièces jointes ne sont pas fusionnés'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs, 2);
    const order = inputs;
    progressHelper(context)(0.05, `Fusion de ${order.length} PDF…`);
    const bytes = await mergePdfs(order.map((input) => ({ bytes: input.bytes, name: input.name })));
    progressHelper(context)(0.9, 'Écriture du PDF fusionné…');
    const prefix = commonPrefixBase(order.map((input) => input.name));
    const baseName = prefix === 'noto'
      ? `${order[0].name.replace(/\.[^.]+$/u, '')}-fusion`
      : `${prefix}-fusion`;
    const rawName = readText(params, 'template', '{nom}.pdf').replace('{nom}', baseName);
    const name = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`;
    return {
      outputs: [{ name, bytes, format: 'pdf' }],
      warnings: order.length > 20 ? ['La fusion de nombreux fichiers peut produire un document volumineux ; vérifiez le résultat.'] : [],
      measurements: [measurement('Taille', order.reduce((sum, input) => sum + input.size, 0), bytes.length)],
    };
  },
};

const splitOperation: Operation = {
  id: 'pdf.split',
  label: 'Diviser un PDF',
  description: 'Découpe le document : une page par fichier, par lots ou selon des plages personnalisées.',
  category: 'pdf-pages',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'many', label: 'un PDF par partie' },
  params: [
    {
      id: 'mode', label: 'Découpe', kind: 'select', default: 'pages',
      options: [
        { value: 'pages', label: 'Une page par fichier' },
        { value: 'chunks', label: 'Par paquets de N pages' },
        { value: 'ranges', label: 'Plages personnalisées (1-3, 5, 8-10)' },
      ],
    },
    { id: 'chunkSize', label: 'Pages par paquet', kind: 'number', default: 5, min: 1, max: 500 },
    { id: 'ranges', label: 'Plages', kind: 'text', default: '', placeholder: '1-3, 5, 8-10' },
  ],
  limits: ['Un PDF très découpé produit beaucoup de fichiers : Noto les écrit tous dans le dossier choisi'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const mode = readText(params, 'mode', 'pages');
    const groups: number[][] = [];
    if (mode === 'chunks') {
      const size = Math.max(1, Math.round(readNumber(params, 'chunkSize', 5)));
      for (let start = 1; start <= pageCount; start += size) {
        groups.push(Array.from({ length: Math.min(size, pageCount - start + 1) }, (_, index) => start + index));
      }
    } else if (mode === 'ranges') {
      const ranges = readText(params, 'ranges');
      if (!ranges.trim()) throw new Error('Indiquez au moins une plage, par exemple 1-3, 5, 8-10.');
      for (const chunk of ranges.split(',')) {
        if (!chunk.trim()) continue;
        groups.push(formatPageRangeInput(chunk, pageCount));
      }
    } else {
      for (let page = 1; page <= pageCount; page += 1) groups.push([page]);
    }

    const outputs: OperationOutput[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      context.progress({ value: (index + 1) / groups.length, label: `Extraction de la partie ${index + 1} sur ${groups.length}…` });
      const bytes = await extractPageBytes(input.bytes, group, input.name);
      const suffix = group.length === 1 ? `p${group[0]}` : `p${group[0]}-${group.at(-1)}`;
      outputs.push({ name: outputNameFor(input, suffix, 'pdf', index + 1, groups.length), bytes, format: 'pdf' });
    }
    return {
      outputs,
      warnings: [],
      measurements: [measurement('Pages', pageCount, outputs.length, 'items'), measurement('Taille', input.size, totalBytes(outputs))],
    };
  },
};

const extractOperation: Operation = {
  id: 'pdf.extract',
  label: 'Extraire des pages',
  description: 'Crée un nouveau PDF contenant les pages choisies, ou un fichier par page.',
  category: 'pdf-pages',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'many', label: 'un ou plusieurs PDF' },
  params: [
    { id: 'pages', label: 'Pages', kind: 'text', default: '', placeholder: '1-3, 5, 8-10' },
    { id: 'separate', label: 'Un fichier par page', kind: 'boolean', default: false, advanced: true },
  ],
  limits: ['Les pages extraites perdent les signets et formulaires du document d’origine'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const pages = pageSelection(readText(params, 'pages'), pageCount);
    if (readBoolean(params, 'separate')) {
      const outputs: OperationOutput[] = [];
      for (let index = 0; index < pages.length; index += 1) {
        context.progress({ value: (index + 1) / pages.length, label: `Page ${pages[index]}…` });
        outputs.push({
          name: outputNameFor(input, `p${pages[index]}`, 'pdf', index + 1, pages.length, '', pages[index]),
          bytes: await extractPageBytes(input.bytes, [pages[index]], input.name),
          format: 'pdf',
        });
      }
      return { outputs, warnings: [], measurements: [measurement('Pages extraites', pageCount, outputs.length, 'items')] };
    }
    const list = pages.map((page) => `p${page}`).join('-');
    const bytes = await extractPageBytes(input.bytes, pages, input.name);
    return {
      outputs: [{ name: outputNameFor(input, list.length > 60 ? 'extrait' : list, 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [measurement('Pages', pageCount, pages.length, 'pages')],
    };
  },
};

const removeOperation: Operation = {
  id: 'pdf.remove-pages',
  label: 'Supprimer des pages',
  description: 'Crée une copie du document sans les pages choisies. L’original n’est jamais modifié.',
  category: 'pdf-pages',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF sans les pages supprimées' },
  params: [
    { id: 'pages', label: 'Pages à supprimer', kind: 'text', default: '', placeholder: '2, 4-6' },
  ],
  limits: ['Les pages supprimées doivent représenter moins de la totalité du document'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const pages = pageSelection(readText(params, 'pages'), pageCount);
    context.progress({ value: 0.3, label: `Suppression de ${pages.length} page(s)…` });
    const bytes = await removePdfPages(input.bytes, pages, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'sans-pages', 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [measurement('Pages', pageCount, pageCount - pages.length, 'pages')],
    };
  },
};

const rotateOperation: Operation = {
  id: 'pdf.rotate',
  label: 'Faire pivoter des pages',
  description: 'Applique une rotation réelle aux pages choisies ou à tout le document.',
  category: 'pdf-pages',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF pivoté' },
  params: [
    { id: 'angle', label: 'Rotation', kind: 'select', default: '90', options: [{ value: '90', label: '90° (droite)' }, { value: '180', label: '180°' }, { value: '270', label: '90° (gauche)' }] },
    { id: 'pages', label: 'Pages', kind: 'text', default: '', placeholder: 'vide = toutes les pages' },
  ],
  limits: [
    'La rotation est écrite dans le document : elle est rétablie indépendamment par chaque lecteur PDF',
    'Les pages pivotées ne sont pas re-rastérisées : le gain de poids d’une rotation n’existe pas',
  ],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const pages = pageSelection(readText(params, 'pages'), pageCount);
    context.progress({ value: 0.4, label: 'Rotation des pages…' });
    const angle = Number.parseInt(readText(params, 'angle', '90'), 10) as 90 | 180 | 270;
    const bytes = await rotatePages(input.bytes, pages, angle, input.name);
    return {
      outputs: [{ name: outputNameFor(input, `rotation-${angle}`, 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [measurement('Pages pivotées', pageCount, pages.length, 'pages')],
    };
  },
};

const reorderOperation: Operation = {
  id: 'pdf.reorder',
  label: 'Réorganiser les pages',
  description: 'Inverse l’ordre des pages ou applique un ordre précis.',
  category: 'pdf-pages',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF réorganisé' },
  params: [
    { id: 'mode', label: 'Mode', kind: 'select', default: 'reverse', options: [{ value: 'reverse', label: 'Inverser l’ordre' }, { value: 'custom', label: 'Ordre personnalisé' }] },
    { id: 'order', label: 'Ordre des pages', kind: 'text', default: '', placeholder: '3, 1, 2, 5, 4' },
  ],
  limits: ['L’ordre personnalisé doit mentionner chaque page exactement une fois'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const mode = readText(params, 'mode', 'reverse');
    context.progress({ value: 0.4, label: 'Réorganisation…' });
    const bytes = mode === 'reverse'
      ? await reversePages(input.bytes, input.name)
      : await reorderPages(input.bytes, parseOrder(readText(params, 'order'), pageCount), input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'reorganise', 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [measurement('Pages', pageCount, pageCount, 'pages')],
    };
  },
};

function parseOrder(value: string, pageCount: number): number[] {
  const order = value.split(/[,\s;]+/u).map((entry) => Number.parseInt(entry, 10)).filter((entry) => Number.isFinite(entry));
  if (order.length !== pageCount) {
    throw new Error(`Indiquez les ${pageCount} pages dans l’ordre souhaité, par exemple « ${Array.from({ length: pageCount }, (_, index) => index + 1).reverse().join(', ')} ».`);
  }
  return order;
}

const duplicateOperation: Operation = {
  id: 'pdf.duplicate',
  label: 'Dupliquer des pages',
  description: 'Répète les pages choisies juste après elles.',
  category: 'pdf-pages',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF avec les pages dupliquées' },
  params: [
    { id: 'pages', label: 'Pages à dupliquer', kind: 'text', default: '', placeholder: 'vide = toutes les pages' },
    { id: 'copies', label: 'Copies supplémentaires', kind: 'number', default: 1, min: 1, max: 20 },
  ],
  limits: ['20 copies au maximum par page'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const pages = pageSelection(readText(params, 'pages'), pageCount);
    const copies = Math.round(readNumber(params, 'copies', 1));
    context.progress({ value: 0.4, label: 'Duplication des pages…' });
    const bytes = await duplicatePages(input.bytes, pages, copies, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'duplique', 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [measurement('Pages', pageCount, pageCount + pages.length * copies, 'pages')],
    };
  },
};

const insertOperation: Operation = {
  id: 'pdf.insert',
  label: 'Insérer un PDF',
  description: 'Insère toutes les pages d’un second PDF à la position choisie.',
  category: 'pdf-pages',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 2, max: 2, label: 'deux PDF (document de base, puis insertion)' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF' },
  params: [
    { id: 'position', label: 'Insérer après la page', kind: 'number', default: 0, min: 0, max: 10_000, help: '0 = au début du document' },
  ],
  limits: [
    'Seules les pages du PDF inséré sont reprises : ses signets, formulaires et pièces jointes ne sont pas fusionnés',
    'Les dimensions de page d’origine sont conservées telles quelles',
  ],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs, 2);
    const [base, inserted] = inputs;
    const basePages = await pageCountOf(base.bytes);
    const position = Math.min(basePages, Math.max(0, Math.round(readNumber(params, 'position', 0))));
    context.progress({ value: 0.4, label: `Insertion après la page ${position}…` });
    const bytes = await insertPdfPages(base.bytes, inserted.bytes, position, base.name, inserted.name);
    return {
      outputs: [{ name: outputNameFor(base, 'insertion', 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [measurement('Pages', basePages, basePages + (await pageCountOf(inserted.bytes)), 'pages')],
    };
  },
};

const imposeOperation: Operation = {
  id: 'pdf.impose',
  label: 'Imposer plusieurs pages par feuille',
  description: 'Regroupe 2, 4, 6 ou 9 pages du document sur chaque feuille, pour l’impression.',
  category: 'pdf-pages',
  nature: 'rebuild',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF imposé' },
  params: [
    { id: 'perSheet', label: 'Pages par feuille', kind: 'select', default: '4', options: [{ value: '2', label: '2 pages' }, { value: '4', label: '4 pages' }, { value: '6', label: '6 pages' }, { value: '9', label: '9 pages' }] },
    { id: 'margin', label: 'Marge (points)', kind: 'number', default: 18, min: 0, max: 90 },
    { id: 'gap', label: 'Espace entre les pages (points)', kind: 'number', default: 10, min: 0, max: 60, advanced: true },
  ],
  limits: ['Les pages sont redimensionnées pour tenir sur des feuilles A4 ; cette opération reconstruit la mise en page'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const perSheet = Number.parseInt(readText(params, 'perSheet', '4'), 10);
    context.progress({ value: 0.4, label: 'Imposition des pages…' });
    const bytes = await imposePages(input.bytes, {
      perSheet: ([2, 4, 6, 9].includes(perSheet) ? perSheet : 4) as 2 | 4 | 6 | 9,
      margin: readNumber(params, 'margin', 18),
      gap: readNumber(params, 'gap', 10),
    }, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'impose', 'pdf'), bytes, format: 'pdf' }],
      warnings: ['Les liens, formulaires et signets d’origine ne sont pas conservés dans un document imposé.'],
      measurements: [measurement('Pages', pageCount, await pageCountOf(bytes), 'pages')],
    };
  },
};

/* ------------------------------------------------------------------ */
/* Optimisation                                                       */
/* ------------------------------------------------------------------ */

const COMPRESSION_MODES = {
  structure: { label: 'Optimiser la structure (sans perte)', dpi: 0, quality: 1, grayscale: false },
  balanced: { label: 'Compression équilibrée', dpi: 150, quality: 0.72, grayscale: false },
  strong: { label: 'Compression plus poussée', dpi: 110, quality: 0.55, grayscale: false },
  scan: { label: 'Documents numérisés (texte) ', dpi: 200, quality: 0.6, grayscale: true },
  print: { label: 'Optimisation pour l’impression', dpi: 300, quality: 0.85, grayscale: false },
  share: { label: 'Optimisation pour le partage', dpi: 130, quality: 0.65, grayscale: false },
} as const;

const compressOperation: Operation = {
  id: 'pdf.compress',
  label: 'Compresser un PDF',
  description: 'Réduit le poids du PDF : optimisation sans perte de la structure, ou ré-encodage des pages pour les documents volumineux.',
  category: 'pdf-optimize',
  nature: 'rebuild',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF compressé' },
  params: [
    {
      id: 'mode', label: 'Niveau', kind: 'select', default: 'structure',
      options: Object.entries(COMPRESSION_MODES).map(([value, mode]) => ({ value, label: mode.label })),
      help: 'Seul le mode « Optimiser la structure » conserve le texte sélectionnable.',
    },
    { id: 'grayscale', label: 'Convertir les pages en niveaux de gris', kind: 'boolean', default: false, advanced: true },
    { id: 'dpi', label: 'Résolution de rendu (points par pouce)', kind: 'number', default: 150, min: 72, max: 400, advanced: true },
    { id: 'quality', label: 'Qualité JPEG (0,3 à 1)', kind: 'number', default: 0.72, min: 0.3, max: 1, step: 0.05, advanced: true },
  ],
  limits: [
    'Les modes autres que « structure » remplacent la couche texte par une image : le document n’est plus sélectionnable',
    'Aucune réduction n’est garantie : Noto affiche la taille réelle avant et après',
  ],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const modeId = readText(params, 'mode', 'structure') as keyof typeof COMPRESSION_MODES;
    const mode = COMPRESSION_MODES[modeId] ?? COMPRESSION_MODES.structure;
    context.progress({ value: 0.1, label: modeId === 'structure' ? 'Optimisation de la structure…' : 'Rendu des pages…' });
    let bytes: Uint8Array;
    const pageCount = await pageCountOf(input.bytes);
    let warning: string | undefined;
    if (modeId === 'structure') {
      bytes = await optimizePdfStructure(input.bytes, input.name, true);
    } else {
      const dpi = Math.round(readNumber(params, 'dpi', mode.dpi));
      const quality = readNumber(params, 'quality', mode.quality);
      const rebuilt = await rebuildPdfFromRaster(input.bytes, {
        dpi,
        mimeType: 'image/jpeg',
        quality,
        grayscale: readBoolean(params, 'grayscale', mode.grayscale),
      }, {
        signal: context.signal,
        onProgress: (value, page) => context.progress({ value: value * 0.85, label: `Page ${page} sur ${pageCount}…` }),
      });
      bytes = rebuilt.bytes;
      warning = `Les pages ont été ré-encodées en JPEG à ${dpi} ppp : la couche texte d’origine est remplacée par une image.`;
    }
    const saved = input.size - bytes.length;
    const percent = input.size ? Math.round((saved / input.size) * 1000) / 10 : 0;
    return {
      outputs: [{
        name: outputNameFor(input, 'compresse', 'pdf'),
        bytes,
        format: 'pdf',
        note: saved > 0 ? `${formatSize(saved)} économisés (${percent} %)` : 'Aucune réduction obtenue avec ces réglages',
      }],
      warnings: [
        ...(warning ? [warning] : []),
        ...(saved <= 0 ? ['Ce document est déjà optimisé : aucun gain de taille n’a été obtenu. Essayez un niveau plus poussé en acceptant la perte de la couche texte.'] : []),
      ],
      measurements: [measurement('Taille', input.size, bytes.length)],
    };
  },
};

/* ------------------------------------------------------------------ */
/* Conversion                                                         */
/* ------------------------------------------------------------------ */

const toImagesOperation: Operation = {
  id: 'pdf.to-images',
  label: 'Convertir un PDF en images',
  description: 'Rend chaque page du PDF en image PNG, JPEG ou WebP à la résolution choisie.',
  category: 'pdf-convert',
  nature: 'rebuild',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'png', cardinality: 'many', label: 'une image par page' },
  params: [
    { id: 'format', label: 'Format', kind: 'select', default: 'png', options: [{ value: 'png', label: 'PNG (sans perte)' }, { value: 'jpeg', label: 'JPEG (plus léger)' }, { value: 'webp', label: 'WebP (moderne)' }] },
    { id: 'dpi', label: 'Résolution (ppp)', kind: 'number', default: 150, min: 72, max: 400 },
    { id: 'quality', label: 'Qualité (JPEG/WebP)', kind: 'number', default: 0.85, min: 0.3, max: 1, step: 0.05 },
    { id: 'pages', label: 'Pages', kind: 'text', default: '', placeholder: 'vide = toutes les pages' },
  ],
  limits: ['La résolution est limitée à 400 ppp', 'Les pages très grandes peuvent produire des images volumineuses'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const pages = pageSelection(readText(params, 'pages'), pageCount);
    const mimeType = ({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const)[readText(params, 'format', 'png') as 'png' | 'jpeg' | 'webp'] ?? 'image/png';
    const extension = mimeType === 'image/jpeg' ? 'jpeg' : mimeType === 'image/webp' ? 'webp' : 'png';
    const images = await pdfPagesToImages(input.bytes, {
      dpi: readNumber(params, 'dpi', 150),
      mimeType,
      quality: readNumber(params, 'quality', 0.85),
      pages,
      signal: context.signal,
      onProgress: (value, page) => context.progress({ value, label: `Page ${page} rendue…` }),
      password: context.password,
    });
    return {
      outputs: images.map((image, index) => ({
        name: outputNameFor(input, `page-${image.pageNumber}`, extension, index + 1, images.length, '', image.pageNumber),
        bytes: image.bytes,
        format: (extension === 'jpeg' ? 'jpeg' : extension) as 'png' | 'jpeg' | 'webp',
      })),
      warnings: [],
      measurements: [measurement('Pages converties', pageCount, images.length, 'pages'), measurement('Taille', input.size, images.reduce((sum, image) => sum + image.bytes.length, 0))],
    };
  },
};

const toTextOperation: Operation = {
  id: 'pdf.to-text',
  label: 'Extraire le texte (TXT)',
  description: 'Extrait le texte réel du PDF, page par page. Les pages numérisées sans OCR sont signalées.',
  category: 'pdf-convert',
  nature: 'measure',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'txt', cardinality: 'one', label: 'un fichier texte' },
  params: [
    { id: 'pages', label: 'Pages', kind: 'text', default: '', placeholder: 'vide = toutes les pages' },
    { id: 'separators', label: 'Ajouter les séparateurs de page', kind: 'boolean', default: false },
  ],
  limits: ['Un PDF scanné ne contient pas de texte : utilisez l’OCR local pour ces documents'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const text = await extractText(input, params, context);
    const separators = readBoolean(params, 'separators');
    const content = text.pages
      .map((page) => (separators ? `--- Page ${page.pageNumber} ---\n${page.text}` : page.text))
      .join('\n\n');
    if (!content.trim()) throw new Error('Aucun texte n’a été trouvé dans ce PDF. Il s’agit probablement d’un document numérisé : utilisez l’OCR local.');
    return {
      outputs: [{ name: outputNameFor(input, 'texte', 'txt'), bytes: new TextEncoder().encode(content), format: 'txt' }],
      warnings: text.scannedPages.length ? [`${text.scannedPages.length} page(s) sans texte détectée(s) : elles n’apparaîtront pas dans le fichier (pages ${text.scannedPages.slice(0, 10).join(', ')}${text.scannedPages.length > 10 ? '…' : ''}).`] : [],
      measurements: [measurement('Caractères extraits', 0, text.characterCount, 'items')],
    };
  },
};

const toMarkdownOperation: Operation = {
  id: 'pdf.to-markdown',
  label: 'Convertir en Markdown',
  description: 'Reconstruit un Markdown à partir du texte du PDF : titres détectés par la taille de police, listes et paragraphes.',
  category: 'pdf-convert',
  nature: 'rebuild',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'md', cardinality: 'one', label: 'un fichier Markdown' },
  params: [
    { id: 'headingLevel', label: 'Détection des titres', kind: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automatique (taille de police)' }, { value: 'none', label: 'Aucune (paragraphes seulement)' }] },
  ],
  limits: ['Les tableaux, colonnes et images ne sont pas reconstruits fidèlement', 'La détection des titres est heuristique'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const text = await extractText(input, params, context);
    const markdown = pagesToMarkdown(text.pages, readText(params, 'headingLevel', 'auto') === 'auto');
    if (!markdown.trim()) throw new Error('Aucun texte n’a été trouvé dans ce PDF : utilisez l’OCR local pour un document numérisé.');
    return {
      outputs: [{ name: outputNameFor(input, 'markdown', 'md'), bytes: new TextEncoder().encode(markdown), format: 'md' }],
      warnings: ['La mise en page d’origine n’est pas reproduite : le Markdown est une reconstruction à partir du texte extrait.'],
      measurements: [measurement('Caractères extraits', 0, text.characterCount, 'items')],
    };
  },
};

const toDocxOperation: Operation = {
  id: 'pdf.to-docx',
  label: 'Convertir en DOCX',
  description: 'Reconstruit un document Word à partir du texte et des images intégrées du PDF.',
  category: 'pdf-convert',
  nature: 'rebuild',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'docx', cardinality: 'one', label: 'un document Word' },
  params: [
    { id: 'includeImages', label: 'Inclure les images du PDF', kind: 'boolean', default: true },
    { id: 'detectHeadings', label: 'Détecter les titres', kind: 'boolean', default: true },
  ],
  limits: [
    'Reconstruction approximative : les colonnes, tableaux, styles et positions exactes ne sont pas conservés',
    'Les images sont insérées à la fin de la page dont elles proviennent',
    'La conversion ne garantit pas une reproduction fidèle d’une mise en page complexe',
  ],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const text = await extractText(input, params, context);
    const blocks: DocxBlock[] = [];
    const detectHeadings = readBoolean(params, 'detectHeadings', true);
    for (const page of text.pages) {
      blocks.push({ type: 'heading', level: 2, text: `Page ${page.pageNumber}` });
      for (const block of pagesToMarkdown([page], detectHeadings).split('\n\n')) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        const heading = /^(#{1,4})\s+(.*)$/u.exec(trimmed);
        if (heading) blocks.push({ type: 'heading', level: Math.min(4, heading[1].length) as 1 | 2 | 3 | 4, text: heading[2] });
        else blocks.push({ type: 'paragraph', text: trimmed.replace(/^[-*]\s+/u, '') });
      }
    }
    let imageCount = 0;
    if (readBoolean(params, 'includeImages', true)) {
      try {
        const extracted = await extractPdfImages(input.bytes);
        for (const image of extracted.images) {
          blocks.push({ type: 'image', bytes: image.bytes, width: image.width || 480, height: image.height || 360, caption: `Image de la page ${image.page}` });
          imageCount += 1;
        }
      } catch {
        context.warn('Les images du PDF n’ont pas pu être extraites ; le document Word contient uniquement le texte.');
      }
    }
    const bytes = writeDocx(blocks, input.name.replace(/\.[^.]+$/u, ''));
    return {
      outputs: [{ name: outputNameFor(input, 'word', 'docx'), bytes, format: 'docx' }],
      warnings: [
        'Conversion reconstruite : la mise en page d’origine n’est pas reproduite fidèlement. Vérifiez le résultat dans votre traitement de texte.',
        ...(imageCount ? [`${imageCount} image(s) intégrée(s).`] : []),
      ],
      measurements: [measurement('Taille', input.size, bytes.length)],
    };
  },
};

const toHtmlOperation: Operation = {
  id: 'pdf.to-html',
  label: 'Convertir en HTML',
  description: 'Produit un fichier HTML autonome à partir du texte du PDF.',
  category: 'pdf-convert',
  nature: 'rebuild',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'html', cardinality: 'one', label: 'un fichier HTML' },
  params: [
    { id: 'headingLevel', label: 'Détection des titres', kind: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automatique' }, { value: 'none', label: 'Aucune' }] },
  ],
  limits: ['Pas de reproduction de la mise en page ; le HTML est un contenu reconstruit, sans script'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const text = await extractText(input, params, context);
    const markdown = pagesToMarkdown(text.pages, readText(params, 'headingLevel', 'auto') === 'auto');
    const html = markdownToHtml(markdown, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'page', 'html'), bytes: new TextEncoder().encode(html), format: 'html' }],
      warnings: ['Le HTML produit est reconstruit à partir du texte ; les images ne sont pas incluses dans ce mode.'],
      measurements: [],
    };
  },
};

const extractImagesOperation: Operation = {
  id: 'pdf.extract-images',
  label: 'Extraire les images du PDF',
  description: 'Récupère les images incorporées : les JPEG sont extraits tels quels, sans réencodage.',
  category: 'pdf-convert',
  nature: 'measure',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'png', cardinality: 'many', label: 'les images incorporées' },
  params: [],
  limits: ['Les filtres exotiques (JPEG 2000, fax) ne sont pas décodés ; Noto les signale'],
  run: async (inputs, _params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const result = await extractPdfImages(input.bytes, {
      onProgress: (value, page) => context.progress({ value, label: `Analyse de la page ${page}…` }),
    });
    if (!result.images.length) {
      throw new Error('Aucune image incorporée n’a été trouvée dans ce PDF. S’il s’agit d’un document numérisé, utilisez « PDF vers images ».');
    }
    return {
      outputs: result.images.map((image, index) => ({
        name: outputNameFor(input, `image-${index + 1}`, image.extension, index + 1, result.images.length),
        bytes: image.bytes,
        format: image.extension === 'jpg' ? 'jpeg' : 'png',
        note: image.note,
      })),
      warnings: result.unsupported.length ? [`Images non prises en charge : ${result.unsupported.slice(0, 5).join(' ; ')}${result.unsupported.length > 5 ? '…' : ''}`] : [],
      measurements: [measurement('Images extraites', 0, result.images.length, 'items')],
    };
  },
};

const imagesToPdfOperation: Operation = {
  id: 'images.to-pdf',
  label: 'Créer un PDF à partir d’images',
  description: 'Compose un PDF où chaque image occupe une page, classique pour numériser un dossier.',
  category: 'pdf-convert',
  nature: 'rebuild',
  inputs: { formats: ['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'ico'], min: 1, max: 200, label: 'une ou plusieurs images' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF' },
  params: [
    { id: 'pageSize', label: 'Format de page', kind: 'select', default: 'a4', options: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'fit', label: 'Ajusté à l’image' }] },
    { id: 'orientation', label: 'Orientation', kind: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automatique' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Paysage' }] },
    { id: 'margin', label: 'Marge (points)', kind: 'number', default: 24, min: 0, max: 120 },
    { id: 'background', label: 'Fond de page', kind: 'color', default: '#ffffff' },
  ],
  limits: ['200 images maximum par PDF', 'Les images animées (GIF/WebP) ne conservent que leur première image'],
  run: async (inputs, params, context) => {
    if (!inputs.length) throw new Error('Ajoutez au moins une image.');
    const prepared: { bytes: Uint8Array; type: 'png' | 'jpg'; name: string }[] = [];
    const warnings: string[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / inputs.length, label: `Préparation de « ${input.name} »…` });
      const converted = await prepareImageForPdf(input, warnings);
      if (converted) prepared.push({ ...converted, name: input.name });
    }
    if (!prepared.length) throw new Error('Aucune image n’a pu être préparée pour le PDF.');
    const bytes = await imagesToPdf(prepared, {
      pageSize: readText(params, 'pageSize', 'a4') as 'a4' | 'letter' | 'fit',
      orientation: readText(params, 'orientation', 'auto') as 'auto' | 'portrait' | 'landscape',
      margin: readNumber(params, 'margin', 24),
      background: readText(params, 'background', '#ffffff'),
      title: inputs[0].name,
    });
    const baseName = commonPrefixBase(inputs.map((input) => input.name));
    return {
      outputs: [{ name: `${baseName}.pdf`, bytes, format: 'pdf' }],
      warnings,
      measurements: [measurement('Images', 0, prepared.length, 'items'), measurement('Taille', inputs.reduce((sum, input) => sum + input.size, 0), bytes.length)],
    };
  },
};

/* ------------------------------------------------------------------ */
/* Annotations                                                        */
/* ------------------------------------------------------------------ */

const watermarkOperation: Operation = {
  id: 'pdf.watermark',
  label: 'Ajouter un filigrane',
  description: 'Ajoute un texte en filigrane (brouillon, confidentiel, copie…) sur les pages choisies.',
  category: 'pdf-annotate',
  nature: 'overlay',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF filigrané' },
  params: [
    { id: 'text', label: 'Texte du filigrane', kind: 'text', default: 'BROUILLON', maxLength: 120 },
    { id: 'fontSize', label: 'Taille de police', kind: 'number', default: 56, min: 8, max: 200 },
    { id: 'color', label: 'Couleur', kind: 'color', default: '#7772d8' },
    { id: 'opacity', label: 'Opacité', kind: 'number', default: 0.18, min: 0.02, max: 1, step: 0.02 },
    { id: 'rotation', label: 'Rotation (degrés)', kind: 'number', default: 45, min: -90, max: 90 },
    { id: 'position', label: 'Position', kind: 'select', default: 'center', options: [{ value: 'center', label: 'Centré' }, { value: 'top-left', label: 'Haut gauche' }, { value: 'top-right', label: 'Haut droite' }, { value: 'bottom-left', label: 'Bas gauche' }, { value: 'bottom-right', label: 'Bas droite' }] },
    { id: 'pages', label: 'Pages', kind: 'text', default: '', placeholder: 'vide = toutes les pages', advanced: true },
    { id: 'font', label: 'Police', kind: 'select', default: 'Helvetica', options: [{ value: 'Helvetica', label: 'Sans serif' }, { value: 'TimesRoman', label: 'Serif' }, { value: 'Courier', label: 'Monospace' }], advanced: true },
  ],
  limits: ['Le filigrane est ajouté par-dessus le contenu existant : il ne remplace pas le texte du document', 'Les caractères hors alphabet latin ne peuvent pas être écrits avec les polices PDF intégrées'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pageCount = await pageCountOf(input.bytes);
    const pages = readText(params, 'pages').trim() ? pageSelection(readText(params, 'pages'), pageCount) : undefined;
    context.progress({ value: 0.4, label: 'Ajout du filigrane…' });
    const { bytes, warning } = await addTextOverlay(input.bytes, {
      text: readText(params, 'text', 'BROUILLON'),
      fontSize: readNumber(params, 'fontSize', 56),
      color: readText(params, 'color', '#7772d8'),
      opacity: readNumber(params, 'opacity', 0.18),
      rotation: readNumber(params, 'rotation', 45),
      position: readText(params, 'position', 'center') as OverlayPosition,
      margin: 36,
      pages,
      font: readText(params, 'font', 'Helvetica') as 'Helvetica' | 'TimesRoman' | 'Courier',
    }, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'filigrane', 'pdf'), bytes, format: 'pdf' }],
      warnings: warning ? [warning] : [],
      measurements: [],
    };
  },
};

const headerFooterOperation: Operation = {
  id: 'pdf.header-footer',
  label: 'Ajouter en-tête et pied de page',
  description: 'Ajoute un en-tête et/ou un pied de page, avec les jetons {page}, {pages}, {date} et {heure}.',
  category: 'pdf-annotate',
  nature: 'overlay',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF avec en-tête et pied de page' },
  params: [
    { id: 'header', label: 'En-tête', kind: 'text', default: '', placeholder: 'Rapport — {date}', maxLength: 160 },
    { id: 'footer', label: 'Pied de page', kind: 'text', default: 'Page {page} sur {pages}', maxLength: 160 },
    { id: 'fontSize', label: 'Taille de police', kind: 'number', default: 9, min: 6, max: 24 },
    { id: 'margin', label: 'Marge (points)', kind: 'number', default: 32, min: 12, max: 120 },
    { id: 'color', label: 'Couleur', kind: 'color', default: '#55576b' },
  ],
  limits: ['Le texte est ajouté par-dessus le contenu : sur un document sans marge, il peut chevaucher le texte existant'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const header = readText(params, 'header');
    const footer = readText(params, 'footer');
    if (!header.trim() && !footer.trim()) throw new Error('Saisissez au moins un en-tête ou un pied de page.');
    context.progress({ value: 0.4, label: 'Ajout des repères de page…' });
    const bytes = await addHeaderFooter(input.bytes, {
      header,
      footer,
      margin: readNumber(params, 'margin', 32),
      fontSize: readNumber(params, 'fontSize', 9),
      color: readText(params, 'color', '#55576b'),
    }, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'entete-pied', 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [],
    };
  },
};

const pageNumbersOperation: Operation = {
  id: 'pdf.page-numbers',
  label: 'Numéroter les pages',
  description: 'Ajoute une numérotation réelle aux pages, avec le format et la position choisis.',
  category: 'pdf-annotate',
  nature: 'overlay',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF numéroté' },
  params: [
    { id: 'format', label: 'Format', kind: 'text', default: 'Page {page} sur {pages}', maxLength: 80 },
    { id: 'position', label: 'Position', kind: 'select', default: 'bottom-center', options: [{ value: 'bottom-center', label: 'Bas centré' }, { value: 'bottom-right', label: 'Bas droite' }, { value: 'top-center', label: 'Haut centré' }, { value: 'top-right', label: 'Haut droite' }] },
    { id: 'startAt', label: 'Commencer à', kind: 'number', default: 1, min: 1, max: 10_000 },
    { id: 'fontSize', label: 'Taille de police', kind: 'number', default: 9, min: 6, max: 24 },
    { id: 'margin', label: 'Marge (points)', kind: 'number', default: 28, min: 8, max: 120 },
    { id: 'color', label: 'Couleur', kind: 'color', default: '#292b3a' },
  ],
  limits: [
    'La numérotation est un calque de texte ajouté par-dessus la page ; elle ne modifie pas la couche de texte d’origine',
    'Elle est figée : un découpage ultérieur ne renumérote pas les pages',
  ],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    context.progress({ value: 0.4, label: 'Numérotation des pages…' });
    const bytes = await numberPdfPages(input.bytes, {
      format: readText(params, 'format', 'Page {page} sur {pages}'),
      position: readText(params, 'position', 'bottom-center') as 'bottom-center' | 'bottom-right' | 'top-center' | 'top-right',
      startAt: Math.round(readNumber(params, 'startAt', 1)),
      fontSize: readNumber(params, 'fontSize', 9),
      margin: readNumber(params, 'margin', 28),
      color: readText(params, 'color', '#292b3a'),
    }, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'numerote', 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [],
    };
  },
};

const signatureOperation: Operation = {
  id: 'pdf.sign-image',
  label: 'Ajouter une signature simple',
  description: 'Appose une image de signature (tracée ou importée) sur la page choisie, avec une mention d’horodatage facultative.',
  category: 'pdf-annotate',
  nature: 'overlay',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF signé' },
  params: [
    { id: 'page', label: 'Page', kind: 'number', default: 1, min: 1, max: 10_000 },
    { id: 'x', label: 'Position horizontale (points depuis la gauche)', kind: 'number', default: 60, min: 0, max: 2_000 },
    { id: 'y', label: 'Position verticale (points depuis le haut)', kind: 'number', default: 120, min: 0, max: 2_000 },
    { id: 'width', label: 'Largeur (points)', kind: 'number', default: 160, min: 20, max: 1_200 },
    { id: 'image', label: 'Image de signature (PNG tracé ou importé)', kind: 'text', default: '', advanced: true },
    { id: 'mention', label: 'Mention ajoutée sous la signature', kind: 'text', default: '', placeholder: 'Signé par … le …', advanced: true },
  ],
  limits: [
    'Signature simple sans valeur juridique qualifiée : Noto n’émet ni certificat ni horodatage opposable',
    'La signature est une image ajoutée par-dessus le document ; elle ne scelle pas cryptographiquement le fichier',
  ],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const dataUrl = readText(params, 'image');
    const match = /^data:image\/(png|jpe?g);base64,(.*)$/u.exec(dataUrl);
    if (!match) throw new Error('Aucune image de signature fournie. Tracez votre signature dans l’outil ou importez une image PNG/JPEG.');
    const binary = typeof atob === 'function' ? atob(match[2]) : '';
    const imageBytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) imageBytes[index] = binary.charCodeAt(index);
    context.progress({ value: 0.3, label: 'Ajout de la signature…' });
    const { embedImageOnPage, addTextOverlay } = await import('../pdf/pdfWrite');
    let bytes = await embedImageOnPage(input.bytes, {
      page: Math.round(readNumber(params, 'page', 1)),
      imageBytes,
      imageType: match[1] === 'png' ? 'png' : 'jpg',
      x: readNumber(params, 'x', 60),
      y: readNumber(params, 'y', 120),
      width: readNumber(params, 'width', 160),
    }, input.name);
    const mention = readText(params, 'mention');
    if (mention.trim()) {
      bytes = (await addTextOverlay(bytes, {
        text: mention,
        fontSize: 9,
        color: '#292b3a',
        opacity: 1,
        rotation: 0,
        position: 'bottom-left',
        margin: 24,
        pages: [Math.round(readNumber(params, 'page', 1))],
      })).bytes;
    }
    return {
      outputs: [{ name: outputNameFor(input, 'signe', 'pdf'), bytes, format: 'pdf' }],
      warnings: ['Signature simple ajoutée : elle n’a pas de valeur juridique qualifiée et ne protège pas le document contre une modification ultérieure.'],
      measurements: [],
    };
  },
};

/* ------------------------------------------------------------------ */
/* Sécurité et formulaires                                            */
/* ------------------------------------------------------------------ */

const metadataReadOperation: Operation = {
  id: 'pdf.metadata-read',
  label: 'Lire les métadonnées',
  description: 'Affiche les informations réelles du PDF : titre, auteur, taille des pages, version, formulaires, signatures, chiffrement.',
  category: 'pdf-secure',
  nature: 'measure',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'report', cardinality: 'one', label: 'un rapport affiché dans Noto' },
  params: [],
  limits: [
    'Noto lit les métadonnées déclarées dans le fichier : elles peuvent être absentes, incomplètes ou inexactes',
    'Aucune donnée n’est devinée ni envoyée : l’analyse reste locale',
  ],
  run: async (inputs, _params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pdf = await openPdf(input.bytes, { password: context.password, signal: context.signal });
    try {
      const info = await readPdfInfo(pdf);
      const fonts = readPdfFontNames(input.bytes);
      const rows: string[][] = [
        ['Information', 'Valeur'],
        ['Pages', String(info.pageCount)],
        ['Titre', info.title ?? '—'],
        ['Auteur', info.author ?? '—'],
        ['Sujet', info.subject ?? '—'],
        ['Mots-clés', info.keywords ?? '—'],
        ['Créé par', info.creator ?? '—'],
        ['Produit par', info.producer ?? '—'],
        ['Version PDF', info.pdfVersion ?? '—'],
        ['Chiffré', info.encrypted ? 'oui' : 'non'],
        ['Formulaire', info.hasAcroForm ? 'oui' : 'non'],
        ['Signatures détectées', info.hasSignatures ? 'oui' : 'non'],
        ['Linéarisé (démarrage rapide web)', info.linearized ? 'oui' : 'non'],
        ['Polices', fonts.length ? fonts.slice(0, 12).join(', ') : 'non identifiées'],
      ];
      const sizes = new Set(info.pageSizes.map((size) => `${Math.round(size.width)} × ${Math.round(size.height)}`));
      return {
        outputs: [],
        warnings: info.encrypted ? ['Ce PDF est chiffré : son contenu peut être limité par les autorisations du document.'] : [],
        measurements: [measurement('Pages', 0, info.pageCount, 'pages')],
        report: {
          title: `Métadonnées de ${input.name}`,
          summary: `Document de ${info.pageCount} page(s), ${sizes.size} format(s) de page différent(s).`,
          sections: [
            { title: 'Informations', lines: [], table: rows },
            { title: 'Formats de page', lines: [...sizes].map((size) => `${size} points`) },
          ],
        },
      };
    } finally {
      await pdf.destroy();
    }
  },
};

const metadataWriteOperation: Operation = {
  id: 'pdf.metadata-write',
  label: 'Modifier les métadonnées',
  description: 'Renseigne le titre, l’auteur, le sujet et les mots-clés du document.',
  category: 'pdf-secure',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF mis à jour' },
  params: [
    { id: 'title', label: 'Titre', kind: 'text', default: '', maxLength: 200 },
    { id: 'author', label: 'Auteur', kind: 'text', default: '', maxLength: 200 },
    { id: 'subject', label: 'Sujet', kind: 'text', default: '', maxLength: 200 },
    { id: 'keywords', label: 'Mots-clés (séparés par des virgules)', kind: 'text', default: '', maxLength: 200 },
  ],
  limits: ['Les métadonnées XMP d’origine ne sont pas conservées : le fichier est réécrit'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    context.progress({ value: 0.4, label: 'Mise à jour des métadonnées…' });
    const bytes = await updatePdfMetadata(input.bytes, {
      title: readText(params, 'title'),
      author: readText(params, 'author'),
      subject: readText(params, 'subject'),
      keywords: readText(params, 'keywords'),
    }, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'metadonnees', 'pdf'), bytes, format: 'pdf' }],
      warnings: [],
      measurements: [],
    };
  },
};

const metadataStripOperation: Operation = {
  id: 'pdf.metadata-strip',
  label: 'Supprimer les métadonnées',
  description: 'Retire le titre, l’auteur, le logiciel d’origine et les dates du fichier.',
  category: 'pdf-secure',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF nettoyé' },
  params: [],
  limits: ['Les traces visibles dans le contenu (en-têtes, pieds de page, textes) restent présentes : elles ne sont pas des métadonnées'],
  run: async (inputs, _params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    context.progress({ value: 0.4, label: 'Suppression des métadonnées…' });
    const bytes = await stripPdfMetadata(input.bytes, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'sans-metadonnees', 'pdf'), bytes, format: 'pdf' }],
      warnings: ['Vérifiez le résultat : les informations visibles dans les pages (nom, dates imprimées) ne sont pas retirées par cette opération.'],
      measurements: [],
    };
  },
};

const formListOperation: Operation = {
  id: 'pdf.form-list',
  label: 'Lister les champs de formulaire',
  description: 'Affiche les champs remplissables du PDF et leurs valeurs actuelles.',
  category: 'pdf-secure',
  nature: 'measure',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'report', cardinality: 'one', label: 'un rapport affiché dans Noto' },
  params: [],
  limits: ['Noto lit les champs de formulaire standards (texte, cases à cocher, listes, boutons radio)'],
  run: async (inputs, _params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    context.progress({ value: 0.5, label: 'Lecture des champs…' });
    const fields = await listPdfFormFields(input.bytes, input.name);
    if (!fields.length) {
      return {
        outputs: [],
        warnings: ['Ce PDF ne contient aucun champ de formulaire remplissable.'],
        measurements: [],
        report: { title: `Formulaires de ${input.name}`, summary: 'Aucun champ trouvé.', sections: [] },
      };
    }
    return {
      outputs: [],
      warnings: [],
      measurements: [measurement('Champs', 0, fields.length, 'items')],
      report: {
        title: `Formulaires de ${input.name}`,
        summary: `${fields.length} champ(s) trouvé(s).`,
        sections: [{
          title: 'Champs',
          lines: [],
          table: [['Champ', 'Type', 'Valeur actuelle'], ...fields.map((field) => [field.name, field.type, field.value || '—'])],
        }],
      },
    };
  },
};

const formFillOperation: Operation = {
  id: 'pdf.form-fill',
  label: 'Remplir un formulaire',
  description: 'Renseigne les champs du formulaire PDF à partir d’une liste « champ = valeur ».',
  category: 'pdf-secure',
  nature: 'native',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF rempli' },
  params: [
    { id: 'values', label: 'Valeurs (une par ligne : champ = valeur)', kind: 'text', default: '', placeholder: 'Nom = Dupont\nDate = 13/10/2026' },
  ],
  limits: ['Les champs calculés ou protégés en écriture ne peuvent pas être modifiés'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const values = parseFieldValues(readText(params, 'values'));
    if (!Object.keys(values).length) throw new Error('Aucune valeur saisie. Utilisez une ligne par champ : « Nom = Dupont ».');
    context.progress({ value: 0.5, label: 'Remplissage du formulaire…' });
    const result = await fillPdfFormFields(input.bytes, values, input.name);
    return {
      outputs: [{ name: outputNameFor(input, 'rempli', 'pdf'), bytes: result.bytes, format: 'pdf', note: `${result.applied.length} champ(s) rempli(s)` }],
      warnings: result.skipped.length ? [`Champs ignorés (introuvables ou non modifiables) : ${result.skipped.join(', ')}`] : [],
      measurements: [measurement('Champs remplis', 0, result.applied.length, 'items')],
    };
  },
};

function parseFieldValues(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of source.split('\n')) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) values[key] = value;
  }
  return values;
}

const redactOperation: Operation = {
  id: 'pdf.redact',
  label: 'Caviarder (suppression réelle)',
  description: 'Retire réellement le contenu sensible : les pages concernées sont rendues en image sans leur couche texte, puis le fichier est vérifié.',
  category: 'pdf-secure',
  nature: 'rebuild',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF caviardé et vérifié' },
  params: [
    { id: 'searchTexts', label: 'Textes à supprimer (un par ligne)', kind: 'text', default: '', maxLength: 4_000, placeholder: 'IBAN FR76…\nMarie Dupont' },
    { id: 'regions', label: 'Zones sélectionnées (interne)', kind: 'text', default: '', advanced: true },
    { id: 'dpi', label: 'Résolution de rendu', kind: 'number', default: 200, min: 72, max: 400, advanced: true },
    { id: 'quality', label: 'Qualité JPEG', kind: 'number', default: 0.85, min: 0.4, max: 1, step: 0.05, advanced: true },
  ],
  limits: [
    'Les pages caviardées perdent leur couche texte d’origine : c’est ce qui garantit la suppression réelle',
    'Noto relit le fichier produit et signale tout texte qui n’aurait pas disparu ; il ne peut pas garantir l’absence de contenu caché dans des objets inutilisés',
  ],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const searchTexts = readText(params, 'searchTexts').split('\n').map((line) => line.trim()).filter(Boolean);
    const regions = parseRegions(readText(params, 'regions'));
    if (!searchTexts.length && !regions.length) {
      throw new Error('Indiquez au moins un texte à supprimer ou une zone à caviarder.');
    }
    context.progress({ value: 0.05, label: 'Analyse des pages…' });
    const result = await redactPdf(input.bytes, { regions, searchTexts }, {
      dpi: readNumber(params, 'dpi', 200),
      quality: readNumber(params, 'quality', 0.85),
      signal: context.signal,
      onProgress: (value) => context.progress({ value: 0.05 + value * 0.85, label: 'Caviardage et reconstruction…' }),
      password: context.password,
    });
    const warnings = [
      'Le contenu sensible a été supprimé du fichier produit (les pages concernées ne contiennent plus le texte d’origine).',
      result.verification.verified
        ? `Vérification réussie : ${result.verification.checkedTexts.length} texte(s) recherché(s) et absent(s) du fichier produit.`
        : `ATTENTION : ${result.verification.remainingTexts.join(', ')} semble(nt) encore présent(s) dans le fichier produit. Ne diffusez pas ce document avant vérification.`,
    ];
    return {
      outputs: [{ name: outputNameFor(input, 'caviarde', 'pdf'), bytes: result.bytes, format: 'pdf', note: `${result.removedRegions} zone(s) traitée(s)` }],
      warnings,
      measurements: [measurement('Zones caviardées', 0, result.removedRegions, 'items'), measurement('Taille', input.size, result.bytes.length)],
      report: {
        title: `Caviardage de ${input.name}`,
        summary: result.verification.verified ? 'Suppression vérifiée par relecture du fichier produit.' : 'Vérification incomplète : certains textes subsistent.',
        sections: [{
          title: 'Vérification',
          lines: [
            `Méthode : ${result.verification.method}`,
            `Textes recherchés : ${result.verification.checkedTexts.join(', ') || '—'}`,
            `Textes encore présents : ${result.verification.remainingTexts.join(', ') || 'aucun'}`,
          ],
        }],
      },
    };
  },
};

function parseRegions(source: string): { page: number; x: number; y: number; width: number; height: number }[] {
  if (!source.trim()) return [];
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const region = entry as Record<string, unknown>;
      const page = Number(region.page);
      const x = Number(region.x);
      const y = Number(region.y);
      const width = Number(region.width);
      const height = Number(region.height);
      if (![page, x, y, width, height].every((value) => Number.isFinite(value)) || width <= 0 || height <= 0 || page < 1) return [];
      return [{ page, x, y, width, height }];
    });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Analyse et comparaison                                             */
/* ------------------------------------------------------------------ */

const analyzeOperation: Operation = {
  id: 'pdf.analyze',
  label: 'Analyser la qualité du PDF',
  description: 'Contrôle réel du document : pages, formats, polices, pages blanches, pages numérisées, chiffrement, formulaires.',
  category: 'compare',
  nature: 'measure',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'report', cardinality: 'one', label: 'un rapport affiché dans Noto' },
  params: [],
  limits: ['La détection des pages blanches s’appuie sur le texte et les opérations de dessin : une page très peu décorée peut être signalée à tort'],
  run: async (inputs, _params, context) => {
    ensurePdfInputs(inputs);
    const input = inputs[0];
    const pdf = await openPdf(input.bytes, { password: context.password, signal: context.signal });
    try {
      const info = await readPdfInfo(pdf);
      const analysis = await analyzePdfPages(pdf, {
        signal: context.signal,
        onProgress: (value) => context.progress({ value: value * 0.8, label: 'Analyse des pages…' }),
      });
      const fonts = readPdfFontNames(input.bytes);
      const blank = analysis.filter((page) => page.blank).map((page) => page.pageNumber);
      const scanned = analysis.filter((page) => page.scanned).map((page) => page.pageNumber);
      const sizes = new Map<string, number>();
      for (const page of analysis) {
        const key = `${Math.round(page.width)} × ${Math.round(page.height)} pt`;
        sizes.set(key, (sizes.get(key) ?? 0) + 1);
      }
      const warnings: string[] = [];
      if (scanned.length) warnings.push(`${scanned.length} page(s) semblent numérisées (sans texte) : l’OCR local peut créer une couche de texte interrogeable.`);
      if (blank.length) warnings.push(`${blank.length} page(s) vide(s) détectée(s) : pages ${blank.slice(0, 10).join(', ')}${blank.length > 10 ? '…' : ''}.`);
      if (info.encrypted) warnings.push('Document chiffré : certaines fonctions de modification sont indisponibles.');
      if (!fonts.length) warnings.push('Aucune police intégrée identifiée : le texte peut dépendre de polices absentes à l’impression.');
      return {
        outputs: [],
        warnings,
        measurements: [measurement('Pages', 0, info.pageCount, 'pages'), measurement('Pages numérisées', 0, scanned.length, 'pages')],
        report: {
          title: `Analyse de ${input.name}`,
          summary: `${info.pageCount} page(s), ${scanned.length} numérisée(s), ${blank.length} vide(s).`,
          sections: [
            { title: 'Synthèse', lines: [], table: [
              ['Indicateur', 'Valeur'],
              ['Pages', String(info.pageCount)],
              ['Pages numérisées', scanned.length ? `${scanned.length} (${scanned.slice(0, 12).join(', ')}${scanned.length > 12 ? '…' : ''})` : 'aucune'],
              ['Pages vides', blank.length ? `${blank.length} (${blank.slice(0, 12).join(', ')})` : 'aucune'],
              ['Chiffrement', info.encrypted ? 'oui' : 'non'],
              ['Formulaire', info.hasAcroForm ? 'oui' : 'non'],
              ['Signatures détectées', info.hasSignatures ? 'oui' : 'non'],
              ['Polices', fonts.slice(0, 10).join(', ') || 'non identifiées'],
            ] },
            { title: 'Formats de page', lines: [...sizes].map(([size, count]) => `${size} : ${count} page(s)`) },
          ],
        },
      };
    } finally {
      await pdf.destroy();
    }
  },
};

const compareOperation: Operation = {
  id: 'pdf.compare',
  label: 'Comparer deux PDF',
  description: 'Compare le texte page par page et, si demandé, le rendu visuel ; les pages ajoutées ou supprimées sont signalées.',
  category: 'compare',
  nature: 'measure',
  inputs: { formats: ['pdf'], min: 2, max: 2, label: 'deux PDF (référence puis version modifiée)' },
  output: { format: 'report', cardinality: 'one', label: 'un rapport de comparaison' },
  params: [
    { id: 'mode', label: 'Type de comparaison', kind: 'select', default: 'text', options: [{ value: 'text', label: 'Texte (rapide)' }, { value: 'visual', label: 'Visuel (rendu des pages)' }, { value: 'both', label: 'Texte et visuel' }] },
    { id: 'dpi', label: 'Résolution du rendu visuel', kind: 'number', default: 96, min: 72, max: 200 },
  ],
  limits: ['La comparaison visuelle est un pourcentage de pixels différents, pas une preuve juridique', 'Les images de différences sont fournies pour la première page modifiée'],
  run: async (inputs, params, context) => {
    ensurePdfInputs(inputs, 2);
    const [left, right] = inputs;
    const mode = readText(params, 'mode', 'text');
    const sections: { title: string; lines: string[]; table?: string[][] }[] = [];
    const warnings: string[] = [];
    const measurements = [];
    const artifacts: OperationOutput[] = [];

    if (mode === 'text' || mode === 'both') {
      const leftText = await extractText(left, {}, context);
      const rightText = await extractText(right, {}, context);
      const { compareTextLines } = await import('../textDiff');
      const pageCount = Math.max(leftText.pageCount, rightText.pageCount);
      const rows: string[][] = [['Page', 'État', 'Lignes ajoutées', 'Lignes supprimées', 'Lignes modifiées']];
      let identical = 0;
      for (let page = 1; page <= pageCount; page += 1) {
        context.progress({ value: 0.1 + (page / pageCount) * 0.5, label: `Comparaison de la page ${page}…` });
        const leftPage = leftText.pages.find((entry) => entry.pageNumber === page)?.text ?? '';
        const rightPage = rightText.pages.find((entry) => entry.pageNumber === page)?.text ?? '';
        if (!leftPage && rightPage) {
          rows.push([String(page), 'page ajoutée', String(rightPage.split('\n').length), '0', '0']);
          continue;
        }
        if (leftPage && !rightPage) {
          rows.push([String(page), 'page supprimée', '0', String(leftPage.split('\n').length), '0']);
          continue;
        }
        const diff = compareTextLines(leftPage, rightPage);
        if (diff.additions === 0 && diff.deletions === 0 && diff.changes === 0) identical += 1;
        rows.push([String(page), diff.additions === 0 && diff.deletions === 0 && diff.changes === 0 ? 'identique' : 'modifiée', String(diff.additions), String(diff.deletions), String(diff.changes)]);
      }
      sections.push({ title: 'Comparaison du texte', lines: [`${identical} page(s) identique(s) sur ${pageCount}.`], table: rows });
      measurements.push(measurement('Pages identiques', pageCount, identical, 'pages'));
      if (leftText.scannedPages.length || rightText.scannedPages.length) {
        warnings.push('Au moins un des documents contient des pages numérisées : leur comparaison porte sur le texte disponible.');
      }
    }

    if (mode === 'visual' || mode === 'both') {
      context.progress({ value: 0.65, label: 'Comparaison visuelle…' });
      const comparison = await comparePdfVisually(left.bytes, right.bytes, {
        dpi: readNumber(params, 'dpi', 96),
        signal: context.signal,
        onProgress: (value) => context.progress({ value: 0.65 + value * 0.3, label: 'Rendu des pages…' }),
        maxOverlayPages: 1,
      });
      sections.push({
        title: 'Comparaison visuelle',
        lines: [
          `${comparison.identicalPages} page(s) visuellement identique(s), ${comparison.differentPages} page(s) différente(s).`,
          'La différence indiquée est un pourcentage de pixels modifiés au rendu, à comparer avec prudence.',
        ],
        table: [['Page', 'Différence', 'Remarque'], ...comparison.pages.slice(0, 60).map((page) => [String(page.page), `${page.differencePercent} %`, page.note ?? ''])],
      });
      if (comparison.overlay) {
        artifacts.push({ name: `${left.name.replace(/\.[^.]+$/u, '')}-differences.png`, bytes: comparison.overlay, format: 'png', note: 'Image des différences de la première page modifiée' });
      }
      measurements.push(measurement('Pages visuellement identiques', comparison.pageCount, comparison.identicalPages, 'pages'));
    }

    return {
      outputs: [],
      warnings,
      measurements,
      report: {
        title: `Comparaison : ${left.name} ↔ ${right.name}`,
        summary: `Comparaison en mode ${mode === 'both' ? 'texte et visuel' : mode === 'visual' ? 'visuel' : 'texte'}.`,
        sections,
        artifacts,
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Aides internes                                                     */
/* ------------------------------------------------------------------ */

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  const pdf = await openPdf(bytes);
  try {
    return pdf.numPages;
  } finally {
    await pdf.destroy();
  }
}

async function extractPageBytes(bytes: Uint8Array, pages: number[], name: string): Promise<Uint8Array> {
  const { extractPages } = await import('../pdf/pdfWrite');
  return extractPages(bytes, pages, name);
}

async function extractText(input: OperationInput, params: ParamValues, context: OperationContext) {
  const pdf = await openPdf(input.bytes, { password: context.password, signal: context.signal });
  try {
    const pagesParameter = readText(params, 'pages');
    const pages = pagesParameter.trim() ? pageSelection(pagesParameter, pdf.numPages) : undefined;
    return await readDocumentText(pdf, {
      pages,
      signal: context.signal,
      onProgress: (value, page) => context.progress({ value: value * 0.9, label: `Lecture de la page ${page}…` }),
    });
  } catch (error) {
    throw toPdfReadError(error);
  } finally {
    await pdf.destroy();
  }
}

export function pagesToMarkdown(pages: { pageNumber: number; text: string; items: { text: string; x: number; y: number; width: number; height: number; fontSize: number }[] }[], detectHeadings: boolean): string {
  const lines: string[] = [];
  for (const page of pages) {
    const sizes = page.items.map((item) => item.fontSize).filter((size) => size > 0).sort((left, right) => left - right);
    const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 12;
    for (const paragraph of page.text.split('\n')) {
      const trimmed = paragraph.trim();
      if (!trimmed) {
        lines.push('');
        continue;
      }
      if (!detectHeadings) {
        lines.push(trimmed);
        continue;
      }
      const matching = page.items.filter((item) => item.text.trim() && trimmed.includes(item.text.trim().slice(0, 20)));
      const size = matching.length ? Math.max(...matching.map((item) => item.fontSize)) : median;
      const ratio = median > 0 ? size / median : 1;
      if (ratio >= 1.6 && trimmed.length < 120) lines.push(`## ${trimmed}`);
      else if (ratio >= 1.25 && trimmed.length < 120) lines.push(`### ${trimmed}`);
      else if (/^[•·▪-]\s*/u.test(trimmed) || /^\d+[.)]\s+/u.test(trimmed)) lines.push(trimmed.replace(/^[•·▪]\s*/u, '- '));
      else lines.push(trimmed);
    }
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

function markdownToHtml(markdown: string, title: string): string {
  const escape = (value: string) => value.replace(/[&<>"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] ?? character));
  const body: string[] = [];
  let inList = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/u.exec(line);
    if (heading) {
      if (inList) {
        body.push('</ul>');
        inList = false;
      }
      const level = heading[1].length + 1;
      body.push(`<h${level}>${escape(heading[2])}</h${level}>`);
      continue;
    }
    const item = /^[-*]\s+(.*)$/u.exec(line);
    if (item) {
      if (!inList) {
        body.push('<ul>');
        inList = true;
      }
      body.push(`<li>${escape(item[1])}</li>`);
      continue;
    }
    if (!line.trim()) {
      if (inList) {
        body.push('</ul>');
        inList = false;
      }
      continue;
    }
    if (inList) {
      body.push('</ul>');
      inList = false;
    }
    body.push(`<p>${escape(line)}</p>`);
  }
  if (inList) body.push('</ul>');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:'Segoe UI',system-ui,sans-serif;line-height:1.6;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#292b3a}li{margin:.2rem 0}</style>
</head>
<body>
${body.join('\n')}
</body>
</html>`;
}

async function prepareImageForPdf(input: OperationInput, warnings: string[]): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' } | null> {
  const isPng = input.bytes[0] === 0x89 && input.bytes[1] === 0x50;
  const isJpeg = input.bytes[0] === 0xff && input.bytes[1] === 0xd8;
  if (isJpeg) return { bytes: input.bytes, type: 'jpg' };
  if (isPng) return { bytes: input.bytes, type: 'png' };
  // Les autres formats sont redessinés en PNG sans perte via le canevas local.
  try {
    const { decodeImage, canvasToBytes } = await import('../image/imageEngine');
    const { canvas } = await decodeImage(input.bytes, { name: input.name, format: input.format });
    const bytes = await canvasToBytes(canvas, { format: 'png', quality: 1 });
    canvas.width = 0;
    canvas.height = 0;
    warnings.push(`« ${input.name} » (${input.format}) a été converti en PNG sans perte pour être intégré au PDF.`);
    return { bytes, type: 'png' };
  } catch (error) {
    warnings.push(`« ${input.name} » n’a pas pu être intégré : ${(error as Error).message}`);
    return null;
  }
}

export const PDF_OPERATIONS: Operation[] = [
  mergeOperation,
  splitOperation,
  extractOperation,
  removeOperation,
  rotateOperation,
  reorderOperation,
  duplicateOperation,
  insertOperation,
  imposeOperation,
  compressOperation,
  toImagesOperation,
  toTextOperation,
  toMarkdownOperation,
  toDocxOperation,
  toHtmlOperation,
  extractImagesOperation,
  imagesToPdfOperation,
  watermarkOperation,
  headerFooterOperation,
  pageNumbersOperation,
  signatureOperation,
  metadataReadOperation,
  metadataWriteOperation,
  metadataStripOperation,
  formListOperation,
  formFillOperation,
  redactOperation,
  analyzeOperation,
  compareOperation,
];
