import type { OpenDocument } from '../types';
import { detectDelimiter, parseCsv } from './csv';
import { sanitizeHtmlForPrint } from './security';
import {
  MAX_PRINT_PAGES, PRINT_DPI, collectAppStyles, createPrintUrl, imagePrintSection, tablePrintSections,
  textPrintSection, type PrintJob, type PrintQuality,
} from './printing';

/**
 * Préparation d’un travail d’impression pour un fichier ouvert.
 *
 * Ce module est le seul à connaître les formats : il transforme un document en
 * sections imprimables, en expliquant ce qui est complet et ce qui est borné
 * (nombre de pages, lignes d’un tableau, mise en page reconstruite).
 */

export interface PrintRequest {
  document: OpenDocument;
  /** PDF : page affichée ou document entier. Ignoré pour les autres formats. */
  scope: 'current' | 'all';
  currentPage: number;
  quality: PrintQuality;
  lineNumbers: boolean;
  /** Contenu déjà rendu à l’écran (Markdown, aperçu HTML), à imprimer tel quel. */
  renderedHtml?: string;
}

export interface PreparedPrint {
  job: PrintJob;
  notes: string[];
  /** Adresses locales créées pour l’impression, à libérer ensuite. */
  urls: string[];
}

/** Sections imprimables d’une présentation : une par diapositive, texte extrait. */
async function presentationSections(bytes: Uint8Array, extension: string): Promise<{ sections: string[]; note?: string }> {
  // Les archives bureautiques ne sont chargées que si l’on imprime vraiment :
  // le paquet principal de Noto reste léger.
  const { extractPresentation } = await import('./archiveReader');
  const slides = extractPresentation(bytes, extension);
  const sections = slides.map((slide) => {
    const paragraphs = slide.paragraphs.filter((paragraph) => paragraph.trim() && paragraph.trim() !== slide.title.trim());
    const body = paragraphs.length ? paragraphs.map((paragraph) => `<p>${escapeText(paragraph)}</p>`).join('') : '<p><em>Diapositive sans texte.</em></p>';
    return `<h2>Diapositive ${slide.number} — ${escapeText(slide.title)}</h2>${body}`;
  });
  return {
    sections: sections.length ? sections : ['<p>Cette présentation ne contient aucun texte imprimable.</p>'],
    note: 'Chaque diapositive est imprimée sur une page, à partir du texte et des titres extraits ; la mise en page d’origine et les images ne sont pas reproduites.',
  };
}

/** Sections imprimables d’un document bureautique ou d’un livre : une par partie. */
async function documentSections(bytes: Uint8Array, extension: string): Promise<{ sections: string[]; note?: string }> {
  const { extractOfficeChapters } = await import('./archiveReader');
  const chapters = extractOfficeChapters(bytes, extension);
  const sections = chapters.map((chapter) => {
    const paragraphs = chapter.text.split(/\n{2,}/u).map((block) => block.trim()).filter(Boolean);
    const body = paragraphs.map((paragraph) => `<p>${escapeText(paragraph)}</p>`).join('');
    return `<h2>${escapeText(chapter.title)}</h2>${body || '<p><em>Partie sans texte.</em></p>'}`;
  });
  return {
    sections: sections.length ? sections : ['<p>Aucun texte imprimable n’a été trouvé dans ce document.</p>'],
    note: 'Le texte est imprimé dans l’ordre des parties ; la mise en page d’origine et les images ne sont pas reproduites.',
  };
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[character] ?? character);
}

/** Une image : le fichier lui-même, sans réencodage. */
function imageSections(document: OpenDocument, renderedHtml: string | undefined, urls: string[]): { sections: string[]; notes: string[] } {
  if (renderedHtml) return { sections: [renderedHtml], notes: [] };
  if (document.bytes?.length) {
    const url = createPrintUrl(document.bytes, document.mimeType);
    urls.push(url);
    return { sections: [imagePrintSection(url, document.name)], notes: [] };
  }
  if (document.extension === 'svg' && document.content) {
    return { sections: [document.content], notes: ['Le SVG est imprimé tel quel : le navigateur d’impression n’exécute aucun script qu’il contiendrait.'] };
  }
  return { sections: ['<p>Cette image ne contient aucune donnée imprimable.</p>'], notes: [] };
}

/**
 * Rasterise les pages d’un PDF aux dimensions demandées.
 *
 * C’est un rendu d’image, pas le PDF d’origine : l’impression reste fidèle à
 * l’affichage de Noto, mais le texte imprimé n’est pas sélectionnable. Les
 * pages sont bornées pour ne pas saturer la mémoire ni l’imprimante.
 */
async function pdfSections(request: PrintRequest, urls: string[]): Promise<{ sections: string[]; notes: string[] }> {
  const { document } = request;
  if (!document.bytes?.length) return { sections: ['<p>Ce document PDF ne contient aucune donnée lisible.</p>'], notes: [] };
  const { openPdf, renderPageToBytes, dpiToScale } = await import('./pdf/pdfEngine');
  const pdf = await openPdf(document.bytes);
  try {
    const total = pdf.numPages;
    const pages = request.scope === 'current'
      ? [Math.min(Math.max(1, request.currentPage), total)]
      : Array.from({ length: Math.min(total, MAX_PRINT_PAGES) }, (_, index) => index + 1);
    const scale = dpiToScale(PRINT_DPI[request.quality]);
    const sections: string[] = [];
    const notes: string[] = [];
    for (const pageNumber of pages) {
      const page = await pdf.getPage(pageNumber);
      try {
        const rendered = await renderPageToBytes(page, { scale, mimeType: 'image/jpeg', quality: 0.88 });
        const url = createPrintUrl(rendered.bytes, 'image/jpeg');
        urls.push(url);
        sections.push(imagePrintSection(url, `Page ${pageNumber} sur ${total}`));
      } finally {
        page.cleanup();
      }
    }
    if (request.scope === 'all' && total > pages.length) {
      notes.push(`${pages.length} pages sur ${total} sont imprimées : au-delà de ${MAX_PRINT_PAGES} pages, l’impression est bornée pour ne pas saturer la mémoire.`);
    }
    notes.push('Les pages sont imprimées comme images du rendu Noto : la qualité suit la résolution choisie, et le texte imprimé n’est pas sélectionnable.');
    return { sections, notes };
  } finally {
    await pdf.destroy();
  }
}

/** Construit le travail d’impression complet pour un document. */
export async function preparePrintJob(request: PrintRequest): Promise<PreparedPrint> {
  const { document } = request;
  const notes: string[] = [];
  const urls: string[] = [];
  const title = document.name;
  const subtitle = `Imprimé depuis Noto · ${new Date().toLocaleString('fr-FR')}`;

  if (document.kind === 'pdf') {
    const { sections, notes: pdfNotes } = await pdfSections(request, urls);
    return { job: { title, subtitle, sections }, notes: pdfNotes, urls };
  }
  if (document.kind === 'image') {
    const { sections, notes: imageNotes } = imageSections(document, request.renderedHtml, urls);
    return { job: { title, subtitle, sections }, notes: imageNotes, urls };
  }
  if (document.kind === 'csv') {
    const { sections, note } = tablePrintSections(document.content);
    if (note) notes.push(note);
    return { job: { title, subtitle, sections }, notes, urls };
  }
  if (document.kind === 'html') {
    // L’aperçu HTML vit dans une iframe isolée, impossible à copier : le fichier
    // est assaini puis remis en page. Les scripts et les ressources distantes
    // n’arrivent jamais dans la page d’impression.
    const { html, styles } = sanitizeHtmlForPrint(document.content);
    notes.push('Le HTML est imprimé à partir de son balisage assaini (scripts et éléments distants retirés) ; les images distantes ne sont pas chargées.');
    return { job: { title, subtitle, sections: [html || '<p>Ce fichier HTML ne contient rien à imprimer.</p>'], styles }, notes, urls };
  }
  if (document.kind === 'markdown' && request.renderedHtml) {
    // Le rendu est copié de la fenêtre : les styles de l’application sont
    // recopiés avec lui, sans quoi le Markdown sortirait sans sa mise en forme.
    return { job: { title, subtitle, sections: [request.renderedHtml], styles: collectAppStyles() }, notes, urls };
  }
  if (document.kind === 'presentation' && document.bytes) {
    const { sections, note } = await presentationSections(document.bytes, document.extension);
    if (note) notes.push(note);
    return { job: { title, subtitle, sections }, notes, urls };
  }
  if ((document.kind === 'document' || document.kind === 'ebook') && document.bytes) {
    const { sections, note } = await documentSections(document.bytes, document.extension);
    if (note) notes.push(note);
    return { job: { title, subtitle, sections }, notes, urls };
  }
  if (request.renderedHtml) return { job: { title, subtitle, sections: [request.renderedHtml] }, notes, urls };
  return {
    job: { title, subtitle, sections: [textPrintSection(document.content, { lineNumbers: request.lineNumbers })] },
    notes,
    urls,
  };
}

/** Nombre de sections prévues, pour l’annoncer avant d’imprimer. */
export function describePrintScope(request: PrintRequest, prepared: PreparedPrint): string {
  const { document } = request;
  if (document.kind === 'pdf') {
    return request.scope === 'current'
      ? `Page ${request.currentPage} du PDF, rendue à ${PRINT_DPI[request.quality]} ppp.`
      : `Toutes les pages du PDF (dans la limite de ${MAX_PRINT_PAGES}), rendues à ${PRINT_DPI[request.quality]} ppp.`;
  }
  if (document.kind === 'csv') {
    const parsed = parseCsv(document.content, detectDelimiter(document.content));
    const rows = Math.min(Math.max(0, parsed.rows.length - 1), 2_000);
    return `${rows.toLocaleString('fr-FR')} lignes du tableau, dans une limite de 2 000 lignes par impression.`;
  }
  if (document.kind === 'presentation') return `${prepared.job.sections.length} diapositive(s), une par page.`;
  if (document.kind === 'document' || document.kind === 'ebook') return `${prepared.job.sections.length} partie(s), dans l’ordre du document.`;
  if (document.kind === 'image') return 'L’image, ajustée à la largeur de la page.';
  if ((document.kind === 'markdown' || document.kind === 'html') && request.renderedHtml) {
    return `Le rendu affiché (${document.content.length.toLocaleString('fr-FR')} caractères), copié tel quel dans la page imprimée.`;
  }
  return `Le contenu affiché (${document.content.length.toLocaleString('fr-FR')} caractères), mis en page par Noto.`;
}
