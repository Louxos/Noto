import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, Minus, Plus, ZoomIn } from 'lucide-react';
import type { OpenDocument } from '../types';

GlobalWorkerOptions.workerSrc = workerUrl;

type FitMode = 'width' | 'page' | 'actual';
interface SearchRequest { id: number; backwards: boolean }
interface PdfSearchState { query: string; pages: number[]; occurrences: number; searching: boolean }

const EMPTY_SEARCH: PdfSearchState = { query: '', pages: [], occurrences: 0, searching: false };

export function PdfViewer({ document, searchQuery, searchRequest }: { document: OpenDocument; searchQuery: string; searchRequest: SearchRequest | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const handledRequestId = useRef(0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchState, setSearchState] = useState<PdfSearchState>(EMPTY_SEARCH);
  const [stageSize, setStageSize] = useState({ width: 960, height: 680 });

  useEffect(() => {
    setPdf(null);
    setPageNumber(1);
    setPageCount(0);
    setLoading(true);
    setError('');
    setSearchState(EMPTY_SEARCH);
    handledRequestId.current = 0;
    if (!document.bytes?.length) {
      setError('Ce document PDF ne contient aucune donnée lisible.');
      setLoading(false);
      return;
    }
    const task = getDocument({ data: document.bytes.slice() });
    task.promise.then((loaded) => {
      setPdf(loaded);
      setPageCount(loaded.numPages);
      setLoading(false);
    }).catch(() => {
      setError('Ce fichier PDF est invalide ou ne peut pas être ouvert.');
      setLoading(false);
    });
    return () => { void task.destroy(); };
  }, [document]);

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
      setSearchState(trimmedQuery ? { query: trimmedQuery, pages: [], occurrences: 0, searching: false } : EMPTY_SEARCH);
      return;
    }

    let cancelled = false;
    setSearchState({ query: trimmedQuery, pages: [], occurrences: 0, searching: true });
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
          const matches = text.match(expression);
          if (matches?.length) {
            pages.push(number);
            occurrences += matches.length;
          }
          if (number % 8 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          if (cancelled) return;
        }
        setSearchState({ query: trimmedQuery, pages, occurrences, searching: false });
        if (pages.length) setPageNumber(pages[0]);
      })().catch(() => {
        if (!cancelled) setSearchState({ query: trimmedQuery, pages: [], occurrences: 0, searching: false });
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [pdf, searchQuery]);

  useEffect(() => {
    if (!searchRequest || searchRequest.id === handledRequestId.current || searchState.searching || searchState.query !== searchQuery.trim() || !searchState.pages.length) return;
    handledRequestId.current = searchRequest.id;
    const currentIndex = searchState.pages.indexOf(pageNumber);
    const nextIndex = searchRequest.backwards
      ? (currentIndex < 0 ? searchState.pages.length - 1 : (currentIndex - 1 + searchState.pages.length) % searchState.pages.length)
      : (currentIndex < 0 ? 0 : (currentIndex + 1) % searchState.pages.length);
    setPageNumber(searchState.pages[nextIndex]);
  }, [pageNumber, searchQuery, searchRequest, searchState]);

  function setPage(value: number) {
    setPageNumber(Math.max(1, Math.min(pageCount || 1, value)));
  }

  const searchLabel = searchQuery.trim()
    ? searchState.query !== searchQuery.trim() || searchState.searching
      ? 'Recherche…'
      : searchState.occurrences
        ? `${searchState.occurrences} résultat${searchState.occurrences > 1 ? 's' : ''} · ${searchState.pages.length} page${searchState.pages.length > 1 ? 's' : ''}`
        : 'Aucun résultat'
    : '';

  return (
    <div className="pdf-viewer">
      <div className="viewer-tools pdf-tools">
        <div className="tool-group">
          <button className="tool-button" type="button" title="Page précédente" aria-label="Page précédente" disabled={pageNumber <= 1} onClick={() => setPage(pageNumber - 1)}><ChevronLeft size={17} /></button>
          <label className="page-input-label">
            <input aria-label="Numéro de page" type="number" min={1} max={pageCount || 1} value={pageNumber} onChange={(event) => setPage(Number(event.target.value))} onBlur={(event) => setPage(Number(event.target.value))} />
            <span>sur {pageCount || '—'}</span>
          </label>
          <button className="tool-button" type="button" title="Page suivante" aria-label="Page suivante" disabled={pageNumber >= pageCount} onClick={() => setPage(pageNumber + 1)}><ChevronRight size={17} /></button>
        </div>
        <div className="tool-group">
          <button className="tool-button" type="button" title="Réduire le zoom" aria-label="Réduire le zoom" onClick={() => { setFitMode('actual'); setZoom((value) => Math.max(0.4, value - 0.1)); }}><Minus size={15} /></button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="tool-button" type="button" title="Augmenter le zoom" aria-label="Augmenter le zoom" onClick={() => { setFitMode('actual'); setZoom((value) => Math.min(3, value + 0.1)); }}><Plus size={15} /></button>
          <span className="tool-divider" />
          <button className={`tool-button ${fitMode === 'width' ? 'is-selected' : ''}`} type="button" title="Ajuster à la largeur" aria-label="Ajuster à la largeur" onClick={() => { setFitMode('width'); setZoom(1); }}><ZoomIn size={15} /></button>
          <select className="fit-select" aria-label="Ajustement de la page" value={fitMode} onChange={(event) => { setFitMode(event.target.value as FitMode); setZoom(1); }}>
            <option value="width">Largeur</option>
            <option value="page">Page entière</option>
            <option value="actual">Taille réelle</option>
          </select>
        </div>
        {searchLabel && <span className="pdf-search-count">{searchLabel}</span>}
      </div>
      <div className="pdf-stage" ref={stageRef}>
        {error ? (
          <div className="viewer-empty">{error}</div>
        ) : loading ? (
          <div className="viewer-empty"><span className="loading-dot" />Préparation du document…</div>
        ) : (
          <div className="pdf-paper-wrap"><canvas ref={canvasRef} className="pdf-canvas" /></div>
        )}
      </div>
    </div>
  );
}
