import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, type DragEvent, type ReactNode, type CSSProperties } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  ArrowDown, ArrowUp, BookOpen, BookOpenText, Check, ChevronDown, CircleHelp, Clock3, Code2, Command,
  Copy, ClipboardPaste, Download, File, FileCode2, FileDiff, FileImage, FileText, FileType2, FileUp, FolderInput, FolderPlus, FolderSearch, Globe2, Presentation, Upload,
  Expand, Image as ImageIcon, Keyboard, LayoutGrid, LoaderCircle, Maximize2, Minimize2, Moon, MoreHorizontal,
  PanelLeft, Pencil, Plus, RotateCcw, Scissors, Search, Settings2, ShieldCheck, Sun, Table2,
  TextCursorInput, X, Save, Replace, Sparkles, Trash2, Pin, Wrench, Printer, FileSearch, Link2, CircleAlert,
  Heart,
} from 'lucide-react';
import { CodeViewer } from './components/CodeViewer';
import { CsvViewer } from './components/CsvViewer';
import { HtmlViewer } from './components/HtmlViewer';
import { TextEditor } from './components/TextEditor';
import { ProgressiveTextViewer } from './components/ProgressiveTextViewer';
import { SmartGroupScreen } from './components/SmartGroupScreen';
import { AppMenuBar, CommandPalette, ContextMenu, GoToLineDialog, GroupAssignmentDialog, GroupDialog, GroupScreen, RenameFileDialog, SaveAsDialog, ShortcutsDialog, type CommandOption, type MenuDefinition, type MenuEntry } from './components/WorkspaceTools';
import { localizeCommands, localizeMenus } from './i18n/workspace';
import { FolderSearchDialog } from './components/FolderSearchDialog';
import { LocalSearchPanel } from './components/LocalSearchPanel';
import { TextDiffDialog } from './components/TextDiffDialog';
import { WelcomeDialog } from './components/WelcomeDialog';
import { FileInfoDialog, PrintDialog } from './components/FileTools';
import { formatBytes, loadBrowserFile, openDesktopFiles, pickBrowserFiles, readDesktopPath, saveDocument, type SaveAsOptions } from './lib/files';
import { moveDesktopFile, pathFileName, renameDesktopFile } from './lib/fileOperations';
import { getExtension, getFileKind, getFormatLabel, mimeTypeFor } from './lib/fileTypes';
import { loadDesktopSessionState, reopenSessionFiles, saveDesktopSession, clearDesktopSession } from './lib/session';
import { createLocalBackup, parseLocalBackup } from './lib/backup';
import { clearLocalDrafts, draftId, loadLocalDrafts, removeLocalDraft, saveLocalDraft } from './lib/drafts';
import { formatJsonForDisplay, validateJson } from './lib/textFormat';
import { createSearchRegExp, searchText, type SearchOptions, type TextSearchMatch } from './lib/search';
import { reorderTabs, tabsWithoutOthers, togglePinnedTab } from './lib/tabs';
import { createGroup, addGroupFile, deleteGroup, duplicateGroup, loadGroups, removeGroupFile, removeGroupFiles, renameGroup, saveGroups, toggleGroupFile, type FileGroup, type GroupColor } from './lib/groups';
import { loadPinnedSearchFolders, savePinnedSearchFolders, togglePinnedSearchFolder } from './lib/searchFolders';
import { defaultPreferences, loadPreferences, loadRecentFiles, savePreferences, saveRecentFiles, upsertRecent, TOOLBAR_ACTIONS, type Preferences, type RecentFile, type ToolbarAction } from './lib/preferences';
import type { BrowserFileHandle, OpenDocument } from './types';
import { APP_VERSION } from './lib/version';
import { checkForUpdate, type UpdateInfo } from './lib/updater';
import { setLanguage, tLang } from './lib/i18n';
import { detectFullscreenKind, enterFullscreen, exitFullscreen, fullscreenSupport, onDocumentFullscreenChange, type FullscreenKind } from './lib/fullscreen';
import { immersiveOpenNotice, opensInImmersive, type OpenGesture } from './lib/launchMode';
import { topbarFitClasses } from './lib/topbarLayout';
import { cloneRenderedForPrint, extractRenderedImage } from './lib/printing';
import { countLines, type StatRow } from './lib/fileStats';
import { describeLinkKind, previewForAnchor, setLinkPreview, useLinkPreview } from './lib/linkPreview';
import { useTopbarFit } from './components/useTopbarFit';
import type { StudioRequest } from './studio/StudioScreen';
import './styles.css';

const MarkdownViewer = lazy(() => import('./components/MarkdownViewer').then((module) => ({ default: module.MarkdownViewer })));
const ImageViewer = lazy(() => import('./components/ImageViewer').then((module) => ({ default: module.ImageViewer })));
const PdfViewer = lazy(() => import('./components/PdfViewer').then((module) => ({ default: module.PdfViewer })));
const PresentationViewer = lazy(() => import('./components/PresentationViewer').then((module) => ({ default: module.PresentationViewer })));
const OfficeDocumentViewer = lazy(() => import('./components/OfficeDocumentViewer').then((module) => ({ default: module.OfficeDocumentViewer })));
const StudioScreen = lazy(() => import('./studio/StudioScreen'));

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

const FIRST_RUN_KEY = 'noto.first-run.v1';

function shouldShowFirstRun(): boolean {
  try { return localStorage.getItem(FIRST_RUN_KEY) !== 'done'; }
  catch { return false; }
}

function isComparableDocument(document: OpenDocument): boolean {
  return !document.truncated && ['markdown', 'text', 'code', 'html', 'csv', 'unknown'].includes(document.kind);
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

function OpenDialogButton({ onClick, compact = false, language = 'fr' }: { onClick: () => void; compact?: boolean; language?: Preferences['language'] }) {
  return (
    <button className={compact ? 'open-side-button' : 'primary-button'} type="button" onClick={onClick}>
      <Plus size={16} strokeWidth={2.1} />
      <span>{tLang(language, 'home.openFile')}</span>
      {!compact && <kbd>Ctrl O</kbd>}
    </button>
  );
}

export default function App() {
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState<'home' | 'file' | 'recents' | 'group' | 'smart-group' | 'studio'>('home');
  const [studioRequest, setStudioRequest] = useState<StudioRequest | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [recents, setRecents] = useState<RecentFile[]>(() => loadRecentFiles(preferences.recentLimit));
  const [groups, setGroups] = useState<FileGroup[]>(() => loadGroups());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeSmartGroup, setActiveSmartGroup] = useState<'pdf' | 'image' | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ groupId: string | null } | null>(null);
  const [renameTarget, setRenameTarget] = useState<RecentFile | null>(null);
  // Mesures rapportées par le lecteur affiché (pages d’un PDF, dimensions d’une image…)
  const [viewerReadout, setViewerReadout] = useState<StatRow[]>([]);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printHtml, setPrintHtml] = useState('');
  // Adresse du lien survolé, publiée par le lecteur : affichée en bas de la
  // fenêtre, comme le fait un navigateur.
  const linkPreview = useLinkPreview();
  const viewerPrintRef = useRef<HTMLDivElement | null>(null);
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
  const [folderSearchOpen, setFolderSearchOpen] = useState(false);
  const [textDiffOpen, setTextDiffOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => shouldShowFirstRun());
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [saveAsError, setSaveAsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Ouverture du fichier…');
  const [dragging, setDragging] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [fullscreenKind, setFullscreenKind] = useState<FullscreenKind | null>(null);
  const [toast, setToast] = useState('');
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const documentsRef = useRef<OpenDocument[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const modalReturnFocusRef = useRef<HTMLElement | null>(null);
  const draftStorageErrorShown = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const browserHandles = useRef<Map<string, BrowserFileHandle>>(new Map());
  const sessionRestoreStarted = useRef(false);
  const commitDocuments = useCallback((next: OpenDocument[]) => {
    documentsRef.current = next;
    setDocuments(next);
  }, []);
  const activeDoc = documents.find((document) => document.id === activeId) ?? null;
  const comparableDocuments = documents.filter(isComparableDocument);
  const activeModalId = commandPaletteOpen ? 'palette' : shortcutsOpen ? 'shortcuts' : textDiffOpen ? 'text-diff' : folderSearchOpen ? 'folder-search' : welcomeOpen ? 'welcome' : saveAsDialogOpen ? 'save-as' : goToLineOpen ? 'go-to-line' : renameTarget ? 'rename-file' : groupAssignmentTarget ? 'group-assignment' : groupDialog ? 'group' : settingsOpen ? 'settings' : fileInfoOpen ? 'file-info' : printOpen ? 'print' : null;
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

  const openStudio = useCallback((request: StudioRequest | null = null) => {
    setStudioRequest(request);
    setPage('studio');
    setActiveId(null);
    setActiveGroupId(null);
    setActiveSmartGroup(null);
  }, []);

  const openStudioForPath = useCallback((path: string) => {
    openStudio({ paths: [path] });
  }, [openStudio]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('noto:boot-ready')));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    savePreferences(preferences);
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.accent = preferences.accent;
  }, [preferences]);

  useEffect(() => {
    setLanguage(preferences.language);
  }, [preferences.language]);

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
    if (!loading) { setLoadingSlow(false); return; }
    setLoadingSlow(false);
    const timeout = window.setTimeout(() => setLoadingSlow(true), 1_800);
    return () => window.clearTimeout(timeout);
  }, [loading]);

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

  const fullscreen = useMemo(() => fullscreenSupport(), []);

  /** Bascule le plein écran de la fenêtre (niveau système) et rend compte de l’état réel. */
  const toggleWindowFullscreen = useCallback(async () => {
    try {
      if (fullscreenKind) {
        await exitFullscreen(fullscreenKind);
        setFullscreenKind(null);
        notify('Plein écran désactivé.');
        return;
      }
      const kind = await enterFullscreen();
      setFullscreenKind(kind);
      notify(kind === 'window'
        ? 'Fenêtre en plein écran. F11 ou Échap dans le menu Affichage pour en sortir.'
        : 'Affichage en plein écran. F11 pour en sortir.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      notify(`Plein écran refusé : ${detail}`, 'error');
    }
  }, [fullscreenKind, notify]);

  /** Mode immersion : la fenêtre garde sa taille, l’interface se retire. */
  const toggleImmersive = useCallback(() => {
    setImmersive((current) => {
      const next = !current;
      notify(next
        ? 'Mode immersion : barre latérale, menus et onglets sont masqués. Échap ou Ctrl+Maj+F pour revenir.'
        : 'Mode immersion désactivé.');
      return next;
    });
  }, [notify]);

  const closeWelcome = useCallback(() => {
    try { localStorage.setItem(FIRST_RUN_KEY, 'done'); } catch { /* First-run dismissal is best-effort in private storage. */ }
    setWelcomeOpen(false);
  }, []);

  const openWindowsDefaults = useCallback(async () => {
    if (!isTauri()) {
      notify('Les associations se gèrent dans les paramètres Windows de l’application de bureau.', 'error');
      return;
    }
    try {
      await invoke('open_default_apps_settings');
      notify('Paramètres Windows ouverts. Windows vous laisse choisir les associations de Noto.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible d’ouvrir les paramètres Windows.', 'error');
    }
  }, [notify]);

  const openReleasePage = useCallback(async () => {
    if (!isTauri()) {
      window.open('https://github.com/Louxos/Noto/releases/latest', '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await invoke('open_release_page');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible d’ouvrir les téléchargements de Noto.', 'error');
    }
  }, [notify]);

  async function pinWelcomeFolder() {
    if (!isTauri()) { notify('L’épinglage des dossiers est disponible dans l’application de bureau.', 'error'); return; }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Épingler un dossier de recherche' });
      const path = typeof selected === 'string' ? selected : Array.isArray(selected) ? selected[0] : null;
      if (!path) return;
      const folders = loadPinnedSearchFolders();
      if (folders.some((folder) => folder.path.toLocaleLowerCase('en-US') === path.toLocaleLowerCase('en-US'))) {
        notify('Ce dossier est déjà épinglé.');
        closeWelcome();
        return;
      }
      if (folders.length >= 10) { notify('Vous pouvez épingler jusqu’à 10 dossiers.', 'error'); return; }
      savePinnedSearchFolders(togglePinnedSearchFolder(folders, path));
      closeWelcome();
      notify('Dossier épinglé pour vos recherches locales. Son contenu n’a pas été analysé.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible d’épingler ce dossier.', 'error');
    }
  }

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

  const openTauriPath = useCallback(async (path: string, searchTarget?: { line: number | null; query: string }): Promise<boolean | null> => {
    setLoading(true);
    setLoadingMessage('Ouverture du fichier…');
    try {
      const item = await readDesktopPath(path);
      openLoadedDocuments([item]);
      if (searchTarget?.line) {
        const opened = documentsRef.current.find((document) => document.source === 'desktop' && document.path === item.path);
        if (opened) {
          const match = searchText(opened.content, searchTarget.query.trim(), { caseSensitive: false, wholeWord: false, regex: false }).matches[0];
          if (match) setPendingSearchResult({ ...match, documentId: opened.id, documentName: opened.name });
          else setPendingGoToLine({ documentId: opened.id, line: searchTarget.line });
        }
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible d’ouvrir ce fichier.';
      if (message === 'Ouverture annulée.') return null;
      notify(message, 'error');
      return false;
    } finally {
      setLoading(false);
    }
  }, [notify, openLoadedDocuments]);

  const navigateImageSibling = useCallback(async (path: string) => {
    setLoading(true);
    setLoadingMessage('Ouverture de l’image…');
    try {
      const item = await readDesktopPath(path);
      const activeImage = documentsRef.current.find((document) => document.id === activeId && document.kind === 'image');
      if (!activeImage) {
        openLoadedDocuments([item]);
        return;
      }
      const replacement = { ...item, id: activeImage.id };
      commitDocuments(documentsRef.current.map((document) => document.id === activeImage.id ? replacement : document));
      setActiveId(activeImage.id);
      setPage('file');
      setIsEditing(false);
      rememberDocument(replacement);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible d’ouvrir cette image.';
      if (message !== 'Ouverture annulée.') notify(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeId, commitDocuments, notify, openLoadedDocuments, rememberDocument]);

  const openTauriPaths = useCallback(async (paths: string[]) => {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    if (!uniquePaths.length) return;
    setLoading(true);
    setLoadingMessage(uniquePaths.length > 1 ? `Ouverture de ${uniquePaths.length} fichiers…` : 'Ouverture du fichier…');
    try {
      const loaded: OpenDocument[] = [];
      for (const path of uniquePaths) {
        try { loaded.push(await readDesktopPath(path)); }
        catch (error) { notify(error instanceof Error ? error.message : `Impossible d’ouvrir « ${pathFileName(path)} ».`, 'error'); }
      }
      if (loaded.length) openLoadedDocuments(loaded);
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
    void reopenSessionFiles(savedSession.files, readDesktopPath).then(({ documents: loaded, unavailable }) => {
      if (cancelled) return;
      if (loaded.length) openLoadedDocuments(loaded);
      if (unavailable.length) notify(unavailable.length === 1
        ? 'Un fichier de la session n’a pas pu être retrouvé. Vous pourrez le retirer des récents ou l’ouvrir à son nouvel emplacement.'
        : `${unavailable.length} fichiers de la session n’ont pas pu être retrouvés. Vous pourrez les retirer des récents ou les ouvrir à leur nouvel emplacement.`, 'error');
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
  }, [groups, notify, openLoadedDocuments, preferences.restoreSession]);

  useEffect(() => {
    if (preferences.restoreSession && isTauri()) {
      saveDesktopSession(documents, {
        activeId,
        activeGroupId,
        page: page === 'group' ? 'group' : page === 'file' ? 'file' : 'home',
        // L’atelier n’est pas restauré à l’ouverture : la session reprend sur la
        // bibliothèque, jamais au milieu d’un traitement.
      });
    } else clearDesktopSession();
  }, [activeGroupId, activeId, documents, page, preferences.restoreSession]);

  /** Un fichier venu de Windows n’active le mode immersion qu’une seule fois
   *  par lancement, même si cet effet est rejoué après un changement de réglage. */
  const immersiveHandshakeApplied = useRef(false);

  const requestImmersiveForWindows = useCallback((gesture: OpenGesture, fileCount: number) => {
    if (!opensInImmersive(gesture, preferences.immersiveOnFileOpen)) return;
    if (immersiveHandshakeApplied.current) return;
    immersiveHandshakeApplied.current = true;
    setImmersive(true);
    notify(immersiveOpenNotice(fileCount));
  }, [notify, preferences.immersiveOnFileOpen]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<string[]>('noto-open-files', (event) => {
          void invoke<string[]>('take_pending_open_files')
            .then((pending) => {
              const paths = pending.length ? pending : event.payload;
              requestImmersiveForWindows('handoff', paths.length);
              return openTauriPaths(paths);
            })
            .catch(() => {
              requestImmersiveForWindows('handoff', event.payload.length);
              return openTauriPaths(event.payload);
            });
        });
        if (cancelled) { unlisten(); return; }
        const [startupPaths, pendingPaths] = await Promise.all([
          invoke<string[]>('startup_paths').catch(() => []),
          invoke<string[]>('take_pending_open_files').catch(() => []),
        ]);
        // Double-clic sur un fichier associé à Noto : le document s’affiche seul.
        if (startupPaths.length) requestImmersiveForWindows('launch', startupPaths.length);
        if (!cancelled) await openTauriPaths([...startupPaths, ...pendingPaths]);
      } catch {
        // Ordinary file opening remains available even if the optional hand-off cannot be initialized.
      }
    })();
    return () => { cancelled = true; unlisten?.(); };
  }, [openTauriPaths, requestImmersiveForWindows]);

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
      const opened = await openTauriPath(recent.path);
      if (opened === false && window.confirm(`« ${recent.name} » n’est pas accessible. Le retirer des fichiers récents ?`)) {
        setRecents((current) => current.filter((file) => file.id !== recent.id));
      }
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

  const commitProgressiveContent = useCallback((documentId: string, content: string, loadedBytes: number) => {
    commitDocuments(documentsRef.current.map((document) => document.id === documentId
      ? { ...document, content, savedContent: content, loadedBytes }
      : document));
  }, [commitDocuments]);

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

  /**
   * Ouvre la fenêtre d’impression.
   *
   * Le contenu déjà rendu à l’écran (Markdown, aperçu HTML, image affichée avec
   * ses réglages) est copié à cet instant : Noto imprime ce que vous voyez, et
   * non une deuxième mise en page approximative.
   */
  const openPrintDialog = useCallback(() => {
    if (!activeDoc) {
      notify('Ouvrez d’abord un fichier pour l’imprimer.', 'error');
      return;
    }
    let html = '';
    try {
      const rendered = viewerPrintRef.current;
      if (rendered && activeDoc.kind === 'image') html = extractRenderedImage(rendered) ?? '';
      else if (rendered && activeDoc.kind === 'markdown') html = cloneRenderedForPrint(rendered);
    } catch (error) {
      notify(`Le contenu affiché n’a pas pu être préparé : ${error instanceof Error ? error.message : 'erreur inconnue'}`, 'error');
      return;
    }
    setPrintHtml(html);
    setPrintOpen(true);
  }, [activeDoc, notify]);

  const openFileInfoDialog = useCallback(() => {
    if (!activeDoc) {
      notify('Ouvrez d’abord un fichier pour voir ses informations.', 'error');
      return;
    }
    setFileInfoOpen(true);
  }, [activeDoc, notify]);

  // Le relevé du lecteur appartient au fichier affiché : on repart de zéro à
  // chaque changement d’onglet, pour ne jamais mélanger deux fichiers.
  useEffect(() => { setViewerReadout([]); setLinkPreview(null); }, [activeId]);
  /** Page du PDF actuellement affichée, rapportée par le lecteur lui-même. */
  const viewerPage = viewerReadout.find((row) => row.label === 'Page affichée')?.raw ?? 1;
  /**
   * Relevé de repli pour les fichiers texte : leurs lecteurs ne rapportent rien,
   * ces deux mesures se lisent directement dans le contenu chargé.
   */
  const textReadout = useMemo<StatRow[]>(() => {
    if (!activeDoc || !['markdown', 'text', 'code', 'html', 'unknown'].includes(activeDoc.kind)) return [];
    const content = activeDoc.content;
    if (!content) return [{ label: 'Caractères', value: '0' }];
    return [
      { label: 'Caractères', value: content.length.toLocaleString('fr-FR') },
      { label: 'Lignes', value: countLines(content).toLocaleString('fr-FR') },
    ];
  }, [activeDoc]);
  /** Ce que la barre d’état affiche : le relevé du lecteur, sinon celui du texte. */
  const statusReadout = viewerReadout.length ? viewerReadout : textReadout;

  /**
   * Survol des liens, écouté au niveau du document.
   *
   * Un seul écouteur couvre tous les lecteurs présents et futurs : le lien
   * survolé est décrit (adresse, ancre résolue ou introuvable) puis affiché en
   * bas de la fenêtre ; survoler autre chose le retire, comme dans un
   * navigateur. L’écouteur est posé sur le document plutôt que sur la racine de
   * l’application, sans quoi quitter la fenêtre par le bas laisserait l’aperçu
   * affiché.
   */
  useEffect(() => {
    const onHover = (event: MouseEvent) => {
      const target = event.target;
      const anchor = target instanceof Element ? target.closest('a[href]') : null;
      setLinkPreview(anchor instanceof HTMLAnchorElement ? previewForAnchor(anchor) : null);
    };
    document.addEventListener('mouseover', onHover);
    return () => document.removeEventListener('mouseover', onHover);
  }, []);

  useEffect(() => onDocumentFullscreenChange(() => {
    void detectFullscreenKind().then((kind) => setFullscreenKind((current) => (current === kind ? current : kind)));
  }), []);

  useEffect(() => {
    // Le plein écran peut aussi être quitté autrement (raccourci du système,
    // touche Échap). On relit alors l’état réel au lieu de le supposer.
    const sync = () => { if (document.visibilityState === 'visible') void detectFullscreenKind().then(setFullscreenKind); };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        else if (textDiffOpen) setTextDiffOpen(false);
        else if (folderSearchOpen) setFolderSearchOpen(false);
        else if (welcomeOpen) closeWelcome();
        else if (groupDialog) setGroupDialog(null);
        else if (shortcutsOpen) setShortcutsOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (saveAsDialogOpen) setSaveAsDialogOpen(false);
        else if (goToLineOpen) setGoToLineOpen(false);
        else if (fileInfoOpen) setFileInfoOpen(false);
        else if (printOpen) setPrintOpen(false);
        else if (groupPickerOpen) setGroupPickerOpen(false);
        else if (searchOpen) setSearchOpen(false);
        else if (immersive) setImmersive(false);
        return;
      }

      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        const target = event.target;
        const isTyping = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
        if (event.key === 'F11' && fullscreen.supported) {
          event.preventDefault();
          void toggleWindowFullscreen();
          return;
        }
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
      } else if (key === 'p') {
        // Convention des suites documentaires : Ctrl+P imprime, Ctrl+Maj+P ouvre
        // la palette de commandes.
        event.preventDefault();
        if (event.shiftKey) setCommandPaletteOpen(true);
        else openPrintDialog();
      } else if (key === 'i') {
        event.preventDefault();
        openFileInfoDialog();
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
      } else if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        toggleImmersive();
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
  }, [activeDoc, activeId, canEdit, closeDocument, closeWelcome, commandPaletteOpen, currentGroup, documents, fileInfoOpen, findInDocument, folderSearchOpen, fullscreen.supported, goToLineOpen, printOpen, groupDialog, groupPickerOpen, handleOpen, handleSave, immersive, openFileInfoDialog, openGoToLine, openPrintDialog, page, query, saveAsDialogOpen, searchOpen, settingsOpen, shortcutsOpen, textDiffOpen, toggleEditMode, toggleImmersive, toggleWindowFullscreen, welcomeOpen]);

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
    print: activeDoc && <button className="icon-action" type="button" title="Imprimer ce fichier (Ctrl+P)" aria-label="Imprimer ce fichier" onClick={openPrintDialog}><Printer size={16} /></button>,
    info: activeDoc && <button className="icon-action" type="button" title="Informations sur le fichier (Ctrl+I)" aria-label="Informations sur le fichier" onClick={openFileInfoDialog}><FileSearch size={16} /></button>,
    close: activeDoc && <button className="icon-action close-current" type="button" title="Fermer le fichier (Ctrl+W)" aria-label="Fermer le fichier" onClick={() => closeDocument(activeDoc.id)}><X size={17} /></button>,
  };
  const toolbar = preferences.toolbarOrder
    .filter((action) => !preferences.hiddenToolbarActions.includes(action) && Boolean(toolbarActions[action]))
    .map((action) => <span className="toolbar-action-slot" key={action}>{toolbarActions[action]}</span>);

  const topbarStage = useTopbarFit(
    topbarRef,
    [page, activeDoc?.id ?? '', activeDoc?.kind ?? '', isEditing, editorMode, htmlMode, dirty,
      preferences.compactToolbar, preferences.toolbarOrder.join(','), preferences.hiddenToolbarActions.join(','),
      comparableDocuments.length, immersive].join('|'),
  );

  const menuDefinitions: MenuDefinition[] = [
    { id: 'file', label: 'Fichier', items: [
      { id: 'open', label: 'Ouvrir un fichier…', shortcut: 'Ctrl+O', icon: <FileUp size={15} />, onSelect: () => void handleOpen() },
      { id: 'folder-search', label: 'Rechercher dans un dossier…', icon: <FolderSearch size={15} />, dividerBefore: true, disabled: !isTauri(), onSelect: () => setFolderSearchOpen(true) },
      { id: 'compare-text', label: 'Comparer des fichiers texte…', icon: <FileDiff size={15} />, onSelect: () => setTextDiffOpen(true) },
      { id: 'save', label: 'Enregistrer', shortcut: 'Ctrl+S', icon: <Save size={15} />, disabled: !dirty || !canEdit, onSelect: () => void handleSave() },
      { id: 'save-as', label: 'Enregistrer sous…', shortcut: 'Ctrl+Maj+S', icon: <FileText size={15} />, disabled: !canEdit, onSelect: () => void handleSave(true) },
      { id: 'print', label: 'Imprimer…', shortcut: 'Ctrl+P', icon: <Printer size={15} />, disabled: !activeDoc, dividerBefore: true, onSelect: openPrintDialog },
      { id: 'file-info', label: 'Informations sur le fichier…', shortcut: 'Ctrl+I', icon: <FileSearch size={15} />, disabled: !activeDoc, onSelect: openFileInfoDialog },
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
      { id: 'smart-pdf', label: 'PDF ouverts récemment', icon: <FileType2 size={15} />, onSelect: () => openSmartGroup('pdf') },
      { id: 'smart-images', label: 'Images récentes', icon: <FileImage size={15} />, onSelect: () => openSmartGroup('image') },
      { id: 'studio', label: 'Atelier de traitement…', icon: <Wrench size={15} />, dividerBefore: true, onSelect: () => openStudio(null) },
      { id: 'studio-pdf', label: 'Atelier PDF (fusion, découpe, filigrane…)', icon: <FileType2 size={15} />, onSelect: () => openStudio({ operationId: 'pdf.merge', family: 'pdf' }) },
      { id: 'studio-image', label: 'Atelier images (conversion, optimisation…)', icon: <FileImage size={15} />, onSelect: () => openStudio({ operationId: 'image.convert', family: 'image' }) },
      { id: 'studio-ocr', label: 'OCR et nettoyage de scans', icon: <BookOpen size={15} />, onSelect: () => openStudio({ operationId: 'ocr.image' }) },
      { id: 'studio-convert', label: 'Conversion de documents', icon: <Download size={15} />, onSelect: () => openStudio({ operationId: 'office.to-pdf' }) },
      { id: 'sidebar', label: preferences.sidebarCollapsed ? 'Déployer la barre latérale' : 'Réduire la barre latérale', icon: <MoreHorizontal size={15} />, dividerBefore: true, onSelect: () => updatePreference('sidebarCollapsed', !preferences.sidebarCollapsed) },
      { id: 'toolbar-density', label: preferences.compactToolbar ? 'Aérer la barre d’outils' : 'Compacter la barre d’outils', icon: <PanelLeft size={15} />, onSelect: () => updatePreference('compactToolbar', !preferences.compactToolbar) },
      { id: 'fullscreen-window', label: fullscreenKind ? 'Quitter le plein écran de la fenêtre' : 'Plein écran de la fenêtre', shortcut: 'F11', icon: fullscreenKind ? <Minimize2 size={15} /> : <Maximize2 size={15} />, disabled: !fullscreen.supported, onSelect: () => void toggleWindowFullscreen() },
      { id: 'immersive', label: immersive ? 'Quitter le mode immersion' : 'Mode immersion (document seul)', shortcut: 'Ctrl+Maj+F', icon: immersive ? <Minimize2 size={15} /> : <Expand size={15} />, onSelect: toggleImmersive },
      { id: 'theme', label: preferences.theme === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair', icon: preferences.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />, onSelect: () => updatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light') },
      { id: 'settings', label: 'Paramètres…', shortcut: 'Ctrl+,', icon: <Settings2 size={15} />, dividerBefore: true, onSelect: () => setSettingsOpen(true) },
    ] },
    { id: 'help', label: 'Aide', items: [
      { id: 'welcome-guide', label: 'Guide de prise en main', icon: <BookOpenText size={15} />, onSelect: () => setWelcomeOpen(true) },
      { id: 'palette', label: 'Ouverture rapide…', shortcut: 'Ctrl+P', icon: <Command size={15} />, onSelect: () => setCommandPaletteOpen(true) },
      { id: 'shortcuts', label: 'Raccourcis clavier', icon: <Keyboard size={15} />, onSelect: () => setShortcutsOpen(true) },
    ] },
  ];
  const localizedMenus = localizeMenus(menuDefinitions, preferences.language);

  const commands: CommandOption[] = [
    { id: 'open', label: 'Ouvrir un fichier', detail: 'Parcourir votre appareil', shortcut: 'Ctrl+O', keywords: 'parcourir importer', icon: <FileUp size={16} />, onSelect: () => void handleOpen() },
    { id: 'folder-search', label: 'Rechercher dans un dossier', detail: 'Recherche locale à la demande', keywords: 'chercher dossier contenu fichiers', icon: <FolderSearch size={16} />, disabled: !isTauri(), onSelect: () => setFolderSearchOpen(true) },
    { id: 'studio-open', label: 'Ouvrir l’atelier', detail: 'Traiter, convertir et analyser des fichiers localement', keywords: 'atelier pdf image ocr conversion traitement', icon: <Wrench size={16} />, onSelect: () => openStudio(null) },
    { id: 'studio-pdf-open', label: 'Atelier PDF', detail: 'Fusionner, découper, compresser, filigraner', keywords: 'atelier pdf fusion découpe compression', icon: <FileType2 size={16} />, onSelect: () => openStudio({ operationId: 'pdf.merge', family: 'pdf' }) },
    { id: 'studio-images-open', label: 'Atelier images', detail: 'Convertir, optimiser, modifier, planches-contacts', keywords: 'atelier image conversion optimisation', icon: <FileImage size={16} />, onSelect: () => openStudio({ operationId: 'image.convert', family: 'image' }) },
    { id: 'studio-ocr-open', label: 'OCR et scans', detail: 'Reconnaître le texte, créer un PDF interrogeable', keywords: 'ocr texte scan numérisation tesseract', icon: <BookOpen size={16} />, onSelect: () => openStudio({ operationId: 'ocr.image' }) },
    { id: 'compare-text', label: 'Comparer des fichiers texte', detail: 'Afficher les différences de deux onglets', keywords: 'diff comparaison code texte', icon: <FileDiff size={16} />, onSelect: () => setTextDiffOpen(true) },
    { id: 'save', label: 'Enregistrer', detail: 'Sauvegarder les modifications', shortcut: 'Ctrl+S', keywords: 'sauvegarde fichier', icon: <Save size={16} />, disabled: !dirty || !canEdit, onSelect: () => void handleSave() },
    { id: 'print', label: 'Imprimer le fichier', detail: activeDoc ? `Envoyer « ${activeDoc.name} » à l’imprimante` : 'Ouvrez d’abord un fichier', shortcut: 'Ctrl+P', keywords: 'imprimer imprimante papier impression', icon: <Printer size={16} />, disabled: !activeDoc, onSelect: openPrintDialog },
    { id: 'file-info', label: 'Informations sur le fichier', detail: 'Pages, caractères, mots, dimensions, métadonnées', shortcut: 'Ctrl+I', keywords: 'informations statistiques mesures pages caractères mots taille métadonnées', icon: <FileSearch size={16} />, disabled: !activeDoc, onSelect: openFileInfoDialog },
    { id: 'find', label: 'Rechercher', detail: 'Trouver du texte dans le fichier actif', shortcut: 'Ctrl+F', keywords: 'chercher trouver', icon: <Search size={16} />, disabled: !canReadText, onSelect: () => { setSearchOpen(true); setReplaceOpen(false); } },
    { id: 'replace', label: 'Rechercher et remplacer', detail: 'Remplacer plusieurs occurrences', shortcut: 'Ctrl+H', keywords: 'édition texte', icon: <Replace size={16} />, disabled: !canEdit, onSelect: () => { setSearchOpen(true); setReplaceOpen(true); } },
    { id: 'go-to-line', label: 'Aller à la ligne', detail: 'Placer le curseur sur une ligne précise', shortcut: 'Ctrl+G', keywords: 'éditeur numéro navigation', icon: <TextCursorInput size={16} />, disabled: !canEdit, onSelect: openGoToLine },
    { id: 'edit', label: isEditing ? 'Terminer la modification' : 'Modifier le fichier', detail: 'Basculer lecture et édition', shortcut: 'Ctrl+E', keywords: 'écrire éditer modifier', icon: <Pencil size={16} />, disabled: !canEdit, onSelect: toggleEditMode },
    { id: 'group-new', label: 'Créer un groupe', detail: 'Rassembler des fichiers sans les déplacer', shortcut: 'Ctrl+Maj+N', keywords: 'organisation collection dossier', icon: <FolderPlus size={16} />, disabled: groups.length >= 30, onSelect: () => openGroupDialog() },
    { id: 'group-rename', label: 'Renommer le groupe actuel', detail: currentGroup?.name ?? 'Sélectionnez un groupe d’abord', shortcut: 'F2', keywords: 'nom collection', icon: <Pencil size={16} />, disabled: !currentGroup, onSelect: () => { if (currentGroup) openGroupDialog(currentGroup.id); } },
    { id: 'fullscreen-window', label: fullscreenKind ? 'Quitter le plein écran' : 'Passer en plein écran', detail: fullscreen.supported ? 'Fenêtre entière sur tout l’écran' : 'Indisponible dans cet environnement', shortcut: 'F11', keywords: 'plein écran fullscreen agrandir écran entier', icon: fullscreenKind ? <Minimize2 size={16} /> : <Maximize2 size={16} />, disabled: !fullscreen.supported, onSelect: () => void toggleWindowFullscreen() },
    { id: 'immersive', label: immersive ? 'Quitter le mode immersion' : 'Mode immersion', detail: 'Masquer la barre latérale, les menus et les onglets', shortcut: 'Ctrl+Maj+F', keywords: 'immersion concentration lecture seule document', icon: immersive ? <Minimize2 size={16} /> : <Expand size={16} />, onSelect: toggleImmersive },
    { id: 'theme', label: 'Changer de thème', detail: `Passer au thème ${preferences.theme === 'light' ? 'sombre' : 'clair'}`, keywords: 'personnalisation apparence', icon: preferences.theme === 'light' ? <Moon size={16} /> : <Sun size={16} />, onSelect: () => updatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light') },
    { id: 'settings', label: 'Ouvrir les paramètres', detail: 'Apparence, barre d’outils et éditeur', shortcut: 'Ctrl+,', keywords: 'options personnaliser', icon: <Settings2 size={16} />, onSelect: () => setSettingsOpen(true) },
    { id: 'welcome-guide', label: 'Afficher le guide de prise en main', detail: 'Revoir les premières étapes de Noto', keywords: 'aide bienvenue premier démarrage', icon: <BookOpenText size={16} />, onSelect: () => setWelcomeOpen(true) },
    { id: 'shortcuts', label: 'Afficher les raccourcis clavier', detail: 'Voir toutes les commandes clavier', keywords: 'aide clavier', icon: <Keyboard size={16} />, onSelect: () => setShortcutsOpen(true) },
  ];
  const openTabKeys = new Set(documents.map((document) => `${document.source}:${document.path}`));
  commands.push(
    ...documents.map((document) => ({
      id: `open-tab:${document.id}`,
      label: document.name,
      detail: preferences.hidePaths ? 'Onglet ouvert' : `Onglet ouvert · ${document.path}`,
      keywords: `onglet ouvert ${document.name} ${preferences.hidePaths ? '' : document.path}`,
      icon: kindIcon(document.kind, 16),
      onSelect: () => { setActiveId(document.id); setPage('file'); setIsEditing(false); },
    })),
    ...recents.filter((recent) => !openTabKeys.has(`${recent.source}:${recent.path}`)).map((recent) => ({
      id: `open-recent:${recent.id}`,
      label: recent.name,
      detail: preferences.hidePaths ? 'Fichier récent' : `Fichier récent · ${recent.path}`,
      keywords: `fichier récent ouvrir ${recent.name} ${preferences.hidePaths ? '' : recent.path}`,
      icon: kindIcon(recent.kind, 16),
      onSelect: () => { void handleRecent(recent); },
    })),
  );
  const localizedCommands = localizeCommands(commands, preferences.language);

  function fileContextActions(contextFile: RecentFile): MenuEntry[] {
    const openContextDocument = documents.find((document) => document.source === contextFile.source && document.path === contextFile.path);
    const isOpen = Boolean(openContextDocument);
    const inCurrentGroup = currentGroup?.files.some((file) => file.id === contextFile.id) ?? false;
    const items: MenuEntry[] = [
      { id: 'open-file', label: 'Ouvrir le fichier', icon: <FileUp size={15} />, onSelect: () => void handleRecent(contextFile) },
      { id: 'studio-file', label: contextFile.source === 'desktop' ? 'Ouvrir dans l’atelier' : 'Ouvrir dans l’atelier (fichier local requis)', icon: <Wrench size={15} />, disabled: contextFile.source !== 'desktop' || !isTauri(), onSelect: () => openStudioForPath(contextFile.path) },
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
    if (openContextDocument && comparableDocuments.length > 1 && isComparableDocument(openContextDocument)) {
      items.push({ id: 'compare-open-files', label: 'Comparer les fichiers ouverts…', icon: <FileDiff size={15} />, dividerBefore: true, onSelect: () => setTextDiffOpen(true) });
    }
    if (isOpen) items.push({ id: 'close-file', label: 'Fermer le fichier', icon: <X size={15} />, dividerBefore: true, onSelect: () => {
      const openDocument = documentsRef.current.find((document) => document.source === contextFile.source && document.path === contextFile.path);
      if (openDocument) closeDocument(openDocument.id);
    } });
    return items;
  }

  function handleAppContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.context-menu-popover')) return;
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
    } else {
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
      items.push({ id: 'search-selection', label: `Rechercher « ${selectedText.slice(0, 28)}${selectedText.length > 28 ? '…' : ''} »`, icon: <Search size={15} />, onSelect: () => { setQuery(selectedText); setSearchOpen(true); setReplaceOpen(false); } });
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
    }

    setContextMenu({ position: { x: event.clientX, y: event.clientY }, items });
  }

  return (
    <div className={`app-shell theme-${preferences.theme} ${preferences.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${preferences.compactToolbar ? 'toolbar-compact' : ''} ${immersive ? 'immersive' : ''} ${topbarFitClasses(topbarStage)}`} style={{ '--reader-size': `${preferences.textSize}px` } as CSSProperties} onDragEnter={onDragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onContextMenu={handleAppContextMenu}>
      <input ref={inputRef} className="visually-hidden" type="file" multiple onChange={onInputFiles} aria-label="Sélectionner des fichiers" />
      <aside className="sidebar">
        <div className="brand-lockup" onClick={() => { setPage('home'); setActiveId(null); }} role="button" tabIndex={0}>
          <span className="brand-mark" aria-hidden="true"><span /><span /><i /></span>
          <span className="brand-name">noto</span>
        </div>

        <div className="sidebar-main-action"><OpenDialogButton onClick={() => void handleOpen()} compact language={preferences.language} /></div>

        <nav className="sidebar-nav" aria-label="Navigation principale">
          <button className={`nav-item ${page === 'home' ? 'active' : ''}`} type="button" onClick={() => { setPage('home'); setActiveId(null); setActiveGroupId(null); }}>
            <LayoutGrid size={17} /><span>{tLang(preferences.language, 'nav.home')}</span>
          </button>
          <button className={`nav-item ${page === 'recents' ? 'active' : ''}`} type="button" onClick={() => { setPage('recents'); setActiveId(null); setActiveGroupId(null); }}>
            <Clock3 size={17} /><span>{tLang(preferences.language, 'nav.recents')}</span><span className="nav-count">{recents.length || ''}</span>
          </button>
          <button className={`nav-item ${page === 'studio' ? 'active' : ''}`} type="button" title="Atelier : traiter, convertir et analyser vos fichiers" onClick={() => openStudio(null)}>
            <Wrench size={17} /><span>{tLang(preferences.language, 'nav.atelier')}</span>
          </button>
        </nav>

        <section className="sidebar-group-section" aria-label="Groupes de fichiers">
          <div className="sidebar-group-heading"><span>{tLang(preferences.language, 'nav.groups').toUpperCase()}</span><button type="button" title={tLang(preferences.language, 'nav.createGroup')} aria-label={tLang(preferences.language, 'nav.createGroup')} disabled={groups.length >= 30} onClick={() => openGroupDialog()}><Plus size={15} /></button></div>
          <div className="sidebar-group-list">
            {groups.map((group) => <button className={`group-nav-item ${page === 'group' && activeGroupId === group.id ? 'active' : ''}`} type="button" key={group.id} data-context-group-id={group.id} title={`${group.name} · ${group.files.length} fichier${group.files.length === 1 ? '' : 's'}`} onClick={() => { setActiveGroupId(group.id); setActiveId(null); setPage('group'); }}>
              <span className={`group-color-dot color-${group.color}`} /><span className="group-nav-label">{group.name}</span><span className="group-nav-count">{group.files.length}</span>
            </button>)}
            {groups.length === 0 && <div className="sidebar-group-empty">{tLang(preferences.language, 'nav.emptyGroups')}</div>}
          </div>
        </section>

        <section className="sidebar-group-section smart-group-section" aria-label="Collections intelligentes">
          <div className="sidebar-group-heading"><span>{tLang(preferences.language, 'nav.quickCollections').toUpperCase()}</span></div>
          <div className="sidebar-group-list">
            <button className={`group-nav-item ${page === 'smart-group' && activeSmartGroup === 'pdf' ? 'active' : ''}`} type="button" onClick={() => openSmartGroup('pdf')} title={`PDF ouverts récemment · ${recents.filter((recent) => recent.kind === 'pdf').length}`}>
              <span className="group-color-dot color-violet" /><span className="group-nav-label">{tLang(preferences.language, 'nav.pdfRecents')}</span><span className="group-nav-count">{recents.filter((recent) => recent.kind === 'pdf').length}</span>
            </button>
            <button className={`group-nav-item ${page === 'smart-group' && activeSmartGroup === 'image' ? 'active' : ''}`} type="button" onClick={() => openSmartGroup('image')} title={`Images récentes · ${recents.filter((recent) => recent.kind === 'image').length}`}>
              <span className="group-color-dot color-blue" /><span className="group-nav-label">{tLang(preferences.language, 'nav.imageRecents')}</span><span className="group-nav-count">{recents.filter((recent) => recent.kind === 'image').length}</span>
            </button>
          </div>
        </section>

        <div className="sidebar-recents-header">
          <span>{tLang(preferences.language, 'nav.recentlyOpened').toUpperCase()}</span>
          <button type="button" title={preferences.language === 'fr' ? 'Effacer la liste des récents' : 'Clear recent files'} aria-label={preferences.language === 'fr' ? 'Effacer les fichiers récents' : 'Clear recent files'} onClick={() => { setRecents([]); notify('La liste des fichiers récents a été effacée.'); }}><MoreHorizontal size={17} /></button>
        </div>
        <div className="sidebar-recent-list">
          {recents.slice(0, 6).map((recent) => (
            <button className={`recent-file ${activeDoc?.path === recent.path && page === 'file' ? 'selected' : ''}`} type="button" key={recent.id} data-context-file-id={recent.id} onClick={() => void handleRecent(recent)} title={preferences.hidePaths ? recent.name : recent.path}>
              <span className={`file-type-icon type-${recent.kind}`}>{kindIcon(recent.kind, 15)}</span>
              <span className="recent-file-copy"><span className="recent-file-name">{recent.name}</span><span className="recent-file-date">{formatRelativeDate(recent.lastOpened)}</span></span>
            </button>
          ))}
          {recents.length === 0 && <div className="sidebar-empty">{tLang(preferences.language, 'nav.emptyRecents')}</div>}
        </div>

        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={15} /><span>{preferences.language === 'fr' ? <>Vos fichiers restent<br />sur cet appareil</> : <>Your files stay<br />on this device</>}</span></div>
          <div className="sidebar-footer-actions">
            <button className="footer-icon-button" type="button" title={preferences.language === 'fr' ? (preferences.theme === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair') : (preferences.theme === 'light' ? 'Enable dark theme' : 'Enable light theme')} aria-label={preferences.language === 'fr' ? 'Changer de thème' : 'Change theme'} onClick={() => updatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light')}>
              {preferences.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button className="footer-settings" type="button" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /><span>{tLang(preferences.language, 'settings.title')}</span></button>
          </div>
          <div className="sidebar-version"><span>Noto</span><span>{APP_VERSION}</span></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar" ref={topbarRef}>
          <div className="topbar-title">
            <span className="topbar-icon">{activeDoc && page === 'file' ? kindIcon(activeDoc.kind, 16) : <span className="mini-logo">N</span>}</span>
            <div className="topbar-heading">
              <div className="topbar-name-row">
                <h1>{page === 'studio' ? tLang(preferences.language, 'nav.atelier') : page === 'recents' ? tLang(preferences.language, 'nav.recents') : page === 'smart-group' ? smartGroupTitle : page === 'group' && currentGroup ? currentGroup.name : page === 'file' && activeDoc ? activeDoc.name : tLang(preferences.language, 'nav.home')}</h1>
                {page === 'file' && activeDoc && activeDoc.content !== activeDoc.savedContent && <span className="unsaved-indicator" title="Modifications non enregistrées" />}
              </div>
              <span className="topbar-subtitle">{page === 'studio' ? 'Traitement local · aucun envoi en ligne' : page === 'file' && activeDoc ? `${getFormatLabel(activeDoc.kind)}${activeDoc.path && activeDoc.source === 'desktop' && !preferences.hidePaths ? ` · ${activeDoc.path}` : ''}` : page === 'group' && currentGroup ? `${currentGroup.files.length} fichier${currentGroup.files.length === 1 ? '' : 's'} · Espace local` : page === 'smart-group' ? `${smartGroupFiles.length} fichier${smartGroupFiles.length === 1 ? '' : 's'} · Collection dynamique locale` : 'Espace local'}</span>
            </div>
          </div>

          <AppMenuBar menus={localizedMenus} onOpenPalette={() => setCommandPaletteOpen(true)} collapsed={topbarStage === 'menu-button'} />

          <div className="topbar-actions">
            {page === 'file' && activeDoc && <>
              {activeDoc.kind === 'html' && !isEditing && <div className="segmented-control html-mode-toggle" aria-label="Mode HTML">
                <button className={htmlMode === 'code' ? 'selected' : ''} type="button" title="Afficher le code HTML" aria-label="Afficher le code HTML" onClick={() => setHtmlMode('code')}><Code2 size={14} /><span>Code</span></button>
                <button className={htmlMode === 'preview' ? 'selected' : ''} type="button" title="Afficher l’aperçu isolé" aria-label="Afficher l’aperçu isolé" onClick={() => setHtmlMode('preview')}><Maximize2 size={13} /><span>Aperçu</span></button>
              </div>}
              {isEditing && activeDoc.kind === 'markdown' && <div className="segmented-control editor-mode-toggle" aria-label="Mode de lecture">
                <button className={editorMode === 'source' ? 'selected' : ''} type="button" title="Éditer la source" aria-label="Éditer la source" onClick={() => setEditorMode('source')}><TextCursorInput size={14} /><span>Édition</span></button>
                <button className={editorMode === 'split' ? 'selected' : ''} type="button" title="Édition et aperçu côte à côte" aria-label="Édition et aperçu côte à côte" onClick={() => setEditorMode('split')}><PanelLeft size={14} /><span>Côte à côte</span></button>
                <button className={editorMode === 'preview' ? 'selected' : ''} type="button" title="Afficher uniquement l’aperçu" aria-label="Afficher uniquement l’aperçu" onClick={() => setEditorMode('preview')}><BookOpenText size={14} /><span>Aperçu</span></button>
              </div>}
              {toolbar}
              {comparableDocuments.length > 1 && <button className="secondary-button topbar-compare-button" type="button" title="Comparer les fichiers texte ouverts" onClick={() => setTextDiffOpen(true)}><FileDiff size={14} /><span>Comparer</span></button>}
            </>}
            {immersive && <button className="icon-action immersive-exit" type="button" title="Quitter le mode immersion (Échap)" aria-label="Quitter le mode immersion" onClick={toggleImmersive}><Minimize2 size={17} /></button>}
            {fullscreen.supported && <button className="icon-action" type="button" title={fullscreenKind ? 'Quitter le plein écran (F11)' : 'Plein écran (F11)'} aria-label={fullscreenKind ? 'Quitter le plein écran' : 'Passer en plein écran'} aria-pressed={Boolean(fullscreenKind)} onClick={() => void toggleWindowFullscreen()}>{fullscreenKind ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>}
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
          {page === 'studio' && (
            <Suspense fallback={<div className="viewer-empty">Préparation de l’atelier…</div>}>
              <StudioScreen request={studioRequest} onClose={() => { setStudioRequest(null); setPage('home'); }} />
            </Suspense>
          )}
          {page === 'home' && <HomeScreen recents={recents} hidePaths={preferences.hidePaths} language={preferences.language} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
          {page === 'recents' && <RecentScreen recents={recents} hidePaths={preferences.hidePaths} language={preferences.language} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onRemove={(id) => setRecents((current) => current.filter((item) => item.id !== id))} onTogglePin={(recent) => setRecents((current) => current.map((item) => item.id === recent.id ? { ...item, pinned: !item.pinned } : item))} />}
          {page === 'smart-group' && activeSmartGroup && <SmartGroupScreen title={smartGroupTitle} kind={activeSmartGroup} files={smartGroupFiles} hidePaths={preferences.hidePaths} onRecent={(recent) => void handleRecent(recent)} />}
          {page === 'smart-group' && !activeSmartGroup && <HomeScreen recents={recents} hidePaths={preferences.hidePaths} language={preferences.language} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
          {page === 'group' && currentGroup && <GroupScreen group={currentGroup} hidePaths={preferences.hidePaths} onOpen={() => void handleOpen()} onOpenAll={() => void openAllGroupFiles(currentGroup)} onRecent={(recent) => void handleRecent(recent)} onRemoveFile={(id) => setGroups((current) => removeGroupFile(current, currentGroup.id, id))} onRemoveFiles={(ids) => setGroups((current) => removeGroupFiles(current, currentGroup.id, ids))} onRename={() => setGroupDialog({ groupId: currentGroup.id })} onDelete={deleteCurrentGroup} />}
          {page === 'group' && !currentGroup && <HomeScreen recents={recents} hidePaths={preferences.hidePaths} language={preferences.language} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
          {page === 'file' && activeDoc && <div className={`document-workspace ${activeDoc.kind === 'markdown' ? 'is-markdown' : ''}`}>
            {activeDoc.truncated && <div className="partial-warning"><CircleHelp size={15} /><span>Aperçu partiel — le contenu complet reste accessible lorsque le lecteur le permet. L’édition et l’enregistrement sont désactivés.</span></div>}
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
                onOpenPath={navigateImageSibling}
                onProgressiveContent={commitProgressiveContent}
                onReadout={setViewerReadout}
                printRef={viewerPrintRef}
              />
            )}
          </div>}
          {page === 'file' && !activeDoc && <HomeScreen recents={recents} hidePaths={preferences.hidePaths} language={preferences.language} onOpen={() => void handleOpen()} onRecent={(recent) => void handleRecent(recent)} onViewAll={() => setPage('recents')} />}
        </section>

        {page === 'file' && activeDoc && <footer className="document-statusbar">
          {/* Comme dans un navigateur, l’adresse du lien survolé prend la place
              du statut à gauche pendant le survol. */}
          {linkPreview ? <div className={`status-link is-${linkPreview.kind}`} role="status" title={linkPreview.href}>
            {linkPreview.kind === 'anchor-missing' ? <CircleAlert size={13} /> : <Link2 size={13} />}
            <span className="status-link-address">{linkPreview.label}</span>
            <span className="status-link-kind">{describeLinkKind(linkPreview.kind)}</span>
          </div> : <div className="status-left"><span className="status-dot" />{dirty ? 'Modifications non enregistrées' : 'À jour'}<span className="status-separator">·</span><span>{activeDoc.extension ? `.${activeDoc.extension.toUpperCase()}` : getFormatLabel(activeDoc.kind)}</span></div>}
          <div className="status-measures" aria-live="polite">{statusReadout.map((row) => <span className="status-measure" key={row.label} title={`${row.label} : ${row.value}`}>{row.label} : {row.value}</span>)}</div>
          <div className="status-actions">
            {activeDoc && <button className="status-button" type="button" title="Informations sur le fichier (Ctrl+I)" aria-label="Informations sur le fichier" onClick={openFileInfoDialog}><FileSearch size={14} /><span>Informations</span></button>}
            {activeDoc && <button className="status-button" type="button" title="Imprimer ce fichier (Ctrl+P)" aria-label="Imprimer ce fichier" onClick={openPrintDialog}><Printer size={14} /><span>Imprimer</span></button>}
          </div>
          <div className="status-right"><span>{formatBytes(activeDoc.size)}</span>{activeDoc.kind === 'markdown' && <><span className="status-separator">·</span><span>Markdown</span></>}{activeDoc.source === 'desktop' && <><span className="status-separator">·</span><span>Local</span></>}</div>
        </footer>}
      </main>

      {dragging && <div className="drop-overlay" onDragLeave={() => setDragging(false)}><div className="drop-overlay-card"><span className="drop-icon"><FileUp size={25} /></span><strong>Déposez pour ouvrir</strong><span>Texte, code, PDF, présentations, documents et images…</span></div></div>}
      {loading && <div className="loading-overlay" aria-busy="true"><div className="loading-card" role="status" aria-live="polite"><LoaderCircle size={20} className="spin" /><div className="loading-copy"><span>{loadingMessage}</span>{loadingSlow && <small>Encore un instant : Noto termine cette opération localement. Aucun contenu n’est transmis.</small>}</div></div></div>}
      {toast && <div className={`toast toast-${toastKind}`} role="status"><span className="toast-mark">{toastKind === 'success' ? <Check size={14} /> : <CircleHelp size={14} />}</span>{toast}</div>}
      {settingsOpen && <SettingsModal preferences={preferences} onChange={updatePreference} onClose={() => setSettingsOpen(false)} onClearRecents={() => { setRecents([]); notify('La liste des fichiers récents a été effacée.'); }} onResetDefaults={resetPreferences} onClearDrafts={clearDraftRecoveryData} onMoveToolbar={moveToolbarAction} onToggleToolbar={toggleToolbarAction} onOpenShortcuts={() => { setSettingsOpen(false); setShortcutsOpen(true); }} onOpenWindowsDefaults={() => void openWindowsDefaults()} onOpenReleasePage={() => void openReleasePage()} onOpenIndexedResult={(path) => { setSettingsOpen(false); void openTauriPath(path); }} onExportBackup={exportLocalSettings} onImportBackup={(file) => void importLocalSettings(file)} />}
      {folderSearchOpen && <FolderSearchDialog hidePaths={preferences.hidePaths} onOpenFile={(path, line, query) => { setFolderSearchOpen(false); void openTauriPath(path, { line, query }); }} onClose={() => setFolderSearchOpen(false)} />}
      {textDiffOpen && <TextDiffDialog documents={documents} initialLeftId={activeDoc?.id ?? null} onOpenFile={() => void handleOpen()} onClose={() => setTextDiffOpen(false)} />}
      {fileInfoOpen && activeDoc && <FileInfoDialog document={activeDoc} readout={viewerReadout} onClose={() => setFileInfoOpen(false)} notify={notify} />}
      {printOpen && activeDoc && <PrintDialog document={activeDoc} currentPage={viewerPage} renderedHtml={printHtml || undefined} onClose={() => { setPrintOpen(false); setPrintHtml(''); }} notify={notify} />}
      {welcomeOpen && <WelcomeDialog onOpenFile={() => { closeWelcome(); void handleOpen(); }} onPinFolder={() => void pinWelcomeFolder()} onIntegrations={() => { closeWelcome(); setSettingsOpen(true); }} onClose={closeWelcome} />}
      {groupDialog && <GroupDialog group={groupDialog.groupId ? groups.find((group) => group.id === groupDialog.groupId) : undefined} onClose={() => setGroupDialog(null)} onSave={saveGroupDialog} />}
      {goToLineOpen && activeDoc && <GoToLineDialog lineCount={activeDoc.content.split('\\n').length} onGo={navigateToLine} onClose={() => setGoToLineOpen(false)} />}
      {saveAsDialogOpen && activeDoc && <SaveAsDialog fileName={activeDoc.name} error={saveAsError} onSave={(options) => void handleSave(true, options)} onClose={() => setSaveAsDialogOpen(false)} />}
      {renameTarget && <RenameFileDialog file={renameTarget} onClose={() => setRenameTarget(null)} onRename={(name) => void submitFileRename(name)} />}
      {groupAssignmentTarget && <GroupAssignmentDialog file={groupAssignmentTarget} groups={groups} onToggle={toggleAssignedFile} onCreate={() => { setGroupAssignmentTarget(null); openGroupDialog(); }} onClose={() => setGroupAssignmentTarget(null)} />}
      {contextMenu && <ContextMenu position={contextMenu.position} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {commandPaletteOpen && <CommandPalette commands={localizedCommands} language={preferences.language} onClose={() => setCommandPaletteOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function HomeScreen({ recents, onOpen, onRecent, onViewAll, hidePaths = false, language = 'fr' }: { recents: RecentFile[]; onOpen: () => void; onRecent: (recent: RecentFile) => void; onViewAll: () => void; hidePaths?: boolean; language?: Preferences['language'] }) {
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
          <div className="eyebrow"><span className="eyebrow-dot" />{tLang(language, 'home.eyebrow')}</div>
          <h2>{language === 'fr' ? <>Vos fichiers,<br /><em>en toute clarté.</em></> : <>Your files,<br /><em>in clear view.</em></>}</h2>
          <p>{tLang(language, 'home.subtitle')}</p>
          <div className="welcome-actions"><OpenDialogButton onClick={onOpen} language={language} /><span className="local-hint"><ShieldCheck size={14} />{tLang(language, 'home.localHint')}</span></div>
        </div>
      </div>

      <div className="format-row" aria-label={language === 'fr' ? 'Formats compatibles' : 'Supported file formats'}>
        <span>{tLang(language, 'home.compatible').toUpperCase()}</span>
        <div className="format-pills"><span><BookOpenText size={14} />Markdown</span><span><Code2 size={14} />Code</span><span><FileType2 size={14} />PDF</span><span><Presentation size={14} />{language === 'fr' ? 'Diaporamas' : 'Presentations'}</span><span><BookOpen size={14} />EPUB</span><span><ImageIcon size={14} />Images</span><span><Table2 size={14} />CSV / TSV</span></div>
      </div>

      <div className="home-recents-section">
        <div className="section-heading"><div><h3>{tLang(language, 'home.recent')}</h3><p>{tLang(language, 'home.recentSubtitle')}</p></div>{recents.length > 3 && <button className="text-link" type="button" onClick={onViewAll}>{tLang(language, 'home.viewAll')} <span>→</span></button>}</div>
        {recents.length > 0 ? <div className="home-recent-grid">
          {recents.slice(0, 3).map((recent) => <RecentCard key={recent.id} recent={recent} onClick={() => onRecent(recent)} hidePath={hidePaths} />)}
        </div> : <div className="recent-empty-card"><span className="empty-clock"><Clock3 size={18} /></span><span><strong>{tLang(language, 'home.nothingOpen')}</strong><small>{tLang(language, 'home.noRecent')}</small></span><button type="button" onClick={onOpen}>{tLang(language, 'home.browse')} <span>→</span></button></div>}
      </div>
      <div className="home-footnote"><span>{tLang(language, 'home.principle')}</span><i />{language === 'fr' ? 'Pas de compte' : 'No account'}<i />{language === 'fr' ? 'Pas de cloud' : 'No cloud'}<i />{language === 'fr' ? 'Pas de suivi' : 'No tracking'}</div>
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

function RecentScreen({ recents, onOpen, onRecent, onRemove, onTogglePin, hidePaths, language = 'fr' }: { recents: RecentFile[]; onOpen: () => void; onRecent: (recent: RecentFile) => void; onRemove: (id: string) => void; onTogglePin: (recent: RecentFile) => void; hidePaths: boolean; language?: Preferences['language'] }) {
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
    <div className="recent-screen-heading"><div><div className="eyebrow">{tLang(language, 'recents.eyebrow').toUpperCase()}</div><h2>{tLang(language, 'nav.recents')}</h2><p>{tLang(language, 'recents.description')}</p></div><button className="secondary-button" type="button" onClick={onOpen}><Plus size={15} /> {tLang(language, 'home.openFile')}</button></div>
    {recents.length > 0 && <div className="recent-controls">
      <label className="recent-filter-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === 'fr' ? 'Filtrer les noms et chemins' : 'Filter names and paths'} aria-label={language === 'fr' ? 'Filtrer les fichiers récents' : 'Filter recent files'} /></label>
      <label><span>{language === 'fr' ? 'Type' : 'Type'}</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">{language === 'fr' ? 'Tous les types' : 'All types'}</option><option value="text">{language === 'fr' ? 'Texte / documents' : 'Text / documents'}</option><option value="code">{language === 'fr' ? 'Code / HTML' : 'Code / HTML'}</option><option value="pdf">PDF</option><option value="image">{language === 'fr' ? 'Images' : 'Images'}</option><option value="presentation">{language === 'fr' ? 'Présentations' : 'Presentations'}</option><option value="data">CSV / TSV</option></select></label>
      <label><span>{language === 'fr' ? 'Trier' : 'Sort'}</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">{language === 'fr' ? 'Plus récents' : 'Most recent'}</option><option value="name">{language === 'fr' ? 'Nom' : 'Name'}</option><option value="kind">{language === 'fr' ? 'Type' : 'Type'}</option></select></label>
    </div>}
    {recents.length ? visibleRecents.length ? <div className="recent-list-table">
      <div className="recent-table-head"><span>{language === 'fr' ? 'FICHIER' : 'FILE'}</span><span>{language === 'fr' ? 'TYPE' : 'TYPE'}</span><span>{language === 'fr' ? 'OUVERT' : 'OPENED'}</span><span /></div>
      {visibleRecents.map((recent) => <div className="recent-table-row" key={recent.id} data-context-file-id={recent.id}>
        <button className="recent-table-file" type="button" onClick={() => onRecent(recent)} title={hidePaths ? recent.name : recent.path}><span className={`home-file-icon type-${recent.kind}`}>{kindIcon(recent.kind, 17)}</span><span><strong>{recent.name}</strong><small>{hidePaths ? (language === 'fr' ? 'Chemin masqué' : 'Path hidden') : recent.path}</small></span></button>
        <span className="recent-table-kind">{getFormatLabel(recent.kind as OpenDocument['kind'])}</span>
        <span className="recent-table-date">{formatRelativeDate(recent.lastOpened)}</span>
        <div className="recent-row-actions">
          <button className={`recent-pin ${recent.pinned ? 'is-pinned' : ''}`} type="button" title={language === 'fr' ? (recent.pinned ? 'Désépingler' : 'Épingler') : (recent.pinned ? 'Unpin' : 'Pin')} aria-label={`${language === 'fr' ? (recent.pinned ? 'Désépingler' : 'Épingler') : (recent.pinned ? 'Unpin' : 'Pin')} ${recent.name}`} aria-pressed={Boolean(recent.pinned)} onClick={() => onTogglePin(recent)}><Pin size={14} /></button>
          <button className="recent-remove" type="button" title={language === 'fr' ? 'Retirer des récents' : 'Remove from recents'} aria-label={`${language === 'fr' ? 'Retirer' : 'Remove'} ${recent.name} ${language === 'fr' ? 'des récents' : 'from recents'}`} onClick={() => onRemove(recent.id)}><X size={15} /></button>
        </div>
      </div>)}
    </div> : <div className="recent-filter-empty"><Search size={17} /><span>{language === 'fr' ? 'Aucun fichier récent ne correspond à ce filtre.' : 'No recent files match this filter.'}</span></div> : <div className="recent-empty-large"><span><Clock3 size={24} /></span><h3>{language === 'fr' ? 'Aucun fichier récent' : 'No recent files'}</h3><p>{language === 'fr' ? 'Ouvrez votre premier fichier pour le retrouver ici.' : 'Open a file to see it here.'}</p><button className="primary-button" type="button" onClick={onOpen}><Plus size={16} />{tLang(language, 'home.openFile')}</button></div>}
    <div className="recent-privacy"><ShieldCheck size={15} />{language === 'fr' ? 'Votre historique reste uniquement enregistré sur cet appareil.' : 'Your history stays only on this device.'}</div>
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
  document, documents, isEditing, editorMode, htmlMode, preferences, onChange, editorRef, searchQuery, pdfSearchRequest, fileContextItems, onOpenPath, onProgressiveContent, onReadout, printRef,
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
  onOpenPath: (path: string) => void;
  onProgressiveContent: (documentId: string, content: string, loadedBytes: number) => void;
  onReadout: (rows: StatRow[]) => void;
  printRef: React.MutableRefObject<HTMLDivElement | null>;
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

  if (document.truncated && ['markdown', 'text', 'code', 'html', 'unknown'].includes(document.kind)) {
    return <ProgressiveTextViewer document={document} lineNumbers={preferences.lineNumbers} wordWrap={preferences.wordWrap} fontSize={preferences.textSize} onContentLoaded={onProgressiveContent} />;
  }

  if (document.kind === 'markdown') return <div className="reader-scroll" ref={printRef}><Suspense fallback={<div className="viewer-empty">Préparation du rendu…</div>}><MarkdownViewer source={document.content} document={document} documents={documents} /></Suspense></div>;
  if (document.kind === 'code' || document.kind === 'text' || (document.kind === 'unknown' && (document.content.length > 0 || document.size === 0))) {
    const displayContent = document.extension === 'json' ? formatJsonForDisplay(document.content) : document.content;
    const jsonError = document.extension === 'json' ? validateJson(document.content) : null;
    const validationMessage = jsonError ? `JSON invalide · ligne ${jsonError.line}, colonne ${jsonError.column} · ${jsonError.message}` : undefined;
    return <CodeViewer content={displayContent} extension={document.extension} lineNumbers={preferences.lineNumbers} wordWrap={preferences.wordWrap} fontSize={preferences.textSize} validationMessage={validationMessage} />;
  }
  if (document.kind === 'csv') return <CsvViewer content={document.content} fileName={document.name} onReadout={onReadout} />;
  if (document.kind === 'html') return htmlMode === 'preview'
    ? <HtmlViewer source={document.content} mode="preview" />
    : <CodeViewer content={document.content} extension="html" lineNumbers={preferences.lineNumbers} wordWrap={preferences.wordWrap} fontSize={preferences.textSize} />;
  if (document.kind === 'pdf') return <Suspense fallback={<div className="viewer-empty">Chargement du lecteur PDF…</div>}><PdfViewer document={document} searchQuery={searchQuery} searchRequest={pdfSearchRequest} fileContextItems={fileContextItems} onReadout={onReadout} /></Suspense>;
  if (document.kind === 'image') return <div className="image-viewer-host" ref={printRef}><Suspense fallback={<div className="viewer-empty">Chargement de l’image…</div>}><ImageViewer document={document} fileContextItems={fileContextItems} onOpenPath={onOpenPath} onReadout={onReadout} /></Suspense></div>;
  if (document.kind === 'presentation') return <Suspense fallback={<div className="viewer-empty">Préparation du diaporama…</div>}><PresentationViewer document={document} fileContextItems={fileContextItems} onReadout={onReadout} /></Suspense>;
  if (document.kind === 'document' || document.kind === 'ebook') return <Suspense fallback={<div className="viewer-empty">Préparation du document…</div>}><OfficeDocumentViewer document={document} fileContextItems={fileContextItems} onReadout={onReadout} /></Suspense>;
  return <UnsupportedFile document={document} onOpenText={() => onChange(document.content)} />;
}

export function SettingsModal({ preferences, onChange, onClose, onClearRecents, onResetDefaults, onClearDrafts, onMoveToolbar, onToggleToolbar, onOpenShortcuts, onOpenWindowsDefaults, onOpenReleasePage, onOpenIndexedResult, onExportBackup, onImportBackup }: {
  preferences: Preferences;
  onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onClose: () => void;
  onClearRecents: () => void;
  onResetDefaults: () => void;
  onClearDrafts: () => void;
  onMoveToolbar: (action: ToolbarAction, direction: -1 | 1) => void;
  onToggleToolbar: (action: ToolbarAction) => void;
  onOpenShortcuts: () => void;
  onOpenWindowsDefaults: () => void;
  onOpenReleasePage: () => void;
  onOpenIndexedResult: (path: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
}) {
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const tx = (key: string, fallback?: string) => {
    const value = tLang(preferences.language, key);
    return value === key ? fallback ?? key : value;
  };
  const checkUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateError('');
    try {
      setUpdateInfo(await checkForUpdate(APP_VERSION));
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : tx('settings.updateError', 'Update check failed.'));
      setUpdateInfo(null);
    } finally {
      setCheckingUpdates(false);
    }
  };
  const toolbarLabels: Record<ToolbarAction, string> = {
    search: tx('settings.toolbarSearch', 'Search'), edit: tx('settings.toolbarEdit', 'Edit'), save: tx('settings.toolbarSave', 'Save'),
    print: tx('settings.toolbarPrint', 'Print'), info: tx('settings.toolbarInfo', 'File information'), group: tx('settings.toolbarGroup', 'Add to group'), close: tx('settings.toolbarClose', 'Close file'),
  };
  const toolbarIcons: Record<ToolbarAction, ReactNode> = { search: <Search size={14} />, edit: <Pencil size={14} />, save: <Save size={14} />, print: <Printer size={14} />, info: <FileSearch size={14} />, group: <FolderPlus size={14} />, close: <X size={14} /> };
  const orderedActions = [...preferences.toolbarOrder, ...TOOLBAR_ACTIONS.filter((action) => !preferences.toolbarOrder.includes(action))];
  const accents: { value: Preferences['accent']; label: string }[] = [
    { value: 'violet', label: 'Violet' }, { value: 'blue', label: preferences.language === 'fr' ? 'Bleu' : 'Blue' },
    { value: 'mint', label: preferences.language === 'fr' ? 'Menthe' : 'Mint' }, { value: 'rose', label: preferences.language === 'fr' ? 'Rose' : 'Rose' },
  ];

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div><span className="settings-icon"><Settings2 size={17} /></span><div><h2 id="settings-title">{tx('settings.title', 'Settings')}</h2><p>{tx('settings.subtitle', 'Make Noto yours.')}</p></div></div><button className="icon-action" type="button" title={tx('settings.done', 'Close')} aria-label={tx('settings.title', 'Settings')} onClick={onClose}><X size={18} /></button></header>
      <div className="settings-body">
        <section className="settings-section"><div className="settings-section-title"><span>{tx('settings.appearance', 'Appearance').toUpperCase()}</span><small>{tx('settings.appearanceDesc', 'Your space, your way.')}</small></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.theme', 'Theme')}</strong><small>{tx('settings.themeDesc', 'Choose how Noto looks.')}</small></div><div className="theme-picker">
            <button className={preferences.theme === 'light' ? 'selected' : ''} type="button" onClick={() => onChange('theme', 'light')}><Sun size={15} />{tx('settings.themeLight', 'Light')}</button>
            <button className={preferences.theme === 'dark' ? 'selected' : ''} type="button" onClick={() => onChange('theme', 'dark')}><Moon size={15} />{tx('settings.themeDark', 'Dark')}</button>
          </div></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.accent', 'Accent color')}</strong><small>{tx('settings.accentDesc', 'Color highlights across the interface.')}</small></div><div className="accent-picker" role="radiogroup" aria-label={tx('settings.accent', 'Accent color')}>
            {accents.map((accent) => <button className={`accent-swatch accent-${accent.value} ${preferences.accent === accent.value ? 'selected' : ''}`} key={accent.value} type="button" role="radio" aria-checked={preferences.accent === accent.value} title={accent.label} aria-label={accent.label} onClick={() => onChange('accent', accent.value)} />)}
          </div></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.textSize', 'Text size')}</strong><small>{tx('settings.textSizeDesc', 'Reading comfort.')}</small></div><div className="select-wrap"><select value={preferences.textSize} aria-label={tx('settings.textSize', 'Text size')} onChange={(event) => onChange('textSize', Number(event.target.value))}><option value={14}>{preferences.language === 'fr' ? 'Compacte' : 'Compact'}</option><option value={16}>Standard</option><option value={18}>{preferences.language === 'fr' ? 'Confortable' : 'Comfortable'}</option><option value={20}>{preferences.language === 'fr' ? 'Grande' : 'Large'}</option></select><ChevronDown size={14} /></div></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.language', 'Language')}</strong><small>{tx('settings.languageDesc', 'Choose the interface language.')}</small></div><div className="select-wrap"><select value={preferences.language} aria-label={tx('settings.language', 'Language')} onChange={(event) => onChange('language', event.target.value as Preferences['language'])}><option value="fr">{tx('settings.languageFr', 'Français')}</option><option value="en">{tx('settings.languageEn', 'English')}</option></select><ChevronDown size={14} /></div></div>
        </section>
        <section className="settings-section"><div className="settings-section-title"><span>{tx('settings.workspace', 'Workspace').toUpperCase()}</span><small>{tx('settings.workspaceDesc', 'Configure panels and toolbar.')}</small></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.compactToolbar', 'Compact toolbar')}</strong><small>{tx('settings.compactToolbarDesc', 'Hide labels to save space.')}</small></div><button className={`toggle ${preferences.compactToolbar ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.compactToolbar} onClick={() => onChange('compactToolbar', !preferences.compactToolbar)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.sidebarCollapsed', 'Compact sidebar')}</strong><small>{tx('settings.sidebarCollapsedDesc', 'Collapse navigation panel.')}</small></div><button className={`toggle ${preferences.sidebarCollapsed ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.sidebarCollapsed} onClick={() => onChange('sidebarCollapsed', !preferences.sidebarCollapsed)}><i /></button></div>
          <div className="toolbar-customization"><div className="toolbar-customization-heading"><div><strong>{tx('settings.toolbarCommands', 'Toolbar commands')}</strong><small>{tx('settings.toolbarCommandsDesc', 'Hide or reorder them.')}</small></div><span>{preferences.language === 'fr' ? 'ORDRE' : 'ORDER'}</span></div>
            {orderedActions.map((action, index) => {
              const visible = !preferences.hiddenToolbarActions.includes(action);
              return <div className={`toolbar-preference-row ${visible ? '' : 'muted'}`} key={action}>
                <div className="toolbar-order-controls"><button type="button" title={preferences.language === 'fr' ? 'Monter' : 'Move up'} aria-label={`${preferences.language === 'fr' ? 'Monter' : 'Move up'} ${toolbarLabels[action]}`} disabled={index === 0} onClick={() => onMoveToolbar(action, -1)}><ArrowUp size={13} /></button><button type="button" title={preferences.language === 'fr' ? 'Descendre' : 'Move down'} aria-label={`${preferences.language === 'fr' ? 'Descendre' : 'Move down'} ${toolbarLabels[action]}`} disabled={index === orderedActions.length - 1} onClick={() => onMoveToolbar(action, 1)}><ArrowDown size={13} /></button></div>
                <span className="toolbar-preference-icon">{toolbarIcons[action]}</span><span className="toolbar-preference-name">{toolbarLabels[action]}</span>
                <button className={`toggle ${visible ? 'on' : ''}`} type="button" role="switch" aria-checked={visible} aria-label={`${preferences.language === 'fr' ? (visible ? 'Masquer' : 'Afficher') : (visible ? 'Hide' : 'Show')} ${toolbarLabels[action]}`} onClick={() => onToggleToolbar(action)}><i /></button>
              </div>;
            })}
          </div>
        </section>
        <section className="settings-section"><div className="settings-section-title"><span>{tx('settings.editor', 'Editor').toUpperCase()}</span><small>{tx('settings.editorDesc', 'Options for quick edits.')}</small></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.editorFont', 'Editor font')}</strong><small>{tx('settings.editorFontDesc', 'Monospace font size.')}</small></div><div className="select-wrap"><select value={preferences.editorSize} onChange={(event) => onChange('editorSize', Number(event.target.value))}><option value={12}>12 px</option><option value={14}>14 px</option><option value={16}>16 px</option><option value={18}>18 px</option><option value={20}>20 px</option></select><ChevronDown size={14} /></div></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.lineNumbers', 'Line numbers')}</strong><small>{tx('settings.lineNumbersDesc', 'Find your way in the file.')}</small></div><button className={`toggle ${preferences.lineNumbers ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.lineNumbers} onClick={() => onChange('lineNumbers', !preferences.lineNumbers)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.wordWrap', 'Word wrap')}</strong><small>{tx('settings.wordWrapDesc', 'Wrap long lines.')}</small></div><button className={`toggle ${preferences.wordWrap ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.wordWrap} onClick={() => onChange('wordWrap', !preferences.wordWrap)}><i /></button></div>
        </section>
        <section className="settings-section"><div className="settings-section-title"><span>{tx('settings.windows', 'Windows & Associations').toUpperCase()}</span><small>{tx('settings.windowsDesc', 'Stay in control of default apps.')}</small></div>
          <div className="setting-row windows-defaults-row"><div className="setting-label"><strong>{tx('settings.defaultApps', 'Default apps')}</strong><small>{tx('settings.defaultAppsDesc', 'Windows lets you choose without silent replacement.')}</small></div><button className="subtle-button" type="button" disabled={!isTauri()} onClick={onOpenWindowsDefaults}><Globe2 size={14} />{tx('settings.openWindowsSettings', 'Open Windows Settings')}</button></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.immersive', 'Open in immersive from Windows')}</strong><small>{tx('settings.immersiveDesc', 'Open an associated file without navigation.')}</small></div><button className={`toggle ${preferences.immersiveOnFileOpen ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.immersiveOnFileOpen} onClick={() => onChange('immersiveOnFileOpen', !preferences.immersiveOnFileOpen)}><i /></button></div>
          <div className="integration-format-list" aria-label={preferences.language === 'fr' ? 'Formats déclarés par Noto' : 'Formats supported by Noto'}><span><strong>{preferences.language === 'fr' ? 'Texte & code' : 'Text & code'}</strong><small>TXT · MD · JSON · JS · CSS · YAML…</small></span><span><strong>{preferences.language === 'fr' ? 'Lecture' : 'Reading'}</strong><small>PDF · images · EPUB</small></span><span><strong>{preferences.language === 'fr' ? 'Données & documents' : 'Data & documents'}</strong><small>CSV · TSV · DOCX · ODT · PPTX · ODP</small></span></div>
          <div className="settings-inline-note"><ShieldCheck size={14} />{preferences.language === 'fr' ? 'Noto ne modifie pas les applications par défaut sans votre accord. Les préférences se gèrent dans Windows.' : 'Noto never changes default apps without your permission. Manage preferences in Windows.'}</div>
        </section>
        <section className="settings-section settings-general"><div className="settings-section-title"><span>{tx('settings.general', 'General').toUpperCase()}</span></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.updates', 'Updates')}</strong><small>{preferences.language === 'fr' ? 'Vérifiez manuellement la dernière version stable. Seules les métadonnées publiques de version sont demandées ; aucun document n’est transmis.' : 'Manually check the latest stable version. Only public release metadata is requested; no document is sent.'}</small></div><button className="subtle-button" type="button" disabled={checkingUpdates} onClick={() => void checkUpdates()}><RotateCcw size={13} className={checkingUpdates ? 'spin' : ''} />{checkingUpdates ? (preferences.language === 'fr' ? 'Vérification…' : 'Checking…') : tx('settings.checkUpdates', 'Check for updates')}</button></div>
          {updateInfo && <div className={`update-check-result ${updateInfo.isNewer ? 'available' : ''}`} role="status"><span>{updateInfo.isNewer ? `${tx('settings.updateAvailable', 'An update is available')} · v${updateInfo.latestVersion}` : `${tx('settings.upToDate', 'Noto is up to date')} · v${updateInfo.currentVersion}`}</span>{updateInfo.isNewer && <button className="text-link" type="button" onClick={onOpenReleasePage}>{preferences.language === 'fr' ? 'Télécharger' : 'Download'} <span>→</span></button>}</div>}
          {updateError && <div className="update-check-error" role="status">{updateError}</div>}
          <div className="setting-row backup-setting-row"><div className="setting-label"><strong>{tx('settings.backup', 'Local backup')}</strong><small>{tx('settings.backupDesc', 'Export or import groups and settings; paths included, never file contents.')}</small></div><div className="backup-buttons"><button className="subtle-button" type="button" onClick={onExportBackup}><Download size={13} />{tx('settings.export', 'Export')}</button><button className="subtle-button" type="button" onClick={() => backupInputRef.current?.click()}><Upload size={13} />{tx('settings.import', 'Import')}</button><input ref={backupInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImportBackup(file); }} aria-label={preferences.language === 'fr' ? 'Choisir une sauvegarde Noto à importer' : 'Choose a Noto backup to import'} /></div></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.restoreSession', 'Restore desktop session')}</strong><small>{tx('settings.restoreSessionDesc', 'Keep open tab paths on this device without storing content.')}</small></div><button className={`toggle ${preferences.restoreSession ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.restoreSession} onClick={() => onChange('restoreSession', !preferences.restoreSession)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.draftRecovery', 'Local draft recovery')}</strong><small>{tx('settings.draftRecoveryDesc', 'Save unsaved text edits locally. Off by default; turning it off clears drafts after confirmation.')}</small></div><button className={`toggle ${preferences.draftRecoveryEnabled ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.draftRecoveryEnabled} onClick={() => onChange('draftRecoveryEnabled', !preferences.draftRecoveryEnabled)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.draftRetention', 'Draft retention')}</strong><small>{tx('settings.draftRetentionDesc', 'Older drafts are removed on next access.')}</small></div><div className="draft-retention-actions"><div className="select-wrap"><select disabled={!preferences.draftRecoveryEnabled} value={preferences.draftRetentionDays} onChange={(event) => onChange('draftRetentionDays', Number(event.target.value) as Preferences['draftRetentionDays'])}><option value={1}>{preferences.language === 'fr' ? '1 jour' : '1 day'}</option><option value={7}>{preferences.language === 'fr' ? '7 jours' : '7 days'}</option><option value={30}>{preferences.language === 'fr' ? '30 jours' : '30 days'}</option></select><ChevronDown size={14} /></div><button className="subtle-button" type="button" onClick={onClearDrafts}><Trash2 size={13} />{tx('settings.clear', 'Clear')}</button></div></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.recentLimit', 'Recent files limit')}</strong><small>{tx('settings.recentLimitDesc', 'Local limit for the recents list.')}</small></div><div className="select-wrap"><select value={preferences.recentLimit} onChange={(event) => onChange('recentLimit', Number(event.target.value) as Preferences['recentLimit'])}><option value={4}>4</option><option value={8}>8</option><option value={12}>12</option><option value={20}>20</option></select><ChevronDown size={14} /></div></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.hidePaths', 'Hide paths')}</strong><small>{tx('settings.hidePathsDesc', 'Replace visible paths with a discreet label.')}</small></div><button className={`toggle ${preferences.hidePaths ? 'on' : ''}`} type="button" role="switch" aria-checked={preferences.hidePaths} onClick={() => onChange('hidePaths', !preferences.hidePaths)}><i /></button></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.localHistory', 'Local history')}</strong><small>{tx('settings.localHistoryDesc', 'Clear the recent files list.')}</small></div><button className="subtle-button" type="button" onClick={onClearRecents}><RotateCcw size={14} />{tx('settings.clear', 'Clear')}</button></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.shortcuts', 'Keyboard shortcuts')}</strong><small>{tx('settings.shortcutsDesc', 'Show the quick commands list.')}</small></div><button className="subtle-button" type="button" onClick={onOpenShortcuts}><Keyboard size={14} />{tx('settings.view', 'View')}</button></div>
          <div className="setting-row"><div className="setting-label"><strong>{tx('settings.reset', 'Settings')}</strong><small>{tx('settings.resetDesc', 'Restore the default visual and editor settings.')}</small></div><button className="subtle-button" type="button" onClick={onResetDefaults}><RotateCcw size={14} />{tx('settings.resetAll', 'Restore all')}</button></div>
        </section>
        <LocalSearchPanel language={preferences.language} hidePaths={preferences.hidePaths} onOpenFile={onOpenIndexedResult} />
        <section className="settings-section settings-thanks"><div className="settings-section-title"><span>{tx('settings.thanks', 'Thanks').toUpperCase()}</span></div>
          <div className="thanks-card"><span className="thanks-icon" aria-hidden="true"><Heart size={16} /></span><div className="thanks-copy"><strong>{tx('settings.thanksTitle', 'Noto by Louxos')}</strong><p>{tx('settings.thanksText', 'Noto is imagined and developed by Louis — Louxos, founder of Louxos Corporation, with the Louxos Corporation collective.')}</p><div className="thanks-links"><a href="https://louxos-corporation.netlify.app" target="_blank" rel="noreferrer">{tx('settings.thanksLink', 'louxos-corporation.netlify.app')}</a><span aria-hidden="true">·</span><a href="https://louxos-corporation.netlify.app/#equipe" target="_blank" rel="noreferrer">{tx('settings.thanksTeam', 'Meet the team')}</a></div></div></div>
        </section>
        <div className="settings-privacy"><ShieldCheck size={15} /><span>{tx('settings.privacy', 'Your documents stay on this device.')}</span></div>
      </div>
      <footer className="settings-footer"><span>Noto <i>·</i> {tx('settings.version', 'Version')} {APP_VERSION}</span><button className="secondary-button" type="button" onClick={onClose}>{tx('settings.done', 'Done')}</button></footer>
    </section>
  </div>;
}
