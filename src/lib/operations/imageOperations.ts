import { buildOutputName, commonPrefixBase } from '../jobs/naming';
import { formatSize } from '../jobs/output';
import { canEncode, canvasToBytes, compareCanvases, decodeImage, drawSheet, hammingDistance, looksAnimated, perceptualHash, sheetSize, targetSize, tileRegions, applyTransform, type ImageTransform } from '../image/imageEngine';
import { metadataToLines, readImageMetadata } from '../image/imageMetadata';
import type { FormatId } from '../documents/formats';
import { familyOf } from '../documents/formats';
import type { Operation, OperationInput, OperationOutput } from './types';
import { readBoolean, readNumber, readText } from './types';

/**
 * Opérations image de Noto.
 *
 * Toutes les opérations passent par le canevas du moteur local et écrivent de
 * nouveaux fichiers : les images d’origine ne sont jamais modifiées. Les
 * formats d’écriture réellement disponibles sont testés avant l’annonce du
 * résultat (`canEncode`).
 */

const IMAGE_FORMATS: FormatId[] = ['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'ico'];

const FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG — sans perte, transparence' },
  { value: 'jpeg', label: 'JPEG — léger, pas de transparence' },
  { value: 'webp', label: 'WebP — moderne, transparence' },
  { value: 'bmp', label: 'BMP — sans compression, volumineux' },
  { value: 'ico', label: 'ICO — icône Windows (PNG encapsulé 256 px)' },
];

function ensureImageInputs(inputs: OperationInput[]): void {
  if (!inputs.length) throw new Error('Ajoutez au moins une image.');
  for (const input of inputs) {
    if (familyOf(input.format) !== 'image') throw new Error(`« ${input.name} » n’est pas une image reconnue.`);
  }
}

function imageName(input: OperationInput, suffix: string, targetExtension: string, index = 1, total = 1, template = ''): string {
  return buildOutputName({ template, sourceName: input.name, index, total, suffix, targetExtension });
}

function imageMeasurements(inputs: OperationInput[], outputs: OperationOutput[]) {
  const before = inputs.reduce((sum, input) => sum + input.size, 0);
  const after = outputs.reduce((sum, output) => sum + output.bytes.length, 0);
  return [{ label: 'Taille', before, after, unit: 'bytes' as const }];
}

function resizeFromParams(params: Record<string, string | number | boolean>): ImageTransform['resize'] {
  const preset = readText(params, 'resize', 'none');
  if (preset === 'none') return undefined;
  if (preset === 'custom') {
    const width = readNumber(params, 'width', 0);
    const height = readNumber(params, 'height', 0);
    if (!width && !height) return undefined;
    return { width: width || undefined, height: height || undefined, mode: readText(params, 'fit', 'fit') as 'fit' | 'cover' | 'exact' };
  }
  const presets: Record<string, { width?: number; height?: number; mode: 'fit' | 'cover' }> = {
    web: { width: 1600, height: 1600, mode: 'fit' },
    mail: { width: 1280, height: 1280, mode: 'fit' },
    thumbnail: { width: 320, height: 320, mode: 'fit' },
    square: { width: 1080, height: 1080, mode: 'cover' },
    print: { width: 2480, height: 3508, mode: 'fit' },
  };
  return presets[preset];
}

const convertOperation: Operation = {
  id: 'image.convert',
  label: 'Convertir des images',
  description: 'Change le format réel des images, avec réglage de la qualité et du redimensionnement.',
  category: 'image-convert',
  nature: 'rebuild',
  inputs: { formats: IMAGE_FORMATS, min: 1, max: 500, label: 'une ou plusieurs images' },
  output: { format: 'png', cardinality: 'per-input', label: 'une image par entrée' },
  params: [
    { id: 'format', label: 'Format de sortie', kind: 'select', default: 'webp', options: FORMAT_OPTIONS },
    { id: 'quality', label: 'Qualité (JPEG/WebP)', kind: 'number', default: 0.9, min: 0.3, max: 1, step: 0.05 },
    { id: 'resize', label: 'Redimensionnement', kind: 'select', default: 'none', options: [
      { value: 'none', label: 'Conserver les dimensions' },
      { value: 'web', label: 'Web — 1600 px maximum' },
      { value: 'mail', label: 'E-mail — 1280 px maximum' },
      { value: 'thumbnail', label: 'Miniature — 320 px' },
      { value: 'square', label: 'Carré — 1080 × 1080' },
      { value: 'print', label: 'Impression — A4 à 300 ppp' },
      { value: 'custom', label: 'Dimensions personnalisées' },
    ] },
    { id: 'width', label: 'Largeur (px)', kind: 'number', default: 0, min: 0, max: 20_000, advanced: true },
    { id: 'height', label: 'Hauteur (px)', kind: 'number', default: 0, min: 0, max: 20_000, advanced: true },
    { id: 'fit', label: 'Mode de redimensionnement', kind: 'select', default: 'fit', options: [{ value: 'fit', label: 'Respecter les proportions' }, { value: 'cover', label: 'Remplir (rognage centré)' }, { value: 'exact', label: 'Étirer (proportions libres)' }], advanced: true },
    { id: 'background', label: 'Fond si transparence', kind: 'color', default: '#ffffff', advanced: true },
  ],
  limits: [
    'GIF et WebP animés : seule la première image est réencodée (Noto l’annonce et conserve l’original)',
    'TIFF multipage : seule la première page est traitée',
  ],
  run: async (inputs, params, context) => {
    ensureImageInputs(inputs);
    const format = readText(params, 'format', 'webp') as FormatId;
    if (!canEncode(format)) {
      throw new Error(`Ce moteur ne sait pas encoder le format ${format.toUpperCase()}. Choisissez PNG, JPEG ou WebP.`);
    }
    const quality = readNumber(params, 'quality', 0.9);
    const resize = resizeFromParams(params);
    const outputs: OperationOutput[] = [];
    const warnings: string[] = [];
    const extension = format === 'jpeg' ? 'jpg' : format;
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / inputs.length, label: `Conversion de « ${input.name} »…` });
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      if (decoded.truncated) {
        warnings.push(`« ${input.name} » contient plusieurs images (animation ou multipage) : seule la première a été convertie. L’original n’a pas été modifié.`);
      }
      const canvas = resize || format === 'jpeg'
        ? applyTransform(decoded.canvas, { resize, background: format === 'jpeg' ? readText(params, 'background', '#ffffff') : undefined })
        : decoded.canvas;
      const bytes = await canvasToBytes(canvas, { format, quality, background: readText(params, 'background', '#ffffff') });
      if (canvas !== decoded.canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      decoded.canvas.width = 0;
      decoded.canvas.height = 0;
      outputs.push({
        name: imageName(input, `converti`, extension, index + 1, inputs.length),
        bytes,
        format,
        note: `${decoded.width} × ${decoded.height} → ${targetSize(decoded.width, decoded.height, resize ?? { mode: 'fit' }).width} × ${targetSize(decoded.width, decoded.height, resize ?? { mode: 'fit' }).height}`,
      });
    }
    return { outputs, warnings, measurements: imageMeasurements(inputs, outputs) };
  },
};

const optimizeOperation: Operation = {
  id: 'image.optimize',
  label: 'Optimiser des images',
  description: 'Allège les images en ajustant qualité et dimensions, sans changer de format quand c’est possible.',
  category: 'image-convert',
  nature: 'rebuild',
  inputs: { formats: IMAGE_FORMATS, min: 1, max: 500, label: 'une ou plusieurs images' },
  output: { format: 'same', cardinality: 'per-input', label: 'une image allégée par entrée' },
  params: [
    { id: 'preset', label: 'Objectif', kind: 'select', default: 'balanced', options: [
      { value: 'quality', label: 'Qualité maximale (réencodage léger)' },
      { value: 'balanced', label: 'Équilibré — web et partage' },
      { value: 'small', label: 'Poids minimal — vignettes et aperçus' },
    ] },
    { id: 'maxDimension', label: 'Dimension maximale (px)', kind: 'number', default: 2560, min: 200, max: 20_000 },
    { id: 'convertPng', label: 'Convertir les PNG en WebP', kind: 'boolean', default: false, help: 'Le WebP est bien plus léger, mais tous les logiciels ne l’ouvrent pas.', advanced: true },
  ],
  limits: ['Une image déjà optimisée peut ne pas diminuer ; la taille réelle est affichée', 'La transparence est conservée en PNG et WebP, perdue en JPEG'],
  run: async (inputs, params, context) => {
    ensureImageInputs(inputs);
    const preset = readText(params, 'preset', 'balanced');
    const quality = preset === 'quality' ? 0.94 : preset === 'small' ? 0.62 : 0.82;
    const maxDimension = readNumber(params, 'maxDimension', 2560);
    const outputs: OperationOutput[] = [];
    const warnings: string[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / inputs.length, label: `Optimisation de « ${input.name} »…` });
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      const animated = looksAnimated(input.bytes, input.format) || decoded.truncated;
      const targetFormat: FormatId = input.format === 'png' && readBoolean(params, 'convertPng')
        ? 'webp'
        : input.format === 'jpeg' || input.format === 'webp'
          ? input.format
          : 'png';
      if (!canEncode(targetFormat)) throw new Error(`Le format ${targetFormat.toUpperCase()} n’est pas disponible à l’écriture dans ce moteur.`);
      const resize = decoded.width > maxDimension || decoded.height > maxDimension
        ? { width: maxDimension, height: maxDimension, mode: 'fit' as const }
        : undefined;
      const canvas = applyTransform(decoded.canvas, { resize });
      const bytes = await canvasToBytes(canvas, { format: targetFormat, quality });
      canvas.width = 0;
      canvas.height = 0;
      decoded.canvas.width = 0;
      decoded.canvas.height = 0;
      const saved = input.size - bytes.length;
      if (saved <= 0) warnings.push(`« ${input.name} » n’a pas pu être allégé (${formatSize(Math.abs(saved))} de plus). Le niveau « Poids minimal » peut aider.`);
      if (animated) warnings.push(`« ${input.name} » est animé : l’optimisation a produit une image fixe, l’original reste disponible.`);
      outputs.push({
        name: imageName(input, 'optimise', targetFormat === 'jpeg' ? 'jpg' : targetFormat, index + 1, inputs.length),
        bytes,
        format: targetFormat,
        note: saved > 0 ? `${formatSize(saved)} économisés` : 'Aucun gain',
      });
    }
    return { outputs, warnings, measurements: imageMeasurements(inputs, outputs) };
  },
};

const editOperation: Operation = {
  id: 'image.edit',
  label: 'Modifier une image',
  description: 'Rotation, retournement, recadrage, redimensionnement, réglages de couleur, bordure et filigrane.',
  category: 'image-edit',
  nature: 'rebuild',
  inputs: { formats: IMAGE_FORMATS, min: 1, max: 200, label: 'une ou plusieurs images' },
  output: { format: 'same', cardinality: 'per-input', label: 'une image modifiée par entrée' },
  params: [
    { id: 'rotate', label: 'Rotation', kind: 'select', default: '0', options: [{ value: '0', label: 'Aucune' }, { value: '90', label: '90° droite' }, { value: '180', label: '180°' }, { value: '270', label: '90° gauche' }] },
    { id: 'flipHorizontal', label: 'Retourner horizontalement', kind: 'boolean', default: false },
    { id: 'flipVertical', label: 'Retourner verticalement', kind: 'boolean', default: false },
    { id: 'cropX', label: 'Recadrage : marge gauche (‰)', kind: 'number', default: 0, min: 0, max: 900, advanced: true },
    { id: 'cropY', label: 'Recadrage : marge haute (‰)', kind: 'number', default: 0, min: 0, max: 900, advanced: true },
    { id: 'cropWidth', label: 'Recadrage : largeur (‰)', kind: 'number', default: 1000, min: 10, max: 1000, advanced: true },
    { id: 'cropHeight', label: 'Recadrage : hauteur (‰)', kind: 'number', default: 1000, min: 10, max: 1000, advanced: true },
    { id: 'resize', label: 'Redimensionnement', kind: 'select', default: 'none', options: [
      { value: 'none', label: 'Conserver' },
      { value: 'web', label: '1600 px maximum' },
      { value: 'mail', label: '1280 px maximum' },
      { value: 'thumbnail', label: 'Miniature 320 px' },
      { value: 'custom', label: 'Dimensions personnalisées' },
    ] },
    { id: 'width', label: 'Largeur (px)', kind: 'number', default: 0, min: 0, max: 20_000, advanced: true },
    { id: 'height', label: 'Hauteur (px)', kind: 'number', default: 0, min: 0, max: 20_000, advanced: true },
    { id: 'brightness', label: 'Luminosité (-100 à 100)', kind: 'number', default: 0, min: -100, max: 100, advanced: true },
    { id: 'contrast', label: 'Contraste (%)', kind: 'number', default: 100, min: 0, max: 300, advanced: true },
    { id: 'saturation', label: 'Saturation (%)', kind: 'number', default: 100, min: 0, max: 300, advanced: true },
    { id: 'grayscale', label: 'Niveaux de gris', kind: 'boolean', default: false, advanced: true },
    { id: 'borderWidth', label: 'Bordure (px)', kind: 'number', default: 0, min: 0, max: 200, advanced: true },
    { id: 'borderColor', label: 'Couleur de bordure', kind: 'color', default: '#292b3a', advanced: true },
    { id: 'watermarkText', label: 'Filigrane', kind: 'text', default: '', maxLength: 80, advanced: true },
    { id: 'watermarkPosition', label: 'Position du filigrane', kind: 'select', default: 'bottom-right', options: [{ value: 'center', label: 'Centré' }, { value: 'bottom-right', label: 'Bas droite' }, { value: 'bottom-left', label: 'Bas gauche' }, { value: 'top-right', label: 'Haut droite' }, { value: 'top-left', label: 'Haut gauche' }], advanced: true },
    { id: 'watermarkColor', label: 'Couleur du filigrane', kind: 'color', default: '#ffffff', advanced: true },
    { id: 'outputFormat', label: 'Format de sortie', kind: 'select', default: 'same', options: [{ value: 'same', label: 'Conserver le format' }, ...FORMAT_OPTIONS] },
    { id: 'quality', label: 'Qualité (JPEG/WebP)', kind: 'number', default: 0.92, min: 0.5, max: 1, step: 0.02, advanced: true },
    { id: 'background', label: 'Fond (formats sans transparence)', kind: 'color', default: '#ffffff', advanced: true },
  ],
  limits: ['La correction de perspective n’est pas proposée : elle demande une détection de quadrilatère qui fausserait l’image sur les cas difficiles'],
  run: async (inputs, params, context) => {
    ensureImageInputs(inputs);
    const rotate = Number.parseInt(readText(params, 'rotate', '0'), 10);
    const cropX = readNumber(params, 'cropX', 0);
    const cropY = readNumber(params, 'cropY', 0);
    const cropWidth = readNumber(params, 'cropWidth', 1000);
    const cropHeight = readNumber(params, 'cropHeight', 1000);
    const hasCrop = cropX > 0 || cropY > 0 || cropWidth < 1000 || cropHeight < 1000;
    const borderWidth = readNumber(params, 'borderWidth', 0);
    const watermarkText = readText(params, 'watermarkText');
    const outputFormatParam = readText(params, 'outputFormat', 'same');
    const outputs: OperationOutput[] = [];
    const warnings: string[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / inputs.length, label: `Modification de « ${input.name} »…` });
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      const transform: ImageTransform = {
        rotate: ([90, 180, 270].includes(rotate) ? rotate : 0) as 0 | 90 | 180 | 270,
        flipHorizontal: readBoolean(params, 'flipHorizontal'),
        flipVertical: readBoolean(params, 'flipVertical'),
        resize: resizeFromParams(params),
        grayscale: readBoolean(params, 'grayscale'),
        brightness: readNumber(params, 'brightness', 0) / 100,
        contrast: readNumber(params, 'contrast', 100),
        saturation: readNumber(params, 'saturation', 100),
        border: borderWidth > 0 ? { width: borderWidth, color: readText(params, 'borderColor', '#292b3a') } : undefined,
        watermark: watermarkText.trim()
          ? {
            text: watermarkText,
            fontSize: Math.max(14, Math.round(Math.min(decoded.width, decoded.height) * 0.06)),
            color: readText(params, 'watermarkColor', '#ffffff'),
            opacity: 0.7,
            position: readText(params, 'watermarkPosition', 'bottom-right') as 'center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',
            rotation: 0,
          }
          : undefined,
      };
      if (hasCrop) {
        transform.crop = {
          x: (decoded.width * cropX) / 1000,
          y: (decoded.height * cropY) / 1000,
          width: Math.max(1, (decoded.width * Math.min(1000 - cropX, cropWidth)) / 1000),
          height: Math.max(1, (decoded.height * Math.min(1000 - cropY, cropHeight)) / 1000),
        };
      }
      const canvas = applyTransform(decoded.canvas, transform);
      const outputFormat: FormatId = outputFormatParam === 'same'
        ? (['png', 'jpeg', 'webp', 'bmp'].includes(input.format) ? input.format : 'png')
        : outputFormatParam as FormatId;
      if (!canEncode(outputFormat)) throw new Error(`Ce moteur ne peut pas écrire le format ${outputFormat.toUpperCase()}.`);
      const bytes = await canvasToBytes(canvas, {
        format: outputFormat,
        quality: readNumber(params, 'quality', 0.92),
        background: readText(params, 'background', '#ffffff'),
      });
      const width = canvas.width;
      const height = canvas.height;
      canvas.width = 0;
      canvas.height = 0;
      decoded.canvas.width = 0;
      decoded.canvas.height = 0;
      outputs.push({
        name: imageName(input, 'modifie', outputFormat === 'jpeg' ? 'jpg' : outputFormat, index + 1, inputs.length),
        bytes,
        format: outputFormat,
        note: `${width} × ${height} px`,
      });
    }
    return { outputs, warnings, measurements: imageMeasurements(inputs, outputs) };
  },
};

const contactSheetOperation: Operation = {
  id: 'image.contact-sheet',
  label: 'Créer une planche-contact',
  description: 'Dispose toutes les images dans une grille légendée, idéale pour un aperçu d’un dossier.',
  category: 'image-edit',
  nature: 'rebuild',
  inputs: { formats: IMAGE_FORMATS, min: 1, max: 200, label: 'une ou plusieurs images (regroupées)' },
  output: { format: 'png', cardinality: 'one', label: 'une planche-contact' },
  params: [
    { id: 'columns', label: 'Colonnes', kind: 'number', default: 4, min: 1, max: 10 },
    { id: 'cellSize', label: 'Taille des vignettes (px)', kind: 'number', default: 260, min: 80, max: 800 },
    { id: 'gap', label: 'Espacement (px)', kind: 'number', default: 16, min: 0, max: 80 },
    { id: 'label', label: 'Afficher les noms de fichiers', kind: 'boolean', default: true },
    { id: 'background', label: 'Fond', kind: 'color', default: '#f7f8fa' },
  ],
  limits: ['La planche peut devenir très grande : Noto vérifie la taille finale avant de l’écrire'],
  run: async (inputs, params, context) => {
    ensureImageInputs(inputs);
    const columns = readNumber(params, 'columns', 4);
    const cellSize = readNumber(params, 'cellSize', 260);
    const gap = readNumber(params, 'gap', 16);
    const options = {
      columns,
      cellSize,
      gap,
      background: readText(params, 'background', '#f7f8fa'),
      label: readBoolean(params, 'label', true),
      labelColor: '#292b3a',
    };
    const size = sheetSize(inputs.length, options);
    if (size.width * size.height > 80_000_000) {
      throw new Error('La planche-contact serait trop grande. Réduisez le nombre de colonnes ou la taille des vignettes.');
    }
    const images: { canvas: HTMLCanvasElement; label?: string }[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / (inputs.length + 1), label: `Lecture de « ${input.name} »…` });
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      images.push({ canvas: decoded.canvas, label: input.name });
    }
    context.progress({ value: 0.95, label: 'Composition de la planche…' });
    const sheet = drawSheet(images, { ...options, label: options.label });
    const bytes = await canvasToBytes(sheet, { format: 'png', quality: 1 });
    for (const image of images) {
      image.canvas.width = 0;
      image.canvas.height = 0;
    }
    sheet.width = 0;
    sheet.height = 0;
    const baseName = commonPrefixBase(inputs.map((input) => input.name));
    return {
      outputs: [{ name: `${baseName}-planche-contact.png`, bytes, format: 'png', note: `${size.columns} × ${size.rows} vignettes` }],
      warnings: [],
      measurements: imageMeasurements(inputs, [{ name: 'planche', bytes, format: 'png' }]),
    };
  },
};

const collageOperation: Operation = {
  id: 'image.collage',
  label: 'Créer un collage',
  description: 'Assemble les images en une seule composition (grille, bande horizontale ou verticale).',
  category: 'image-edit',
  nature: 'rebuild',
  inputs: { formats: IMAGE_FORMATS, min: 2, max: 60, label: 'au moins deux images (regroupées)' },
  output: { format: 'png', cardinality: 'one', label: 'un collage' },
  params: [
    { id: 'layout', label: 'Disposition', kind: 'select', default: 'grid', options: [{ value: 'grid', label: 'Grille' }, { value: 'horizontal', label: 'Bande horizontale' }, { value: 'vertical', label: 'Bande verticale' }] },
    { id: 'columns', label: 'Colonnes (grille)', kind: 'number', default: 3, min: 1, max: 8 },
    { id: 'cellSize', label: 'Taille des cases (px)', kind: 'number', default: 400, min: 120, max: 1_200 },
    { id: 'gap', label: 'Espacement (px)', kind: 'number', default: 12, min: 0, max: 80 },
    { id: 'background', label: 'Fond', kind: 'color', default: '#ffffff' },
  ],
  limits: ['Le collage est un nouveau visuel : il ne remplace jamais les images d’origine'],
  run: async (inputs, params, context) => {
    ensureImageInputs(inputs);
    const layout = readText(params, 'layout', 'grid');
    const cellSize = readNumber(params, 'cellSize', 400);
    const gap = readNumber(params, 'gap', 12);
    const columns = layout === 'grid' ? readNumber(params, 'columns', 3) : layout === 'horizontal' ? inputs.length : 1;
    const options = {
      columns,
      cellSize,
      gap,
      background: readText(params, 'background', '#ffffff'),
      label: false,
      labelColor: '#292b3a',
    };
    const size = sheetSize(inputs.length, options);
    if (size.width * size.height > 80_000_000) throw new Error('Le collage serait trop grand : réduisez la taille des cases ou le nombre d’images.');
    const images: { canvas: HTMLCanvasElement }[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / (inputs.length + 1), label: `Préparation de « ${input.name} »…` });
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      images.push({ canvas: decoded.canvas });
    }
    const sheet = drawSheet(images, options);
    const bytes = await canvasToBytes(sheet, { format: 'png', quality: 1 });
    for (const image of images) {
      image.canvas.width = 0;
      image.canvas.height = 0;
    }
    sheet.width = 0;
    sheet.height = 0;
    const baseName = commonPrefixBase(inputs.map((input) => input.name));
    return {
      outputs: [{ name: `${baseName}-collage.png`, bytes, format: 'png' }],
      warnings: ['Le collage est une composition : les proportions des images sont respectées mais le cadrage peut différer.'],
      measurements: [],
    };
  },
};

const tileOperation: Operation = {
  id: 'image.tile',
  label: 'Découper une image en tuiles',
  description: 'Découpe l’image en plusieurs morceaux égaux (utile pour l’impression ou le web).',
  category: 'image-edit',
  nature: 'rebuild',
  inputs: { formats: IMAGE_FORMATS, min: 1, max: 200, label: 'une ou plusieurs images' },
  output: { format: 'same', cardinality: 'many', label: 'une image par tuile' },
  params: [
    { id: 'columns', label: 'Colonnes', kind: 'number', default: 2, min: 1, max: 20 },
    { id: 'rows', label: 'Lignes', kind: 'number', default: 2, min: 1, max: 20 },
    { id: 'format', label: 'Format des tuiles', kind: 'select', default: 'png', options: FORMAT_OPTIONS },
  ],
  limits: ['20 × 20 tuiles au maximum par image'],
  run: async (inputs, params, context) => {
    ensureImageInputs(inputs);
    const columns = readNumber(params, 'columns', 2);
    const rows = readNumber(params, 'rows', 2);
    const format = readText(params, 'format', 'png') as FormatId;
    if (!canEncode(format)) throw new Error(`Ce moteur ne sait pas écrire le format ${format.toUpperCase()}.`);
    const outputs: OperationOutput[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / inputs.length, label: `Découpage de « ${input.name} »…` });
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      const regions = tileRegions(decoded.width, decoded.height, columns, rows);
      for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
        const region = regions[regionIndex];
        const canvas = applyTransform(decoded.canvas, { crop: region });
        const bytes = await canvasToBytes(canvas, { format, quality: 0.95 });
        canvas.width = 0;
        canvas.height = 0;
        const position = `r${Math.floor(regionIndex / columns) + 1}c${(regionIndex % columns) + 1}`;
        outputs.push({
          name: imageName(input, `tuile-${position}`, format === 'jpeg' ? 'jpg' : format, index + 1, inputs.length),
          bytes,
          format,
          note: `${region.width} × ${region.height} px`,
        });
      }
      decoded.canvas.width = 0;
      decoded.canvas.height = 0;
    }
    return { outputs, warnings: [], measurements: imageMeasurements(inputs, outputs) };
  },
};

const variantsOperation: Operation = {
  id: 'image.variants',
  label: 'Générer plusieurs tailles',
  description: 'Produit plusieurs versions d’une même image (par exemple 1920, 1280 et 640 pixels de large).',
  category: 'image-edit',
  nature: 'rebuild',
  inputs: { formats: IMAGE_FORMATS, min: 1, max: 200, label: 'une ou plusieurs images' },
  output: { format: 'same', cardinality: 'many', label: 'plusieurs tailles par image' },
  params: [
    { id: 'widths', label: 'Largeurs souhaitées (px)', kind: 'text', default: '1920, 1280, 640', help: 'Séparées par des virgules.' },
    { id: 'format', label: 'Format', kind: 'select', default: 'webp', options: FORMAT_OPTIONS },
    { id: 'quality', label: 'Qualité', kind: 'number', default: 0.85, min: 0.3, max: 1, step: 0.05 },
  ],
  limits: ['Les largeurs supérieures à l’original produisent une image agrandie (resampling), sans détail supplémentaire'],
  run: async (inputs, params, context) => {
    ensureImageInputs(inputs);
    const widths = readText(params, 'widths', '1920, 1280, 640')
      .split(/[,;\s]+/u)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value >= 16 && value <= 20_000);
    if (!widths.length) throw new Error('Indiquez au moins une largeur valide, par exemple 1920, 1280, 640.');
    const format = readText(params, 'format', 'webp') as FormatId;
    if (!canEncode(format)) throw new Error(`Ce moteur ne sait pas écrire le format ${format.toUpperCase()}.`);
    const outputs: OperationOutput[] = [];
    const warnings: string[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / inputs.length, label: `Variantes de « ${input.name} »…` });
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      for (const width of widths) {
        const canvas = applyTransform(decoded.canvas, { resize: { width, mode: 'fit' } });
        const bytes = await canvasToBytes(canvas, { format, quality: readNumber(params, 'quality', 0.85) });
        const actual = canvas.width;
        canvas.width = 0;
        canvas.height = 0;
        if (actual !== width && decoded.width < width) warnings.push(`« ${input.name} » est plus petite que ${width} px : la variante a été produite sans gain de détail.`);
        outputs.push({
          name: imageName(input, `${actual}px`, format === 'jpeg' ? 'jpg' : format, index + 1, inputs.length),
          bytes,
          format,
          note: `${actual} px de large`,
        });
      }
      decoded.canvas.width = 0;
      decoded.canvas.height = 0;
    }
    return { outputs, warnings, measurements: imageMeasurements(inputs, outputs) };
  },
};

const metadataOperation: Operation = {
  id: 'image.metadata',
  label: 'Lire les métadonnées d’une image',
  description: 'Affiche EXIF, IPTC et informations techniques : appareil, dates, objectif, position GPS éventuelle.',
  category: 'image-analyze',
  nature: 'measure',
  inputs: { formats: IMAGE_FORMATS, min: 1, max: 1, label: 'une image' },
  output: { format: 'report', cardinality: 'one', label: 'un rapport affiché dans Noto' },
  params: [],
  limits: ['Les formats SVG, BMP et certains PNG ne contiennent aucune métadonnée EXIF'],
  run: async (inputs, _params, context) => {
    ensureImageInputs(inputs);
    const input = inputs[0];
    context.progress({ value: 0.4, label: 'Lecture des métadonnées…' });
    const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
    const metadata = await readImageMetadata(input.bytes, { format: input.format, fileName: input.name });
    const width = decoded.width;
    const height = decoded.height;
    const animated = looksAnimated(input.bytes, input.format);
    decoded.canvas.width = 0;
    decoded.canvas.height = 0;
    const lines = metadataToLines(metadata);
    return {
      outputs: [],
      warnings: metadata.gps ? ['Cette image contient une position GPS : elle est visible par quiconque reçoit le fichier.'] : [],
      measurements: [],
      report: {
        title: `Métadonnées de ${input.name}`,
        summary: `${width} × ${height} px, ${formatSize(input.size)}${animated ? ', image animée' : ''}. ${metadata.available ? '' : 'Aucune métadonnée EXIF/IPTC.'}`,
        sections: [
          { title: 'Fichier', lines: [], table: [['Information', 'Valeur'], ['Dimensions', `${width} × ${height} px`], ['Format', input.format.toUpperCase()], ['Taille', formatSize(input.size)], ['Animée', animated ? 'oui' : 'non']] },
          { title: 'Métadonnées', lines },
        ],
      },
    };
  },
};

const stripMetadataOperation: Operation = {
  id: 'image.strip-metadata',
  label: 'Supprimer les métadonnées d’images',
  description: 'Réencode l’image sans recopier EXIF, IPTC, XMP ni position GPS.',
  category: 'image-analyze',
  nature: 'rebuild',
  inputs: { formats: IMAGE_FORMATS, min: 1, max: 200, label: 'une ou plusieurs images' },
  output: { format: 'same', cardinality: 'per-input', label: 'une image nettoyée' },
  params: [
    { id: 'format', label: 'Format de sortie', kind: 'select', default: 'same', options: [{ value: 'same', label: 'Conserver le format (PNG ou JPEG)' }, { value: 'png', label: 'PNG — sans perte' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }] },
    { id: 'quality', label: 'Qualité', kind: 'number', default: 0.95, min: 0.5, max: 1, step: 0.05 },
  ],
  limits: [
    'La suppression passe par un réencodage : les pixels sont redessinés (aucune perte en PNG, légère recompression en JPEG)',
    'Noto ne peut pas garantir la suppression d’informations invisibles dans les pixels eux-mêmes (filigranes, tatouages numériques)',
  ],
  run: async (inputs, params, context) => {
    ensureImageInputs(inputs);
    const requested = readText(params, 'format', 'same');
    const outputs: OperationOutput[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index + 1) / inputs.length, label: `Nettoyage de « ${input.name} »…` });
      const format: FormatId = requested === 'same'
        ? (input.format === 'jpeg' || input.format === 'webp' ? input.format : 'png')
        : requested as FormatId;
      if (!canEncode(format)) throw new Error(`Ce moteur ne peut pas écrire le format ${format.toUpperCase()}.`);
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      const bytes = await canvasToBytes(decoded.canvas, { format, quality: readNumber(params, 'quality', 0.95) });
      decoded.canvas.width = 0;
      decoded.canvas.height = 0;
      outputs.push({
        name: imageName(input, 'sans-metadonnees', format === 'jpeg' ? 'jpg' : format, index + 1, inputs.length),
        bytes,
        format,
        note: 'Réencodage sans recopie des métadonnées',
      });
    }
    return {
      outputs,
      warnings: ['Vérifiez le résultat si le fichier doit être diffusé : le réencodage retire EXIF/IPTC/XMP, mais des données peuvent subsister dans le contenu visible.'],
      measurements: imageMeasurements(inputs, outputs),
    };
  },
};

const compareOperation: Operation = {
  id: 'image.compare',
  label: 'Comparer deux images',
  description: 'Compare dimensions, contenu réel des pixels et similarité perceptuelle.',
  category: 'image-analyze',
  nature: 'measure',
  inputs: { formats: IMAGE_FORMATS, min: 2, max: 2, label: 'deux images' },
  output: { format: 'report', cardinality: 'one', label: 'un rapport de comparaison' },
  params: [],
  limits: ['La similarité perceptuelle est une estimation (empreinte 8 × 8), pas une preuve d’identité'],
  run: async (inputs, _params, context) => {
    ensureImageInputs(inputs);
    if (inputs.length < 2) throw new Error('Sélectionnez deux images à comparer.');
    const [left, right] = inputs;
    context.progress({ value: 0.3, label: 'Lecture des images…' });
    const leftImage = await decodeImage(left.bytes, { name: left.name, format: left.format });
    const rightImage = await decodeImage(right.bytes, { name: right.name, format: right.format });
    const difference = compareCanvases(leftImage.canvas, rightImage.canvas);
    const leftHash = perceptualHash(leftImage.canvas);
    const rightHash = perceptualHash(rightImage.canvas);
    const distance = hammingDistance(leftHash, rightHash);
    const similarity = Math.max(0, Math.round((1 - distance / 64) * 100));
    const identicalBytes = left.bytes.length === right.bytes.length && left.bytes.every((byte, index) => byte === right.bytes[index]);
    leftImage.canvas.width = 0;
    leftImage.canvas.height = 0;
    rightImage.canvas.width = 0;
    rightImage.canvas.height = 0;
    return {
      outputs: [],
      warnings: [],
      measurements: [{ label: 'Pixels différents', before: 0, after: difference.differencePercent, unit: 'percent' as const }],
      report: {
        title: `Comparaison : ${left.name} ↔ ${right.name}`,
        summary: identicalBytes
          ? 'Les deux fichiers sont strictement identiques octet par octet.'
          : difference.identical
            ? 'Les images sont visuellement identiques (pixels au rendu).'
            : `${difference.differencePercent} % des pixels comparés diffèrent.`,
        sections: [{
          title: 'Résultats',
          lines: [],
          table: [
            ['Indicateur', 'Valeur'],
            ['Fichiers identiques (octets)', identicalBytes ? 'oui' : 'non'],
            ['Dimensions', `${leftImage.width} × ${leftImage.height} px / ${rightImage.width} × ${rightImage.height} px`],
            ['Pixels différents', `${difference.differencePercent} %`],
            ['Dimensions différentes', difference.sizeMismatch ? 'oui (comparaison sur la zone commune)' : 'non'],
            ['Similarité perceptuelle estimée', `${similarity} % (distance ${distance} sur 64)`],
          ],
        }],
      },
    };
  },
};

export const IMAGE_OPERATIONS: Operation[] = [
  convertOperation,
  optimizeOperation,
  editOperation,
  contactSheetOperation,
  collageOperation,
  tileOperation,
  variantsOperation,
  metadataOperation,
  stripMetadataOperation,
  compareOperation,
];

export { ensureImageInputs, imageName };
