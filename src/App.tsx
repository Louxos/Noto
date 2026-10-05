import { useCallback, useEffect, useRef, useState, lazy, Suspense, type DragEvent, type ReactNode, type CSSProperties } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  BookOpenText, Check, ChevronDown, CircleHelp, Clock3, Code2, File, FileCode2, FileImage,
  FileText, FileType2, FileUp, Globe2, Image as ImageIcon,
  LayoutGrid, LoaderCircle, Maximize2, Moon, MoreHorizontal, PanelLeft,
  Pencil, Plus, RotateCcw, Search, Settings2, ShieldCheck, Sun, Table2, TextCursorInput,
  X, Save, Replace, Sparkles,
} from 'lucide-react';
import { CodeViewer } from './components/CodeViewer';
import { CsvViewer } from './components/CsvViewer';
import { HtmlViewer } from './components/HtmlViewer';
import { TextEditor } from './components/TextEditor';
import { formatBytes, loadBrowserFile, openDesktopFiles, pickBrowserFiles, readDesktopPath, saveDocument } from './lib/files';
import { getFormatLabel } from './lib/fileTypes';
import { formatJsonForDisplay } from './lib/textFormat';
import { loadPreferences, loadRecentFiles, savePreferences, saveRecentFiles, upsertRecent, type Preferences, type RecentFile } from './lib/preferences';
import type { BrowserFileHandle, OpenDocument } from './types';
import './styles.css';

const MarkdownViewer = lazy(() => import('./components/MarkdownViewer').then((module) => ({ default: module.MarkdownViewer })));
const ImageViewer = lazy(() => import('./components/ImageViewer').then((module) => ({ default: module.ImageViewer })));
const PdfViewer = lazy(() => import('./components/PdfViewer').then((module) => ({ default: module.PdfViewer })));

const formatIcons: Record<string, typeof FileText> = {
  markdown: BookOpenText,
  text: FileText,
  code: FileCode2,
  html: Globe2,
  csv: Table2,
  pdf: FileType2,
  image: FileImage,
  unknown: File,
};

function formatRelativeDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isToday) return `Aujourd’hui, ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  if (date.toDateString() === yesterday.toDateString()) return `Hier, ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatMatchCount(value: string, content: string): string {
  if (!value.trim()) return '';
  const escaped = value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = content.match(new RegExp(escaped, 'gi'))?.length ?? 0;
  return `${count} résultat${count > 1 ? 's' : ''}`;
}

function kindIcon(kind: string, size = 16): ReactNode {
  const Icon = formatIcons[kind] ?? File;
  return <Icon size={size} strokeWidth={1.8} />;
}

function OpenDialogButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button className={compact ? 'open-side-button' : 'primary-button'} type="button" onClick={onClick}>
      <Plus size={16} strokeWidth={2.1} />
      <span>Ouvrir un fichier</span>
      {!compact && <kbd>Ctrl O</kbd>}
    </button>
  );
}

export default function App() {
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState<'home' | 'file' | 'recents'>('home');
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [recents, setRecents] = useState<RecentFile[]>(() => loadRecentFiles());
  const [isEditing, setIsEditing] = useState(false);
  const [editorMode, setEditorMode] = useState<'source' | 'split' | 'preview'>('split');
  const [htmlMode, setHtmlMode] = useState<'code' | 'preview'>('preview');
  const [textFallbackIds, setTextFallbackIds] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [pdfFindRequest, setPdfFindRequest] = useState<{ id: number; backwards: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Ouverture du fichier…');
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState('');
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const documentsRef = useRef<OpenDocument[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const browserHandles = useRef<Map<string, BrowserFileHandle>>(new Map());
  const commitDocuments = useCallback((next: OpenDocument[]) => {
    documentsRef.current = next;
    setDocuments(next);
  }, []);
  const activeDoc = documents.find((document) => document.id === activeId) ?? null;
  const dirty = Boolean(activeDoc && activeDoc.content !== activeDoc.savedContent);
  const canReadText = Boolean(activeDoc && (activeDoc.kind !== 'unknown' || textFallbackIds.has(activeDoc.id)));
  const canEdit = Boolean(activeDoc && canReadText && !activeDoc.truncated && ['markdown', 'text', 'code', 'html', 'csv', 'unknown'].includes(activeDoc.kind));

  useEffect(() => {
    savePreferences(preferences);
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences]);

  useEffect(() => {
    saveRecentFiles(recents);
  }, [recents]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3_400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => searchRef.current?.focus(), 40);
  }, [searchOpen]);

  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast(message);
    setToastKind(kind);
  }, []);

  const rememberDocument = useCallback((document: OpenDocument) => {
    const recent: RecentFile = {
      id: `${document.source}:${document.path}`,
      name: document.name,
      path: document.path,
      kind: document.kind,
      lastOpened: Date.now(),
      source: document.source,
    };
    setRecents((current) => upsertRecent(current, recent));
    if (document.handle) browserHandles.current.set(recent.id, document.handle);
  }, []);

  const openLoadedDocuments = useCallback((items: OpenDocument[]) => {
    if (items.length === 0) return;
    const next = [...documentsRef.current];
    const openedIds: string[] = [];
    for (const item of items) {
      const existing = next.find((document) => document.source === item.source && document.path === item.path);
      if (existing) {
        openedIds.push(existing.id);
        rememberDocument(existing);
        continue;
      }
      next.push(item);
      openedIds.push(item.id);
      rememberDocument(item);
    }
    commitDocuments(next);
    setActiveId(openedIds[openedIds.length - 1] ?? null);
    setPage('file');
    setIsEditing(false);
    setHtmlMode('preview');
    setEditorMode('split');
    setSearchOpen(false);
    setQuery('');
  }, [commitDocuments, rememberDocument]);

  const openTauriPath = useCallback(async (path: string) => {
    setLoading(true);
    setLoadingMessage('Ouverture du fichier…');
    try {
      const item = await readDesktopPath(path);
      openLoadedDocuments([item]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible d’ouvrir ce fichier.';
      if (message !== 'Ouverture annulée.') notify(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, openLoadedDocuments]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    invoke<string[]>('startup_paths').then(async (paths) => {
      if (cancelled || !paths.length) return;
      setLoading(true);
      try {
        const loaded: OpenDocument[] = [];
        for (const path of paths) {
          try { loaded.push(await readDesktopPath(path)); }
          catch (error) { notify(error instanceof Error ? error.message : 'Impossible d’ouvrir un fichier.', 'error'); }
        }
        if (!cancelled) openLoadedDocuments(loaded);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [notify, openLoadedDocuments]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop' && event.payload.paths.length > 0) {
        const paths = event.payload.paths;
        setDragging(false);
        setLoading(true);
        setLoadingMessage('Ouverture des fichiers…');
        void Promise.all(paths.map(async (path) => {
          try { return await readDesktopPath(path); }
          catch (error) { notify(error instanceof Error ? error.message : 'Impossible d’ouvrir ce fichier.', 'error'); return null; }
        })).then((items) => openLoadedDocuments(items.filter((item): item is OpenDocument => item !== null)))
          .finally(() => setLoading(false));
      } else if (event.payload.type === 'enter' || event.payload.type === 'over') {
        setDragging(true);
      } else if (event.payload.type === 'leave') {
        setDragging(false);
      }
    }).then((listener) => {
      if (disposed) listener();
      else unlisten = listener;
    }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, [notify, openLoadedDocuments]);

  const handleOpen = useCallback(async () => {
    if (isTauri()) {
      setLoading(true);
      setLoadingMessage('Ouverture des fichiers…');
      try {
        openLoadedDocuments(await openDesktopFiles());
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Impossible d’ouvrir le fichier.', 'error');
      } finally {
        setLoading(false);
      }
      return;
    }
    const documentsFromPicker = await pickBrowserFiles();
    if (documentsFromPicker !== null) {
      openLoadedDocuments(documentsFromPicker);
      return;
    }
    inputRef.current?.click();
  }, [notify, openLoadedDocuments]);

  const onInputFiles = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setLoading(true);
    setLoadingMessage(files.length > 1 ? `Ouverture de ${files.length} fichiers…` : 'Ouverture du fichier…');
    try {
      const loaded: OpenDocument[] = [];
      for (const file of files) {
        const document = await loadBrowserFile(file);
        if (document) loaded.push(document);
      }
      openLoadedDocuments(loaded);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible d’ouvrir ce fichier.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, openLoadedDocuments]);

  const openDroppedFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setLoading(true);
    setLoadingMessage(files.length > 1 ? `Ouverture de ${files.length} fichiers…` : 'Ouverture du fichier…');
    try {
      const loaded: OpenDocument[] = [];
      for (const file of files) {
        const document = await loadBrowserFile(file);
        if (document) loaded.push(document);
      }
      openLoadedDocuments(loaded);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible de lire le fichier déposé.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, openLoadedDocuments]);

  const handleRecent = useCallback(async (recent: RecentFile) => {
    const existing = documentsRef.current.find((document) => `${document.source}:${document.path}` === recent.id);
    if (existing) {
      setActiveId(existing.id);
      setPage('file');
      setIsEditing(false);
      return;
    }
    if (recent.source === 'desktop' && isTauri()) {
      await openTauriPath(recent.path);
      return;
    }
    const handle = browserHandles.current.get(recent.id);
    if (handle) {
      try {
        const loaded = await loadBrowserFile(await handle.getFile(), handle);
        if (loaded) openLoadedDocuments([loaded]);
        return;
      } catch {
        browserHandles.current.delete(recent.id);
      }
    }
    notify('Pour protéger vos fichiers, sélectionnez de nouveau ce document sur votre appareil.', 'error');
    await handleOpen();
  }, [handleOpen, notify, openLoadedDocuments, openTauriPath]);

  const closeDocument = useCallback((id: string) => {
    const current = documentsRef.current;
    const closing = current.find((document) => document.id === id);
    if (!closing) return;
    if (closing.content !== closing.savedContent && !window.confirm(`« ${closing.name} » contient des modifications non enregistrées.\n\nFermer sans enregistrer ?`)) return;
    const remaining = current.filter((document) => document.id !== id);
    commitDocuments(remaining);
    if (activeId === id) {
      setActiveId(remaining.at(-1)?.id ?? null);
      if (!remaining.length) setPage('home');
      setIsEditing(false);
    }
  }, [activeId, commitDocuments]);

  const updateContent = useCallback((value: string) => {
    if (!activeId) return;
    commitDocuments(documentsRef.current.map((document) => document.id === activeId ? { ...document, content: value } : document));
  }, [activeId, commitDocuments]);

  const handleSave = useCallback(async (saveAs = false) => {
    if (!activeDoc || !canEdit || activeDoc.truncated || (!dirty && !saveAs)) return;
    setLoading(true);
    setLoadingMessage('Enregistrement…');
    const browserDownloadFallback = activeDoc.source === 'browser' && !activeDoc.handle && !isTauri();
    try {
      const saved = await saveDocument(activeDoc, activeDoc.content, saveAs);
      commitDocuments(documentsRef.current.map((document) => document.id === activeDoc.id ? saved : document));
      notify(browserDownloadFallback ? 'Une copie a été téléchargée.' : 'Modifications enregistrées.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible d’enregistrer ce fichier.';
      if (message !== 'Enregistrement annulé.') notify(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeDoc, canEdit, commitDocuments, dirty, notify]);

  const findInDocument = useCallback((backwards = false) => {
    if (!query || !activeDoc) return;
    if (activeDoc.kind === 'pdf') {
      setPdfFindRequest({ id: Date.now() + Math.random(), backwards });
      return;
    }
    const editor = editorRef.current;
    if (isEditing && editor) {
      const value = editor.value;
      const start = backwards ? editor.selectionStart - query.length : editor.selectionEnd;
      let index = backwards ? value.lastIndexOf(query, Math.max(start, 0)) : value.indexOf(query, Math.max(start, 0));
      if (index < 0) index = backwards ? value.lastIndexOf(query) : value.indexOf(query);
      if (index >= 0) {
        editor.focus();
        editor.setSelectionRange(index, index + query.length);
        const line = value.slice(0, index).split('\n').length;
        editor.scrollTop = Math.max(0, (line - 3) * preferences.editorSize * 1.75);
      }
      return;
    }
    const find = (window as Window & { find?: (text: string, caseSensitive?: boolean, backwards?: boolean, wrap?: boolean) => boolean }).find;
    find?.call(window, query, false, backwards, true);
  }, [activeDoc, isEditing, preferences.editorSize, query]);

  const replaceAll = useCallback(() => {
    if (!activeDoc || !query) return;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = activeDoc.content.match(new RegExp(escaped, 'gi'))?.length ?? 0;
    if (!matches) return;
    updateContent(activeDoc.content.replace(new RegExp(escaped, 'gi'), replacement));
    notify(`${matches} remplacement${matches > 1 ? 's' : ''} effectué${matches > 1 ? 's' : ''}.`);
    setIsEditing(true);
    setEditorMode('source');
  }, [activeDoc, notify, query, replacement, updateContent]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) {
        if (event.key === 'Escape') {
          if (settingsOpen) setSettingsOpen(false);
          else if (searchOpen) setSearchOpen(false);
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'o') {
        event.preventDefault();
        void handleOpen();
      } else if (key === 's') {
        event.preventDefault();
        void handleSave(event.shiftKey);
      } else if (key === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        setReplaceOpen(false);
      } else if (key === 'h') {
        event.preventDefault();
        setSearchOpen(true);
        setReplaceOpen(true);
      } else if (key === 'w' && activeId) {
        event.preventDefault();
        closeDocument(activeId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, closeDocument, handleOpen, handleSave, searchOpen, settingsOpen]);

  function updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isTauri()) {
      event.preventDefault();
      setDragging(true);
    }
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    const target = event.relatedTarget;
    if (!isTauri() && (!target || !(target instanceof Node) || !event.currentTarget.contains(target))) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (isTauri()) return;
    event.preventDefault();
    setDragging(false);
    void openDroppedFiles(Array.from(event.dataTransfer.files ?? []));
  }

  const isHome = page === 'home';

  return (
    <div className={`app-shell theme-${preferences.theme}`} style={{ '--reader-size': `${preferences.textSize}px` } as CSSProperties} onDragEnter={onDragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <input ref={inputRef} className="visually-hidden" type="file" multiple onChange={onInputFiles} aria-label="Sélectionner des fichiers" />
      <aside className="sidebar">
        <div className="brand-lockup" onClick={() => { setPage('home'); setActiveId(null); }} role="button" tabIndex={0}>
          <span className="brand-mark" aria-hidden="true"><span /><span /><i /></span>
          <span className="brand-name">noto</span>
          <span className="brand-build">BÊTA</span>
        </div>

        <div className="sidebar-main-action"><OpenDialogButton onClick={() => void handleOpen()} compact /></div>

        <nav className="sidebar-nav" aria-label="Navigation principale">
          <button className={`nav-item ${page === 'home' ? 'active' : ''}`} type="button" onClick={() => { setPage('home'); setActiveId(null); }}>
            <LayoutGrid size={17} /><span>Accueil</span>
          </button>
          <button className={`nav-item ${page === 'recents' ? 'active' : ''}`} type="button" onClick={() => { setPage('recents'); setActiveId(null); }}>
            <Clock3 size={17} /><span>Récents</span><span className="nav-count">{recents.length || ''}</span>
          </button>
        </nav>

        <div className="sidebar-recents-header">
          <span>RÉCEMMENT OUVERTS</span>
          <button type="button" title="Effacer la liste des récents" aria-label="Effacer les fichiers récents" onClick={() => { setRecents([]); notify('La liste des fichiers récents a été effacée.'); }}><MoreHorizontal size={17} /></button>
        </div>
        <div className="sidebar-recent-list">
          {recents.slice(0, 6).map((recent) => (
            <button className={`recent-file ${activeDoc?.path === recent.path && page === 'file' ? 'selected' : ''}`} type="button" key={recent.id} onClick={() => void handleRecent(recent)} title={recent.path}>
              <span className={`file-type-icon type-${recent.kind}`}>{kindIcon(recent.kind, 15)}</span>
              <span className="recent-file-copy"><span className="recent-file-name">{recent.name}</span><span className="recent-file-date">{formatRelativeDate(recent.lastOpened)}</span></span>
            </button>
          ))}
          {recents.length === 0 && <div className="sidebar-empty">Les fichiers ouverts apparaîtront ici.</div>}
        </div>

        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={15} /><span>Vos fichiers restent<br />sur cet appareil</span></div>
          <div className="sidebar-footer-actions">
            <button className="footer-icon-button" type="button" title={preferences.theme === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair'} aria-label="Changer de thème" onClick={() => updatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light')}>
              {preferences.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button className="footer-settings" type="button" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /><span>Paramètres</span></button>
          </div>
          <div className="sidebar-version"><span>Noto</span><span>0.1.0</span></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-icon">{activeDoc && page === 'file' ? kindIcon(activeDoc.kind, 16) : <span className="mini-logo">N</span>}</span>
            <div className="topbar-heading">
              <div className="topbar-name-row">
                <h1>{page === 'recents' ? 'Récents' : page === 'file' && activeDoc ? activeDoc.name : 'Accueil'}</h1>
                {page === 'file' && activeDoc && activeDoc.content !== activeDoc.savedContent && <span className="unsaved-indicator" title="Modifications non enregistrées" />}
              </div>
              <span className="topbar-subtitle">{page === 'file' && activeDoc ? `${getFormatLabel(activeDoc.kind)}${activeDoc.path && activeDoc.source === 'desktop' ? ` · ${activeDoc.path}` : ''}` : 'Espace local'}</span>
            </div>
          </div>

          <div className="topbar-actions">
            {page === 'file' && activeDoc && <>
              {activeDoc.kind === 'html' && !isEditing && <div className="segmented-control html-mode-toggle" aria-label="Mode HTML">
                <button className={htmlMode === 'code' ? 'selected' : ''} type="button" onClick={() => setHtmlMode('code')}><Code2 size={14} />Code</button>
                <button className={htmlMode === 'preview' ? 'selected' : ''} type="button" onClick={() => setHtmlMode('preview')}><Maximize2 size={13} />Aperçu</button>
              </div>}
              {isEditing && activeDoc.kind === 'markdown' && <div className="segmented-control editor-mode-toggle" aria-label="Mode de lecture">
                <button className={editorMode === 'source' ? 'selected' : ''} type="button" onClick={() => setEditorMode('source')}><TextCursorInput size={14} />Édition</button>
                <button className={editorMode === 'split' ? 'selected' : ''} type="button" onClick={() => setEditorMode('split')}><PanelLeft size={14} />Côte à côte</button>
                <button className={editorMode === 'preview' ? 'selected' : ''} type="button" onClick={() => setEditorMode('preview')}><BookOpenText size={14} />Aperçu</button>
              </div>}
              {canReadText && <button className="icon-action" type="button" title="Rechercher (Ctrl+F)" aria-label="Rechercher" onClick={() => { setSearchOpen(true); setReplaceOpen(false); }}><Search size={17} /></button>}
              {canEdit && !activeDoc.truncated && <button className={`edit-action ${isEditing ? 'editing' : ''}`} type="button" onClick={() => { setIsEditing((value) => !value); setEditorMode(activeDoc.kind === 'markdown' ? 'split' : 'source'); }}>
                {isEditing ? <Check size={16} /> : <Pencil size={15} />}<span>{isEditing ? 'Terminer' : 'Éditer'}</span>
              </button>}
              {canEdit && dirty && !activeDoc.truncated && <button className="save-action" type="button" onClick={() => void handleSave()}><Save size={15} /><span>Enregistrer</span></button>}
              <button className="icon-action close-current" type="button" title="Fermer le fichier (Ctrl+W)" aria-label="Fermer le fichier" onClick={() => closeDocument(activeDoc.id)}><X size={17} /></button>
            </>}
            {(isHome || page === 'recents') && <button className="icon-action settings-top-action" type="button" title="Paramètres" aria-label="Paramètres" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button>}
          </div>
        </header>

        {page === 'file' && documents.length > 0 && <div className="tab-strip" role="tablist" aria-label="Fichiers ouverts">
          {documents.map((document) => (
            <div key={document.id} className={`document-tab ${activeId === document.id ? 'active' : ''}`} role="tab" aria-selected={activeId === document.id} tabIndex={0} onClick={() => { setActiveId(document.id); setIsEditing(false); setPage('file'); }} onKeyDown={(event) => { if (event.key === 'Enter') setActiveId(document.id); }}>
              <span className={`tab-icon type-${document.kind}`}>{kindIcon(document.kind, 14)}</span>
              <span className="tab-name">{document.name}</span>
              {document.content !== document.savedContent && <span className="tab-unsaved" />}
              <button className="tab-close" type="button" aria-label={`Fermer ${document.name}`} onClick={(event) => { event.stopPropagation(); closeDocument(document.id); }}><X size={13} /></button>
            </div>
          ))}
          <button className="tab-add" type="button" title="Ouvrir un fichier" aria-label="Ouvrir un fichier" onClick={() => void handleOpen()}><Plus size={16} /></button>
        </div>}

        {searchOpen && page === 'file' && activeDoc && <div className="search-panel" role="search">
          <div className="search-field-wrap"><Search size={15} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans ce fichier" onKeyDown={(event) => { if (event.key === 'Enter') findInDocument(event.shiftKey); if (event.key === 'Escape') setSearchOpen(false); }} /></div>
          {replaceOpen && <div className="search-field-wrap replace-field"><Replace size={15} /><input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="Remplacer par" onKeyDown={(event) => { if (event.key === 'Enter') replaceAll(); }} /></div>}
          <span className="search-count">{activeDoc.kind === 'pdf' ? 'Dans le PDF' : formatMatchCount(query, activeDoc.content)}</span>
          <button className="tool-button" type="button" title="Résultat précédent" aria-label="Résultat précédent" onClick={() => findInDocument(true)}><ChevronDown size={15} className="rotate-up" /></button>
          <button className="tool-button" type="button" title="Résultat suivant" aria-label="Résultat suivant" onClick={() => findInDocument(false)}><ChevronDown size={15} /></button>
          {replaceOpen && <button className="replace-all-button" type="button" disabled={!query} onClick={replaceAll}>Tout remplacer</button>}
          <button className="tool-button search-close" type="button" title="Fermer la recherche" aria-label="Fermer la recherche" onClick={() => setSearchOpen(false)}><X size={15} /></button>
        </div>}

        <section className="workspace-content">
          {page === 'home' && <HomeScreen recents={recents} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
          {page === 'recents' && <RecentScreen recents={recents} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onRemove={(id) => setRecents((current) => current.filter((item) => item.id !== id))} />}
          {page === 'file' && activeDoc && <div className={`document-workspace ${activeDoc.kind === 'markdown' ? 'is-markdown' : ''}`}>
            {activeDoc.truncated && <div className="partial-warning"><CircleHelp size={15} /><span>Aperçu partiel — seules les premières lignes sont chargées. L’édition et l’enregistrement sont désactivés.</span></div>}
            {activeDoc.kind === 'unknown' && !canReadText ? <UnsupportedFile document={activeDoc} onOpenText={() => setTextFallbackIds((current) => new Set(current).add(activeDoc.id))} /> : (
              <ViewerContent
                document={activeDoc}
                documents={documents}
                isEditing={isEditing}
                editorMode={editorMode}
                htmlMode={htmlMode}
                preferences={preferences}
                onChange={updateContent}
                editorRef={editorRef}
                searchQuery={searchOpen ? query : ''}
                pdfSearchRequest={pdfFindRequest}
              />
            )}
          </div>}
          {page === 'file' && !activeDoc && <HomeScreen recents={recents} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
        </section>

        {page === 'file' && activeDoc && <footer className="document-statusbar">
          <div className="status-left"><span className="status-dot" />{dirty ? 'Modifications non enregistrées' : 'À jour'}<span className="status-separator">·</span><span>{activeDoc.extension ? `.${activeDoc.extension.toUpperCase()}` : getFormatLabel(activeDoc.kind)}</span></div>
          <div className="status-right"><span>{formatBytes(activeDoc.size)}</span>{activeDoc.kind === 'markdown' && <><span className="status-separator">·</span><span>Markdown</span></>}{activeDoc.source === 'desktop' && <><span className="status-separator">·</span><span>Local</span></>}</div>
        </footer>}
      </main>

      {dragging && <div className="drop-overlay" onDragLeave={() => setDragging(false)}><div className="drop-overlay-card"><span className="drop-icon"><FileUp size={25} /></span><strong>Déposez pour ouvrir</strong><span>Markdown, texte, code, PDF, images…</span></div></div>}
      {loading && <div className="loading-overlay"><div className="loading-card"><LoaderCircle size={20} className="spin" /><span>{loadingMessage}</span></div></div>}
      {toast && <div className={`toast toast-${toastKind}`} role="status"><span className="toast-mark">{toastKind === 'success' ? <Check size={14} /> : <CircleHelp size={14} />}</span>{toast}</div>}
      {settingsOpen && <SettingsModal preferences={preferences} onChange={updatePreference} onClose={() => setSettingsOpen(false)} onClearRecents={() => { setRecents([]); notify('La liste des fichiers récents a été effacée.'); }} />}
    </div>
  );
}

function HomeScreen({ recents, onOpen, onRecent, onViewAll }: { recents: RecentFile[]; onOpen: () => void; onRecent: (recent: RecentFile) => void; onViewAll: () => void }) {
  return (
    <div className="home-screen">
      <div className="welcome-block">
        <div className="welcome-illustration" aria-hidden="true">
          <div className="illustration-orbit orbit-one" /><div className="illustration-orbit orbit-two" />
          <div className="illustration-document illustration-back"><span /><span /><span /></div>
          <div className="illustration-document illustration-front"><div className="illustration-file-mark">N</div><span /><span /><span /></div>
          <div className="illustration-sparkle"><Sparkles size={15} /></div>
        </div>
        <div className="welcome-copy">
          <div className="eyebrow"><span className="eyebrow-dot" />UN ESPACE POUR VOS FICHIERS</div>
          <h2>Vos fichiers,<br /><em>en toute clarté.</em></h2>
          <p>Ouvrez un document, un extrait de code ou une image. Noto vous offre un endroit calme pour les consulter — et les modifier quand il le faut.</p>
          <div className="welcome-actions"><OpenDialogButton onClick={onOpen} /><span className="local-hint"><ShieldCheck size={14} />Tout reste sur votre appareil</span></div>
        </div>
      </div>

      <div className="format-row" aria-label="Formats compatibles">
        <span>PRÊT POUR VOS FORMATS COURANTS</span>
        <div className="format-pills"><span><BookOpenText size={14} />Markdown</span><span><Code2 size={14} />Code</span><span><FileType2 size={14} />PDF</span><span><ImageIcon size={14} />Images</span><span><Table2 size={14} />CSV</span></div>
      </div>

      <div className="home-recents-section">
        <div className="section-heading"><div><h3>Fichiers récents</h3><p>Reprenez là où vous en étiez.</p></div>{recents.length > 3 && <button className="text-link" type="button" onClick={onViewAll}>Tout voir <span>→</span></button>}</div>
        {recents.length > 0 ? <div className="home-recent-grid">
          {recents.slice(0, 3).map((recent) => <RecentCard key={recent.id} recent={recent} onClick={() => onRecent(recent)} />)}
        </div> : <div className="recent-empty-card"><span className="empty-clock"><Clock3 size={18} /></span><span><strong>Rien d’ouvert pour le moment</strong><small>Vos derniers fichiers apparaîtront ici.</small></span><button type="button" onClick={onOpen}>Parcourir <span>→</span></button></div>}
      </div>
      <div className="home-footnote"><span>Simple par nature</span><i />Pas de compte<i />Pas de cloud<i />Pas de suivi</div>
    </div>
  );
}

function RecentCard({ recent, onClick }: { recent: RecentFile; onClick: () => void }) {
  return <button className="home-recent-card" type="button" onClick={onClick} title={recent.path}>
    <span className={`home-file-icon type-${recent.kind}`}>{kindIcon(recent.kind, 17)}</span>
    <span className="home-card-copy"><strong>{recent.name}</strong><small>{getFormatLabel(recent.kind as OpenDocument['kind'])} <i /> {formatRelativeDate(recent.lastOpened)}</small></span>
    <span className="card-arrow">↗</span>
  </button>;
}

function RecentScreen({ recents, onOpen, onRecent, onRemove }: { recents: RecentFile[]; onOpen: () => void; onRecent: (recent: RecentFile) => void; onRemove: (id: string) => void }) {
  return <div className="recent-screen">
    <div className="recent-screen-heading"><div><div className="eyebrow">VOTRE HISTORIQUE LOCAL</div><h2>Récents</h2><p>Les fichiers que vous avez consultés récemment sur cet appareil.</p></div><button className="secondary-button" type="button" onClick={onOpen}><Plus size={15} /> Ouvrir un fichier</button></div>
    {recents.length ? <div className="recent-list-table">
      <div className="recent-table-head"><span>FICHIER</span><span>TYPE</span><span>OUVERT</span><span /></div>
      {recents.map((recent) => <div className="recent-table-row" key={recent.id}>
        <button className="recent-table-file" type="button" onClick={() => onRecent(recent)} title={recent.path}><span className={`home-file-icon type-${recent.kind}`}>{kindIcon(recent.kind, 17)}</span><span><strong>{recent.name}</strong><small>{recent.path}</small></span></button>
        <span className="recent-table-kind">{getFormatLabel(recent.kind as OpenDocument['kind'])}</span>
        <span className="recent-table-date">{formatRelativeDate(recent.lastOpened)}</span>
        <button className="recent-remove" type="button" title="Retirer des récents" aria-label={`Retirer ${recent.name} des récents`} onClick={() => onRemove(recent.id)}><X size={15} /></button>
      </div>)}
    </div> : <div className="recent-empty-large"><span><Clock3 size={24} /></span><h3>Aucun fichier récent</h3><p>Ouvrez votre premier fichier pour le retrouver ici.</p><button className="primary-button" type="button" onClick={onOpen}><Plus size={16} />Ouvrir un fichier</button></div>}
    <div className="recent-privacy"><ShieldCheck size={15} />Votre historique reste uniquement enregistré sur cet appareil.</div>
  </div>;
}

function UnsupportedFile({ document, onOpenText }: { document: OpenDocument; onOpenText: () => void }) {
  const maybeText = document.content.length > 0 || document.size === 0;
  return <div className="unsupported-screen">
    <div className="unsupported-icon"><FileType2 size={25} /></div>
    <span className="eyebrow">FORMAT NON RECONNU</span>
    <h2>Ce fichier n’est pas encore pris en charge.</h2>
    <p>Noto ne peut pas afficher <strong>{document.name}</strong> pour le moment. Le fichier original n’a pas été modifié.</p>
    <div className="unsupported-details"><span>Type de fichier</span><strong>{document.extension ? `.${document.extension}` : 'Sans extension'}</strong><i /><span>Taille</span><strong>{formatBytes(document.size)}</strong></div>
    {maybeText && <button className="secondary-button" type="button" onClick={onOpenText}><TextCursorInput size={16} />Ouvrir comme fichier texte</button>}
  </div>;
}

function ViewerContent({
  document, documents, isEditing, editorMode, htmlMode, preferences, onChange, editorRef, searchQuery, pdfSearchRequest,
}: {
  document: OpenDocument;
  documents: OpenDocument[];
  isEditing: boolean;
  editorMode: 'source' | 'split' | 'preview';
  htmlMode: 'code' | 'preview';
  preferences: Preferences;
  onChange: (value: string) => void;
  editorRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  searchQuery: string;
  pdfSearchRequest: { id: number; backwards: boolean } | null;
}) {
  const isMarkdown = document.kind === 'markdown';
  const showSource = isEditing && (isMarkdown ? editorMode !== 'preview' : true);
  const showPreview = isEditing && isMarkdown && (editorMode !== 'source');

  if (isEditing) {
    return <div className={`editor-workspace editor-${editorMode} ${isMarkdown ? 'markdown-editor-workspace' : 'plain-editor-workspace'}`}>
      {showSource && <section className="editor-pane">
        <div className="pane-heading"><span>{isMarkdown ? 'MARKDOWN' : document.extension ? document.extension.toUpperCase() : 'TEXTE'} · ÉDITION</span><span>{document.content.split('\n').length} lignes</span></div>
        <TextEditor value={document.content} extension={document.extension} onChange={onChange} lineNumbers={preferences.lineNumbers} wordWrap={preferences.wordWrap} fontSize={preferences.editorSize} disabled={document.truncated} textareaRef={editorRef} />
      </section>}
      {showPreview && <section className="preview-pane">
        <div className="pane-heading"><span>APERÇU EN DIRECT</span><span>{document.content.length.toLocaleString('fr-FR')} caractères</span></div>
        <div className="preview-scroll"><Suspense fallback={<div className="viewer-empty">Préparation de l’aperçu…</div>}><MarkdownViewer source={document.content} document={document} documents={documents} /></Suspense></div>
      </section>}
    </div>;
  }

  if (document.kind === 'markdown') return <div className="reader-scroll"><Suspense fallback={<div className="viewer-empty">Préparation du rendu…</div>}><MarkdownViewer source={document.content} document={document} documents={documents} /></Suspense></div>;
  if (document.kind === 'code' || document.kind === 'text' || (document.kind === 'unknown' && (document.content.length > 0 || document.size === 0))) {
    const displayContent = document.extension === 'json' ? formatJsonForDisplay(document.content) : document.content;
    return <CodeViewer content={displayContent} extension={document.extension} lineNumbers={preferences.lineNumbers} wordWrap={preferences.wordWrap} fontSize={preferences.textSize} />;
  }
  if (document.kind === 'csv') return <CsvViewer content={document.content} />;
  if (document.kind === 'html') return htmlMode === 'preview'
    ? <HtmlViewer source={document.content} mode="preview" />
    : <CodeViewer content={document.content} extension="html" lineNumbers={preferences.lineNumbers} wordWrap={preferences.wordWrap} fontSize={preferences.textSize} />;
  if (document.kind === 'pdf') return <Suspense fallback={<div className="viewer-empty">Chargement du lecteur PDF…</div>}><PdfViewer document={document} searchQuery={searchQuery} searchRequest={pdfSearchRequest} /></Suspense>;
  if (document.kind === 'image') return <Suspense fallback={<div className="viewer-empty">Chargement de l’image…</div>}><ImageViewer document={document} /></Suspense>;
  return <UnsupportedFile document={document} onOpenText={() => onChange(document.content)} />;
}

function SettingsModal({ preferences, onChange, onClose, onClearRecents }: { preferences: Preferences; onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void; onClose: () => void; onClearRecents: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div><span className="settings-icon"><Settings2 size={17} /></span><div><h2 id="settings-title">Paramètres</h2><p>Personnalisez votre espace Noto.</p></div></div><button className="icon-action" type="button" title="Fermer" aria-label="Fermer les paramètres" onClick={onClose}><X size={18} /></button></header>
      <div className="settings-body">
        <section className="settings-section"><div className="settings-section-title"><span>APPARENCE</span><small>Votre espace, à votre façon.</small></div>
          <div className="setting-row"><div className="setting-label"><strong>Thème</strong><small>Choisissez l’apparence de Noto.</small></div><div className="theme-picker">
            <button className={preferences.theme === 'light' ? 'selected' : ''} type="button" onClick={() => onChange('theme', 'light')}><Sun size={15} />Clair</button>
            <button className={preferences.theme === 'dark' ? 'selected' : ''} type="button" onClick={() => onChange('theme', 'dark')}><Moon size={15} />Sombre</button>
          </div></div>
          <div className="setting-row"><div className="setting-label"><strong>Taille du texte</strong><small>Confort de lecture.</small></div><div className="select-wrap"><select value={preferences.textSize} onChange={(event) => onChange('textSize', Number(event.target.value))}><option value={14}>Compacte</option><option value={16}>Standard</option><option value={18}>Confortable</option><option value={20}>Grande</option></select><ChevronDown size={14} /></div></div>
        </section>
        <section className="settings-section"><div className="settings-section-title"><span>ÉDITEUR</span><small>Options pour les modifications rapides.</small></div>
          <div className="setting-row"><div className="setting-label"><strong>Police de l’éditeur</strong><small>Taille de la police monospace.</small></div><div className="select-wrap"><select value={preferences.editorSize} onChange={(event) => onChange('editorSize', Number(event.target.value))}><option value={12}>12 px</option><option value={14}>14 px</option><option value={16}>16 px</option><option value={18}>18 px</option><option value={20}>20 px</option></select><ChevronDown size={14} /></div></div>
          <div className="setting-row"><div className="setting-label"><strong>Numéros de lignes</strong><small>Repérez-vous dans le fichier.</small></div><button className={`toggle ${preferences.lineNumbers ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.lineNumbers} onClick={() => onChange('lineNumbers', !preferences.lineNumbers)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>Retour à la ligne</strong><small>Renvoyer les longues lignes à la ligne.</small></div><button className={`toggle ${preferences.wordWrap ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.wordWrap} onClick={() => onChange('wordWrap', !preferences.wordWrap)}><i /></button></div>
        </section>
        <section className="settings-section settings-general"><div className="settings-section-title"><span>GÉNÉRAL</span></div><div className="setting-row"><div className="setting-label"><strong>Historique local</strong><small>Effacer la liste des fichiers récents.</small></div><button className="subtle-button" type="button" onClick={onClearRecents}><RotateCcw size={14} />Effacer</button></div></section>
        <div className="settings-privacy"><ShieldCheck size={15} /><span>Aucun compte ni synchronisation. Vos fichiers restent sur votre appareil.</span></div>
      </div>
      <footer className="settings-footer"><span>Noto <i>·</i> Version 0.1.0</span><button className="secondary-button" type="button" onClick={onClose}>Terminé</button></footer>
    </section>
  </div>;
}
