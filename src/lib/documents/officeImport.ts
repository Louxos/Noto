import type { FormatId } from './formats';
import { extractOfficeChapters, extractPresentation } from '../archiveReader';
import type { DocumentBlock } from './pdfRender';

/**
 * Import des documents bureautiques et livres numériques.
 *
 * Noto lit réellement le contenu des archives Office (texte, images courantes)
 * et le transforme en blocs réutilisables par l’export PDF, l’export DOCX ou
 * l’extraction de texte. Aucune macro n’est exécutée, aucun script incorporé
 * n’est interprété : seuls les éléments de contenu sont lus.
 */

export interface ImportedDocument {
  blocks: DocumentBlock[];
  warnings: string[];
  title: string;
}

export function importOfficeDocument(bytes: Uint8Array, format: FormatId, name: string): ImportedDocument {
  const warnings: string[] = [];
  if (format === 'pptx' || format === 'odp') {
    const slides = extractPresentation(bytes, format);
    const blocks: DocumentBlock[] = [];
    for (const slide of slides) {
      blocks.push({ type: 'heading', level: 2, text: `Diapositive ${slide.number} — ${slide.title}` });
      for (const paragraph of slide.paragraphs) {
        if (paragraph !== slide.title) blocks.push({ type: 'paragraph', text: paragraph });
      }
      for (const image of slide.images) {
        const decoded = decodeDataUrl(image.src);
        if (decoded) blocks.push({ type: 'image', bytes: decoded.bytes, width: decoded.width, height: decoded.height, caption: image.alt });
      }
      for (const image of slide.images) {
        if (!decodeDataUrl(image.src)) warnings.push(`Une image de la diapositive ${slide.number} n’a pas pu être intégrée (format non pris en charge).`);
      }
      blocks.push({ type: 'pagebreak' });
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === 'pagebreak') blocks.pop();
    warnings.push('Les animations, transitions et mises en page complexes ne sont pas reproduites : le rendu est reconstruit à partir du texte et des images.');
    return { blocks, warnings, title: name };
  }

  const chapters = extractOfficeChapters(bytes, format);
  const blocks: DocumentBlock[] = [];
  for (const chapter of chapters) {
    blocks.push({ type: 'heading', level: 1, text: chapter.title });
    for (const paragraph of chapter.text.split(/\n{2,}/u)) {
      const trimmed = paragraph.trim();
      if (trimmed) blocks.push({ type: 'paragraph', text: trimmed });
    }
  }
  if (!blocks.length) throw new Error('Aucun contenu lisible n’a été trouvé dans ce document.');
  warnings.push(format === 'rtf'
    ? 'Le RTF est lu en texte : la mise en forme (gras, couleurs, tableaux) n’est pas conservée.'
    : 'Le document est lu en texte et en images simples ; la mise en page d’origine n’est pas reproduite.');
  return { blocks, warnings, title: name };
}

function decodeDataUrl(src: string): { bytes: Uint8Array; width: number; height: number } | null {
  const match = /^data:(image\/[a-z+]+);base64,(.*)$/u.exec(src);
  if (!match) return null;
  try {
    const binary = typeof atob === 'function' ? atob(match[2]) : '';
    if (!binary) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, width: 480, height: 360 };
  } catch {
    return null;
  }
}
