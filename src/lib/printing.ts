import { parseCsv, detectDelimiter } from './csv';
import { escapeHtml } from './highlighting';

/**
 * Impression.
 *
 * Noto imprime ce qu’il affiche réellement, sans passer par un service :
 *  - texte, code, Markdown, HTML et tableaux sont mis en page par Noto ;
 *  - les PDF et les images sont transformés en pages imprimables à la
 *    résolution choisie.
 *
 * L’impression elle-même se fait par la boîte de dialogue du système, dans une
 * iframe hors écran : c’est le seul moyen d’imprimer sans quitter l’application,
 * et cela fonctionne aussi bien dans la fenêtre Tauri que dans un navigateur.
 */

/** Résolution d’impression proposée pour les documents transformés en images. */
export type PrintQuality = 'rapide' | 'normale' | 'haute';

export const PRINT_DPI: Record<PrintQuality, number> = { rapide: 96, normale: 150, haute: 300 };

export const PRINT_QUALITY_LABELS: Record<PrintQuality, string> = {
  rapide: 'Rapide (96 ppp)',
  normale: 'Normale (150 ppp)',
  haute: 'Haute (300 ppp)',
};

/** Au-delà, la mise en page serait longue et le rendu mémoire important. */
export const MAX_PRINT_PAGES = 200;
export const MAX_PRINT_ROWS = 2_000;

export interface PrintJob {
  title: string;
  /** Corps de la page imprimée : chaque section commence sur une nouvelle page. */
  sections: string[];
  /** Note affichée sous le titre dans l’en-tête imprimé. */
  subtitle?: string;
  /** Styles de l’application, copiés pour un contenu rendu à l’écran. */
  styles?: string;
}

const PRINT_STYLE = `
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  /* Les styles de l’application sont recopiés avant ceux-ci : ils imposent une
     fenêtre de hauteur fixe et sans défilement, ce qui couperait l’impression à
     la première page. La page imprimée repart donc d’une feuille libre. */
  html, body { width: auto !important; height: auto !important; min-width: 0 !important; max-height: none !important; overflow: visible !important; }
  body { margin: 0; color: #1c1d26; background: #fff; font: 11pt/1.5 'Segoe UI', Arial, sans-serif; }
  header.print-head { border-bottom: 1px solid #d8d8e0; margin-bottom: 8mm; padding-bottom: 3mm; }
  header.print-head h1 { margin: 0; font-size: 14pt; }
  header.print-head p { margin: 1mm 0 0; color: #5c5d6b; font-size: 9pt; }
  section.print-section { break-after: page; }
  section.print-section:last-child { break-after: auto; }
  pre.print-code { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 9.5pt/1.45 'Cascadia Code', Consolas, monospace; }
  pre.print-code.is-nowrap { white-space: pre; }
  table.print-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.print-table th, table.print-table td { border: 1px solid #d8d8e0; padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
  table.print-table thead th { background: #f1f1f6; }
  img.print-image { max-width: 100%; max-height: 240mm; display: block; margin: 0 auto; }
  img.print-page { max-width: 100%; max-height: 250mm; display: block; margin: 0 auto; }
  footer.print-note { margin-top: 6mm; color: #5c5d6b; font-size: 8.5pt; border-top: 1px solid #d8d8e0; padding-top: 2mm; }
  /* Le contenu rendu à l’écran garde ses styles, mais la coque de l’application
     est neutralisée : rien de la fenêtre Noto ne doit se retrouver sur papier. */
  .app-shell, .main-area, .reader-scroll, .markdown-body, .code-viewport, .css-viewer { display: block !important; height: auto !important; max-height: none !important; overflow: visible !important; }
  .code-viewport { border: 0 !important; }
  .topbar, .menubar, .sidebar, .tab-strip, .document-statusbar, .viewer-tools, .pdf-tools, .immersive-exit, .context-menu-popover, .toast { display: none !important; }
`;

/** Assemble la page imprimée. Le titre est échappé comme le reste du contenu. */
export function buildPrintHtml(job: PrintJob): string {
  const sections = job.sections.map((section) => `<section class="print-section">${section}</section>`).join('\n');
  const subtitle = job.subtitle ? `<p>${escapeHtml(job.subtitle)}</p>` : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'" />
<title>${escapeHtml(job.title)}</title>
<style>${job.styles ?? ''}</style>
<style>${PRINT_STYLE}</style>
</head>
<body>
<header class="print-head"><h1>${escapeHtml(job.title)}</h1>${subtitle}</header>
${sections}
<footer class="print-note">Imprimé depuis Noto. Traitement local : aucun contenu n’a été envoyé en ligne.</footer>
</body>
</html>`;
}

/**
 * Texte brut, échappé, avec numéros de ligne facultatifs.
 *
 * Les numéros sont écrits dans chaque ligne plutôt que dans une colonne séparée :
 * une ligne trop longue qui se replie reste ainsi rattachée à son numéro, ce
 * qu’une gouttière en deux blocs ne saurait pas faire à l’impression.
 */
export function textPrintSection(content: string, options: { lineNumbers?: boolean; wrap?: boolean } = {}): string {
  const classes = `print-code ${options.wrap === false ? 'is-nowrap' : ''}`.trim();
  if (!content.length) return `<pre class="${classes}"> </pre>`;
  if (!options.lineNumbers) return `<pre class="${classes}">${escapeHtml(content)}</pre>`;
  const lines = content.split(/\r\n|\r|\n/u);
  const width = String(lines.length).length;
  const numbered = lines
    .map((line, index) => `${String(index + 1).padStart(width, ' ')} │ ${line}`)
    .join('\n');
  return `<pre class="${classes}">${escapeHtml(numbered)}</pre>`;
}

/** Tableau imprimé à partir du texte CSV/TSV, borné en lignes. */
export function tablePrintSections(content: string, options: { maxRows?: number } = {}): { sections: string[]; note?: string } {
  const maxRows = options.maxRows ?? MAX_PRINT_ROWS;
  const parsed = parseCsv(content, detectDelimiter(content));
  if (!parsed.rows.length) return { sections: ['<p>Ce tableau est vide.</p>'] };
  const [header, ...body] = parsed.rows;
  const shown = body.slice(0, maxRows);
  const head = `<tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>`;
  const rows = shown.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('\n');
  return {
    sections: [`<table class="print-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`],
    note: body.length > shown.length
      ? `${shown.length.toLocaleString('fr-FR')} lignes sur ${body.length.toLocaleString('fr-FR')} sont imprimées : au-delà, le tableau est tronqué pour ne pas saturer l’imprimante.`
      : undefined,
  };
}

/** Une image imprimable, à partir d’une adresse locale (objet ou donnée). */
export function imagePrintSection(url: string, alt: string): string {
  return `<img class="print-image" src="${url}" alt="${escapeHtml(alt)}" />`;
}

/**
 * Adresse locale d’un contenu binaire, pour l’iframe d’impression.
 *
 * Une adresse d’objet est préférée à une adresse de données : imprimer un PDF de
 * 200 pages en base64 doublerait la mémoire occupée pour un gain nul, l’iframe
 * appartenant au même document.
 */
export function createPrintUrl(bytes: Uint8Array, mimeType: string): string {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

/** Libère les adresses locales une fois l’impression lancée. */
export function releasePrintUrls(urls: string[], delayMs = 30_000): void {
  if (!urls.length) return;
  window.setTimeout(() => { for (const url of urls) URL.revokeObjectURL(url); }, delayMs);
}

/**
 * Ouvre une iframe hors écran, y écrit la page, attend le chargement des images
 * puis demande l’impression au système. L’iframe est retirée ensuite : Noto ne
 * laisse aucune fenêtre ouverte après l’impression.
 */
export async function printHtmlDocument(html: string, options: { timeoutMs?: number } = {}): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Aperçu d’impression');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.opacity = '0';
  frame.style.border = '0';
  frame.style.pointerEvents = 'none';
  document.body.appendChild(frame);

  const cleanup = () => { window.setTimeout(() => frame.remove(), 1_000); };
  try {
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument) throw new Error('L’aperçu d’impression n’a pas pu être préparé dans cet environnement.');
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('L’aperçu d’impression n’a pas répondu à temps.')), options.timeoutMs ?? 20_000);
      frame.addEventListener('load', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      frameDocument.open();
      frameDocument.write(html);
      frameDocument.close();
    });
    // Les images (pages de PDF, photos) doivent être décodées avant l’impression,
    // sinon les pages sortiraient blanches.
    await waitForImages(frameDocument);
    frameWindow.focus();
    frameWindow.print();
    cleanup();
  } catch (error) {
    cleanup();
    throw error;
  }
}

function waitForImages(frameDocument: Document, timeoutMs = 15_000): Promise<void> {
  const images = [...frameDocument.images];
  if (!images.length) return Promise.resolve();
  const pending = images.filter((image) => !image.complete);
  if (!pending.length) return Promise.resolve();
  return new Promise((resolve) => {
    let remaining = pending.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
    };
    const timer = window.setTimeout(resolve, timeoutMs);
    for (const image of pending) {
      image.addEventListener('load', () => { window.clearTimeout(timer); done(); }, { once: true });
      image.addEventListener('error', () => { window.clearTimeout(timer); done(); }, { once: true });
    }
  });
}

/**
 * Styles de l’application, recopiés dans la page imprimée pour qu’un contenu
 * rendu à l’écran (Markdown, aperçu HTML) s’imprime avec la même mise en forme.
 *
 * Les règles sont **recopiées** (et non liées par une adresse) : la page
 * imprimée n’a ainsi besoin d’aucun chargement, ce que sa politique de sécurité
 * interdit de toute façon. Une feuille d’une autre origine serait illisible :
 * elle est ignorée, jamais contournée.
 */
export function collectAppStyles(source: Document = document): string {
  const parts: string[] = [];
  let readable = 0;
  for (const sheet of Array.from(source.styleSheets ?? [])) {
    try {
      const text = Array.from(sheet.cssRules ?? []).map((rule) => rule.cssText).join('\n');
      if (text.trim()) { parts.push(text); readable += 1; }
    } catch {
      // Feuille non lisible (origine différente) : ignorée volontairement.
    }
  }
  if (!readable) {
    // Repli quand l’interface CSSOM n’est pas disponible : le texte des styles
    // déjà présents dans le document suffit à la mise en page imprimée.
    for (const node of source.querySelectorAll('style')) {
      if (node.textContent?.trim()) parts.push(node.textContent);
    }
  }
  return parts.join('\n');
}

/**
 * Image d’un lecteur d’image, prête à imprimer.
 *
 * La rotation choisie à l’écran est conservée ; le zoom ne l’est pas, une image
 * imprimée occupant la largeur de la page. Les formats que le navigateur ne sait
 * pas afficher (TIFF) arrivent ici sous forme d’image déjà convertie.
 */
export function extractRenderedImage(element: Element): string | null {
  const image = element.querySelector('img');
  const source = image?.getAttribute('src') ?? '';
  if (!source) return null;
  const transform = image?.getAttribute('style') ?? '';
  const rotation = /rotate\(\s*(-?\d+(?:\.\d+)?)deg\s*\)/u.exec(transform)?.[1];
  const style = rotation ? ` style="transform: rotate(${rotation}deg)"` : '';
  const alt = escapeHtml(image?.getAttribute('alt') ?? 'Image');
  return `<img class="print-image" src="${escapeHtml(source)}" alt="${alt}"${style} />`;
}

/**
 * Clone d’un contenu déjà rendu à l’écran, prêt à imprimer.
 *
 * Sont retirés : les commandes (boutons, champs, liens d’action) et les repères
 * purement visuels. Les `canvas` sont remplacés par une image de leur contenu,
 * sans quoi une page de PDF s’imprimerait blanche.
 */
export function cloneRenderedForPrint(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const unwanted of clone.querySelectorAll('button, input, select, textarea, nav, [role="toolbar"], [aria-hidden="true"]')) {
    unwanted.remove();
  }
  const sources = [...element.querySelectorAll('canvas')];
  const targets = [...clone.querySelectorAll('canvas')];
  targets.forEach((canvas, index) => {
    const source = sources[index];
    if (!source || !source.width || !source.height) { canvas.remove(); return; }
    let replacement: HTMLImageElement;
    try {
      replacement = document.createElement('img');
      replacement.src = source.toDataURL('image/png');
    } catch {
      canvas.remove();
      return;
    }
    replacement.alt = canvas.getAttribute('aria-label') ?? 'Aperçu imprimé';
    replacement.className = 'print-canvas-image';
    canvas.replaceWith(replacement);
  });
  for (const node of clone.querySelectorAll<HTMLElement>('[tabindex], [contenteditable], [data-context-menu]')) {
    node.removeAttribute('tabindex');
    node.removeAttribute('contenteditable');
    node.removeAttribute('data-context-menu');
  }
  return clone.innerHTML;
}
