import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Copy, FileText } from 'lucide-react';
import { extractOfficeChapters, type DocumentChapter } from '../lib/archiveReader';
import type { OpenDocument } from '../types';
import { ContextMenu, type MenuEntry } from './WorkspaceTools';

export function OfficeDocumentViewer({ document, fileContextItems }: { document: OpenDocument; fileContextItems: MenuEntry[] }) {
  const [chapters, setChapters] = useState<DocumentChapter[]>([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const isEbook = document.kind === 'ebook';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setChapters([]);
    setChapterIndex(0);
    const timer = window.setTimeout(() => {
      try {
        if (!document.bytes) throw new Error('Le contenu du document est indisponible.');
        const result = extractOfficeChapters(document.bytes, document.extension);
        if (!cancelled) {
          setChapters(result);
          setChapterIndex(0);
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Impossible de lire ce document.');
          setLoading(false);
        }
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [document.bytes, document.extension, document.id]);

  useEffect(() => {
    if (!isEbook) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setChapterIndex((index) => Math.min(chapters.length - 1, index + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setChapterIndex((index) => Math.max(0, index - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chapters.length, isEbook]);

  const chapter = chapters[chapterIndex];
  const menuItems: MenuEntry[] = [
    ...fileContextItems,
    { id: 'copy', label: 'Copier le texte de cette partie', icon: <Copy size={15} />, disabled: !chapter, onSelect: () => {
      if (chapter && navigator.clipboard?.writeText) void navigator.clipboard.writeText(chapter.text).catch(() => undefined);
    } },
    ...(isEbook ? [
      { id: 'previous', label: 'Partie précédente', shortcut: '←', disabled: chapterIndex === 0, onSelect: () => setChapterIndex((index) => Math.max(0, index - 1)) },
      { id: 'next', label: 'Partie suivante', shortcut: '→', disabled: chapterIndex >= chapters.length - 1, onSelect: () => setChapterIndex((index) => Math.min(chapters.length - 1, index + 1)) },
    ] : []),
  ];

  return <div className="office-document-viewer" onContextMenu={(event) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }}>
    {loading ? <div className="office-loading"><span className="loading-spinner" />Lecture du document…</div> : error ? <div className="office-error"><FileText size={26} /><h2>Document non lisible</h2><p>{error}</p><small>Les formats bureautiques sont ouverts en lecture seule. Le texte est extrait localement ; la mise en page, les polices et certains objets intégrés peuvent différer de l’original.</small></div> : chapter ? <>
      <header className="office-document-toolbar">
        <div className="office-document-title"><span className="office-document-icon">{isEbook ? <BookOpen size={17} /> : <FileText size={17} />}</span><div><strong>{document.name}</strong><small>{isEbook ? 'Livre numérique · texte extrait localement' : `${document.extension.toUpperCase()} · aperçu du texte`}</small></div></div>
        {isEbook && <div className="ebook-controls"><button type="button" className="office-page-button" aria-label="Partie précédente" title="Partie précédente (←)" disabled={chapterIndex === 0} onClick={() => setChapterIndex((index) => Math.max(0, index - 1))}><ChevronLeft size={16} /></button><span>{chapterIndex + 1} / {chapters.length}</span><button type="button" className="office-page-button" aria-label="Partie suivante" title="Partie suivante (→)" disabled={chapterIndex >= chapters.length - 1} onClick={() => setChapterIndex((index) => Math.min(chapters.length - 1, index + 1))}><ChevronRight size={16} /></button></div>}
      </header>
      <article className={`office-document-content ${isEbook ? 'ebook-content' : ''}`}>
        <div className="office-paper">
          {chapter.title && (isEbook || chapters.length > 1) && <div className="office-chapter-label">{chapter.title}</div>}
          {chapter.text.split(/\n{2,}/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={`${chapterIndex}-${index}`}>{paragraph}</p>)}
        </div>
        {isEbook && <nav className="ebook-bottom-navigation" aria-label="Navigation du livre"><button className="secondary-button" type="button" disabled={chapterIndex === 0} onClick={() => setChapterIndex((index) => Math.max(0, index - 1))}><ChevronLeft size={15} />Partie précédente</button><span>Partie {chapterIndex + 1} sur {chapters.length}</span><button className="secondary-button" type="button" disabled={chapterIndex >= chapters.length - 1} onClick={() => setChapterIndex((index) => Math.min(chapters.length - 1, index + 1))}>Partie suivante<ChevronRight size={15} /></button></nav>}
      </article>
    </> : null}
    {contextMenu && <ContextMenu position={contextMenu} items={menuItems} onClose={() => setContextMenu(null)} />}
  </div>;
}
