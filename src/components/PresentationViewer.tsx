import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, MonitorPlay, Play, X } from 'lucide-react';
import { extractPresentation, type PresentationSlide } from '../lib/archiveReader';
import type { OpenDocument } from '../types';
import { ContextMenu, type MenuEntry } from './WorkspaceTools';

interface PresentationViewerProps {
  document: OpenDocument;
  fileContextItems: MenuEntry[];
}

export function PresentationViewer({ document, fileContextItems }: PresentationViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSlides([]);
    setActiveSlide(0);
    const timer = window.setTimeout(() => {
      try {
        if (!document.bytes) throw new Error('Le contenu de la présentation est indisponible.');
        const result = extractPresentation(document.bytes, document.extension);
        if (!cancelled) {
          setSlides(result);
          setActiveSlide(0);
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Impossible de lire cette présentation.');
          setLoading(false);
        }
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [document.bytes, document.extension, document.id]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(window.document.fullscreenElement === rootRef.current);
    window.document.addEventListener('fullscreenchange', updateFullscreen);
    return () => window.document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        if (event.key !== 'Escape') return;
      }
      if (contextMenu) {
        if (event.key === 'Escape') setContextMenu(null);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        setActiveSlide((index) => Math.min(slides.length - 1, index + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setActiveSlide((index) => Math.max(0, index - 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveSlide(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActiveSlide(Math.max(0, slides.length - 1));
      } else if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        void toggleFullscreen();
      } else if (event.key === 'Escape' && window.document.fullscreenElement) {
        void window.document.exitFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [slides.length, contextMenu]);

  async function toggleFullscreen() {
    const element = rootRef.current;
    if (!element) return;
    try {
      if (window.document.fullscreenElement) await window.document.exitFullscreen?.();
      else if (element.requestFullscreen) await element.requestFullscreen();
      else setError('Le plein écran n’est pas disponible dans cet environnement.');
    } catch {
      setError('Impossible d’activer le plein écran. Vérifiez les autorisations de votre navigateur.');
    }
  }

  const slide = slides[activeSlide];
  const menuItems: MenuEntry[] = [
    ...fileContextItems,
    { id: 'previous', label: 'Diapositive précédente', shortcut: '←', disabled: activeSlide === 0, onSelect: () => setActiveSlide((index) => Math.max(0, index - 1)) },
    { id: 'next', label: 'Diapositive suivante', shortcut: '→', disabled: activeSlide >= slides.length - 1, onSelect: () => setActiveSlide((index) => Math.min(slides.length - 1, index + 1)) },
    { id: 'fullscreen', label: isFullscreen ? 'Quitter le plein écran' : 'Plein écran', icon: isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />, dividerBefore: true, onSelect: () => void toggleFullscreen() },
  ];

  return <div
    ref={rootRef}
    className={`presentation-viewer ${isFullscreen ? 'presentation-fullscreen' : ''}`}
    tabIndex={-1}
    onContextMenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY });
    }}
  >
    {loading ? <div className="office-loading"><span className="loading-spinner" />Lecture de la présentation…</div> : error && !slides.length ? <div className="office-error"><MonitorPlay size={27} /><h2>Présentation non lisible</h2><p>{error}</p><small>Formats pris en charge : PowerPoint .pptx et OpenDocument .odp. Les diapositives sont reconstruites à partir du texte et des images intégrés ; les animations et la mise en page complexe ne sont pas reproduites.</small></div> : slide ? <>
      <header className="presentation-toolbar">
        <div className="presentation-title"><MonitorPlay size={16} /><span>{document.name}</span></div>
        <span className="presentation-counter">{activeSlide + 1} / {slides.length}</span>
        <div className="presentation-toolbar-actions">
          <button className="presentation-action" type="button" onClick={() => void toggleFullscreen()} title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'} aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}>{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button className="presentation-action presentation-start" type="button" onClick={() => void toggleFullscreen()} title="Démarrer le diaporama" aria-label="Démarrer le diaporama"><Play size={14} /><span>Diaporama</span></button>
          {isFullscreen && <button className="presentation-action" type="button" onClick={() => void window.document.exitFullscreen?.()} title="Quitter" aria-label="Quitter le plein écran"><X size={16} /></button>}
        </div>
      </header>
      <main className="presentation-stage" aria-label={`Diapositive ${activeSlide + 1} sur ${slides.length}`}>
        <button className="slide-step slide-step-previous" type="button" aria-label="Diapositive précédente" title="Précédente (←)" disabled={activeSlide === 0} onClick={() => setActiveSlide((index) => Math.max(0, index - 1))}><ChevronLeft size={22} /></button>
        <article className="presentation-slide">
          <div className="presentation-slide-content">
            <span className="presentation-slide-number">{String(slide.number).padStart(2, '0')}</span>
            <h1>{slide.title}</h1>
            <div className="presentation-slide-paragraphs">
              {slide.paragraphs.filter((paragraph) => paragraph.trim() !== slide.title.trim()).map((paragraph, index) => <p key={`${slide.number}-${index}`}>{paragraph}</p>)}
            </div>
            {slide.images.length > 0 && <div className="presentation-slide-images">{slide.images.map((image, index) => <img src={image.src} alt={image.alt} key={`${slide.number}-image-${index}`} />)}</div>}
          </div>
        </article>
        <button className="slide-step slide-step-next" type="button" aria-label="Diapositive suivante" title="Suivante (→)" disabled={activeSlide >= slides.length - 1} onClick={() => setActiveSlide((index) => Math.min(slides.length - 1, index + 1))}><ChevronRight size={22} /></button>
      </main>
      <footer className="presentation-footer">
        <div className="presentation-progress" aria-label={`Progression : ${activeSlide + 1} sur ${slides.length}`}><span style={{ width: `${slides.length ? ((activeSlide + 1) / slides.length) * 100 : 0}%` }} /></div>
        <div className="presentation-footer-row"><span>Flèches ← → pour naviguer · F pour le plein écran · Échap pour quitter</span><span>{activeSlide + 1} / {slides.length}</span></div>
      </footer>
    </> : null}
    {error && slides.length > 0 && <div className="presentation-toast" role="status">{error}<button type="button" aria-label="Fermer le message" onClick={() => setError('')}><X size={13} /></button></div>}
    {contextMenu && <ContextMenu position={contextMenu} items={menuItems} onClose={() => setContextMenu(null)} />}
  </div>;
}
