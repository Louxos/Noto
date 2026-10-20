import type { OpenDocument } from '../types';
import { formatBytes } from './files';
import { imageSizeFromBytes, svgSizeFromText, tableStatGroup, textStatGroup, fileStatGroup, type StatGroup, type StatRow } from './fileStats';

/**
 * Mesures complètes d’un fichier ouvert : ce qui demande une lecture (PDF,
 * archives bureautiques, images) est fait ici, à la demande.
 *
 * Chaque partie est isolée : si une mesure échoue — PDF protégé, archive
 * abîmée, format non reconnu — le groupe correspondant explique pourquoi au lieu
 * de faire échouer l’ensemble. Une information absente n’est jamais remplacée
 * par une valeur inventée.
 */

const MAX_PDF_STAT_BYTES = 200 * 1024 * 1024;

/** Mesures PDF : pages, dimensions, version, métadonnées lues dans le document. */
export async function pdfStatGroup(bytes: Uint8Array): Promise<StatGroup> {
  const number = (value: number) => value.toLocaleString('fr-FR');
  if (bytes.length === 0) return { id: 'pdf', title: 'Document PDF', rows: [], note: 'Aucune donnée PDF n’est disponible pour ce fichier.' };
  if (bytes.length > MAX_PDF_STAT_BYTES) {
    return { id: 'pdf', title: 'Document PDF', rows: [], note: `Fichier de ${formatBytes(bytes.length)} : les mesures PDF ne sont pas calculées au-delà de ${formatBytes(MAX_PDF_STAT_BYTES)}. Le lecteur PDF affiche toujours le nombre de pages en ouvrant le document.` };
  }
  try {
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const rows: StatRow[] = [{ label: 'Pages', value: number(pdf.getPageCount()) }];
    if (pdf.getPageCount() > 0) {
      const size = pdf.getPage(0).getSize();
      const millimeters = (points: number) => Math.round(points / 72 * 25.4);
      rows.push({ label: 'Page 1', value: `${millimeters(size.width)} × ${millimeters(size.height)} mm (${Math.round(size.width)} × ${Math.round(size.height)} pt)` });
      const orientation = size.width > size.height ? 'paysage' : 'portrait';
      rows.push({ label: 'Orientation', value: orientation });
    }
    const title = pdf.getTitle();
    const author = pdf.getAuthor();
    const producer = pdf.getProducer();
    const creator = pdf.getCreator();
    const creationDate = pdf.getCreationDate();
    const modificationDate = pdf.getModificationDate();
    if (title) rows.push({ label: 'Titre', value: title });
    if (author) rows.push({ label: 'Auteur', value: author });
    if (producer) rows.push({ label: 'Producteur', value: producer });
    if (creator) rows.push({ label: 'Créé avec', value: creator });
    if (creationDate) rows.push({ label: 'Créé le', value: creationDate.toLocaleString('fr-FR') });
    if (modificationDate) rows.push({ label: 'Modifié le', value: modificationDate.toLocaleString('fr-FR') });
    // Un document chiffré s’ouvre en lecture (ignoreEncryption) : on le dit, car
    // certaines mesures peuvent alors être incomplètes.
    if (pdf.isEncrypted) rows.push({ label: 'Chiffrement', value: 'document protégé (lecture seule ici)' });
    return {
      id: 'pdf',
      title: 'Document PDF',
      rows,
      note: pdf.isEncrypted ? 'Le document est protégé : ces informations proviennent de sa structure lisible, sans mot de passe saisi.' : undefined,
    };
  } catch (error) {
    return {
      id: 'pdf',
      title: 'Document PDF',
      rows: [],
      note: `Le document n’a pas pu être analysé : ${error instanceof Error ? error.message : 'erreur inconnue'}. Le lecteur PDF l’affiche via le moteur pdf.js, qui tolère parfois plus de cas.`,
    };
  }
}

/** Mesures d’image : dimensions lues dans l’en-tête, sans décodage complet. */
export function imageStatGroup(document: OpenDocument): StatGroup {
  if (document.extension === 'svg') {
    const size = svgSizeFromText(document.content);
    return {
      id: 'image',
      title: 'Image',
      rows: [
        { label: 'Format', value: 'SVG (vectoriel)' },
        ...(size ? [{ label: 'Dimensions du dessin', value: `${size.width} × ${size.height} px` }] : []),
        { label: 'Poids', value: formatBytes(document.size) },
      ],
      note: size ? 'Un SVG s’adapte à la taille d’affichage : ces dimensions sont celles déclarées dans le fichier.' : 'Ce SVG ne déclare ni largeur ni hauteur : il s’adapte entièrement à son conteneur.',
    };
  }
  const bytes = document.bytes;
  const size = bytes ? imageSizeFromBytes(bytes, document.extension) : null;
  if (!size) {
    return {
      id: 'image',
      title: 'Image',
      rows: [{ label: 'Format', value: document.extension ? document.extension.toUpperCase() : 'inconnu' }],
      note: 'Les dimensions n’ont pas pu être lues dans l’en-tête de ce fichier ; l’image reste affichée normalement par le lecteur.',
    };
  }
  return {
    id: 'image',
    title: 'Image',
    rows: [
      { label: 'Format', value: size.format },
      { label: 'Dimensions', value: `${size.width} × ${size.height} px` },
      { label: 'Pixels', value: (size.width * size.height).toLocaleString('fr-FR') },
      { label: 'Poids', value: formatBytes(document.size) },
      { label: 'Dimensions lues', value: size.note ?? 'en-tête du fichier, sans décodage complet' },
    ],
    note: 'Les métadonnées EXIF/IPTC complètes se lisent dans l’atelier images, à l’outil de lecture des métadonnées.',
  };
}

/** Mesures d’une présentation : nombre de diapositives et de paragraphes. */
export async function presentationStatGroup(bytes: Uint8Array, extension: string): Promise<StatGroup> {
  try {
    const { extractPresentation } = await import('./archiveReader');
    const slides = extractPresentation(bytes, extension);
    const paragraphs = slides.reduce((total, slide) => total + slide.paragraphs.filter((paragraph) => paragraph.trim()).length, 0);
    const images = slides.reduce((total, slide) => total + slide.images.length, 0);
    const characters = slides.reduce((total, slide) => total + slide.paragraphs.join('\n').length, 0);
    return {
      id: 'presentation',
      title: 'Présentation',
      rows: [
        { label: 'Diapositives', value: slides.length.toLocaleString('fr-FR') },
        { label: 'Paragraphes', value: paragraphs.toLocaleString('fr-FR') },
        { label: 'Caractères', value: characters.toLocaleString('fr-FR') },
        { label: 'Images intégrées', value: images.toLocaleString('fr-FR') },
      ],
      note: 'Ces mesures portent sur le contenu extrait du fichier, pas sur sa mise en page d’origine.',
    };
  } catch (error) {
    return {
      id: 'presentation',
      title: 'Présentation',
      rows: [],
      note: `Le contenu n’a pas pu être extrait : ${error instanceof Error ? error.message : 'erreur inconnue'}.`,
    };
  }
}

/** Mesures d’un document bureautique ou d’un livre : parties, paragraphes, caractères. */
export async function documentStatGroup(bytes: Uint8Array, extension: string): Promise<StatGroup> {
  try {
    const { extractOfficeChapters } = await import('./archiveReader');
    const chapters = extractOfficeChapters(bytes, extension);
    const characters = chapters.reduce((total, chapter) => total + chapter.text.length, 0);
    const paragraphs = chapters.reduce((total, chapter) => total + chapter.text.split(/\n{2,}/u).filter((block) => block.trim()).length, 0);
    return {
      id: 'document',
      title: extension === 'epub' ? 'Livre numérique' : 'Document',
      rows: [
        { label: extension === 'epub' ? 'Parties' : 'Sections', value: chapters.length.toLocaleString('fr-FR') },
        { label: 'Paragraphes', value: paragraphs.toLocaleString('fr-FR') },
        { label: 'Caractères', value: characters.toLocaleString('fr-FR') },
        { label: 'Mots', value: chapters.reduce((total, chapter) => total + (chapter.text.match(/\S+/gu)?.length ?? 0), 0).toLocaleString('fr-FR') },
      ],
      note: 'Mesures prises sur le texte extrait, sans mise en page.',
    };
  } catch (error) {
    return {
      id: 'document',
      title: extension === 'epub' ? 'Livre numérique' : 'Document',
      rows: [],
      note: `Le contenu n’a pas pu être extrait : ${error instanceof Error ? error.message : 'erreur inconnue'}.`,
    };
  }
}

/**
 * Toutes les mesures disponibles pour un document ouvert.
 *
 * `viewerReadout` reçoit les chiffres que le lecteur affiché connaît déjà mieux
 * que quiconque (page courante d’un PDF, diapositive affichée, lignes d’un
 * tableau tel qu’il est rendu) : ils sont affichés tels quels, sans recalcul.
 */
export async function collectFileStats(document: OpenDocument, viewerReadout: StatRow[] = []): Promise<StatGroup[]> {
  const groups: StatGroup[] = [fileStatGroup(document)];
  const bytes = document.bytes;
  const isText = ['markdown', 'text', 'code', 'html', 'csv', 'unknown'].includes(document.kind);

  if (isText && document.content.length > 0) {
    if (document.kind === 'csv') groups.push(tableStatGroup(document.content, document.extension));
    else groups.push(textStatGroup(document.content, { truncated: document.truncated, encoding: document.textEncoding }));
  }
  if (document.kind === 'pdf' && bytes) groups.push(await pdfStatGroup(bytes));
  if (document.kind === 'image') groups.push(imageStatGroup(document));
  if (document.kind === 'presentation' && bytes) groups.push(await presentationStatGroup(bytes, document.extension));
  if ((document.kind === 'document' || document.kind === 'ebook') && bytes) groups.push(await documentStatGroup(bytes, document.extension));
  if (viewerReadout.length) groups.push({ id: 'viewer', title: 'Affichage en cours', rows: viewerReadout });
  return groups;
}

export function statRowsToMarkdown(document: OpenDocument, groups: StatGroup[]): string {
  const lines = [`# Informations sur ${document.name}`, ''];
  for (const group of groups) {
    if (!group.rows.length && !group.note) continue;
    lines.push(`## ${group.title}`, '');
    for (const row of group.rows) lines.push(`- **${row.label}** : ${row.value}`);
    if (group.note) lines.push('', `> ${group.note}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
