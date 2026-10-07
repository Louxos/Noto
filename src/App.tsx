import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, type DragEvent, type ReactNode, type CSSProperties } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  ArrowDown, ArrowUp, BookOpen, BookOpenText, Check, ChevronDown, CircleHelp, Clock3, Code2, Command,
  Copy, ClipboardPaste, Download, File, FileCode2, FileImage, FileText, FileType2, FileUp, FolderInput, FolderPlus, Globe2, Presentation, Upload,
  Image as ImageIcon, Keyboard, LayoutGrid, LoaderCircle, Maximize2, Moon, MoreHorizontal,
  PanelLeft, Pencil, Plus, RotateCcw, Scissors, Search, Settings2, ShieldCheck, Sun, Table2,
  TextCursorInput, X, Save, Replace, Sparkles, Trash2, Pin,
} from 'lucide-react';
import { CodeViewer } from './components/CodeViewer';
import { CsvViewer } from './components/CsvViewer';
import { HtmlViewer } from './components/HtmlViewer';
import { TextEditor } from './components/TextEditor';
import { SmartGroupScreen } from './components/SmartGroupScreen';

import { AppMenuBar, CommandPalette, ContextMenu, GoToLineDialog, GroupAssignmentDialog, GroupDialog, GroupScreen, RenameFileDialog, SaveAsDialog, ShortcutsDialog, type CommandOption, type MenuDefinition, type MenuEntry } from './components/WorkspaceTools';
import { formatBytes, loadBrowserFile, openDesktopFiles, pickBrowserFiles, readDesktopPath, saveDocument, type SaveAsOptions } from './lib/files';
import { moveDesktopFile, pathFileName, renameDesktopFile } from './lib/fileOperations';
import { getExtension, getFileKind, getFormatLabel, mimeTypeFor } from './lib/fileTypes';
import { loadDesktopSessionState, saveDesktopSession, clearDesktopSession } from './lib/session';
import { createLocalBackup, parseLocalBackup } from './lib/backup';
import { clearLocalDrafts, draftId, loadLocalDrafts, removeLocalDraft, saveLocalDraft } from './lib/drafts';
import { formatJsonForDisplay, validateJson } from './lib/textFormat';
import { createSearchRegExp, searchText, type SearchOptions, type TextSearchMatch } from './lib/search';
import { reorderTabs, tabsWithoutOthers, togglePinnedTab } from './lib/tabs';
import { createGroup, addGroupFile, deleteGroup, duplicateGroup, loadGroups, removeGroupFile, removeGroupFiles, renameGroup, saveGroups, toggleGroupFile, type FileGroup, type GroupColor } from './lib/groups';
import { defaultPreferences, loadPreferences, loadRecentFiles, savePreferences, saveRecentFiles, upsertRecent, TOOLBAR_ACTIONS, type Preferences, type RecentFile, type ToolbarAction } from './lib/preferences';
import type { BrowserFileHandle, OpenDocument } from './types';
import './styles.css';

const MarkdownViewer = lazy(() => import('./components/MarkdownViewer').then((module) => ({ default: module.MarkdownViewer })));
const ImageViewer = lazy(() => import('./components/ImageViewer').then((module) => ({ default: module.ImageViewer })));
const PdfViewer = lazy(() => import('./components/PdfViewer').then((module) => ({ default: module.PdfViewer })));
const PresentationViewer = lazy(() => import('./components/PresentationViewer').then((module) => ({ default: module.PresentationViewer })));
const OfficeDocumentViewer = lazy(() => import('./components/OfficeDocumentViewer').then((module) => ({ default: module.OfficeDocumentViewer })));
const NotebookScreen = lazy(() => import('./components/NotebookScreen').then((module) => ({ default: module.NotebookScreen })));

const formatIcons: Record<string, typeof FileText> = {
  markdown: BookOpenText,
  text: FileText,
  code: FileCode2,
  html: Globe2,
  csv: Table2,
  pdf: FileType2,
  image: FileImage,
  presentation: Presentation,
  document: FileText,
  ebook: BookOpen,
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

function kindIcon(kind: string, size = 16): ReactNode {
  const Icon = formatIcons[kind] ?? File;
  return <Icon size={size} strokeWidth={1.8} />;
}

function recentFromDocument(document: OpenDocument): RecentFile {
  return {
    id: `${document.source}:${document.path}`,
    name: document.name,
    path: document.path,
    kind: document.kind,
    lastOpened: Date.now(),
    source: document.source,
  };
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
  const [page, setPage] = useState<'home' | 'file' | 'recents' | 'group' | 'smart-group' | 'notebooks'>('home');
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [recents, setRecents] = useState<RecentFile[]>(() => loadRecentFiles(preferences.recentLimit));
  const [groups, setGroups] = useState<FileGroup[]>(() => loadGroups());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeSmartGroup, setActiveSmartGroup] = useState<'pdf' | 'image' | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ groupId: string | null } | null>(null);
  const [renameTarget, setRenameTarget] = useState<RecentFile | null>(null);
  const [groupAssignmentTarget, setGroupAssignmentTarget] = useState<RecentFile | null>(null);
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; items: MenuEntry[] } | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [tabDropTargetId, setTabDropTargetId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'source' | 'split' | 'preview'>('split');
  const [htmlMode, setHtmlMode] = useState<'code' | 'preview'>('preview');
  const [textFallbackIds, setTextFallbackIds] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({ caseSensitive: false, wholeWord: false, regex: false });
  const [searchAllTabs, setSearchAllTabs] = useState(false);
  const [currentSearchMatch, setCurrentSearchMatch] = useState<{ documentId: string; index: number } | null>(null);
  const [goToLineOpen, setGoToLineOpen] = useState(false);
  const [pendingGoToLine, setPendingGoToLine] = useState<{ documentId: string; line: number } | null>(null);
  const [pendingSearchResult, setPendingSearchResult] = useState<(TextSearchMatch & { documentId: string; documentName: string }) | null>(null);
  const [pdfFindRequest, setPdfFindRequest] = useState<{ id: number; backwards: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [saveAsError, setSaveAsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Ouverture du fichier…');
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState('');
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const documentsRef = useRef<OpenDocument[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const modalReturnFocusRef = useRef<HTMLElement | null>(null);
  const draftStorageErrorShown = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const browserHandles = useRef<Map<string, BrowserFileHandle>>(new Map());
  const sessionRestoreStarted = useRef(false);
  const commitDocuments = useCallback((next: OpenDocument[]) => {
    documentsRef.current = next;
    setDocuments(next);
  }, []);
  const activeDoc = documents.find((document) => document.id === activeId) ?? null;
  const activeModalId = commandPaletteOpen ? 'palette' : shortcutsOpen ? 'shortcuts' : saveAsDialogOpen ? 'save-as' : goToLineOpen ? 'go-to-line' : renameTarget ? 'rename-file' : groupAssignmentTarget ? 'group-assignment' : groupDialog ? 'group' : settingsOpen ? 'settings' : null;
  const searchResults = useMemo(() => {
    const searchDocuments = searchAllTabs
      ? [...(activeDoc ? [activeDoc] : []), ...documents.filter((document) => document.id !== activeDoc?.id)]
      : activeDoc ? [activeDoc] : [];
    const matches: Array<TextSearchMatch & { documentId: string; documentName: string }> = [];
    let total = 0;
    let truncated = false;
    let error: string | null = null;
    for (const document of searchDocuments) {
      if (!['markdown', 'text', 'code', 'html', 'csv', 'unknown'].includes(document.kind)) continue;
      const result = searchText(document.content, query, searchOptions);
      if (result.error) { error ??= result.error; continue; }
      total += result.total;
      truncated ||= result.truncated;
      for (const match of result.matches) {
        if (matches.length >= 300) { truncated = true; break; }
        matches.push({ ...match, documentId: document.id, documentName: document.name });
      }
    }
    if (!error && query && searchDocuments.length === 0) error = searchText('', query, searchOptions).error;
    return { matches, total, truncated, error };
  }, [activeDoc, documents, query, searchAllTabs, searchOptions]);
  const currentGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  const smartGroupTitle = activeSmartGroup === 'pdf' ? 'PDF ouverts récemment' : 'Images récentes';
  const smartGroupFiles = recents.filter((recent) => recent.kind === (activeSmartGroup === 'pdf' ? 'pdf' : 'image'));
  const activeFileKey = activeDoc ? `${activeDoc.source}:${activeDoc.path}` : '';
  const dirty = Boolean(activeDoc && activeDoc.content !== activeDoc.savedContent);
  const canReadText = Boolean(activeDoc && (['markdown', 'text', 'code', 'html', 'csv', 'pdf'].includes(activeDoc.kind) || (activeDoc.kind === 'unknown' && textFallbackIds.has(activeDoc.id))));
  const canEdit = Boolean(activeDoc && canReadText && !activeDoc.truncated && ['markdown', 'text', 'code', 'html', 'csv', 'unknown'].includes(activeDoc.kind));

  useEffect(() => {
    savePreferences(preferences);
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.accent = preferences.accent;
  }, [preferences]);

  useEffect(() => {
    saveRecentFiles(recents, preferences.recentLimit);
    if (recents.length > preferences.recentLimit) setRecents((current) => current.slice(0, preferences.recentLimit));
  }, [preferences.recentLimit, recents]);

  useEffect(() => {
    saveGroups(groups);
  }, [groups]);

  useEffect(() => {
    if (!groupPickerOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.group-picker-root')) setGroupPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [groupPickerOpen]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3_400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => searchRef.current?.focus(), 40);
  }, [searchOpen]);

  useEffect(() => {
    if (!pendingSearchResult || pendingSearchResult.documentId !== activeId || page !== 'file') return;
    let frame = 0;
    let attempts = 0;
    const locate = () => {
      attempts += 1;
      const editor = editorRef.current;
      if (isEditing && editor) {
        editor.focus();
        editor.setSelectionRange(pendingSearchResult.index, pendingSearchResult.index + pendingSearchResult.length);
        editor.scrollTop = Math.max(0, (pendingSearchResult.line - 3) * preferences.editorSize * 1.75);
        setCurrentSearchMatch({ documentId: pendingSearchResult.documentId, index: pendingSearchResult.index });
        setPendingSearchResult(null);
        return;
      }
      const find = (window as Window & { find?: (text: string, caseSensitive?: boolean, backwards?: boolean, wrap?: boolean) => boolean }).find;
      if (find?.call(window, pendingSearchResult.text, searchOptions.caseSensitive, false, true) || attempts >= 10) {
        setCurrentSearchMatch({ documentId: pendingSearchResult.documentId, index: pendingSearchResult.index });
        setPendingSearchResult(null);
        return;
      }
      frame = window.requestAnimationFrame(locate);
    };
    frame = window.requestAnimationFrame(locate);
    return () => window.cancelAnimationFrame(frame);
  }, [activeId, isEditing, page, pendingSearchResult, preferences.editorSize, searchOptions.caseSensitive]);

  useEffect(() => {
    if (!pendingGoToLine || pendingGoToLine.documentId !== activeId || !isEditing) return;
    const frame = window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const lineStarts = [0];
      for (let index = 0; index < editor.value.length; index += 1) if (editor.value[index] === '\\n') lineStarts.push(index + 1);
      const position = lineStarts[pendingGoToLine.line - 1] ?? editor.value.length;
      editor.focus();
      editor.setSelectionRange(position, position);
      editor.scrollTop = Math.max(0, (pendingGoToLine.line - 3) * preferences.editorSize * 1.75);
      setPendingGoToLine(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeId, isEditing, pendingGoToLine, preferences.editorSize]);

  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast(message);
    setToastKind(kind);
  }, []);

  useEffect(() => {
    if (!preferences.draftRecoveryEnabled) {
      clearLocalDrafts();
      draftStorageErrorShown.current = false;
      return;
    }
    const persistDraftsBeforeClose = () => {
      for (const document of documentsRef.current) {
        if (document.truncated || !['markdown', 'text', 'code', 'html', 'csv', 'unknown'].includes(document.kind)) continue;
        try {
          if (document.content !== document.savedContent) saveLocalDraft(document, preferences.draftRetentionDays);
          else removeLocalDraft(document);
        } catch { /* Periodic recovery remains best-effort if storage is unavailable. */ }
      }
    };
    window.addEventListener('pagehide', persistDraftsBeforeClose);
    const timer = window.setTimeout(() => { 
      let saveError: string | null = null;
      for (const document of documents) {
        if (document.truncated || !['markdown', 'text', 'code', 'html', 'csv', 'unknown'].includes(document.kind)) continue;
        if (document.content !== document.savedContent) {
          try { saveLocalDraft(document, preferences.draftRetentionDays); }
          catch (error) { saveError ??= error instanceof Error ? error.message : 'Impossible d’enregistrer le brouillon local.'; }
        } else removeLocalDraft(document);
      }
      if (saveError && !draftStorageErrorShown.current) {
        draftStorageErrorShown.current = true;
        notify(saveError, 'error');
      } else if (!saveError) draftStorageErrorShown.current = false;
    }, 450);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', persistDraftsBeforeClose);
    };
  }, [documents, notify, preferences.draftRecoveryEnabled, preferences.draftRetentionDays]);

  const rememberDocument = useCallback((document: OpenDocument) => {
    const recent = recentFromDocument(document);
    setRecents((current) => upsertRecent(current, recent, preferences.recentLimit));
    if (document.handle) browserHandles.current.set(recent.id, document.handle);
  }, [preferences.recentLimit]);

  const openLoadedDocuments = useCallback((items: OpenDocument[]) => {
    if (items.length === 0) return;
    const next = [...documentsRef.current];
    const openedIds: string[] = [];
    const drafts = preferences.draftRecoveryEnabled
      ? new Map(loadLocalDrafts(preferences.draftRetentionDays).map((draft) => [draft.id, draft]))
      : new Map();
    for (const item of items) {
      const existing = next.find((document) => document.source === item.source && document.path === item.path);
      if (existing) {
        openedIds.push(existing.id);
        rememberDocument(existing);
        continue;
      }
      let documentToOpen = item;
      if (preferences.draftRecoveryEnabled && !item.truncated && ['markdown', 'text', 'code', 'html', 'csv', 'unknown'].includes(item.kind)) {
        const draft = drafts.get(draftId(item));
        if (draft && draft.content !== item.savedContent) {
          const sourceChanged = draft.originalSize !== item.size || (draft.originalModifiedAt !== undefined && item.modifiedAt !== undefined && draft.originalModifiedAt !== item.modifiedAt);
          const warning = sourceChanged ? '\n\nLe fichier d’origine semble avoir changé depuis la création du brouillon.' : '';
          if (window.confirm(`Récupérer le brouillon local de « ${item.name} » ? Il a été enregistré le ${new Date(draft.savedAt).toLocaleString('fr-FR')}.${warning}\n\nLe fichier d’origine ne sera pas modifié avant un enregistrement explicite. Choisir Annuler supprimera ce brouillon local.`)) {
            documentToOpen = { ...item, content: draft.content };
          } else removeLocalDraft(item);
        } else if (draft) removeLocalDraft(item);
      }
      next.push(documentToOpen);
      openedIds.push(documentToOpen.id);
      rememberDocument(documentToOpen);
    }
    commitDocuments(next);
    if (page === 'group' && activeGroupId) {
      setGroups((current) => items.reduce((updated, item) => addGroupFile(updated, activeGroupId, recentFromDocument(item)), current));
    }
    setActiveId(openedIds[openedIds.length - 1] ?? null);
    setPage('file');
    setIsEditing(false);
    setHtmlMode('preview');
    setEditorMode('split');
    setSearchOpen(false);
    setQuery('');
    setCurrentSearchMatch(null);
    setPendingSearchResult(null);
    setPendingGoToLine(null);
  }, [activeGroupId, commitDocuments, page, preferences.draftRecoveryEnabled, preferences.draftRetentionDays, rememberDocument]);

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
    if (!preferences.restoreSession) {
      clearDesktopSession();
      return;
    }
    if (!isTauri() || sessionRestoreStarted.current) return;
    sessionRestoreStarted.current = true;
    const savedSession = loadDesktopSessionState();
    if (!savedSession.files.length && !savedSession.activeGroupId) return;
    let cancelled = false;
    setLoading(true);
    setLoadingMessage('Restauration de la session précédente…');
    void Promise.all(savedSession.files.map(async (file) => {
      try { return await readDesktopPath(file.path); }
      catch { return null; }
    })).then((items) => {
      if (cancelled) return;
      const loaded = items.filter((item): item is OpenDocument => item !== null);
      if (loaded.length) openLoadedDocuments(loaded);
      const activeFile = loaded.find((item) => item.path === savedSession.activePath) ?? loaded.at(-1);
      if (savedSession.page === 'group' && savedSession.activeGroupId && groups.some((group) => group.id === savedSession.activeGroupId)) {
        setActiveGroupId(savedSession.activeGroupId);
        setActiveId(null);
        setPage('group');
      } else if (activeFile) {
        setActiveId(activeFile.id);
        setPage('file');
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groups, openLoadedDocuments, preferences.restoreSession]);

  useEffect(() => {
    if (preferences.restoreSession && isTauri()) {
      saveDesktopSession(documents, {
        activeId,
        activeGroupId,
        page: page === 'group' ? 'group' : page === 'file' ? 'file' : 'home',
      });
    } else clearDesktopSession();
  }, [activeGroupId, activeId, documents, page, preferences.restoreSession]);

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

  async function openAllGroupFiles(group: FileGroup) {
    if (!group.files.length) return;
    if (group.files.length >= 12 && !window.confirm(`Ouvrir ${group.files.length} fichiers du groupe « ${group.name} » ? Cela peut utiliser beaucoup de mémoire.`)) return;
    setLoading(true);
    setLoadingMessage(`Ouverture des fichiers du groupe « ${group.name} »…`);
    const loaded: OpenDocument[] = [];
    const alreadyOpen: OpenDocument[] = [];
    let skipped = 0;
    for (const file of group.files) {
      const existing = documentsRef.current.find((document) => `${document.source}:${document.path}` === file.id);
      if (existing) { alreadyOpen.push(existing); continue; }
      try {
        if (file.source === 'desktop' && isTauri()) loaded.push(await readDesktopPath(file.path));
        else {
          const handle = browserHandles.current.get(file.id);
          if (!handle) { skipped += 1; continue; }
          const document = await loadBrowserFile(await handle.getFile(), handle);
          if (document) loaded.push(document);
          else skipped += 1;
        }
      } catch { skipped += 1; }
    }
    if (loaded.length) openLoadedDocuments(loaded);
    else if (alreadyOpen.length) {
      setActiveId(alreadyOpen[0].id);
      setPage('file');
      setIsEditing(false);
    }
    if (skipped) notify(`${skipped} fichier${skipped === 1 ? '' : 's'} n’a pas pu être rouvert.`, 'error');
    setLoading(false);
  }

  const closeDocument = useCallback((id: string) => {
    const current = documentsRef.current;
    const closing = current.find((document) => document.id === id);
    if (!closing) return;
    const closeWarning = preferences.draftRecoveryEnabled
      ? `« ${closing.name} » contient des modifications non enregistrées.\n\nFermer ? Noto essaiera de conserver un brouillon local si sa taille le permet.`
      : `« ${closing.name} » contient des modifications non enregistrées.\n\nFermer sans enregistrer ? Les modifications seront perdues.`;
    if (closing.content !== closing.savedContent && !window.confirm(closeWarning)) return;
    if (closing.content !== closing.savedContent && preferences.draftRecoveryEnabled && !closing.truncated) {
      try { saveLocalDraft(closing, preferences.draftRetentionDays); }
      catch (error) { notify(error instanceof Error ? error.message : 'Impossible de conserver le brouillon local.', 'error'); }
    } else if (closing.content === closing.savedContent) removeLocalDraft(closing);
    const remaining = current.filter((document) => document.id !== id);
    commitDocuments(remaining);
    if (activeId === id) {
      setActiveId(remaining.at(-1)?.id ?? null);
      if (!remaining.length) setPage('home');
      setIsEditing(false);
    }
  }, [activeId, commitDocuments, notify, preferences.draftRecoveryEnabled, preferences.draftRetentionDays]);

  function moveTab(sourceId: string, targetId: string) {
    const current = documentsRef.current;
    const reordered = reorderTabs(current, sourceId, targetId);
    if (reordered !== current) commitDocuments(reordered);
  }

  function toggleTabPinned(id: string) {
    commitDocuments(togglePinnedTab(documentsRef.current, id));
  }

  function closeOtherTabs(keepId: string) {
    const current = documentsRef.current;
    const keep = current.find((document) => document.id === keepId);
    if (!keep || current.length < 2) return;
    const unsavedDocuments = current.filter((document) => document.id !== keepId && document.content !== document.savedContent);
    const unsaved = unsavedDocuments.length;
    const closeWarning = preferences.draftRecoveryEnabled
      ? `Fermer les autres onglets ? ${unsaved} fichier${unsaved === 1 ? ' contient des modifications non enregistrées' : 's contiennent des modifications non enregistrées'}. Noto essaiera de conserver localement les brouillons dont la taille le permet.`
      : `Fermer les autres onglets ? ${unsaved} fichier${unsaved === 1 ? ' contient des modifications non enregistrées' : 's contiennent des modifications non enregistrées'} qui seront perdues.`;
    if (unsaved && !window.confirm(closeWarning)) return;
    if (preferences.draftRecoveryEnabled) {
      for (const document of unsavedDocuments) {
        if (document.truncated) continue;
        try { saveLocalDraft(document, preferences.draftRetentionDays); }
        catch (error) { notify(error instanceof Error ? error.message : 'Impossible de conserver un brouillon local.', 'error'); }
      }
    }
    commitDocuments(tabsWithoutOthers(current, keepId));
    setActiveId(keep.id);
    setPage('file');
    setIsEditing(false);
  }

  const updateContent = useCallback((value: string) => {
    if (!activeId) return;
    commitDocuments(documentsRef.current.map((document) => document.id === activeId ? { ...document, content: value } : document));
  }, [activeId, commitDocuments]);

  const handleSave = useCallback(async (saveAs = false, options?: SaveAsOptions) => {
    if (saveAs && !options) { setSaveAsError(''); setSaveAsDialogOpen(true); return; }
    if (!activeDoc || !canEdit || activeDoc.truncated || (!dirty && !saveAs)) return;
    setLoading(true);
    setLoadingMessage('Enregistrement…');
    const browserDownloadFallback = activeDoc.source === 'browser' && !activeDoc.handle && !isTauri();
    try {
      if (!saveAs && activeDoc.modifiedAt) {
        let changedOutside = false;
        if (activeDoc.source === 'desktop') {
          const { stat } = await import('@tauri-apps/plugin-fs');
          const latest = await stat(activeDoc.path);
          changedOutside = latest.size !== activeDoc.size || Boolean(latest.mtime && latest.mtime.getTime() > activeDoc.modifiedAt + 500);
        } else if (activeDoc.handle) {
          const latest = await activeDoc.handle.getFile();
          changedOutside = latest.size !== activeDoc.size || latest.lastModified > activeDoc.modifiedAt + 500;
        }
        if (changedOutside && !window.confirm(`« ${activeDoc.name} » a été modifié en dehors de Noto depuis son ouverture.\\n\\nVoulez-vous quand même remplacer la version actuellement enregistrée ?`)) return;
      }
      const saved = await saveDocument(activeDoc, activeDoc.content, saveAs, options);
      commitDocuments(documentsRef.current.map((document) => document.id === activeDoc.id ? saved : document));
      removeLocalDraft(activeDoc);
      notify(saveAs ? 'Copie enregistrée.' : browserDownloadFallback ? 'Une copie a été téléchargée.' : 'Modifications enregistrées.');
      if (saveAs) { setSaveAsError(''); setSaveAsDialogOpen(false); }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible d’enregistrer ce fichier.';
      if (message !== 'Enregistrement annulé.') {
        if (saveAs) setSaveAsError(message);
        else notify(message, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [activeDoc, canEdit, commitDocuments, dirty, notify]);

  const findInDocument = useCallback((backwards = false) => {
    if (!query || !activeDoc) return;
    if (!searchAllTabs && activeDoc.kind === 'pdf') {
      setPdfFindRequest({ id: Date.now() + Math.random(), backwards });
      return;
    }
    const matches = searchAllTabs
      ? searchResults.matches
      : searchResults.matches.filter((match) => match.documentId === activeDoc.id);
    if (!matches.length) {
      if (searchResults.error) notify(searchResults.error, 'error');
      else notify('Aucun résultat dans les fichiers ouverts.');
      return;
    }
    const currentIndex = matches.findIndex((match) => match.index === currentSearchMatch?.index && match.documentId === currentSearchMatch.documentId);
    const nextIndex = currentIndex < 0
      ? (backwards ? matches.length - 1 : 0)
      : (currentIndex + (backwards ? -1 : 1) + matches.length) % matches.length;
    const match = matches[nextIndex];
    if (match.documentId !== activeDoc.id) {
      const targetDocument = documents.find((document) => document.id === match.documentId);
      setActiveId(match.documentId);
      setPage('file');
      setIsEditing(false);
      if (targetDocument?.kind === 'html') setHtmlMode('code');
      setCurrentSearchMatch({ documentId: match.documentId, index: match.index });
      setPendingSearchResult(match);
      return;
    }
    setCurrentSearchMatch({ documentId: activeDoc.id, index: match.index });
    const editor = editorRef.current;
    if (isEditing && editor) {
      editor.focus();
      editor.setSelectionRange(match.index, match.index + match.length);
      editor.scrollTop = Math.max(0, (match.line - 3) * preferences.editorSize * 1.75);
      return;
    }
    const find = (window as Window & { find?: (text: string, caseSensitive?: boolean, backwards?: boolean, wrap?: boolean) => boolean }).find;
    if (find) find.call(window, match.text, searchOptions.caseSensitive, backwards, true);
  }, [activeDoc, currentSearchMatch, documents, isEditing, notify, preferences.editorSize, query, searchAllTabs, searchOptions.caseSensitive, searchResults]);

  const replaceAll = useCallback(() => {
    if (!activeDoc || !query) return;
    const result = searchText(activeDoc.content, query, searchOptions);
    if (result.error) { notify(result.error, 'error'); return; }
    if (!result.total) return;
    const expression = createSearchRegExp(query, searchOptions);
    if (!expression) return;
    const content = searchOptions.regex
      ? activeDoc.content.replace(expression, replacement)
      : activeDoc.content.replace(expression, () => replacement);
    updateContent(content);
    notify(`${result.total}${result.truncated ? '+' : ''} remplacement${result.total === 1 ? '' : 's'} effectué${result.total === 1 ? '' : 's'}.`);
    setIsEditing(true);
    setEditorMode('source');
  }, [activeDoc, notify, query, replacement, searchOptions, updateContent]);

  const openGoToLine = useCallback(() => {
    if (!activeDoc || !canEdit) return;
    setGoToLineOpen(true);
  }, [activeDoc, canEdit]);

  const navigateToLine = useCallback((line: number) => {
    if (!activeDoc || !canEdit) return;
    const boundedLine = Math.max(1, Math.min(activeDoc.content.split('\\n').length, line));
    setPendingGoToLine({ documentId: activeDoc.id, line: boundedLine });
    setIsEditing(true);
    setEditorMode('source');
    setGoToLineOpen(false);
  }, [activeDoc, canEdit]);

  const openGroupDialog = (groupId: string | null = null) => setGroupDialog({ groupId });

  function saveGroupDialog(name: string, color: GroupColor) {
    if (!groupDialog) return;
    if (groupDialog.groupId) {
      setGroups((current) => renameGroup(current, groupDialog.groupId!, name, color));
      notify('Groupe modifié.');
    } else {
      if (groups.length >= 30) { notify('Vous pouvez créer jusqu’à 30 groupes.', 'error'); return; }
      const created = createGroup(name, color);
      if (!created) return;
      setGroups((current) => [created, ...current]);
      setActiveGroupId(created.id);
      setActiveId(null);
      setPage('group');
      notify(`Groupe « ${created.name} » créé.`);
    }
    setGroupDialog(null);
  }

  function deleteCurrentGroup() {
    if (!currentGroup) return;
    if (!window.confirm(`Supprimer le groupe « ${currentGroup.name} » ?\n\nLes fichiers d’origine ne seront pas supprimés.`)) return;
    setGroups((current) => deleteGroup(current, currentGroup.id));
    setActiveGroupId(null);
    setPage('home');
    setActiveId(null);
    notify('Groupe supprimé. Les fichiers originaux sont conservés.');
  }

  function toggleCurrentFileInGroup(groupId: string) {
    if (!activeDoc) return;
    const recent = recentFromDocument(activeDoc);
    const currentlyGrouped = groups.find((group) => group.id === groupId)?.files.some((file) => file.id === recent.id) ?? false;
    setGroups((current) => toggleGroupFile(current, groupId, recent));
    notify(currentlyGrouped ? 'Fichier retiré du groupe.' : 'Fichier ajouté au groupe.');
  }

  function updateFileLocation(file: RecentFile, path: string) {
    const name = pathFileName(path);
    const source = file.source ?? 'desktop';
    const updated: RecentFile = { ...file, id: `${source}:${path}`, name, path, kind: getFileKind(name) };
    setRecents((current) => current.map((item) => item.id === file.id ? updated : item));
    setGroups((current) => current.map((group) => ({
      ...group,
      files: group.files.map((item) => item.id === file.id ? updated : item),
    })));
    const nextDocuments = documentsRef.current.map((item) => item.source === source && item.path === file.path ? {
      ...item,
      name,
      path,
      extension: getExtension(name),
      kind: getFileKind(name),
      mimeType: mimeTypeFor(name),
    } : item);
    commitDocuments(nextDocuments);
  }

  async function submitFileRename(name: string) {
    if (!renameTarget) return;
    setLoading(true);
    setLoadingMessage('Renommage du fichier…');
    try {
      const path = await renameDesktopFile(renameTarget.path, name);
      updateFileLocation(renameTarget, path);
      setRenameTarget(null);
      notify('Fichier renommé.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible de renommer ce fichier.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function moveFileToFolder(file: RecentFile) {
    if (file.source !== 'desktop' || !isTauri()) {
      notify('Le déplacement du fichier original est disponible dans l’application de bureau.', 'error');
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Choisir le dossier de destination' });
      const folder = Array.isArray(selected) ? selected[0] : selected;
      if (!folder) return;
      setLoading(true);
      setLoadingMessage('Déplacement du fichier…');
      const path = await moveDesktopFile(file.path, folder);
      if (path !== file.path) {
        updateFileLocation(file, path);
        notify('Fichier déplacé.');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible de déplacer ce fichier.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function exportLocalSettings() {
    const backup = createLocalBackup(groups, preferences);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `noto-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    notify('Sauvegarde locale exportée. Elle contient des chemins de fichiers, pas leur contenu.');
  }

  async function importLocalSettings(file: File) {
    try {
      const backup = parseLocalBackup(await file.text());
      const draftsWillBeCleared = !backup.preferences.draftRecoveryEnabled && loadLocalDrafts(preferences.draftRetentionDays).length > 0;
      const draftWarning = draftsWillBeCleared ? '\n\nLa récupération importée est désactivée : les brouillons locaux existants seront effacés.' : '';
      if (!window.confirm(`Importer ${backup.groups.length} groupe${backup.groups.length === 1 ? '' : 's'} et remplacer les réglages actuels ?\n\nLe fichier contient les noms et chemins de groupe, sans contenu de document.${draftWarning}`)) return;
      setGroups(backup.groups);
      setPreferences(backup.preferences);
      notify('Groupes et paramètres importés.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible d’importer cette sauvegarde.', 'error');
    }
  }

  function toggleAssignedFile(groupId: string) {
    if (!groupAssignmentTarget) return;
    const currentGroup = groups.find((group) => group.id === groupId);
    const selected = currentGroup?.files.some((item) => item.id === groupAssignmentTarget.id) ?? false;
    setGroups((current) => toggleGroupFile(current, groupId, groupAssignmentTarget));
    notify(selected ? 'Fichier retiré du groupe.' : 'Fichier ajouté au groupe.');
  }

  function moveToolbarAction(action: ToolbarAction, direction: -1 | 1) {
    setPreferences((current) => {
      const order = [...current.toolbarOrder];
      const index = order.indexOf(action);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...current, toolbarOrder: order };
    });
  }

  function toggleToolbarAction(action: ToolbarAction) {
    setPreferences((current) => {
      const hidden = current.hiddenToolbarActions.includes(action)
        ? current.hiddenToolbarActions.filter((item) => item !== action)
        : [...current.hiddenToolbarActions, action];
      return { ...current, hiddenToolbarActions: hidden };
    });
  }

  function resetPreferences() {
    if (!window.confirm('Rétablir les réglages par défaut ? Les groupes et documents ouverts seront conservés ; la limite des fichiers récents reviendra à 8 et les brouillons locaux seront effacés.')) return;
    setPreferences({ ...defaultPreferences, toolbarOrder: [...defaultPreferences.toolbarOrder], hiddenToolbarActions: [...defaultPreferences.hiddenToolbarActions] });
    notify('Réglages par défaut rétablis.');
  }

  const toggleEditMode = useCallback(() => {
    if (!activeDoc || !canEdit) return;
    setIsEditing((value) => !value);
    setEditorMode(activeDoc.kind === 'markdown' ? 'split' : 'source');
  }, [activeDoc, canEdit]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        else if (groupDialog) setGroupDialog(null);
        else if (shortcutsOpen) setShortcutsOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (saveAsDialogOpen) setSaveAsDialogOpen(false);
        else if (goToLineOpen) setGoToLineOpen(false);
        else if (groupPickerOpen) setGroupPickerOpen(false);
        else if (searchOpen) setSearchOpen(false);
        return;
      }

      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        const target = event.target;
        const isTyping = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
        if (event.key === 'F3' && query && activeDoc && !isTyping) {
          event.preventDefault();
          findInDocument(event.shiftKey);
          return;
        }
        if (event.key === 'F2' && page === 'group' && currentGroup && !groupDialog && !isTyping) {
          event.preventDefault();
          setGroupDialog({ groupId: currentGroup.id });
        }
        return;
      }

      if (key === 'tab' && documents.length > 1) {
        event.preventDefault();
        const currentIndex = documents.findIndex((document) => document.id === activeId);
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + documents.length) % documents.length;
        setActiveId(documents[nextIndex].id);
        setPage('file');
        setIsEditing(false);
      } else if (/^[1-9]$/.test(key) && documents.length > 0) {
        event.preventDefault();
        const index = key === '9' ? documents.length - 1 : Number(key) - 1;
        if (documents[index]) {
          setActiveId(documents[index].id);
          setPage('file');
          setIsEditing(false);
        }
      } else if (key === 'p' && event.shiftKey) {
        event.preventDefault();
        setCommandPaletteOpen(true);
      } else if (key === 'n' && event.shiftKey) {
        event.preventDefault();
        setGroupDialog({ groupId: null });
      } else if (key === 'g' && event.shiftKey) {
        event.preventDefault();
        if (activeDoc) setGroupPickerOpen(true);
        else if (currentGroup) setPage('group');
        else setGroupDialog({ groupId: null });
      } else if (key === 'g' && canEdit) {
        event.preventDefault();
        openGoToLine();
      } else if (key === 'e' && canEdit) {
        event.preventDefault();
        toggleEditMode();
      } else if (key === 'o') {
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
      } else if ((key === ',' || event.code === 'Comma')) {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (key === 'w' && activeId) {
        event.preventDefault();
        closeDocument(activeId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDoc, activeId, canEdit, closeDocument, commandPaletteOpen, currentGroup, documents, findInDocument, goToLineOpen, groupDialog, groupPickerOpen, handleOpen, handleSave, openGoToLine, page, query, saveAsDialogOpen, searchOpen, settingsOpen, shortcutsOpen, toggleEditMode]);

  useEffect(() => {
    if (!activeModalId) {
      const returnTarget = modalReturnFocusRef.current;
      modalReturnFocusRef.current = null;
      if (returnTarget?.isConnected) returnTarget.focus();
      return;
    }
    if (!modalReturnFocusRef.current && document.activeElement instanceof HTMLElement) modalReturnFocusRef.current = document.activeElement;
    let frame = 0;
    const findFocusable = () => {
      const backdrop = document.querySelector<HTMLElement>('.modal-backdrop');
      if (!backdrop) return [] as HTMLElement[];
      return [...backdrop.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
    };
    frame = window.requestAnimationFrame(() => {
      const backdrop = document.querySelector<HTMLElement>('.modal-backdrop');
      const preferred = backdrop?.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select');
      (preferred ?? findFocusable()[0])?.focus();
    });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const backdrop = document.querySelector<HTMLElement>('.modal-backdrop');
      const focusable = findFocusable();
      if (!backdrop || focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !backdrop.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !backdrop.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trapFocus, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', trapFocus, true);
    };
  }, [activeModalId]);

  function updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    if (key === 'draftRecoveryEnabled' && value === false) {
      const drafts = loadLocalDrafts(preferences.draftRetentionDays).length;
      if (drafts && !window.confirm(`Désactiver la récupération et effacer ${drafts} brouillon${drafts === 1 ? '' : 's'} local${drafts === 1 ? '' : 'aux'} ?`)) return;
    }
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function clearDraftRecoveryData() {
    const count = loadLocalDrafts(preferences.draftRetentionDays).length;
    if (!count) {
      notify('Aucun brouillon local à effacer.');
      return;
    }
    if (!window.confirm(`Effacer définitivement ${count} brouillon${count === 1 ? '' : 's'} de récupération local${count === 1 ? '' : 'aux'} ?`)) return;
    clearLocalDrafts();
    notify('Les brouillons de récupération ont été effacés.');
  }

  function openSmartGroup(kind: 'pdf' | 'image') {
    setActiveSmartGroup(kind);
    setActiveGroupId(null);
    setActiveId(null);
    setPage('smart-group');
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes('application/x-noto-tab')) return;
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
    if (isTauri() || event.dataTransfer.types.includes('application/x-noto-tab')) return;
    event.preventDefault();
    setDragging(false);
    void openDroppedFiles(Array.from(event.dataTransfer.files ?? []));
  }

  const toolbarActions: Record<ToolbarAction, ReactNode> = {
    search: canReadText && <button className="icon-action" type="button" title="Rechercher (Ctrl+F)" aria-label="Rechercher" onClick={() => { setSearchOpen(true); setReplaceOpen(false); }}><Search size={17} /></button>,
    edit: canEdit && !activeDoc?.truncated && <button className={`edit-action ${isEditing ? 'editing' : ''}`} type="button" title={isEditing ? 'Terminer la modification (Ctrl+E)' : 'Modifier ce fichier (Ctrl+E)'} onClick={toggleEditMode}>{isEditing ? <Check size={16} /> : <Pencil size={15} />}<span>{isEditing ? 'Terminer' : 'Éditer'}</span></button>,
    save: canEdit && !activeDoc?.truncated && <button className="save-action" type="button" title="Enregistrer (Ctrl+S)" disabled={!dirty} onClick={() => void handleSave()}><Save size={15} /><span>Enregistrer</span></button>,
    group: activeDoc && <div className="group-picker-root">
      <button className={`icon-action group-toolbar-action ${groups.some((group) => group.files.some((file) => file.id === activeFileKey)) ? 'has-group' : ''}`} type="button" title="Classer dans un groupe (Ctrl+Maj+G)" aria-label="Classer dans un groupe" aria-expanded={groupPickerOpen} onClick={() => setGroupPickerOpen((open) => !open)}><FolderPlus size={16} /><span>Classer</span></button>
      {groupPickerOpen && <div className="group-picker-panel" role="menu" aria-label="Classer le fichier dans un groupe">
        <div className="group-picker-title">Ranger le fichier dans…</div>
        {groups.map((group) => {
          const selected = group.files.some((file) => file.id === activeFileKey);
          return <button className="group-picker-option" key={group.id} type="button" role="menuitemcheckbox" aria-checked={selected} onClick={() => toggleCurrentFileInGroup(group.id)}><span className={`group-color-dot color-${group.color}`} /><span>{group.name}</span>{selected && <Check size={14} />}</button>;
        })}
        {groups.length === 0 && <p className="group-picker-empty">Créez un groupe pour organiser vos fichiers.</p>}
        <button className="group-picker-create" type="button" onClick={() => { setGroupPickerOpen(false); openGroupDialog(); }}><Plus size={14} />Nouveau groupe</button>
      </div>}
    </div>,
    close: activeDoc && <button className="icon-action close-current" type="button" title="Fermer le fichier (Ctrl+W)" aria-label="Fermer le fichier" onClick={() => closeDocument(activeDoc.id)}><X size={17} /></button>,
  };
  const toolbar = preferences.toolbarOrder
    .filter((action) => !preferences.hiddenToolbarActions.includes(action) && Boolean(toolbarActions[action]))
    .map((action) => <span className="toolbar-action-slot" key={action}>{toolbarActions[action]}</span>);

  const menuDefinitions: MenuDefinition[] = [
    { id: 'file', label: 'Fichier', items: [
      { id: 'open', label: 'Ouvrir un fichier…', shortcut: 'Ctrl+O', icon: <FileUp size={15} />, onSelect: () => void handleOpen() },
      { id: 'save', label: 'Enregistrer', shortcut: 'Ctrl+S', icon: <Save size={15} />, disabled: !dirty || !canEdit, onSelect: () => void handleSave() },
      { id: 'save-as', label: 'Enregistrer sous…', shortcut: 'Ctrl+Maj+S', icon: <FileText size={15} />, disabled: !canEdit, onSelect: () => void handleSave(true) },
      { id: 'close', label: 'Fermer le fichier actif', shortcut: 'Ctrl+W', icon: <X size={15} />, disabled: !activeDoc, dividerBefore: true, onSelect: () => { if (activeId) closeDocument(activeId); } },
      { id: 'new-group', label: 'Créer un groupe…', shortcut: 'Ctrl+Maj+N', icon: <FolderPlus size={15} />, dividerBefore: true, disabled: groups.length >= 30, onSelect: () => openGroupDialog() },
      { id: 'rename-group', label: 'Renommer le groupe actuel…', shortcut: 'F2', icon: <Pencil size={15} />, disabled: !currentGroup, onSelect: () => { if (currentGroup) openGroupDialog(currentGroup.id); } },
      { id: 'delete-group', label: 'Supprimer le groupe actuel…', icon: <Trash2 size={15} />, disabled: !currentGroup, onSelect: deleteCurrentGroup },
    ] },
    { id: 'edit', label: 'Édition', items: [
      { id: 'toggle-edit', label: isEditing ? 'Terminer la modification' : 'Modifier le fichier', shortcut: 'Ctrl+E', icon: <Pencil size={15} />, disabled: !canEdit || Boolean(activeDoc?.truncated), onSelect: toggleEditMode },
      { id: 'find', label: 'Rechercher dans le fichier…', shortcut: 'Ctrl+F', icon: <Search size={15} />, disabled: !canReadText, onSelect: () => { setSearchOpen(true); setReplaceOpen(false); } },
      { id: 'replace', label: 'Rechercher et remplacer…', shortcut: 'Ctrl+H', icon: <Replace size={15} />, disabled: !canEdit, onSelect: () => { setSearchOpen(true); setReplaceOpen(true); } },
      { id: 'go-to-line', label: 'Aller à la ligne…', shortcut: 'Ctrl+G', icon: <TextCursorInput size={15} />, disabled: !canEdit, onSelect: openGoToLine },
      { id: 'classify', label: 'Classer le fichier actif…', shortcut: 'Ctrl+Maj+G', icon: <FolderPlus size={15} />, disabled: !activeDoc, dividerBefore: true, onSelect: () => setGroupPickerOpen(true) },
    ] },
    { id: 'view', label: 'Affichage', items: [
      { id: 'home', label: 'Accueil', icon: <LayoutGrid size={15} />, onSelect: () => { setPage('home'); setActiveId(null); setActiveGroupId(null); setActiveSmartGroup(null); } },
      { id: 'recents', label: 'Fichiers récents', icon: <Clock3 size={15} />, onSelect: () => { setPage('recents'); setActiveId(null); setActiveGroupId(null); setActiveSmartGroup(null); } },
      { id: 'notebooks', label: 'Carnets', icon: <BookOpenText size={15} />, onSelect: () => { setPage('notebooks'); setActiveGroupId(null); } },
      { id: 'smart-pdf', label: 'PDF ouverts récemment', icon: <FileType2 size={15} />, onSelect: () => openSmartGroup('pdf') },
      { id: 'smart-images', label: 'Images récentes', icon: <FileImage size={15} />, onSelect: () => openSmartGroup('image') },
      { id: 'sidebar', label: preferences.sidebarCollapsed ? 'Déployer la barre latérale' : 'Réduire la barre latérale', icon: <MoreHorizontal size={15} />, dividerBefore: true, onSelect: () => updatePreference('sidebarCollapsed', !preferences.sidebarCollapsed) },
      { id: 'toolbar-density', label: preferences.compactToolbar ? 'Aérer la barre d’outils' : 'Compacter la barre d’outils', icon: <PanelLeft size={15} />, onSelect: () => updatePreference('compactToolbar', !preferences.compactToolbar) },
      { id: 'theme', label: preferences.theme === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair', icon: preferences.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />, onSelect: () => updatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light') },
      { id: 'settings', label: 'Paramètres…', shortcut: 'Ctrl+,', icon: <Settings2 size={15} />, dividerBefore: true, onSelect: () => setSettingsOpen(true) },
    ] },
    { id: 'help', label: 'Aide', items: [
      { id: 'palette', label: 'Palette de commandes…', shortcut: 'Ctrl+Maj+P', icon: <Command size={15} />, onSelect: () => setCommandPaletteOpen(true) },
      { id: 'shortcuts', label: 'Raccourcis clavier', icon: <Keyboard size={15} />, onSelect: () => setShortcutsOpen(true) },
    ] },
  ];

  const commands: CommandOption[] = [
    { id: 'open', label: 'Ouvrir un fichier', detail: 'Parcourir votre appareil', shortcut: 'Ctrl+O', keywords: 'parcourir importer', icon: <FileUp size={16} />, onSelect: () => void handleOpen() },
    { id: 'notebooks', label: 'Ouvrir les carnets', detail: 'Créer, ouvrir et organiser des pages locales', keywords: 'notes sections pages carnet', icon: <BookOpenText size={16} />, onSelect: () => { setPage('notebooks'); setActiveGroupId(null); } },
    { id: 'save', label: 'Enregistrer', detail: 'Sauvegarder les modifications', shortcut: 'Ctrl+S', keywords: 'sauvegarde fichier', icon: <Save size={16} />, disabled: !dirty || !canEdit, onSelect: () => void handleSave() },
    { id: 'find', label: 'Rechercher', detail: 'Trouver du texte dans le fichier actif', shortcut: 'Ctrl+F', keywords: 'chercher trouver', icon: <Search size={16} />, disabled: !canReadText, onSelect: () => { setSearchOpen(true); setReplaceOpen(false); } },
    { id: 'replace', label: 'Rechercher et remplacer', detail: 'Remplacer plusieurs occurrences', shortcut: 'Ctrl+H', keywords: 'édition texte', icon: <Replace size={16} />, disabled: !canEdit, onSelect: () => { setSearchOpen(true); setReplaceOpen(true); } },
    { id: 'go-to-line', label: 'Aller à la ligne', detail: 'Placer le curseur sur une ligne précise', shortcut: 'Ctrl+G', keywords: 'éditeur numéro navigation', icon: <TextCursorInput size={16} />, disabled: !canEdit, onSelect: openGoToLine },
    { id: 'edit', label: isEditing ? 'Terminer la modification' : 'Modifier le fichier', detail: 'Basculer lecture et édition', shortcut: 'Ctrl+E', keywords: 'écrire éditer modifier', icon: <Pencil size={16} />, disabled: !canEdit, onSelect: toggleEditMode },
    { id: 'group-new', label: 'Créer un groupe', detail: 'Rassembler des fichiers sans les déplacer', shortcut: 'Ctrl+Maj+N', keywords: 'organisation collection dossier', icon: <FolderPlus size={16} />, disabled: groups.length >= 30, onSelect: () => openGroupDialog() },
    { id: 'group-rename', label: 'Renommer le groupe actuel', detail: currentGroup?.name ?? 'Sélectionnez un groupe d’abord', shortcut: 'F2', keywords: 'nom collection', icon: <Pencil size={16} />, disabled: !currentGroup, onSelect: () => { if (currentGroup) openGroupDialog(currentGroup.id); } },
    { id: 'theme', label: 'Changer de thème', detail: `Passer au thème ${preferences.theme === 'light' ? 'sombre' : 'clair'}`, keywords: 'personnalisation apparence', icon: preferences.theme === 'light' ? <Moon size={16} /> : <Sun size={16} />, onSelect: () => updatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light') },
    { id: 'settings', label: 'Ouvrir les paramètres', detail: 'Apparence, barre d’outils et éditeur', shortcut: 'Ctrl+,', keywords: 'options personnaliser', icon: <Settings2 size={16} />, onSelect: () => setSettingsOpen(true) },
    { id: 'shortcuts', label: 'Afficher les raccourcis clavier', detail: 'Voir toutes les commandes clavier', keywords: 'aide clavier', icon: <Keyboard size={16} />, onSelect: () => setShortcutsOpen(true) },
  ];

  function fileContextActions(contextFile: RecentFile): MenuEntry[] {
    const isOpen = documents.some((document) => document.source === contextFile.source && document.path === contextFile.path);
    const inCurrentGroup = currentGroup?.files.some((file) => file.id === contextFile.id) ?? false;
    const items: MenuEntry[] = [
      { id: 'open-file', label: 'Ouvrir le fichier', icon: <FileUp size={15} />, onSelect: () => void handleRecent(contextFile) },
      { id: 'add-group', label: 'Classer dans un groupe…', icon: <FolderPlus size={15} />, onSelect: () => setGroupAssignmentTarget(contextFile) },
      { id: 'rename-file', label: contextFile.source === 'desktop' && isTauri() ? 'Renommer…' : 'Renommer (application de bureau)', icon: <Pencil size={15} />, dividerBefore: true, disabled: contextFile.source !== 'desktop' || !isTauri(), onSelect: () => setRenameTarget(contextFile) },
      { id: 'move-file', label: contextFile.source === 'desktop' && isTauri() ? 'Déplacer vers un dossier…' : 'Déplacer (application de bureau)', icon: <FolderInput size={15} />, disabled: contextFile.source !== 'desktop' || !isTauri(), onSelect: () => void moveFileToFolder(contextFile) },
      { id: 'copy-file-path', label: 'Copier le chemin', icon: <Copy size={15} />, onSelect: () => {
        if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(contextFile.path).then(() => notify('Chemin copié.')).catch(() => notify('Impossible d’accéder au presse-papiers.', 'error'));
        else notify('Le presse-papiers n’est pas disponible.', 'error');
      } },
    ];
    if (inCurrentGroup && currentGroup) items.push({ id: 'remove-from-group', label: `Retirer de « ${currentGroup.name} »`, icon: <X size={15} />, dividerBefore: true, onSelect: () => setGroups((current) => removeGroupFile(current, currentGroup.id, contextFile.id)) });
    if (recents.some((file) => file.id === contextFile.id)) items.push({ id: 'remove-recent', label: 'Retirer des fichiers récents', icon: <X size={15} />, dividerBefore: !inCurrentGroup, onSelect: () => setRecents((current) => current.filter((file) => file.id !== contextFile.id)) });
    if (isOpen) items.push({ id: 'close-file', label: 'Fermer le fichier', icon: <X size={15} />, dividerBefore: true, onSelect: () => {
      const openDocument = documentsRef.current.find((document) => document.source === contextFile.source && document.path === contextFile.path);
      if (openDocument) closeDocument(openDocument.id);
    } });
    return items;
  }

  function handleAppContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.context-menu-popover')) return;
    const notebookEditorTarget = target.closest('.notebook-rich-editor, .notebook-markdown-source');
    const notebookEditor = Boolean(notebookEditorTarget);
    if (target.closest('.notebook-editor-shell') && !notebookEditor) return;
    event.preventDefault();

    const contextTabId = target.closest<HTMLElement>('[data-context-tab-id]')?.dataset.contextTabId;
    const contextTab = contextTabId ? documents.find((document) => document.id === contextTabId) : null;
    const contextFileId = target.closest<HTMLElement>('[data-context-file-id]')?.dataset.contextFileId;
    const contextFile = contextFileId
      ? recents.find((file) => file.id === contextFileId)
        ?? groups.flatMap((group) => group.files).find((file) => file.id === contextFileId)
        ?? documents.map(recentFromDocument).find((file) => file.id === contextFileId)
      : page === 'file' && activeDoc ? recentFromDocument(activeDoc) : null;
    const groupNodeId = target.closest<HTMLElement>('[data-context-group-id]')?.dataset.contextGroupId;
    const contextGroup = groupNodeId
      ? groups.find((group) => group.id === groupNodeId)
      : page === 'group' ? currentGroup : null;
    const input = target.closest('textarea, input:not([type="file"]):not([type="checkbox"]):not([type="radio"])');
    const textInput = input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement ? input : null;
    let rawSelectedText = '';
    if (textInput) {
      try {
        const start = textInput.selectionStart ?? 0;
        const end = textInput.selectionEnd ?? start;
        rawSelectedText = textInput.value.slice(start, end);
      } catch { rawSelectedText = ''; }
    } else rawSelectedText = window.getSelection()?.toString() ?? '';
    const selectedText = rawSelectedText.trim();

    const items: MenuEntry[] = [];
    if (contextGroup) {
      items.push(
        { id: 'open-group', label: `Ouvrir « ${contextGroup.name} »`, icon: <FolderPlus size={15} />, onSelect: () => { setActiveGroupId(contextGroup.id); setActiveId(null); setPage('group'); } },
        { id: 'rename-group', label: 'Renommer le groupe…', icon: <Pencil size={15} />, dividerBefore: true, onSelect: () => setGroupDialog({ groupId: contextGroup.id }) },
        { id: 'duplicate-group', label: 'Dupliquer le groupe', icon: <Copy size={15} />, disabled: groups.length >= 30, onSelect: () => {
          setGroups((current) => duplicateGroup(current, contextGroup.id));
          notify(`Groupe « ${contextGroup.name} » dupliqué.`);
        } },
        { id: 'delete-group', label: 'Supprimer le groupe…', icon: <Trash2 size={15} />, onSelect: () => {
          if (!window.confirm(`Supprimer le groupe « ${contextGroup.name} » ?\\n\\nLes fichiers d’origine ne seront pas supprimés.`)) return;
          setGroups((current) => deleteGroup(current, contextGroup.id));
          if (activeGroupId === contextGroup.id) { setActiveGroupId(null); setPage('home'); }
          notify('Groupe supprimé. Les fichiers originaux sont conservés.');
        } },
      );
    } else if (contextTab) {
      items.push(...fileContextActions(recentFromDocument(contextTab)));
      items.push(
        { id: 'toggle-pin-tab', label: contextTab.pinned ? 'Désépingler l’onglet' : 'Épingler l’onglet', icon: <Pin size={15} />, dividerBefore: true, onSelect: () => toggleTabPinned(contextTab.id) },
        { id: 'close-other-tabs', label: 'Fermer les autres onglets', icon: <X size={15} />, disabled: documents.length < 2, onSelect: () => closeOtherTabs(contextTab.id) },
      );
    } else if (contextFile) {
      items.push(...fileContextActions(contextFile));
    } else if (!notebookEditor) {
      items.push(
        { id: 'context-open', label: 'Ouvrir un fichier…', shortcut: 'Ctrl+O', icon: <FileUp size={15} />, onSelect: () => void handleOpen() },
        { id: 'context-new-group', label: 'Créer un groupe…', icon: <FolderPlus size={15} />, dividerBefore: true, disabled: groups.length >= 30, onSelect: () => openGroupDialog() },
        { id: 'context-home', label: 'Accueil', icon: <LayoutGrid size={15} />, onSelect: () => { setPage('home'); setActiveId(null); setActiveGroupId(null); } },
        { id: 'context-settings', label: 'Paramètres…', icon: <Settings2 size={15} />, dividerBefore: true, onSelect: () => setSettingsOpen(true) },
      );
    }

    if (selectedText) {
      items.push({ id: 'copy-selection', label: 'Copier la sélection', icon: <Copy size={15} />, dividerBefore: true, onSelect: () => {
        if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(rawSelectedText).catch(() => notify('Impossible d’accéder au presse-papiers.', 'error'));
      } });
      if (!notebookEditor) items.push({ id: 'search-selection', label: `Rechercher « ${selectedText.slice(0, 28)}${selectedText.length > 28 ? '…' : ''} »`, icon: <Search size={15} />, onSelect: () => { setQuery(selectedText); setSearchOpen(true); setReplaceOpen(false); } });
      if (textInput && !textInput.readOnly && !textInput.disabled) items.push({ id: 'cut-selection', label: 'Couper', icon: <Scissors size={15} />, onSelect: () => {
        const start = textInput.selectionStart ?? 0;
        const end = textInput.selectionEnd ?? start;
        const next = `${textInput.value.slice(0, start)}${textInput.value.slice(end)}`;
        if (textInput instanceof HTMLTextAreaElement && textInput.classList.contains('source-editor')) updateContent(next);
        else {
          textInput.setRangeText('', start, end, 'start');
          textInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(rawSelectedText).catch(() => undefined);
      } });
    }
    if (textInput && !textInput.readOnly && !textInput.disabled) {
      items.push({ id: 'paste-selection', label: 'Coller', icon: <ClipboardPaste size={15} />, dividerBefore: !selectedText, disabled: !navigator.clipboard?.readText, onSelect: () => {
        if (!navigator.clipboard?.readText) return;
        void navigator.clipboard.readText().then((pasted) => {
          const start = textInput.selectionStart ?? textInput.value.length;
          const end = textInput.selectionEnd ?? start;
          if (textInput instanceof HTMLTextAreaElement && textInput.classList.contains('source-editor')) {
            updateContent(`${textInput.value.slice(0, start)}${pasted}${textInput.value.slice(end)}`);
            window.requestAnimationFrame(() => { textInput.focus(); textInput.setSelectionRange(start + pasted.length, start + pasted.length); });
          } else {
            textInput.setRangeText(pasted, start, end, 'end');
            textInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }).catch(() => notify('Impossible de lire le presse-papiers.', 'error'));
      } });
      items.push({ id: 'select-all', label: 'Tout sélectionner', shortcut: 'Ctrl+A', onSelect: () => { textInput.focus(); textInput.select(); } });
    } else if (notebookEditor && notebookEditorTarget) {
      items.push({ id: 'notebook-select-all', label: 'Tout sélectionner', shortcut: 'Ctrl+A', onSelect: () => {
        if (!(notebookEditorTarget instanceof HTMLElement)) return;
        notebookEditorTarget.focus();
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(notebookEditorTarget);
        selection.removeAllRanges();
        selection.addRange(range);
      } });
    }
    if (!items.length) return;
    setContextMenu({ position: { x: event.clientX, y: event.clientY }, items });
  }

  return (
    <div className={`app-shell theme-${preferences.theme} ${preferences.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${preferences.compactToolbar ? 'toolbar-compact' : ''}`} style={{ '--reader-size': `${preferences.textSize}px` } as CSSProperties} onDragEnter={onDragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onContextMenu={handleAppContextMenu}>
      <input ref={inputRef} className="visually-hidden" type="file" multiple onChange={onInputFiles} aria-label="Sélectionner des fichiers" />
      <aside className="sidebar">
        <div className="brand-lockup" onClick={() => { setPage('home'); setActiveId(null); }} role="button" tabIndex={0}>
          <span className="brand-mark" aria-hidden="true"><span /><span /><i /></span>
          <span className="brand-name">noto</span>
          <span className="brand-build">BÊTA</span>
        </div>

        <div className="sidebar-main-action"><OpenDialogButton onClick={() => void handleOpen()} compact /></div>

        <nav className="sidebar-nav" aria-label="Navigation principale">
          <button className={`nav-item ${page === 'home' ? 'active' : ''}`} type="button" onClick={() => { setPage('home'); setActiveId(null); setActiveGroupId(null); }}>
            <LayoutGrid size={17} /><span>Accueil</span>
          </button>
          <button className={`nav-item ${page === 'recents' ? 'active' : ''}`} type="button" onClick={() => { setPage('recents'); setActiveId(null); setActiveGroupId(null); }}>
            <Clock3 size={17} /><span>Récents</span><span className="nav-count">{recents.length || ''}</span>
          </button>
          <button className={`nav-item ${page === 'file' ? 'active' : ''}`} type="button" onClick={() => { setActiveGroupId(null); setPage(activeId && documents.some((document) => document.id === activeId) ? 'file' : 'home'); }}>
            <File size={17} /><span>Fichiers</span><span className="nav-count">{documents.length || ''}</span>
          </button>
          <button className={`nav-item ${page === 'notebooks' ? 'active' : ''}`} type="button" onClick={() => { setPage('notebooks'); setActiveGroupId(null); setSearchOpen(false); }}>
            <BookOpenText size={17} /><span>Carnets</span>
          </button>
        </nav>

        <section className="sidebar-group-section" aria-label="Groupes de fichiers">
          <div className="sidebar-group-heading"><span>MES GROUPES</span><button type="button" title="Créer un groupe" aria-label="Créer un groupe" disabled={groups.length >= 30} onClick={() => openGroupDialog()}><Plus size={15} /></button></div>
          <div className="sidebar-group-list">
            {groups.map((group) => <button className={`group-nav-item ${page === 'group' && activeGroupId === group.id ? 'active' : ''}`} type="button" key={group.id} data-context-group-id={group.id} title={`${group.name} · ${group.files.length} fichier${group.files.length === 1 ? '' : 's'}`} onClick={() => { setActiveGroupId(group.id); setActiveId(null); setPage('group'); }}>
              <span className={`group-color-dot color-${group.color}`} /><span className="group-nav-label">{group.name}</span><span className="group-nav-count">{group.files.length}</span>
            </button>)}
            {groups.length === 0 && <div className="sidebar-group-empty">Vos groupes apparaîtront ici.</div>}
          </div>
        </section>

        <section className="sidebar-group-section smart-group-section" aria-label="Collections intelligentes">
          <div className="sidebar-group-heading"><span>COLLECTIONS RAPIDES</span></div>
          <div className="sidebar-group-list">
            <button className={`group-nav-item ${page === 'smart-group' && activeSmartGroup === 'pdf' ? 'active' : ''}`} type="button" onClick={() => openSmartGroup('pdf')} title={`PDF ouverts récemment · ${recents.filter((recent) => recent.kind === 'pdf').length}`}>
              <span className="group-color-dot color-violet" /><span className="group-nav-label">PDF récents</span><span className="group-nav-count">{recents.filter((recent) => recent.kind === 'pdf').length}</span>
            </button>
            <button className={`group-nav-item ${page === 'smart-group' && activeSmartGroup === 'image' ? 'active' : ''}`} type="button" onClick={() => openSmartGroup('image')} title={`Images récentes · ${recents.filter((recent) => recent.kind === 'image').length}`}>
              <span className="group-color-dot color-blue" /><span className="group-nav-label">Images récentes</span><span className="group-nav-count">{recents.filter((recent) => recent.kind === 'image').length}</span>
            </button>
          </div>
        </section>

        <div className="sidebar-recents-header">
          <span>RÉCEMMENT OUVERTS</span>
          <button type="button" title="Effacer la liste des récents" aria-label="Effacer les fichiers récents" onClick={() => { setRecents([]); notify('La liste des fichiers récents a été effacée.'); }}><MoreHorizontal size={17} /></button>
        </div>
        <div className="sidebar-recent-list">
          {recents.slice(0, 6).map((recent) => (
            <button className={`recent-file ${activeDoc?.path === recent.path && page === 'file' ? 'selected' : ''}`} type="button" key={recent.id} data-context-file-id={recent.id} onClick={() => void handleRecent(recent)} title={preferences.hidePaths ? recent.name : recent.path}>
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
            <span className="topbar-icon">{page === 'notebooks' ? <BookOpenText size={16} /> : activeDoc && page === 'file' ? kindIcon(activeDoc.kind, 16) : <span className="mini-logo">N</span>}</span>
            <div className="topbar-heading">
              <div className="topbar-name-row">
                <h1>{page === 'notebooks' ? 'Carnets' : page === 'recents' ? 'Récents' : page === 'smart-group' ? smartGroupTitle : page === 'group' && currentGroup ? currentGroup.name : page === 'file' && activeDoc ? activeDoc.name : 'Accueil'}</h1>
                {page === 'file' && activeDoc && activeDoc.content !== activeDoc.savedContent && <span className="unsaved-indicator" title="Modifications non enregistrées" />}
              </div>
              <span className="topbar-subtitle">{page === 'notebooks' ? 'Carnets et pages Markdown enregistrés sur votre appareil' : page === 'file' && activeDoc ? `${getFormatLabel(activeDoc.kind)}${activeDoc.path && activeDoc.source === 'desktop' && !preferences.hidePaths ? ` · ${activeDoc.path}` : ''}` : page === 'group' && currentGroup ? `${currentGroup.files.length} fichier${currentGroup.files.length === 1 ? '' : 's'} · Espace local` : page === 'smart-group' ? `${smartGroupFiles.length} fichier${smartGroupFiles.length === 1 ? '' : 's'} · Collection dynamique locale` : 'Espace local'}</span>
            </div>
          </div>

          <AppMenuBar menus={menuDefinitions} onOpenPalette={() => setCommandPaletteOpen(true)} />

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
              {toolbar}
            </>}
            <button className="icon-action settings-top-action" type="button" title="Paramètres (Ctrl+,)" aria-label="Paramètres" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button>
          </div>
        </header>

        {page === 'file' && documents.length > 0 && <div className="tab-strip" role="tablist" aria-label="Fichiers ouverts">
          {documents.map((document) => (
            <div
              key={document.id}
              className={`document-tab ${activeId === document.id ? 'active' : ''} ${draggedTabId === document.id ? 'tab-dragging' : ''} ${tabDropTargetId === document.id ? 'tab-drop-target' : ''}`}
              data-context-file-id={`${document.source}:${document.path}`}
              data-context-tab-id={document.id}
              role="tab"
              aria-selected={activeId === document.id}
              aria-label={`${document.name}${document.pinned ? ', épinglé' : ''}`}
              tabIndex={0}
              draggable
              onClick={() => { setActiveId(document.id); setIsEditing(false); setPage('file'); }}
              onKeyDown={(event) => { if (event.key === 'Enter') setActiveId(document.id); }}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-noto-tab', document.id); setDraggedTabId(document.id); }}
              onDragOver={(event) => { if (draggedTabId && draggedTabId !== document.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setTabDropTargetId(document.id); } }}
              onDragLeave={() => setTabDropTargetId((target) => target === document.id ? null : target)}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const sourceId = event.dataTransfer.getData('application/x-noto-tab') || draggedTabId; if (sourceId) moveTab(sourceId, document.id); setDraggedTabId(null); setTabDropTargetId(null); }}
              onDragEnd={() => { setDraggedTabId(null); setTabDropTargetId(null); }}
            >
              <span className={`tab-icon type-${document.kind}`}>{document.pinned ? <Pin size={12} /> : kindIcon(document.kind, 14)}</span>
              <span className="tab-name">{document.name}</span>
              {document.content !== document.savedContent && <span className="tab-unsaved" />}
              <button className="tab-close" type="button" aria-label={`Fermer ${document.name}`} onClick={(event) => { event.stopPropagation(); closeDocument(document.id); }}><X size={13} /></button>
            </div>
          ))}
          <button className="tab-add" type="button" title="Ouvrir un fichier" aria-label="Ouvrir un fichier" onClick={() => void handleOpen()}><Plus size={16} /></button>
        </div>}

        {searchOpen && page === 'file' && activeDoc && <div className="search-panel" role="search" aria-label="Rechercher dans les fichiers ouverts">
          <div className="search-main-row">
            <div className="search-field-wrap"><Search size={15} /><input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setCurrentSearchMatch(null); }} placeholder={searchAllTabs ? 'Rechercher dans les onglets ouverts' : 'Rechercher dans ce fichier'} aria-label="Texte à rechercher" onKeyDown={(event) => { if (event.key === 'Enter') findInDocument(event.shiftKey); if (event.key === 'Escape') setSearchOpen(false); }} /></div>
            {replaceOpen && <div className="search-field-wrap replace-field"><Replace size={15} /><input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="Remplacer par" aria-label="Texte de remplacement" onKeyDown={(event) => { if (event.key === 'Enter') replaceAll(); }} /></div>}
            <span className="search-count" aria-live="polite">{activeDoc.kind === 'pdf' && !searchAllTabs ? 'Dans le PDF' : searchResults.error ? 'Recherche invalide' : query ? `${searchResults.total}${searchResults.truncated ? '+' : ''} résultat${searchResults.total === 1 ? '' : 's'}` : ''}</span>
            <button className={`search-option ${searchOptions.caseSensitive ? 'selected' : ''}`} type="button" title="Respecter la casse" aria-label="Respecter la casse" aria-pressed={searchOptions.caseSensitive} onClick={() => { setSearchOptions((value) => ({ ...value, caseSensitive: !value.caseSensitive })); setCurrentSearchMatch(null); }}>Aa</button>
            <button className={`search-option ${searchOptions.wholeWord ? 'selected' : ''}`} type="button" title="Mot entier" aria-label="Rechercher les mots entiers uniquement" aria-pressed={searchOptions.wholeWord} onClick={() => { setSearchOptions((value) => ({ ...value, wholeWord: !value.wholeWord })); setCurrentSearchMatch(null); }}>Mot</button>
            <button className={`search-option ${searchOptions.regex ? 'selected' : ''}`} type="button" title="Expression régulière" aria-label="Utiliser une expression régulière" aria-pressed={searchOptions.regex} onClick={() => { setSearchOptions((value) => ({ ...value, regex: !value.regex })); setCurrentSearchMatch(null); }}>.*</button>
            <label className="search-scope-toggle" title="Rechercher dans tous les onglets ouverts">
              <input type="checkbox" checked={searchAllTabs} onChange={(event) => { setSearchAllTabs(event.target.checked); setCurrentSearchMatch(null); }} disabled={documents.length < 2} />
              <span>Tous les onglets</span>
            </label>
            <button className="tool-button" type="button" title="Résultat précédent" aria-label="Résultat précédent" onClick={() => findInDocument(true)}><ChevronDown size={15} className="rotate-up" /></button>
            <button className="tool-button" type="button" title="Résultat suivant" aria-label="Résultat suivant" onClick={() => findInDocument(false)}><ChevronDown size={15} /></button>
            {replaceOpen && <button className="replace-all-button" type="button" disabled={!query || searchAllTabs} title={searchAllTabs ? 'Désactivez « Tous les onglets » pour remplacer dans le fichier actif.' : 'Remplacer toutes les occurrences dans le fichier actif'} onClick={replaceAll}>Tout remplacer</button>}
            <button className="tool-button search-close" type="button" title="Fermer la recherche" aria-label="Fermer la recherche" onClick={() => setSearchOpen(false)}><X size={15} /></button>
          </div>
          {searchResults.error && <div className="search-error" role="alert">{searchResults.error}</div>}
          {searchAllTabs && query && !searchResults.error && <div className="search-results-popover">
            <div className="search-results-heading"><strong>{searchResults.total ? `${searchResults.total}${searchResults.truncated ? '+' : ''} résultat${searchResults.total === 1 ? '' : 's'}` : 'Aucun résultat'}</strong><span>dans les fichiers texte ouverts</span></div>
            {searchResults.matches.map((match) => <button className={`search-result-item ${activeId === match.documentId && currentSearchMatch?.index === match.index ? 'current' : ''}`} type="button" key={`${match.documentId}:${match.index}`} onClick={() => {
              const targetDocument = documents.find((document) => document.id === match.documentId);
              setActiveId(match.documentId);
              setPage('file');
              setIsEditing(false);
              if (targetDocument?.kind === 'html') setHtmlMode('code');
              setCurrentSearchMatch({ documentId: match.documentId, index: match.index });
              setPendingSearchResult(match);
            }}>
              <span className="search-result-file">{match.documentName}<small>ligne {match.line}, colonne {match.column}</small></span>
              <span className="search-result-preview">{match.preview || match.text}</span>
            </button>)}
            {searchResults.truncated && <div className="search-results-note">La liste est limitée à 300 correspondances.</div>}
            {documents.some((document) => document.kind === 'pdf') && <div className="search-results-note">Les PDF utilisent leur propre recherche.</div>}
          </div>}
        </div>}

        <section className="workspace-content">
          {page === 'notebooks' && <Suspense fallback={<div className="notebook-loading"><LoaderCircle size={17} className="spin" />Ouverture des carnets…</div>}><NotebookScreen hidePaths={preferences.hidePaths} onOpenFilePath={(path) => { void openTauriPath(path); }} /></Suspense>}
          {page === 'home' && <HomeScreen recents={recents} hidePaths={preferences.hidePaths} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
          {page === 'recents' && <RecentScreen recents={recents} hidePaths={preferences.hidePaths} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onRemove={(id) => setRecents((current) => current.filter((item) => item.id !== id))} onTogglePin={(recent) => setRecents((current) => current.map((item) => item.id === recent.id ? { ...item, pinned: !item.pinned } : item))} />}
          {page === 'smart-group' && activeSmartGroup && <SmartGroupScreen title={smartGroupTitle} kind={activeSmartGroup} files={smartGroupFiles} hidePaths={preferences.hidePaths} onRecent={(recent) => void handleRecent(recent)} />}
          {page === 'smart-group' && !activeSmartGroup && <HomeScreen recents={recents} hidePaths={preferences.hidePaths} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
          {page === 'group' && currentGroup && <GroupScreen group={currentGroup} hidePaths={preferences.hidePaths} onOpen={() => void handleOpen()} onOpenAll={() => void openAllGroupFiles(currentGroup)} onRecent={(recent) => void handleRecent(recent)} onRemoveFile={(id) => setGroups((current) => removeGroupFile(current, currentGroup.id, id))} onRemoveFiles={(ids) => setGroups((current) => removeGroupFiles(current, currentGroup.id, ids))} onRename={() => setGroupDialog({ groupId: currentGroup.id })} onDelete={deleteCurrentGroup} />}
          {page === 'group' && !currentGroup && <HomeScreen recents={recents} hidePaths={preferences.hidePaths} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
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
                fileContextItems={fileContextActions(recentFromDocument(activeDoc))}
              />
            )}
          </div>}
          {page === 'file' && !activeDoc && <HomeScreen recents={recents} hidePaths={preferences.hidePaths} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
        </section>

        {page === 'file' && activeDoc && <footer className="document-statusbar">
          <div className="status-left"><span className="status-dot" />{dirty ? 'Modifications non enregistrées' : 'À jour'}<span className="status-separator">·</span><span>{activeDoc.extension ? `.${activeDoc.extension.toUpperCase()}` : getFormatLabel(activeDoc.kind)}</span></div>
          <div className="status-right"><span>{formatBytes(activeDoc.size)}</span>{activeDoc.kind === 'markdown' && <><span className="status-separator">·</span><span>Markdown</span></>}{activeDoc.source === 'desktop' && <><span className="status-separator">·</span><span>Local</span></>}</div>
        </footer>}
      </main>

      {dragging && <div className="drop-overlay" onDragLeave={() => setDragging(false)}><div className="drop-overlay-card"><span className="drop-icon"><FileUp size={25} /></span><strong>Déposez pour ouvrir</strong><span>Texte, code, PDF, présentations, documents et images…</span></div></div>}
      {loading && <div className="loading-overlay"><div className="loading-card"><LoaderCircle size={20} className="spin" /><span>{loadingMessage}</span></div></div>}
      {toast && <div className={`toast toast-${toastKind}`} role="status"><span className="toast-mark">{toastKind === 'success' ? <Check size={14} /> : <CircleHelp size={14} />}</span>{toast}</div>}
      {settingsOpen && <SettingsModal preferences={preferences} onChange={updatePreference} onClose={() => setSettingsOpen(false)} onClearRecents={() => { setRecents([]); notify('La liste des fichiers récents a été effacée.'); }} onResetDefaults={resetPreferences} onClearDrafts={clearDraftRecoveryData} onMoveToolbar={moveToolbarAction} onToggleToolbar={toggleToolbarAction} onOpenShortcuts={() => { setSettingsOpen(false); setShortcutsOpen(true); }} onExportBackup={exportLocalSettings} onImportBackup={(file) => void importLocalSettings(file)} />}
      {groupDialog && <GroupDialog group={groupDialog.groupId ? groups.find((group) => group.id === groupDialog.groupId) : undefined} onClose={() => setGroupDialog(null)} onSave={saveGroupDialog} />}
      {goToLineOpen && activeDoc && <GoToLineDialog lineCount={activeDoc.content.split('\\n').length} onGo={navigateToLine} onClose={() => setGoToLineOpen(false)} />}
      {saveAsDialogOpen && activeDoc && <SaveAsDialog fileName={activeDoc.name} error={saveAsError} onSave={(options) => void handleSave(true, options)} onClose={() => setSaveAsDialogOpen(false)} />}
      {renameTarget && <RenameFileDialog file={renameTarget} onClose={() => setRenameTarget(null)} onRename={(name) => void submitFileRename(name)} />}
      {groupAssignmentTarget && <GroupAssignmentDialog file={groupAssignmentTarget} groups={groups} onToggle={toggleAssignedFile} onCreate={() => { setGroupAssignmentTarget(null); openGroupDialog(); }} onClose={() => setGroupAssignmentTarget(null)} />}
      {contextMenu && <ContextMenu position={contextMenu.position} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {commandPaletteOpen && <CommandPalette commands={commands} onClose={() => setCommandPaletteOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function HomeScreen({ recents, onOpen, onRecent, onViewAll, hidePaths = false }: { recents: RecentFile[]; onOpen: () => void; onRecent: (recent: RecentFile) => void; onViewAll: () => void; hidePaths?: boolean }) {
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
        <div className="format-pills"><span><BookOpenText size={14} />Markdown</span><span><Code2 size={14} />Code</span><span><FileType2 size={14} />PDF</span><span><Presentation size={14} />Diaporamas</span><span><BookOpen size={14} />EPUB</span><span><ImageIcon size={14} />Images</span><span><Table2 size={14} />CSV / TSV</span></div>
      </div>

      <div className="home-recents-section">
        <div className="section-heading"><div><h3>Fichiers récents</h3><p>Reprenez là où vous en étiez.</p></div>{recents.length > 3 && <button className="text-link" type="button" onClick={onViewAll}>Tout voir <span>→</span></button>}</div>
        {recents.length > 0 ? <div className="home-recent-grid">
          {recents.slice(0, 3).map((recent) => <RecentCard key={recent.id} recent={recent} onClick={() => onRecent(recent)} hidePath={hidePaths} />)}
        </div> : <div className="recent-empty-card"><span className="empty-clock"><Clock3 size={18} /></span><span><strong>Rien d’ouvert pour le moment</strong><small>Vos derniers fichiers apparaîtront ici.</small></span><button type="button" onClick={onOpen}>Parcourir <span>→</span></button></div>}
      </div>
      <div className="home-footnote"><span>Simple par nature</span><i />Pas de compte<i />Pas de cloud<i />Pas de suivi</div>
    </div>
  );
}

function RecentCard({ recent, onClick, hidePath = false }: { recent: RecentFile; onClick: () => void; hidePath?: boolean }) {
  return <button className="home-recent-card" type="button" data-context-file-id={recent.id} onClick={onClick} title={hidePath ? recent.name : recent.path}>
    <span className={`home-file-icon type-${recent.kind}`}>{kindIcon(recent.kind, 17)}</span>
    <span className="home-card-copy"><strong>{recent.name}</strong><small>{getFormatLabel(recent.kind as OpenDocument['kind'])} <i /> {formatRelativeDate(recent.lastOpened)}</small></span>
    <span className="card-arrow">↗</span>
  </button>;
}

function RecentScreen({ recents, onOpen, onRecent, onRemove, onTogglePin, hidePaths }: { recents: RecentFile[]; onOpen: () => void; onRecent: (recent: RecentFile) => void; onRemove: (id: string) => void; onTogglePin: (recent: RecentFile) => void; hidePaths: boolean }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'text' | 'code' | 'pdf' | 'image' | 'presentation' | 'data'>('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'kind'>('recent');
  const visibleRecents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fr-FR');
    const matchesFilter = (recent: RecentFile) => {
      if (filter === 'all') return true;
      if (filter === 'text') return ['markdown', 'text', 'document', 'ebook'].includes(recent.kind);
      if (filter === 'code') return ['code', 'html'].includes(recent.kind);
      if (filter === 'pdf') return recent.kind === 'pdf';
      if (filter === 'image') return recent.kind === 'image';
      if (filter === 'presentation') return recent.kind === 'presentation';
      return recent.kind === 'csv';
    };
    return recents.filter((recent) => matchesFilter(recent) && (!normalized || `${recent.name} ${recent.path}`.toLocaleLowerCase('fr-FR').includes(normalized)))
      .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
        || (sort === 'name' ? left.name.localeCompare(right.name, 'fr', { numeric: true, sensitivity: 'base' })
          : sort === 'kind' ? left.kind.localeCompare(right.kind, 'fr') || left.name.localeCompare(right.name, 'fr', { numeric: true })
            : right.lastOpened - left.lastOpened));
  }, [filter, query, recents, sort]);

  return <div className="recent-screen">
    <div className="recent-screen-heading"><div><div className="eyebrow">VOTRE HISTORIQUE LOCAL</div><h2>Récents</h2><p>Les fichiers que vous avez consultés récemment sur cet appareil.</p></div><button className="secondary-button" type="button" onClick={onOpen}><Plus size={15} /> Ouvrir un fichier</button></div>
    {recents.length > 0 && <div className="recent-controls">
      <label className="recent-filter-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer les noms et chemins" aria-label="Filtrer les fichiers récents" /></label>
      <label><span>Type</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Tous les types</option><option value="text">Texte / documents</option><option value="code">Code / HTML</option><option value="pdf">PDF</option><option value="image">Images</option><option value="presentation">Présentations</option><option value="data">CSV / TSV</option></select></label>
      <label><span>Trier</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">Plus récents</option><option value="name">Nom</option><option value="kind">Type</option></select></label>
    </div>}
    {recents.length ? visibleRecents.length ? <div className="recent-list-table">
      <div className="recent-table-head"><span>FICHIER</span><span>TYPE</span><span>OUVERT</span><span /></div>
      {visibleRecents.map((recent) => <div className="recent-table-row" key={recent.id} data-context-file-id={recent.id}>
        <button className="recent-table-file" type="button" onClick={() => onRecent(recent)} title={hidePaths ? recent.name : recent.path}><span className={`home-file-icon type-${recent.kind}`}>{kindIcon(recent.kind, 17)}</span><span><strong>{recent.name}</strong><small>{hidePaths ? 'Chemin masqué' : recent.path}</small></span></button>
        <span className="recent-table-kind">{getFormatLabel(recent.kind as OpenDocument['kind'])}</span>
        <span className="recent-table-date">{formatRelativeDate(recent.lastOpened)}</span>
        <div className="recent-row-actions">
          <button className={`recent-pin ${recent.pinned ? 'is-pinned' : ''}`} type="button" title={recent.pinned ? 'Désépingler' : 'Épingler'} aria-label={`${recent.pinned ? 'Désépingler' : 'Épingler'} ${recent.name}`} aria-pressed={Boolean(recent.pinned)} onClick={() => onTogglePin(recent)}><Pin size={14} /></button>
          <button className="recent-remove" type="button" title="Retirer des récents" aria-label={`Retirer ${recent.name} des récents`} onClick={() => onRemove(recent.id)}><X size={15} /></button>
        </div>
      </div>)}
    </div> : <div className="recent-filter-empty"><Search size={17} /><span>Aucun fichier récent ne correspond à ce filtre.</span></div> : <div className="recent-empty-large"><span><Clock3 size={24} /></span><h3>Aucun fichier récent</h3><p>Ouvrez votre premier fichier pour le retrouver ici.</p><button className="primary-button" type="button" onClick={onOpen}><Plus size={16} />Ouvrir un fichier</button></div>}
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
  document, documents, isEditing, editorMode, htmlMode, preferences, onChange, editorRef, searchQuery, pdfSearchRequest, fileContextItems,
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
  fileContextItems: MenuEntry[];
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
    const jsonError = document.extension === 'json' ? validateJson(document.content) : null;
    const validationMessage = jsonError ? `JSON invalide · ligne ${jsonError.line}, colonne ${jsonError.column} · ${jsonError.message}` : undefined;
    return <CodeViewer content={displayContent} extension={document.extension} lineNumbers={preferences.lineNumbers} wordWrap={preferences.wordWrap} fontSize={preferences.textSize} validationMessage={validationMessage} />;
  }
  if (document.kind === 'csv') return <CsvViewer content={document.content} />;
  if (document.kind === 'html') return htmlMode === 'preview'
    ? <HtmlViewer source={document.content} mode="preview" />
    : <CodeViewer content={document.content} extension="html" lineNumbers={preferences.lineNumbers} wordWrap={preferences.wordWrap} fontSize={preferences.textSize} />;
  if (document.kind === 'pdf') return <Suspense fallback={<div className="viewer-empty">Chargement du lecteur PDF…</div>}><PdfViewer document={document} searchQuery={searchQuery} searchRequest={pdfSearchRequest} fileContextItems={fileContextItems} /></Suspense>;
  if (document.kind === 'image') return <Suspense fallback={<div className="viewer-empty">Chargement de l’image…</div>}><ImageViewer document={document} fileContextItems={fileContextItems} /></Suspense>;
  if (document.kind === 'presentation') return <Suspense fallback={<div className="viewer-empty">Préparation du diaporama…</div>}><PresentationViewer document={document} fileContextItems={fileContextItems} /></Suspense>;
  if (document.kind === 'document' || document.kind === 'ebook') return <Suspense fallback={<div className="viewer-empty">Préparation du document…</div>}><OfficeDocumentViewer document={document} fileContextItems={fileContextItems} /></Suspense>;
  return <UnsupportedFile document={document} onOpenText={() => onChange(document.content)} />;
}

function SettingsModal({ preferences, onChange, onClose, onClearRecents, onResetDefaults, onClearDrafts, onMoveToolbar, onToggleToolbar, onOpenShortcuts, onExportBackup, onImportBackup }: {
  preferences: Preferences;
  onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onClose: () => void;
  onClearRecents: () => void;
  onResetDefaults: () => void;
  onClearDrafts: () => void;
  onMoveToolbar: (action: ToolbarAction, direction: -1 | 1) => void;
  onToggleToolbar: (action: ToolbarAction) => void;
  onOpenShortcuts: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
}) {
  const backupInputRef = useRef<HTMLInputElement>(null);
  const toolbarLabels: Record<ToolbarAction, string> = { search: 'Rechercher', edit: 'Éditer', save: 'Enregistrer', group: 'Classer dans un groupe', close: 'Fermer le fichier' };
  const toolbarIcons: Record<ToolbarAction, ReactNode> = { search: <Search size={14} />, edit: <Pencil size={14} />, save: <Save size={14} />, group: <FolderPlus size={14} />, close: <X size={14} /> };
  const orderedActions = [...preferences.toolbarOrder, ...TOOLBAR_ACTIONS.filter((action) => !preferences.toolbarOrder.includes(action))];
  const accents: { value: Preferences['accent']; label: string }[] = [
    { value: 'violet', label: 'Violet' }, { value: 'blue', label: 'Bleu' }, { value: 'mint', label: 'Menthe' }, { value: 'rose', label: 'Rose' },
  ];

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div><span className="settings-icon"><Settings2 size={17} /></span><div><h2 id="settings-title">Paramètres</h2><p>Personnalisez votre espace Noto.</p></div></div><button className="icon-action" type="button" title="Fermer" aria-label="Fermer les paramètres" onClick={onClose}><X size={18} /></button></header>
      <div className="settings-body">
        <section className="settings-section"><div className="settings-section-title"><span>APPARENCE</span><small>Votre espace, à votre façon.</small></div>
          <div className="setting-row"><div className="setting-label"><strong>Thème</strong><small>Choisissez l’apparence de Noto.</small></div><div className="theme-picker">
            <button className={preferences.theme === 'light' ? 'selected' : ''} type="button" onClick={() => onChange('theme', 'light')}><Sun size={15} />Clair</button>
            <button className={preferences.theme === 'dark' ? 'selected' : ''} type="button" onClick={() => onChange('theme', 'dark')}><Moon size={15} />Sombre</button>
          </div></div>
          <div className="setting-row"><div className="setting-label"><strong>Couleur d’accent</strong><small>Les repères colorés de l’interface.</small></div><div className="accent-picker" role="radiogroup" aria-label="Couleur d’accent">
            {accents.map((accent) => <button className={`accent-swatch accent-${accent.value} ${preferences.accent === accent.value ? 'selected' : ''}`} key={accent.value} type="button" role="radio" aria-checked={preferences.accent === accent.value} title={accent.label} aria-label={accent.label} onClick={() => onChange('accent', accent.value)} />)}
          </div></div>
          <div className="setting-row"><div className="setting-label"><strong>Taille du texte</strong><small>Confort de lecture.</small></div><div className="select-wrap"><select value={preferences.textSize} onChange={(event) => onChange('textSize', Number(event.target.value))}><option value={14}>Compacte</option><option value={16}>Standard</option><option value={18}>Confortable</option><option value={20}>Grande</option></select><ChevronDown size={14} /></div></div>
        </section>
        <section className="settings-section"><div className="settings-section-title"><span>ESPACE DE TRAVAIL</span><small>Réglez les panneaux et la barre d’outils.</small></div>
          <div className="setting-row"><div className="setting-label"><strong>Barre d’outils compacte</strong><small>Masquer les libellés pour gagner de la place.</small></div><button className={`toggle ${preferences.compactToolbar ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.compactToolbar} onClick={() => onChange('compactToolbar', !preferences.compactToolbar)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>Barre latérale compacte</strong><small>Réduire le panneau de navigation.</small></div><button className={`toggle ${preferences.sidebarCollapsed ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.sidebarCollapsed} onClick={() => onChange('sidebarCollapsed', !preferences.sidebarCollapsed)}><i /></button></div>
          <div className="toolbar-customization"><div className="toolbar-customization-heading"><div><strong>Commandes de la barre</strong><small>Masquez-les ou réorganisez-les.</small></div><span>ORDRE</span></div>
            {orderedActions.map((action, index) => {
              const visible = !preferences.hiddenToolbarActions.includes(action);
              return <div className={`toolbar-preference-row ${visible ? '' : 'muted'}`} key={action}>
                <div className="toolbar-order-controls"><button type="button" title="Monter" aria-label={`Monter ${toolbarLabels[action]}`} disabled={index === 0} onClick={() => onMoveToolbar(action, -1)}><ArrowUp size={13} /></button><button type="button" title="Descendre" aria-label={`Descendre ${toolbarLabels[action]}`} disabled={index === orderedActions.length - 1} onClick={() => onMoveToolbar(action, 1)}><ArrowDown size={13} /></button></div>
                <span className="toolbar-preference-icon">{toolbarIcons[action]}</span><span className="toolbar-preference-name">{toolbarLabels[action]}</span>
                <button className={`toggle ${visible ? 'on' : ''}`} type="button" role="switch" aria-checked={visible} aria-label={`${visible ? 'Masquer' : 'Afficher'} ${toolbarLabels[action]}`} onClick={() => onToggleToolbar(action)}><i /></button>
              </div>;
            })}
          </div>
        </section>
        <section className="settings-section"><div className="settings-section-title"><span>ÉDITEUR</span><small>Options pour les modifications rapides.</small></div>
          <div className="setting-row"><div className="setting-label"><strong>Police de l’éditeur</strong><small>Taille de la police monospace.</small></div><div className="select-wrap"><select value={preferences.editorSize} onChange={(event) => onChange('editorSize', Number(event.target.value))}><option value={12}>12 px</option><option value={14}>14 px</option><option value={16}>16 px</option><option value={18}>18 px</option><option value={20}>20 px</option></select><ChevronDown size={14} /></div></div>
          <div className="setting-row"><div className="setting-label"><strong>Numéros de lignes</strong><small>Repérez-vous dans le fichier.</small></div><button className={`toggle ${preferences.lineNumbers ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.lineNumbers} onClick={() => onChange('lineNumbers', !preferences.lineNumbers)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>Retour à la ligne</strong><small>Renvoyer les longues lignes à la ligne.</small></div><button className={`toggle ${preferences.wordWrap ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.wordWrap} onClick={() => onChange('wordWrap', !preferences.wordWrap)}><i /></button></div>
        </section>
        <section className="settings-section settings-general"><div className="settings-section-title"><span>GÉNÉRAL</span></div>
          <div className="setting-row backup-setting-row"><div className="setting-label"><strong>Sauvegarde locale</strong><small>Exporter ou importer groupes et paramètres ; les chemins sont inclus, jamais le contenu des fichiers.</small></div><div className="backup-buttons"><button className="subtle-button" type="button" onClick={onExportBackup}><Download size={13} />Exporter</button><button className="subtle-button" type="button" onClick={() => backupInputRef.current?.click()}><Upload size={13} />Importer</button><input ref={backupInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImportBackup(file); }} aria-label="Choisir une sauvegarde Noto à importer" /></div></div>
          <div className="setting-row"><div className="setting-label"><strong>Restaurer la session bureau</strong><small>Garde les chemins des onglets ouverts sur cet appareil, sans mémoriser leur contenu.</small></div><button className={`toggle ${preferences.restoreSession ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.restoreSession} onClick={() => onChange('restoreSession', !preferences.restoreSession)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>Récupération locale des brouillons</strong><small>Enregistre localement les modifications non sauvegardées des fichiers texte. Désactivée par défaut ; limite de 750 000 caractères par fichier. La désactivation efface les brouillons (après confirmation).</small></div><button className={`toggle ${preferences.draftRecoveryEnabled ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.draftRecoveryEnabled} onClick={() => onChange('draftRecoveryEnabled', !preferences.draftRecoveryEnabled)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>Conservation des brouillons</strong><small>Les brouillons plus anciens sont supprimés au prochain accès.</small></div><div className="draft-retention-actions"><div className="select-wrap"><select disabled={!preferences.draftRecoveryEnabled} value={preferences.draftRetentionDays} onChange={(event) => onChange('draftRetentionDays', Number(event.target.value) as Preferences['draftRetentionDays'])}><option value={1}>1 jour</option><option value={7}>7 jours</option><option value={30}>30 jours</option></select><ChevronDown size={14} /></div><button className="subtle-button" type="button" onClick={onClearDrafts}><Trash2 size={13} />Effacer</button></div></div>
          <div className="setting-row"><div className="setting-label"><strong>Nombre de fichiers récents</strong><small>Limite locale de la liste des récents.</small></div><div className="select-wrap"><select value={preferences.recentLimit} onChange={(event) => onChange('recentLimit', Number(event.target.value) as Preferences['recentLimit'])}><option value={4}>4 fichiers</option><option value={8}>8 fichiers</option><option value={12}>12 fichiers</option><option value={20}>20 fichiers</option></select><ChevronDown size={14} /></div></div>
          <div className="setting-row"><div className="setting-label"><strong>Masquer les chemins</strong><small>Remplacer les chemins visibles par un libellé discret dans l’interface.</small></div><button className={`toggle ${preferences.hidePaths ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.hidePaths} onClick={() => onChange('hidePaths', !preferences.hidePaths)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>Historique local</strong><small>Effacer la liste des fichiers récents.</small></div><button className="subtle-button" type="button" onClick={onClearRecents}><RotateCcw size={14} />Effacer</button></div>
          <div className="setting-row"><div className="setting-label"><strong>Raccourcis clavier</strong><small>Afficher la liste des commandes rapides.</small></div><button className="subtle-button" type="button" onClick={onOpenShortcuts}><Keyboard size={14} />Consulter</button></div>
          <div className="setting-row"><div className="setting-label"><strong>Réglages</strong><small>Restaurer les paramètres visuels et éditeur par défaut.</small></div><button className="subtle-button" type="button" onClick={onResetDefaults}><RotateCcw size={14} />Tout rétablir</button></div>
        </section>
        <div className="settings-privacy"><ShieldCheck size={15} /><span>Vos documents et groupes restent sur cet appareil. Les brouillons contenant du texte sont conservés localement uniquement si la récupération est activée ; sa désactivation les efface.</span></div>
      </div>
      <footer className="settings-footer"><span>Noto <i>·</i> Version 0.1.0</span><button className="secondary-button" type="button" onClick={onClose}>Terminé</button></footer>
    </section>
  </div>;
}
