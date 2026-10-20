import { buildSearchablePdf } from '../pdf/pdfSearchable';
import { pdfPagesToImages } from '../pdf/pdfRaster';
import { cleanScanCanvas, type ScanCleanupOptions } from '../image/scanCleanup';
import { canvasToBytes, decodeImage, looksAnimated } from '../image/imageEngine';
import { createOcrSession, ocrLanguageLabel, summarizeOcrQuality, OCR_LANGUAGES, type OcrSession } from '../ocr/ocrEngine';
import { buildOutputName, splitFileName } from '../jobs/naming';
import type { Operation, OperationContext, OperationInput, OperationOutput } from './types';
import { readBoolean, readNumber, readText } from './types';

/**
 * OCR local et nettoyage de numérisations.
 *
 * Les modèles de langue sont téléchargés une seule fois, après consentement
 * explicite de l’utilisateur (voir l’outil OCR), puis mis en cache localement.
 * Aucune image n’est transmise à un service en ligne.
 */

export const OCR_MODELS_INFO = OCR_LANGUAGES.map((language) => `${language.label} (${language.code}) — environ ${language.sizeMb} Mo — ${language.license}`);

function parseLanguages(value: string): string[] {
  const codes = value.split(/[,;\s]+/u).map((code) => code.trim().toLowerCase()).filter(Boolean);
  const known = codes.filter((code) => OCR_LANGUAGES.some((language) => language.code === code));
  return known.length ? known : ['fra'];
}

function ensureOcrInputs(inputs: OperationInput[]): void {
  if (!inputs.length) throw new Error('Sélectionnez un fichier à analyser.');
}

function ocrOutputName(input: OperationInput, suffix: string, extension: string, index = 1, total = 1): string {
  return buildOutputName({ sourceName: input.name, index, total, suffix, targetExtension: extension });
}

async function recognizeImage(session: OcrSession, canvas: HTMLCanvasElement, context: OperationContext, label: string) {
  context.progress({ value: 0.4, label });
  const result = await session.recognize(canvas);
  const quality = summarizeOcrQuality(result.words);
  return { ...result, quality };
}

const ocrImageOperation: Operation = {
  id: 'ocr.image',
  label: 'Reconnaître le texte d’une image (OCR)',
  description: 'Extrait le texte réel d’une photo ou d’un scan avec le moteur Tesseract local, en signalant les passages incertains.',
  category: 'ocr',
  nature: 'measure',
  inputs: { formats: ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'gif'], min: 1, max: 50, label: 'une ou plusieurs images' },
  output: { format: 'txt', cardinality: 'per-input', label: 'un fichier texte par image' },
  params: [
    { id: 'languages', label: 'Langues', kind: 'select', default: 'fra', options: OCR_LANGUAGES.filter((language) => language.code !== 'osd').map((language) => ({ value: language.code, label: `${language.label} (${language.code})` })) },
    { id: 'extraLanguages', label: 'Langues supplémentaires', kind: 'text', default: '', placeholder: 'eng, deu', advanced: true },
    { id: 'markdown', label: 'Produire du Markdown', kind: 'boolean', default: false },
    { id: 'cleanup', label: 'Nettoyer le scan avant lecture', kind: 'boolean', default: true, help: 'Redressement estimé, contraste et marges.' },
  ],
  limits: [
    'La reconnaissance dépend de la qualité du scan : 300 ppp et un document droit donnent les meilleurs résultats',
    'La confiance affichée est une estimation du moteur, pas une garantie',
  ],
  run: async (inputs, params, context) => {
    ensureOcrInputs(inputs);
    const languages = [...new Set([readText(params, 'languages', 'fra'), ...parseLanguages(readText(params, 'extraLanguages'))])];
    context.progress({ value: 0.02, label: `Chargement du moteur OCR (${languages.map(ocrLanguageLabel).join(', ')})…` });
    const session = await createOcrSession(languages, {
      onProgress: (value, label) => context.progress({ value: value * 0.3, label }),
    });
    const outputs: OperationOutput[] = [];
    const warnings: string[] = [];
    try {
      for (let index = 0; index < inputs.length; index += 1) {
        const input = inputs[index];
        context.progress({ value: 0.3 + (index / inputs.length) * 0.6, label: `OCR de « ${input.name} »…` });
        const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
        let canvas = decoded.canvas;
        if (readBoolean(params, 'cleanup', true)) {
          const cleaned = await cleanScanCanvas(canvas, {
            deskew: true,
            trimMargins: false,
            contrast: true,
            denoise: false,
            grayscale: true,
            maxAngle: 4,
          });
          decoded.canvas.width = 0;
          decoded.canvas.height = 0;
          canvas = cleaned.canvas;
          if (cleaned.info.angle !== 0) context.report(`« ${input.name} » : inclinaison estimée corrigée de ${cleaned.info.angle}°.`);
        }
        const result = await recognizeImage(session, canvas, context, `Reconnaissance de « ${input.name} »…`);
        canvas.width = 0;
        canvas.height = 0;
        if (!result.text.trim()) {
          warnings.push(`« ${input.name} » : aucun texte reconnu. Essayez une image plus nette ou une résolution plus élevée.`);
          continue;
        }
        const asMarkdown = readBoolean(params, 'markdown');
        const content = asMarkdown
          ? `# ${splitFileName(input.name).baseName}\n\n${result.text.trim().replace(/\n{3,}/gu, '\n\n')}\n`
          : result.text;
        outputs.push({
          name: ocrOutputName(input, 'ocr', asMarkdown ? 'md' : 'txt', index + 1, inputs.length),
          bytes: new TextEncoder().encode(content),
          format: asMarkdown ? 'md' : 'txt',
          note: `confiance moyenne ${Math.round(result.quality.averageConfidence * 100)} % sur ${result.quality.wordCount} mot(s)`,
        });
        warnings.push(result.quality.note);
      }
    } finally {
      await session.terminate();
    }
    if (!outputs.length) throw new Error('Aucun texte n’a été reconnu dans les images fournies.');
    return { outputs, warnings: [...new Set(warnings)], measurements: [] };
  },
};

const ocrPdfTextOperation: Operation = {
  id: 'ocr.pdf',
  label: 'OCR d’un PDF numérisé',
  description: 'Rend chaque page du PDF puis reconnaît le texte : utile pour les documents scannés sans couche texte.',
  category: 'ocr',
  nature: 'measure',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF' },
  output: { format: 'txt', cardinality: 'one', label: 'un fichier texte' },
  params: [
    { id: 'languages', label: 'Langues', kind: 'select', default: 'fra', options: OCR_LANGUAGES.filter((language) => language.code !== 'osd').map((language) => ({ value: language.code, label: `${language.label} (${language.code})` })) },
    { id: 'dpi', label: 'Résolution du rendu (ppp)', kind: 'number', default: 200, min: 100, max: 300 },
    { id: 'markdown', label: 'Produire du Markdown', kind: 'boolean', default: true },
  ],
  limits: ['Le temps de traitement dépend du nombre de pages et du processeur', 'Les documents déjà pourvus d’un texte (PDF natif) n’ont pas besoin de l’OCR'],
  run: async (inputs, params, context) => {
    ensureOcrInputs(inputs);
    const input = inputs[0];
    const languages = parseLanguages(readText(params, 'languages', 'fra'));
    const dpi = readNumber(params, 'dpi', 200);
    context.progress({ value: 0.02, label: 'Rendu des pages…' });
    const images = await pdfPagesToImages(input.bytes, {
      dpi,
      mimeType: 'image/png',
      quality: 1,
      signal: context.signal,
      onProgress: (value) => context.progress({ value: value * 0.3, label: 'Rendu des pages…' }),
      password: context.password,
    });
    const session = await createOcrSession(languages, {
      onProgress: (value, label) => context.progress({ value: 0.3 + value * 0.1, label }),
    });
    const sections: string[] = [];
    const warnings: string[] = [];
    let totalWords = 0;
    let confidenceSum = 0;
    try {
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        context.progress({ value: 0.4 + (index / images.length) * 0.55, label: `OCR de la page ${image.pageNumber} sur ${images.length}…` });
        const decoded = await decodeImage(image.bytes, { name: `page-${image.pageNumber}.png`, format: 'png' });
        const result = await session.recognize(decoded.canvas);
        decoded.canvas.width = 0;
        decoded.canvas.height = 0;
        const text = result.text.trim();
        sections.push(`## Page ${image.pageNumber}\n\n${text || '_Aucun texte reconnu sur cette page._'}`);
        totalWords += result.words.length;
        confidenceSum += result.confidence;
        if (!text) warnings.push(`Page ${image.pageNumber} : aucun texte reconnu.`);
      }
    } finally {
      await session.terminate();
    }
    const averageConfidence = images.length ? confidenceSum / images.length : 0;
    const asMarkdown = readBoolean(params, 'markdown', true);
    const content = asMarkdown ? `# OCR de ${splitFileName(input.name).baseName}\n\n${sections.join('\n\n')}\n` : sections.map((section) => section.replace(/^## /u, '')).join('\n\n');
    return {
      outputs: [{
        name: ocrOutputName(input, 'ocr', asMarkdown ? 'md' : 'txt'),
        bytes: new TextEncoder().encode(content),
        format: asMarkdown ? 'md' : 'txt',
        note: `${totalWords} mot(s), confiance moyenne ${Math.round(averageConfidence * 100)} %`,
      }],
      warnings: [
        ...warnings.slice(0, 20),
        `Confiance moyenne estimée par le moteur : ${Math.round(averageConfidence * 100)} %. Vérifiez les passages incertains avant diffusion.`,
      ],
      measurements: [{ label: 'Mots reconnus', before: 0, after: totalWords, unit: 'items' as const }],
    };
  },
};

const ocrSearchablePdfOperation: Operation = {
  id: 'ocr.searchable-pdf',
  label: 'Créer un PDF interrogeable (OCR)',
  description: 'Reconstruit le PDF avec une couche de texte invisible issue de l’OCR : le document devient cherchable et copiable.',
  category: 'ocr',
  nature: 'rebuild',
  inputs: { formats: ['pdf'], min: 1, max: 1, label: 'un PDF numérisé' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF interrogeable' },
  params: [
    { id: 'languages', label: 'Langues', kind: 'select', default: 'fra', options: OCR_LANGUAGES.filter((language) => language.code !== 'osd').map((language) => ({ value: language.code, label: `${language.label} (${language.code})` })) },
    { id: 'dpi', label: 'Résolution du rendu (ppp)', kind: 'number', default: 200, min: 100, max: 300 },
    { id: 'quality', label: 'Qualité JPEG du rendu', kind: 'number', default: 0.8, min: 0.5, max: 1, step: 0.05, advanced: true },
  ],
  limits: [
    'Les pages sont remplacées par leur rendu : la qualité visuelle dépend de la résolution choisie',
    'La couche de texte est invisible ; elle est positionnée d’après les mots reconnus et peut être imparfaite sur les mises en page complexes',
  ],
  run: async (inputs, params, context) => {
    ensureOcrInputs(inputs);
    const input = inputs[0];
    const languages = parseLanguages(readText(params, 'languages', 'fra'));
    const dpi = readNumber(params, 'dpi', 200);
    const quality = readNumber(params, 'quality', 0.8);
    context.progress({ value: 0.02, label: 'Rendu des pages du PDF…' });
    const rendered = await pdfPagesToImages(input.bytes, {
      dpi,
      mimeType: 'image/jpeg',
      quality,
      signal: context.signal,
      onProgress: (value) => context.progress({ value: value * 0.35, label: 'Rendu des pages…' }),
      password: context.password,
    });
    const session = await createOcrSession(languages, {
      onProgress: (value, label) => context.progress({ value: 0.35 + value * 0.1, label }),
    });
    const pages = [];
    const warnings: string[] = [];
    try {
      for (let index = 0; index < rendered.length; index += 1) {
        const image = rendered[index];
        context.progress({ value: 0.45 + (index / rendered.length) * 0.45, label: `OCR de la page ${image.pageNumber}…` });
        const decoded = await decodeImage(image.bytes, { name: `page-${image.pageNumber}.jpg`, format: 'jpeg' });
        const result = await session.recognize(decoded.canvas);
        pages.push({
          imageBytes: image.bytes,
          mimeType: 'image/jpeg' as const,
          imageWidth: image.width,
          imageHeight: image.height,
          dpi,
          words: result.words,
        });
        const qualitySummary = summarizeOcrQuality(result.words);
        if (qualitySummary.lowConfidenceWords.length) {
          warnings.push(`Page ${image.pageNumber} : ${qualitySummary.lowConfidenceWords.length} mot(s) sous 75 % de confiance.`);
        }
        decoded.canvas.width = 0;
        decoded.canvas.height = 0;
      }
    } finally {
      await session.terminate();
    }
    const built = await buildSearchablePdf(pages, {
      title: splitFileName(input.name).baseName,
      author: 'Noto (OCR local)',
    });
    return {
      outputs: [{
        name: ocrOutputName(input, 'interrogeable', 'pdf'),
        bytes: built.bytes,
        format: 'pdf',
        note: `${built.words} mot(s) indexé(s) sur ${built.pages} page(s)`,
      }],
      warnings: [
        ...warnings.slice(0, 15),
        'Le document produit conserve l’image des pages et ajoute une couche de texte issue de l’OCR : vérifiez le texte reconnu avant un usage officiel.',
      ],
      measurements: [
        { label: 'Mots indexés', before: 0, after: built.words, unit: 'items' as const },
        { label: 'Taille', before: input.size, after: built.bytes.length, unit: 'bytes' as const },
      ],
    };
  },
};

const scanCleanupOperation: Operation = {
  id: 'scan.cleanup',
  label: 'Nettoyer un scan',
  description: 'Redresse, éclaircit et recadre les scans ou photos de documents avant lecture ou OCR.',
  category: 'ocr',
  nature: 'rebuild',
  inputs: { formats: ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'gif', 'pdf'], min: 1, max: 50, label: 'des images ou un PDF numérisé' },
  output: { format: 'png', cardinality: 'per-input', label: 'des images nettoyées' },
  params: [
    { id: 'deskew', label: 'Redresser (inclinaison estimée)', kind: 'boolean', default: true },
    { id: 'contrast', label: 'Améliorer le contraste', kind: 'boolean', default: true },
    { id: 'trimMargins', label: 'Supprimer les marges vides', kind: 'boolean', default: false },
    { id: 'denoise', label: 'Réduire le bruit', kind: 'boolean', default: false, help: 'Filtre médian 3 × 3 : efficace sur les scans bruités, plus lent.' },
    { id: 'grayscale', label: 'Convertir en niveaux de gris', kind: 'boolean', default: false },
    { id: 'format', label: 'Format de sortie', kind: 'select', default: 'png', options: [{ value: 'png', label: 'PNG — sans perte' }, { value: 'jpeg', label: 'JPEG — plus léger' }] },
    { id: 'dpi', label: 'Résolution pour un PDF (ppp)', kind: 'number', default: 200, min: 100, max: 300, advanced: true },
    { id: 'maxAngle', label: 'Angle de redressement maximal (°)', kind: 'number', default: 4, min: 1, max: 15, advanced: true },
  ],
  limits: [
    'Le redressement est estimé par analyse des lignes de texte : une page sans texte structuré n’est pas redressée',
    'Les corrections sont destructives sur le fichier produit ; l’original n’est jamais modifié',
  ],
  run: async (inputs, params, context) => {
    if (!inputs.length) throw new Error('Sélectionnez au moins un fichier.');
    const cleanupOptions: ScanCleanupOptions = {
      deskew: readBoolean(params, 'deskew', true),
      trimMargins: readBoolean(params, 'trimMargins'),
      contrast: readBoolean(params, 'contrast', true),
      denoise: readBoolean(params, 'denoise'),
      grayscale: readBoolean(params, 'grayscale'),
      maxAngle: readNumber(params, 'maxAngle', 4),
    };
    const format = readText(params, 'format', 'png') as 'png' | 'jpeg';
    const outputs: OperationOutput[] = [];
    const warnings: string[] = [];

    const pages: { input: OperationInput; canvas: HTMLCanvasElement; angle: number; applied: string[]; source: string }[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      context.progress({ value: (index / inputs.length) * 0.4, label: `Préparation de « ${input.name} »…` });
      if (input.format === 'pdf') {
        const rendered = await pdfPagesToImages(input.bytes, {
          dpi: readNumber(params, 'dpi', 200),
          mimeType: 'image/png',
          quality: 1,
          signal: context.signal,
          onProgress: (value) => context.progress({ value: value * 0.4, label: `Rendu de « ${input.name} »…` }),
          password: context.password,
        });
        for (const image of rendered) {
          const decoded = await decodeImage(image.bytes, { name: `${input.name}-p${image.pageNumber}.png`, format: 'png' });
          const cleaned = await cleanScanCanvas(decoded.canvas, cleanupOptions);
          decoded.canvas.width = 0;
          decoded.canvas.height = 0;
          pages.push({ input, canvas: cleaned.canvas, angle: cleaned.info.angle, applied: cleaned.info.applied, source: `${splitFileName(input.name).baseName}-page-${image.pageNumber}` });
        }
        continue;
      }
      const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
      if (looksAnimated(input.bytes, input.format)) warnings.push(`« ${input.name} » est animée : seule la première image est nettoyée.`);
      const cleaned = await cleanScanCanvas(decoded.canvas, cleanupOptions);
      decoded.canvas.width = 0;
      decoded.canvas.height = 0;
      pages.push({ input, canvas: cleaned.canvas, angle: cleaned.info.angle, applied: cleaned.info.applied, source: splitFileName(input.name).baseName });
    }

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      context.progress({ value: 0.4 + (index / pages.length) * 0.55, label: `Écriture de « ${page.source} »…` });
      const bytes = await canvasToBytes(page.canvas, { format, quality: 0.9 });
      page.canvas.width = 0;
      page.canvas.height = 0;
      outputs.push({
        name: buildOutputName({ sourceName: `${page.source}.${format === 'jpeg' ? 'jpg' : 'png'}`, index: index + 1, total: pages.length, suffix: 'nettoye', targetExtension: format === 'jpeg' ? 'jpg' : 'png' }),
        bytes,
        format,
        note: page.applied.length ? page.applied.join(', ') : 'aucune correction appliquée',
      });
    }
    if (outputs.length) {
      const angles = pages.map((page) => page.angle).filter((angle) => angle !== 0);
      warnings.push(angles.length
        ? `${angles.length} page(s) redressée(s) ; angles estimés : ${angles.slice(0, 8).map((angle) => `${angle}°`).join(', ')}.`
        : 'Aucune inclinaison notable détectée : le redressement n’a rien modifié.');
    }
    const totalBefore = inputs.reduce((sum, input) => sum + input.size, 0);
    const totalAfter = outputs.reduce((sum, output) => sum + output.bytes.length, 0);
    return {
      outputs,
      warnings,
      measurements: [{ label: 'Taille', before: totalBefore, after: totalAfter, unit: 'bytes' as const }],
    };
  },
};

const scanToPdfOperation: Operation = {
  id: 'scan.to-pdf',
  label: 'Assembler des scans en PDF nettoyé',
  description: 'Nettoie puis assemble des images ou pages en un PDF unique, avec option OCR pour le rendre interrogeable.',
  category: 'ocr',
  nature: 'rebuild',
  inputs: { formats: ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'gif'], min: 1, max: 200, label: 'une ou plusieurs images' },
  output: { format: 'pdf', cardinality: 'one', label: 'un PDF nettoyé' },
  params: [
    { id: 'deskew', label: 'Redresser', kind: 'boolean', default: true },
    { id: 'contrast', label: 'Améliorer le contraste', kind: 'boolean', default: true },
    { id: 'grayscale', label: 'Niveaux de gris', kind: 'boolean', default: true },
    { id: 'ocr', label: 'Ajouter une couche de texte (OCR local)', kind: 'boolean', default: false, help: 'Le moteur OCR est chargé après consentement ; le traitement peut durer plusieurs minutes.' },
    { id: 'languages', label: 'Langues OCR', kind: 'select', default: 'fra', options: OCR_LANGUAGES.filter((language) => language.code !== 'osd').map((language) => ({ value: language.code, label: `${language.label} (${language.code})` })) },
    { id: 'quality', label: 'Qualité JPEG', kind: 'number', default: 0.85, min: 0.5, max: 1, step: 0.05, advanced: true },
  ],
  limits: ['L’assemblage reconstruit les pages : les métadonnées d’origine des images ne sont pas conservées'],
  run: async (inputs, params, context) => {
    if (!inputs.length) throw new Error('Ajoutez au moins une image.');
    const useOcr = readBoolean(params, 'ocr');
    const pages: { input: OperationInput; imageBytes: Uint8Array; width: number; height: number; words: Awaited<ReturnType<OcrSession['recognize']>>['words'] }[] = [];
    const session = useOcr
      ? await createOcrSession(parseLanguages(readText(params, 'languages', 'fra')), {
        onProgress: (value, label) => context.progress({ value: value * 0.2, label }),
      })
      : null;
    const warnings: string[] = [];
    try {
      for (let index = 0; index < inputs.length; index += 1) {
        const input = inputs[index];
        context.progress({ value: 0.2 + (index / inputs.length) * 0.6, label: `Nettoyage de « ${input.name} »…` });
        const decoded = await decodeImage(input.bytes, { name: input.name, format: input.format });
        const cleaned = await cleanScanCanvas(decoded.canvas, {
          deskew: readBoolean(params, 'deskew', true),
          trimMargins: false,
          contrast: readBoolean(params, 'contrast', true),
          denoise: false,
          grayscale: readBoolean(params, 'grayscale', true),
          maxAngle: 4,
        });
        decoded.canvas.width = 0;
        decoded.canvas.height = 0;
        const bytes = await canvasToBytes(cleaned.canvas, { format: 'jpeg', quality: readNumber(params, 'quality', 0.85) });
        let words: Awaited<ReturnType<OcrSession['recognize']>>['words'] = [];
        if (session) {
          const result = await session.recognize(cleaned.canvas);
          words = result.words;
          if (!result.text.trim()) warnings.push(`« ${input.name} » : aucun texte reconnu par l’OCR.`);
        }
        pages.push({ input, imageBytes: bytes, width: cleaned.canvas.width, height: cleaned.canvas.height, words });
        cleaned.canvas.width = 0;
        cleaned.canvas.height = 0;
      }
    } finally {
      await session?.terminate();
    }
    const built = await buildSearchablePdf(pages.map((page) => ({
      imageBytes: page.imageBytes,
      mimeType: 'image/jpeg' as const,
      imageWidth: page.width,
      imageHeight: page.height,
      dpi: 200,
      words: page.words,
    })), { title: 'Numérisation Noto', author: 'Noto' });
    const baseName = splitFileName(inputs[0].name).baseName;
    return {
      outputs: [{
        name: `${baseName}-numerise.pdf`,
        bytes: built.bytes,
        format: 'pdf',
        note: useOcr ? `${built.words} mot(s) indexé(s)` : `${built.pages} page(s) nettoyée(s)`,
      }],
      warnings: useOcr ? [...warnings, 'Couche de texte issue de l’OCR : à vérifier avant archivage.'] : warnings,
      measurements: [
        { label: 'Taille', before: inputs.reduce((sum, input) => sum + input.size, 0), after: built.bytes.length, unit: 'bytes' as const },
        { label: 'Pages', before: 0, after: built.pages, unit: 'pages' as const },
      ],
    };
  },
};

export const OCR_OPERATIONS: Operation[] = [
  ocrImageOperation,
  ocrPdfTextOperation,
  ocrSearchablePdfOperation,
  scanCleanupOperation,
  scanToPdfOperation,
];
