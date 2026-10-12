import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Bookmark, BookOpen, ChevronLeft, ChevronRight, Copy, FileText, List, Minus, Plus, Search, X, ZoomIn } from 'lucide-react';
import type { OpenDocument } from '../types';
import { ContextMenu, type MenuEntry } from './WorkspaceTools';
import { readPdfLocalState, writePdfLocalState } from '../lib/pdfState';

GlobalWorkerOptions.workerSrc = workerUrl;

type FitMode = 'width' | 'page' | 'actual';
type PdfSidebarTab = 'outline' | 'bookmarks' | 'pages';
interface SearchRequest { id: number; backwards: boolean }
interface PdfSearchState { query: string; pages: number[]; occurrences: number; searching: boolean; scannedPages: number; totalPages: number }
interface PdfOutlineEntry { title: string; page: number; depth: number }
interface RawOutlineItem { title?: string; dest?: string | unknown[] | null; items?: RawOutlineItem[] }

const EMPTY_SEARCH: PdfSearchState = { query: '', pages: [], occurrences: 0, searching: false, scannedPages: 0, totalPages: 0 };

export function PdfViewer({ document, searchQuery, searchRequest, fileContextItems }: { document: OpenDocument; searchQuery: string; searchRequest: SearchRequest | null; fileContextItems: MenuEntry[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const handledRequestId = useRef(0);
  const pdfIdentifier = `${document.source}:${document.path || document.name}`;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchState, setSearchState] = useState<PdfSearchState>(EMPTY_SEARCH);
  const [stageSize, setStageSize] = useState({ width: 960, height: 680 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
  const [outlineLoading, setOutlineLoading] = useState(true);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [sidebarTab, setSidebarTab] = useState<PdfSidebarTab | null>(null);
  const [pageTextOpen, setPageTextOpen] = useState(false);
  const [pageText, setPageText] = useState('');
  const [pageTextLoading, setPageTextLoading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');

  useEffect(() => {
    setPdf(null);
    setPageCount(0);
    setPageNumber(1);
    setBookmarks([]);
    setLoading(true);
    setError('');
    setSearchState(EMPTY_SEARCH);
    setOutline([]);
    setOutlineLoading(true);
    setPageText('');
    handledRequestId.current = 0;
    if (!document.bytes?.length) {
      setError('Ce document PDF ne contient aucune donnée lisible.');
      setOutlineLoading(false);
      setLoading(false);
      return;
    }
    const task = getDocument({ data: document.bytes.slice() });
    task.promise.then(async (loaded) => {
      setPdf(loaded);
      setPageCount(loaded.numPages);
      const saved = readPdfLocalState(pdfIdentifier);
      setPageNumber(Math.max(1, Math.min(loaded.numPages || 1, saved.lastPage)));
      setBookmarks(saved.bookmarks.filter((page) => page <= loaded.numPages));
      setLoading(false);
      try {
        const items = await loaded.getOutline();
        if (items) setOutline(await resolveOutline(loaded, items as RawOutlineItem[]));
        setOutlineLoading(false);
      } catch {
        setOutline([]);
        setOutlineLoading(false);
      }
    }).catch(() => {
      setError('Ce fichier PDF est invalide ou ne peut pas être ouvert.');
      setOutlineLoading(false);
      setLoading(false);
    });
    return () => { void task.destroy(); };
  }, [document.id, document.bytes, pdfIdentifier]);

  useEffect(() => {
    if (!pdf || !pageCount) return;
    writePdfLocalState(pdfIdentifier, { lastPage: pageNumber, bookmarks });
  }, [bookmarks, pageCount, pageNumber, pdf, pdfIdentifier]);

  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    const canvas = canvasRef.current;

    pdf.getPage(pageNumber).then(async (page) => {
      if (cancelled) return;
      const unitViewport = page.getViewport({ scale: 1 });
      const widthScale = Math.max(0.2, (stageSize.width - 64) / unitViewport.width);
      const heightScale = Math.max(0.2, (stageSize.height - 56) / unitViewport.height);
      const baseScale = fitMode === 'actual' ? 1 : fitMode === 'page' ? Math.min(widthScale, heightScale) : widthScale;
      const scale = Math.min(3.5, baseScale * zoom);
      const viewport = page.getViewport({ scale });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas indisponible');
      canvas.width = Math.round(viewport.width * pixelRatio);
      canvas.height = Math.round(viewport.height * pixelRatio);
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, viewport.width, viewport.height);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    }).catch((renderError: unknown) => {
      if (!cancelled && (renderError as { name?: string }).name !== 'RenderingCancelledException') {
        setError('Impossible d’afficher cette page PDF.');
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, fitMode, zoom, stageSize]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!pdf || !trimmedQuery) {
      setSearchState(trimmedQuery ? { query: trimmedQuery, pages: [], occurrences: 0, searching: false, scannedPages: 0, totalPages: pdf?.numPages ?? 0 } : EMPTY_SEARCH);
      return;
    }

    let cancelled = false;
    setSearchState({ query: trimmedQuery, pages: [], occurrences: 0, searching: true, scannedPages: 0, totalPages: pdf.numPages });
    const timeout = window.setTimeout(() => {
      void (async () => {
        const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const expression = new RegExp(escaped, 'gi');
        const pages: number[] = [];
        let occurrences = 0;
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          const content = await page.getTextContent();
          const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
          let pageOccurrences = 0;
          for (const _match of text.matchAll(expression)) pageOccurrences += 1;
          if (pageOccurrences) {
            pages.push(number);
            occurrences += pageOccurrences;
          }
          if (number % 8 === 0) {
            setSearchState({ query: trimmedQuery, pages: [...pages], occurrences, searching: true, scannedPages: number, totalPages: pdf.numPages });
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          }
          if (cancelled) return;
        }
        setSearchState({ query: trimmedQuery, pages, occurrences, searching: false, scannedPages: pdf.numPages, totalPages: pdf.numPages });
        if (pages.length) setPageNumber(pages[0]);
      })().catch(() => {
        if (!cancelled) setSearchState({ query: trimmedQuery, pages: [], occurrences: 0, searching: false, scannedPages: 0, totalPages: pdf.numPages });
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [pdf, searchQuery]);

  useEffect(() => {
    if (!searchRequest || searchRequest.id === handledRequestId.current || searchState.query !== searchQuery.trim() || !searchState.pages.length) return;
    handledRequestId.current = searchRequest.id;
    const currentIndex = searchState.pages.indexOf(pageNumber);
    const nextIndex = searchRequest.backwards
      ? (currentIndex < 0 ? searchState.pages.length - 1 : (currentIndex - 1 + searchState.pages.length) % searchState.pages.length)
      : (currentIndex < 0 ? 0 : (currentIndex + 1) % searchState.pages.length);
    setPageNumber(searchState.pages[nextIndex]);
  }, [pageNumber, searchQuery, searchRequest, searchState]);

  useEffect(() => {
    if (!pdf || !pageTextOpen) return;
    let cancelled = false;
    setPageText('');
    setCopyFeedback('');
    setPageTextLoading(true);
    void pdf.getPage(pageNumber).then((page) => page.getTextContent()).then((content) => {
      if (cancelled) return;
      let result = '';
      let previousY: number | null = null;
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const y = item.transform?.[5] ?? null;
        if (result && y !== null && previousY !== null && Math.abs(y - previousY) > 2) result += '\n';
        else if (result && !result.endsWith('\n')) result += ' ';
        result += item.str;
        previousY = y;
      }
      setPageText(result || 'Aucun texte extractible sur cette page.');
    }).catch(() => {
      if (!cancelled) setPageText('Impossible d’extraire le texte de cette page.');
    }).finally(() => { if (!cancelled) setPageTextLoading(false); });
    return () => { cancelled = true; };
  }, [pageNumber, pageTextOpen, pdf]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setPageNumber((current) => Math.min(pageCount || 1, current + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setPageNumber((current) => Math.max(1, current - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageCount]);

  function setPage(value: number) {
    setPageNumber(Math.max(1, Math.min(pageCount || 1, value)));
  }

  const isBookmarked = bookmarks.includes(pageNumber);
  const toggleBookmark = useCallback(() => {
    setBookmarks((current) => current.includes(pageNumber)
      ? current.filter((page) => page !== pageNumber)
      : [...current, pageNumber].sort((left, right) => left - right).slice(0, 100));
  }, [pageNumber]);

  const copyPageText = useCallback(async () => {
    if (!navigator.clipboard?.writeText) { setCopyFeedback('Presse-papiers indisponible.'); return; }
    try {
      await navigator.clipboard.writeText(pageText);
      setCopyFeedback('Texte copié.');
      window.setTimeout(() => setCopyFeedback(''), 1_800);
    } catch {
      setCopyFeedback('Copie refusée par le système.');
    }
  }, [pageText]);

  const pdfContextItems: MenuEntry[] = [
    ...fileContextItems,
    { id: 'previous-page', label: 'Page précédente', shortcut: '←', disabled: pageNumber <= 1, onSelect: () => setPage(pageNumber - 1) },
    { id: 'next-page', label: 'Page suivante', shortcut: '→', disabled: pageNumber >= pageCount, onSelect: () => setPage(pageNumber + 1) },
    { id: 'toggle-page-bookmark', label: isBookmarked ? 'Retirer le signet de cette page' : 'Ajouter un signet à cette page', icon: <Bookmark size={15} />, dividerBefore: true, onSelect: toggleBookmark },
    { id: 'toggle-pdf-text', label: pageTextOpen ? 'Masquer le texte de la page' : 'Afficher le texte sélectionnable', icon: <Copy size={15} />, disabled: !pageTextOpen && !pdf, onSelect: () => setPageTextOpen((open) => !open) },
    { id: 'copy-pdf-page-text', label: 'Copier le texte de la page', icon: <Copy size={15} />, disabled: !pageText || pageTextLoading || pageText.startsWith('Aucun') || pageText.startsWith('Impossible'), onSelect: () => void copyPageText() },
    { id: 'zoom-in', label: 'Augmenter le zoom', icon: <Plus size={15} />, dividerBefore: true, onSelect: () => { setFitMode('actual'); setZoom((value) => Math.min(3, value + 0.1)); } },
    { id: 'zoom-out', label: 'Réduire le zoom', icon: <Minus size={15} />, onSelect: () => { setFitMode('actual'); setZoom((value) => Math.max(0.4, value - 0.1)); } },
    { id: 'fit-width', label: 'Ajuster à la largeur', icon: <ZoomIn size={15} />, onSelect: () => { setFitMode('width'); setZoom(1); } },
  ];

  const searchLabel = searchQuery.trim()
    ? searchState.query !== searchQuery.trim()
      ? 'Recherche…'
      : searchState.searching
        ? `Recherche ${searchState.scannedPages}/${searchState.totalPages} pages…${searchState.occurrences ? ` · ${searchState.occurrences} résultat${searchState.occurrences === 1 ? '' : 's'}` : ''}`
        : searchState.occurrences
          ? `${searchState.occurrences} résultat${searchState.occurrences > 1 ? 's' : ''} · ${searchState.pages.length} page${searchState.pages.length > 1 ? 's' : ''}`
          : 'Aucun résultat'
    : '';

  return (
    <div className="pdf-viewer" onContextMenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY });
    }}>
      {sidebarTab && <aside className="pdf-sidebar" aria-label="Navigation du PDF">
        <div className="pdf-sidebar-heading"><strong>{sidebarTab === 'outline' ? 'Sommaire' : sidebarTab === 'bookmarks' ? 'Signets' : 'Miniatures'}</strong><button className="tool-button" type="button" title="Fermer le panneau" aria-label="Fermer le panneau latéral du PDF" onClick={() => setSidebarTab(null)}><X size={14} /></button></div>
        <div className="pdf-sidebar-content">
          {sidebarTab === 'outline' && (outlineLoading ? <div className="pdf-sidebar-empty">Lecture du sommaire…</div> : outline.length ? outline.map((item, index) => <button className={`pdf-outline-item ${item.page === pageNumber ? 'is-active' : ''}`} type="button" key={`${item.title}-${item.page}-${index}`} style={{ paddingLeft: `${10 + item.depth * 12}px` }} title={`${item.title} · page ${item.page}`} onClick={() => setPage(item.page)}><span>{item.title || `Page ${item.page}`}</span><small>{item.page}</small></button>) : <div className="pdf-sidebar-empty">Ce PDF ne contient pas de sommaire intégré.</div>)}
          {sidebarTab === 'bookmarks' && (loading ? <div className="pdf-sidebar-empty">Lecture des signets…</div> : bookmarks.length ? bookmarks.map((page) => <div className="pdf-bookmark-item" key={page}><button type="button" onClick={() => setPage(page)}><Bookmark size={13} /><span>Page {page}</span></button><button className="pdf-bookmark-remove" type="button" title={`Retirer le signet de la page ${page}`} aria-label={`Retirer le signet de la page ${page}`} onClick={() => setBookmarks((current) => current.filter((item) => item !== page))}><X size={13} /></button></div>) : <div className="pdf-sidebar-empty">Ajoutez un signet depuis la barre d’outils pour le retrouver ici.</div>)}
          {sidebarTab === 'pages' && <PdfThumbnailList pdf={pdf} pageCount={pageCount} currentPage={pageNumber} onSelect={setPage} />}
        </div>
      </aside>}
      <div className="pdf-main">
        <div className="viewer-tools pdf-tools">
          <div className="tool-group pdf-nav-tabs" aria-label="Navigation PDF">
            <button className={`tool-button ${sidebarTab === 'outline' ? 'is-selected' : ''}`} type="button" title="Sommaire" aria-label="Afficher le sommaire" aria-pressed={sidebarTab === 'outline'} onClick={() => setSidebarTab((current) => current === 'outline' ? null : 'outline')}><List size={15} /></button>
            <button className={`tool-button ${sidebarTab === 'bookmarks' ? 'is-selected' : ''}`} type="button" title="Signets" aria-label="Afficher les signets" aria-pressed={sidebarTab === 'bookmarks'} onClick={() => setSidebarTab((current) => current === 'bookmarks' ? null : 'bookmarks')}><Bookmark size={15} /></button>
            <button className={`tool-button ${sidebarTab === 'pages' ? 'is-selected' : ''}`} type="button" title="Miniatures des pages" aria-label="Afficher les miniatures des pages" aria-pressed={sidebarTab === 'pages'} onClick={() => setSidebarTab((current) => current === 'pages' ? null : 'pages')}><BookOpen size={15} /></button>
          </div>
          <div className="tool-group">
            <button className="tool-button" type="button" title="Page précédente" aria-label="Page précédente" disabled={pageNumber <= 1} onClick={() => setPage(pageNumber - 1)}><ChevronLeft size={17} /></button>
            <label className="page-input-label">
              <input aria-label="Numéro de page" type="number" min={1} max={pageCount || 1} value={pageNumber} onChange={(event) => setPage(Number(event.target.value))} onBlur={(event) => setPage(Number(event.target.value))} />
              <span>sur {pageCount || '—'}</span>
            </label>
            <button className="tool-button" type="button" title="Page suivante" aria-label="Page suivante" disabled={pageNumber >= pageCount} onClick={() => setPage(pageNumber + 1)}><ChevronRight size={17} /></button>
            <button className={`tool-button pdf-bookmark-toggle ${isBookmarked ? 'is-selected' : ''}`} type="button" title={isBookmarked ? 'Retirer le signet' : 'Ajouter un signet'} aria-label={isBookmarked ? 'Retirer le signet de cette page' : 'Ajouter un signet à cette page'} aria-pressed={isBookmarked} onClick={toggleBookmark}><Bookmark size={15} fill={isBookmarked ? 'currentColor' : 'none'} /></button>
          </div>
          <div className="tool-group pdf-zoom-group">
            <button className="tool-button" type="button" title="Réduire le zoom" aria-label="Réduire le zoom" onClick={() => { setFitMode('actual'); setZoom((value) => Math.max(0.4, value - 0.1)); }}><Minus size={15} /></button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="tool-button" type="button" title="Augmenter le zoom" aria-label="Augmenter le zoom" onClick={() => { setFitMode('actual'); setZoom((value) => Math.min(3, value + 0.1)); }}><Plus size={15} /></button>
            <span className="tool-divider" />
            <button className={`tool-button ${fitMode === 'width' ? 'is-selected' : ''}`} type="button" title="Ajuster à la largeur" aria-label="Ajuster à la largeur" onClick={() => { setFitMode('width'); setZoom(1); }}><ZoomIn size={15} /></button>
            <select className="fit-select" aria-label="Ajustement de la page" value={fitMode} onChange={(event) => { setFitMode(event.target.value as FitMode); setZoom(1); }}>
              <option value="width">Largeur</option><option value="page">Page entière</option><option value="actual">Taille réelle</option>
            </select>
          </div>
          <button className={`tool-button pdf-text-toggle ${pageTextOpen ? 'is-selected' : ''}`} type="button" title="Afficher le texte sélectionnable de la page" aria-label="Afficher ou masquer le texte de la page" aria-pressed={pageTextOpen} onClick={() => setPageTextOpen((open) => !open)}><FileText size={15} /><span>Texte</span></button>
          {searchLabel && <span className="pdf-search-count" aria-live="polite"><Search size={12} />{searchLabel}</span>}
        </div>
        <div className={`pdf-main-content ${pageTextOpen ? 'with-page-text' : ''}`}>
          <div className="pdf-stage" ref={stageRef}>
            {error ? <div className="viewer-empty">{error}</div> : loading ? <div className="viewer-empty"><span className="loading-dot" />Préparation du document…</div> : <div className="pdf-paper-wrap"><canvas ref={canvasRef} className="pdf-canvas" /></div>}
          </div>
          {pageTextOpen && <section className="pdf-page-text" aria-label={`Texte de la page ${pageNumber}`}>
            <div className="pdf-page-text-heading"><strong>Texte de la page {pageNumber}</strong><button className="subtle-button" type="button" disabled={pageTextLoading || !pageText || pageText.startsWith('Aucun') || pageText.startsWith('Impossible')} onClick={() => void copyPageText()}><Copy size={13} />{copyFeedback || 'Copier'}</button></div>
            <textarea readOnly value={pageTextLoading ? 'Extraction du texte…' : pageText} aria-label="Texte sélectionnable extrait du PDF" />
          </section>}
        </div>
      </div>
      {contextMenu && <ContextMenu position={contextMenu} items={pdfContextItems} onClose={() => setContextMenu(null)} />}
    </div>
  );
}

async function resolveOutline(pdf: PDFDocumentProxy, items: RawOutlineItem[], depth = 0): Promise<PdfOutlineEntry[]> {
  if (depth > 20) return [];
  const result: PdfOutlineEntry[] = [];
  for (const item of items) {
    let page = 0;
    try {
      const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
      const reference = Array.isArray(destination) ? destination[0] : undefined;
      if (typeof reference === 'number') page = reference + 1;
      else if (reference) page = (await pdf.getPageIndex(reference as Parameters<PDFDocumentProxy['getPageIndex']>[0])) + 1;
    } catch { /* Invalid or unsupported outline targets remain hidden. */ }
    if (page > 0 && page <= pdf.numPages) result.push({ title: item.title?.trim() ?? '', page, depth: Math.min(depth, 8) });
    if (item.items?.length) result.push(...await resolveOutline(pdf, item.items, depth + 1));
  }
  return result;
}

const PDF_THUMBNAIL_ROW_HEIGHT = 164;
const PDF_THUMBNAIL_OVERSCAN = 3;

function PdfThumbnailList({ pdf, pageCount, currentPage, onSelect }: { pdf: PDFDocumentProxy | null; pageCount: number; currentPage: number; onSelect: (page: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const updateSize = () => setViewportHeight(list.clientHeight);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !pageCount) return;
    const rowTop = (currentPage - 1) * PDF_THUMBNAIL_ROW_HEIGHT;
    const rowBottom = rowTop + PDF_THUMBNAIL_ROW_HEIGHT;
    if (rowTop < list.scrollTop || rowBottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, rowTop - PDF_THUMBNAIL_ROW_HEIGHT);
      setScrollTop(list.scrollTop);
    }
  }, [currentPage, pageCount]);

  const firstPageIndex = Math.max(0, Math.floor(scrollTop / PDF_THUMBNAIL_ROW_HEIGHT) - PDF_THUMBNAIL_OVERSCAN);
  const lastPageIndex = Math.min(pageCount, Math.ceil((scrollTop + (viewportHeight || PDF_THUMBNAIL_ROW_HEIGHT * 8)) / PDF_THUMBNAIL_ROW_HEIGHT) + PDF_THUMBNAIL_OVERSCAN);
  const visiblePages = Array.from({ length: Math.max(0, lastPageIndex - firstPageIndex) }, (_, index) => firstPageIndex + index + 1);

  return <div ref={listRef} className="pdf-thumbnail-list" aria-label={`Miniatures des ${pageCount} pages`} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
    <div className="pdf-thumbnail-track" style={{ height: `${pageCount * PDF_THUMBNAIL_ROW_HEIGHT}px` }}>
      {visiblePages.map((page) => <div className="pdf-thumbnail-slot" key={page} style={{ top: `${(page - 1) * PDF_THUMBNAIL_ROW_HEIGHT}px`, height: `${PDF_THUMBNAIL_ROW_HEIGHT}px` }}>
        <PdfThumbnail pdf={pdf} page={page} active={page === currentPage} onSelect={() => onSelect(page)} />
      </div>)}
    </div>
  </div>;
}

function PdfThumbnail({ pdf, page, active, onSelect }: { pdf: PDFDocumentProxy | null; page: number; active: boolean; onSelect: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    const canvas = canvasRef.current;
    void pdf.getPage(page).then((pdfPage) => {
      if (cancelled) return;
      const unit = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: Math.min(0.2, 96 / unit.width, 112 / unit.height) });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      task = pdfPage.render({ canvasContext: context, viewport });
      return task.promise;
    }).catch(() => undefined);
    return () => { cancelled = true; task?.cancel(); };
  }, [page, pdf]);

  return <button className={`pdf-thumbnail ${active ? 'is-active' : ''}`} type="button" aria-label={`Aller à la page ${page}`} aria-current={active ? 'page' : undefined} onClick={onSelect}>
    <span className="pdf-thumbnail-paper"><canvas ref={canvasRef} /></span><span>Page {page}</span>
  </button>;
}
