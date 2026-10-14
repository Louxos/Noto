import { PDFDocument, StandardFonts } from 'pdf-lib';
import { sanitizeForStandardFont } from '../documents/pdfRender';
import type { OcrWord } from '../ocr/ocrEngine';

/**
 * Construction d’un PDF interrogeable.
 *
 * Le rendu de la page (image) est conservé et une couche de texte invisible est
 * ajoutée par-dessus, positionnée sur les mots reconnus par l’OCR. Le texte
 * devient sélectionnable et recherchable, sans modifier l’aspect visuel.
 * Cette opération est une reconstruction : la couche texte d’origine n’existe
 * plus (le document était numérisé), elle est recréée à partir de l’OCR.
 */

export interface SearchablePageInput {
  imageBytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  /** Dimensions de l’image en pixels. */
  imageWidth: number;
  imageHeight: number;
  /** Résolution de rendu utilisée, en points par pouce. */
  dpi: number;
  words: OcrWord[];
}

export interface SearchablePdfResult {
  bytes: Uint8Array;
  words: number;
  pages: number;
}

export async function buildSearchablePdf(
  pages: SearchablePageInput[],
  options: { title?: string; author?: string } = {},
): Promise<SearchablePdfResult> {
  if (!pages.length) throw new Error('Aucune page à assembler.');
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.setProducer('Noto');
  document.setCreator('Noto — OCR local (Tesseract.js)');
  if (options.title) document.setTitle(options.title);
  if (options.author) document.setAuthor(options.author);

  let wordCount = 0;
  for (const page of pages) {
    const pointsPerPixel = 72 / page.dpi;
    const width = page.imageWidth * pointsPerPixel;
    const height = page.imageHeight * pointsPerPixel;
    const target = document.addPage([width, height]);
    const image = page.mimeType === 'image/png' ? await document.embedPng(page.imageBytes) : await document.embedJpg(page.imageBytes);
    target.drawImage(image, { x: 0, y: 0, width, height });
    for (const word of page.words) {
      const text = sanitizeForStandardFont(word.text.trim()).text;
      if (!text.trim()) continue;
      const fontSize = Math.max(4, word.height * pointsPerPixel);
      if (fontSize > 200) continue;
      const x = word.x * pointsPerPixel;
      const y = height - (word.y + word.height) * pointsPerPixel;
      if (x < -5 || y < -5 || x > width + 5 || y > height + 5) continue;
      try {
        target.drawText(text, { x, y: Math.max(0, y), size: fontSize, font, opacity: 0 });
        wordCount += 1;
      } catch {
        // Un mot non encodable est simplement absent de la couche texte.
      }
    }
  }
  return { bytes: await document.save({ useObjectStreams: true }), words: wordCount, pages: pages.length };
}
