import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  BookOpenText, Check, ChevronDown, ChevronRight, CircleHelp, FilePlus2, FolderOpen, FolderPlus,
  LoaderCircle, MoreHorizontal, NotebookPen, Pencil, Plus, Search, ShieldCheck,
  Trash2, X,
} from 'lucide-react';
import { NotebookEditor, type NotebookAttachment, type NotebookFileReference } from './NotebookEditor';
import {
  addPage,
  addSection,
  createPageRecord,
  createSectionRecord,
  normalizeNotebookManifest,
  removeNotebookPageTree,
  removeNotebookSection,
  renameNotebookPage,
  renameNotebookSection,
  safeNotebookTitle,
  type NotebookManifest,
  type NotebookPage,
  type NotebookReference,
  type NotebookSection,
} from '../lib/notebookModel';
import {
  ACTIVE_NOTEBOOK_KEY,
  copyFileIntoNotebook,
  createNotebookInFolder,
  createNotebookSectionFolder,
  initializeNotebookFolder,
  joinNotebookPath,
  loadNotebookReferences,
  notebookPathName,
  persistNotebookManifest,
  readNotebookAttachment,
  readNotebookFolder,
  readNotebookPage,
  removeNotebookPageAttachments,
  removeNotebookPageFile,
  removeNotebookReference,
  saveNotebookReferences,
  upsertNotebookReference,
  writeNotebookPage,
} from '../lib/notebooks';
import { mimeTypeFor } from '../lib/fileTypes';

interface ActiveNotebook {
  path: string;
  manifest: NotebookManifest;
}

type NameDialog = {
  kind: 'notebook' | 'section' | 'page' | 'subpage' | 'rename-page' | 'rename-section';
  title: string;
  value: string;
  sectionId?: string;
  parentId?: string | null;
  itemId?: string;
};

type DeleteDialog =
  | { kind: 'page'; pageId: string }
  | { kind: 'section'; sectionId: string };

function makeObjectUrl(bytes: Uint8Array, mimeType: string): string {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

function attachmentPaths(markdown: string, pageId: string): string[] {
  const safeId = pageId.replace(/[^a-zA-Z0-9-]/g, '');
  const expression = new RegExp(`\\((?:\\.\\/)?(attachments/${safeId}/[^\\s)]+)\\)`, 'g');
  return [...new Set([...markdown.matchAll(expression)].map((match) => match[1] ?? '').filter(Boolean))];
}

function pagesForSection(manifest: NotebookManifest, sectionId: string): NotebookPage[] {
  return manifest.pages.filter((page) => page.sectionId === sectionId);
}

function filteredPagesForSection(manifest: NotebookManifest, section: NotebookSection, search: string): NotebookPage[] {
  const pages = pagesForSection(manifest, section.id);
  const query = search.trim().toLocaleLowerCase('fr-FR');
  if (!query || section.title.toLocaleLowerCase('fr-FR').includes(query)) return pages;
  const byId = new Map(pages.map((page) => [page.id, page]));
  const visibleIds = new Set<string>();
  for (const page of pages) {
    if (!page.title.toLocaleLowerCase('fr-FR').includes(query)) continue;
    let current: NotebookPage | undefined = page;
    while (current && !visibleIds.has(current.id)) {
      visibleIds.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return pages.filter((page) => visibleIds.has(page.id));
}

function pageChildren(pages: NotebookPage[], parentId: string | null): NotebookPage[] {
  return pages.filter((page) => page.parentId === parentId).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'fr'));
}

export function NotebookScreen({ onOpenFilePath, hidePaths = false }: { onOpenFilePath: (path: string) => void; hidePaths?: boolean }) {
  const [library, setLibrary] = useState<NotebookReference[]>(() => loadNotebookReferences());
  const libraryRef = useRef(library);
  const [activeNotebook, setActiveNotebook] = useState<ActiveNotebook | null>(null);
  const activeNotebookRef = useRef<ActiveNotebook | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState('');
  const pageContentRef = useRef('');
  const savedContentRef = useRef('');
  const pageContextRef = useRef<{ rootPath: string; page: NotebookPage } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const assetUrlsRef = useRef<Record<string, string>>({});
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [notebookParentPath, setNotebookParentPath] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | null>(null);
  const [contextNotebookMenu, setContextNotebookMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const activePage = activeNotebook?.manifest.pages.find((page) => page.id === selectedPageId) ?? null;
  const activeSection = activeNotebook?.manifest.sections.find((section) => section.id === (activePage?.sectionId ?? selectedSectionId)) ?? null;
  const isDesktop = isTauri();

  useEffect(() => { libraryRef.current = library; }, [library]);
  useEffect(() => { activeNotebookRef.current = activeNotebook; }, [activeNotebook]);
  useEffect(() => {
    if (!contextNotebookMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.notebook-context-menu-floating, .notebook-row-menu')) setContextNotebookMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setContextNotebookMenu(null); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextNotebookMenu]);

  const updateLibrary = useCallback((next: NotebookReference[]) => {
    libraryRef.current = next;
    setLibrary(next);
    saveNotebookReferences(next);
  }, []);

  const replaceAssetUrls = useCallback((next: Record<string, string>) => {
    const old = assetUrlsRef.current;
    for (const [key, url] of Object.entries(old)) if (next[key] !== url) URL.revokeObjectURL(url);
    assetUrlsRef.current = next;
    setAssetUrls(next);
  }, []);

  const enqueueWrite = useCallback((rootPath: string, page: NotebookPage, content: string): Promise<void> => {
    const job = () => writeNotebookPage(rootPath, page, content);
    writeQueueRef.current = writeQueueRef.current.then(job, job);
    return writeQueueRef.current;
  }, []);

  const flushPageSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const context = pageContextRef.current;
    const content = pageContentRef.current;
    if (!context || content === savedContentRef.current) return;
    setSaveState('saving');
    try {
      await enqueueWrite(context.rootPath, context.page, content);
      savedContentRef.current = content;
      setSaveState('saved');
    } catch (saveError) {
      setSaveState('error');
      throw saveError;
    }
  }, [enqueueWrite]);

  const loadPage = useCallback(async (notebook: ActiveNotebook, page: NotebookPage) => {
    await flushPageSave();
    setLoading(true);
    setError('');
    try {
      const content = await readNotebookPage(notebook.path, page);
      const nextAssets: Record<string, string> = {};
      for (const relativePath of attachmentPaths(content, page.id)) {
        try {
          const bytes = await readNotebookAttachment(notebook.path, page.id, relativePath);
          nextAssets[relativePath] = makeObjectUrl(bytes, mimeTypeFor(relativePath));
        } catch { /* Missing attachments remain visible as a safe placeholder. */ }
      }
      replaceAssetUrls(nextAssets);
      pageContextRef.current = { rootPath: notebook.path, page };
      pageContentRef.current = content;
      savedContentRef.current = content;
      setPageContent(content);
      setSelectedSectionId(page.sectionId);
      setSelectedPageId(page.id);
      setSaveState('saved');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible d’ouvrir cette page.');
    } finally {
      setLoading(false);
    }
  }, [flushPageSave, replaceAssetUrls]);

  const activateNotebook = useCallback(async (reference: NotebookReference) => {
    if (activeNotebookRef.current?.path === reference.path) return;
    try {
      await flushPageSave();
      setLoading(true);
      setError('');
      const manifest = await readNotebookFolder(reference.path);
      if (!manifest) {
        setError('Ce dossier n’est pas encore un carnet Noto. Ouvrez-le à nouveau pour l’initialiser.');
        return;
      }
      const loaded: ActiveNotebook = { path: reference.path, manifest };
      setActiveNotebook(loaded);
      activeNotebookRef.current = loaded;
      try { localStorage.setItem(ACTIVE_NOTEBOOK_KEY, manifest.id); } catch { /* Folder access must work even when browser storage is unavailable. */ }
      updateLibrary(upsertNotebookReference(libraryRef.current, manifest, reference.path));
      setSelectedPageId(null);
      setSelectedSectionId(manifest.sections[0]?.id ?? null);
      pageContextRef.current = null;
      pageContentRef.current = '';
      savedContentRef.current = '';
      setPageContent('');
      replaceAssetUrls({});
      const firstPage = manifest.pages.slice().sort((a, b) => a.order - b.order).at(0);
      if (firstPage) await loadPage(loaded, firstPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible d’ouvrir ce carnet. Vérifiez que son dossier est accessible.');
    } finally {
      setLoading(false);
    }
  }, [flushPageSave, loadPage, replaceAssetUrls, updateLibrary]);

  useEffect(() => {
    if (!isDesktop || !library.length) return;
    let activeId: string | null = null;
    try { activeId = localStorage.getItem(ACTIVE_NOTEBOOK_KEY); } catch { /* The first saved folder is a safe local fallback. */ }
    const selected = library.find((reference) => reference.id === activeId) ?? library[0];
    if (selected) void activateNotebook(selected);
    // The selected folder has previously been explicitly chosen by the user and only its path is remembered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      const context = pageContextRef.current;
      const content = pageContentRef.current;
      if (context && content !== savedContentRef.current) void enqueueWrite(context.rootPath, context.page, content).catch(() => undefined);
    }
    for (const url of Object.values(assetUrlsRef.current)) URL.revokeObjectURL(url);
  }, [enqueueWrite]);

  const commitManifest = useCallback(async (next: NotebookManifest) => {
    const current = activeNotebookRef.current;
    if (!current) throw new Error('Aucun carnet n’est ouvert.');
    const normalized = normalizeNotebookManifest(next);
    await persistNotebookManifest(current.path, normalized);
    const updated = { ...current, manifest: normalized };
    activeNotebookRef.current = updated;
    setActiveNotebook(updated);
    updateLibrary(upsertNotebookReference(libraryRef.current, normalized, current.path));
    return updated;
  }, [updateLibrary]);

  const handleCreateNotebook = useCallback(async (name: string) => {
    if (!notebookParentPath) throw new Error('Choisissez d’abord l’emplacement où créer le carnet.');
    setLoading(true);
    setError('');
    try {
      await flushPageSave();
      const created = await createNotebookInFolder(notebookParentPath, name);
      const reference = { id: created.manifest.id, name: created.manifest.name, path: created.rootPath, lastOpened: Date.now() };
      updateLibrary(upsertNotebookReference(libraryRef.current, created.manifest, created.rootPath));
      setNotebookParentPath('');
      setNameDialog(null);
      await activateNotebook(reference);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Impossible de créer le carnet.');
    } finally {
      setLoading(false);
    }
  }, [activateNotebook, flushPageSave, notebookParentPath, updateLibrary]);

  const handleOpenNotebookFolder = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Ouvrir un carnet Noto' });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path !== 'string') return;
      setLoading(true);
      setError('');
      let manifest = await readNotebookFolder(path);
      if (!manifest) {
        const folderName = notebookPathName(path);
        const initialize = window.confirm(`« ${folderName} » ne contient pas encore de carnet Noto.\n\nInitialiser ce dossier ? Noto ajoutera son fichier de métadonnées et des sous-dossiers sans modifier les autres fichiers présents.`);
        if (!initialize) return;
        manifest = await initializeNotebookFolder(path);
      }
      const reference = { id: manifest.id, name: manifest.name, path, lastOpened: Date.now() };
      updateLibrary(upsertNotebookReference(libraryRef.current, manifest, path));
      await activateNotebook(reference);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Impossible d’ouvrir ce dossier comme carnet.');
    } finally {
      setLoading(false);
    }
  }, [activateNotebook, isDesktop, updateLibrary]);

  const chooseNotebookParent = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Choisir où créer le carnet' });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path === 'string') setNotebookParentPath(path);
    } catch (pickerError) {
      setError(pickerError instanceof Error ? pickerError.message : 'Impossible de choisir ce dossier.');
    }
  }, []);

  const handleNameSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nameDialog) return;
    const title = safeNotebookTitle(nameDialog.value);
    if (!title) { setError('Saisissez un nom ou un titre.'); return; }
    if (nameDialog.kind === 'notebook') {
      await handleCreateNotebook(title);
      return;
    }
    const current = activeNotebookRef.current;
    if (!current) return;
    setLoading(true);
    setError('');
    try {
      await flushPageSave();
      if (nameDialog.kind === 'section') {
        const section = createSectionRecord(title, current.manifest);
        await createNotebookSectionFolder(current.path, section.id);
        const updated = await commitManifest(addSection(current.manifest, section));
        setSelectedSectionId(section.id);
        setSelectedPageId(null);
        pageContextRef.current = null;
        pageContentRef.current = '';
        savedContentRef.current = '';
        setPageContent('');
        replaceAssetUrls({});
        setNameDialog(null);
        void updated;
      } else if (nameDialog.kind === 'page' || nameDialog.kind === 'subpage') {
        const sectionId = nameDialog.sectionId ?? selectedSectionId ?? current.manifest.sections[0]?.id;
        if (!sectionId) throw new Error('Créez d’abord une section dans ce carnet.');
        const page = createPageRecord(title, current.manifest, sectionId, nameDialog.parentId ?? null);
        await writeNotebookPage(current.path, page, '');
        try { await commitManifest(addPage(current.manifest, page)); }
        catch (manifestError) { await removeNotebookPageFile(current.path, page.relativePath, page.sectionId).catch(() => undefined); throw manifestError; }
        setNameDialog(null);
        await loadPage(activeNotebookRef.current ?? current, page);
      } else if (nameDialog.kind === 'rename-page' && nameDialog.itemId) {
        await commitManifest(renameNotebookPage(current.manifest, nameDialog.itemId, title));
        setNameDialog(null);
      } else if (nameDialog.kind === 'rename-section' && nameDialog.itemId) {
        await commitManifest(renameNotebookSection(current.manifest, nameDialog.itemId, title));
        setNameDialog(null);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer les modifications du carnet.');
    } finally {
      setLoading(false);
    }
  }, [commitManifest, flushPageSave, handleCreateNotebook, loadPage, nameDialog, replaceAssetUrls, selectedSectionId]);

  const handleContentChange = useCallback((value: string) => {
    pageContentRef.current = value;
    setPageContent(value);
    if (value === savedContentRef.current) {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const context = pageContextRef.current;
      if (!context) { setSaveState('saved'); return; }
      setSaveState('saving');
      void enqueueWrite(context.rootPath, context.page, value).then(() => {
        if (pageContextRef.current?.page.id === context.page.id && pageContentRef.current === value) setSaveState('saved');
      }).catch(() => { if (pageContextRef.current?.page.id === context.page.id) setSaveState('error'); });
      return;
    }
    setSaveState('saving');
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    const context = pageContextRef.current;
    if (!context) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void enqueueWrite(context.rootPath, context.page, value).then(() => {
        if (pageContextRef.current?.page.id === context.page.id && pageContentRef.current === value) {
          savedContentRef.current = value;
          setSaveState('saved');
        }
      }).catch(() => { if (pageContextRef.current?.page.id === context.page.id) setSaveState('error'); });
    }, 450);
  }, [enqueueWrite]);

  const createAttachment = useCallback(async (): Promise<NotebookAttachment | null> => {
    const current = activeNotebookRef.current;
    const page = current?.manifest.pages.find((item) => item.id === selectedPageId);
    if (!current || !page) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ multiple: false, title: 'Choisir une image ou une pièce jointe' });
    const sourcePath = Array.isArray(selected) ? selected[0] : selected;
    if (typeof sourcePath !== 'string') return null;
    const attachment = await copyFileIntoNotebook(current.path, page.id, sourcePath);
    const bytes = await readNotebookAttachment(current.path, page.id, attachment.relativePath);
    const url = makeObjectUrl(bytes, mimeTypeFor(attachment.name));
    const next = { ...assetUrlsRef.current, [attachment.relativePath]: url };
    replaceAssetUrls(next);
    return { ...attachment, url };
  }, [replaceAssetUrls, selectedPageId]);

  const chooseFileReference = useCallback(async (): Promise<NotebookFileReference | null> => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ multiple: false, title: 'Choisir un fichier à référencer' });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (typeof path !== 'string') return null;
    await invoke('allow_file_access', { path });
    return { path, name: notebookPathName(path) };
  }, []);

  const openAttachment = useCallback((relativePath: string) => {
    const current = activeNotebookRef.current;
    if (!current) return;
    try { onOpenFilePath(joinNotebookPath(current.path, relativePath)); }
    catch (openError) { setError(openError instanceof Error ? openError.message : 'Impossible d’ouvrir cette pièce jointe.'); }
  }, [onOpenFilePath]);

  const handleDeletePage = useCallback(async (deleteFiles: boolean) => {
    const current = activeNotebookRef.current;
    const target = deleteDialog;
    if (!current || !target || target.kind !== 'page') return;
    try {
      await flushPageSave();
      const result = removeNotebookPageTree(current.manifest, target.pageId);
      await commitManifest(result.manifest);
      if (deleteFiles) {
        for (const page of result.removed) {
          await removeNotebookPageFile(current.path, page.relativePath, page.sectionId);
          await removeNotebookPageAttachments(current.path, page.id);
        }
      }
      if (result.removed.some((page) => page.id === selectedPageId)) {
        pageContextRef.current = null;
        pageContentRef.current = '';
        savedContentRef.current = '';
        setPageContent('');
        setSelectedPageId(null);
        replaceAssetUrls({});
      }
      setDeleteDialog(null);
      setError('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Impossible de supprimer cette page.');
    }
  }, [commitManifest, deleteDialog, flushPageSave, replaceAssetUrls, selectedPageId]);

  const handleDeleteSection = useCallback(async (deleteFiles: boolean) => {
    const current = activeNotebookRef.current;
    const target = deleteDialog;
    if (!current || !target || target.kind !== 'section') return;
    try {
      await flushPageSave();
      const result = removeNotebookSection(current.manifest, target.sectionId);
      await commitManifest(result.manifest);
      if (deleteFiles) {
        for (const page of result.removed) {
          await removeNotebookPageFile(current.path, page.relativePath, page.sectionId);
          await removeNotebookPageAttachments(current.path, page.id);
        }
      }
      if (result.removed.some((page) => page.id === selectedPageId)) {
        pageContextRef.current = null;
        pageContentRef.current = '';
        savedContentRef.current = '';
        setPageContent('');
        setSelectedPageId(null);
        replaceAssetUrls({});
      }
      setSelectedSectionId(result.manifest.sections[0]?.id ?? null);
      setDeleteDialog(null);
      setError('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Impossible de supprimer cette section.');
    }
  }, [commitManifest, deleteDialog, flushPageSave, replaceAssetUrls, selectedPageId]);

  const removeFromLibrary = useCallback(async (reference: NotebookReference) => {
    if (!window.confirm(`Retirer « ${reference.name} » de la liste des carnets Noto ?\n\nLe dossier et ses fichiers resteront sur votre ordinateur.`)) return;
    if (activeNotebookRef.current?.manifest.id === reference.id) {
      try { await flushPageSave(); } catch { return; }
      activeNotebookRef.current = null;
      setActiveNotebook(null);
      pageContextRef.current = null;
      pageContentRef.current = '';
      savedContentRef.current = '';
      setPageContent('');
      setSelectedPageId(null);
      replaceAssetUrls({});
      try { localStorage.removeItem(ACTIVE_NOTEBOOK_KEY); } catch { /* No browser-local state is required for notebook files. */ }
    }
    updateLibrary(removeNotebookReference(libraryRef.current, reference.id));
  }, [flushPageSave, replaceAssetUrls, updateLibrary]);

  const toggleSection = (sectionId: string) => setCollapsedSections((current) => {
    const next = new Set(current);
    if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
    return next;
  });

  const filteredSections = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr-FR');
    if (!activeNotebook || !query) return activeNotebook?.manifest.sections ?? [];
    const matches = new Set(activeNotebook.manifest.pages.filter((page) => page.title.toLocaleLowerCase('fr-FR').includes(query)).map((page) => page.sectionId));
    return activeNotebook.manifest.sections.filter((section) => section.title.toLocaleLowerCase('fr-FR').includes(query) || matches.has(section.id));
  }, [activeNotebook, search]);

  const openCreateNotebookDialog = () => {
    setError('');
    setNotebookParentPath('');
    setNameDialog({ kind: 'notebook', title: 'Créer un carnet', value: '' });
  };

  const openNotebookContextMenu = (event: React.MouseEvent, reference: NotebookReference) => {
    event.preventDefault();
    const width = 202;
    const height = 90;
    setContextNotebookMenu({
      id: reference.id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    });
  };

  const toggleNotebookContextMenu = (event: React.MouseEvent<HTMLButtonElement>, reference: NotebookReference) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 202;
    const height = 90;
    setContextNotebookMenu((current) => current?.id === reference.id ? null : {
      id: reference.id,
      x: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(rect.bottom + 3, window.innerHeight - height - 8)),
    });
  };

  const displayedTitle = activePage?.title ?? activeNotebook?.manifest.name ?? 'Vos carnets';
  const pageCount = activeNotebook?.manifest.pages.length ?? 0;
  const contextNotebook = contextNotebookMenu ? library.find((reference) => reference.id === contextNotebookMenu.id) : undefined;

  return <div className="notebook-screen" onClick={() => setContextNotebookMenu(null)} onContextMenu={(event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.notebook-editor-shell')) event.stopPropagation();
  }}>
    <aside className="notebook-library-panel" aria-label="Liste des carnets">
      <header className="notebook-panel-heading"><div><span className="eyebrow">ESPACE PERSONNEL</span><h2>Mes carnets</h2></div><button className="notebook-small-action" type="button" title="Créer un carnet" aria-label="Créer un carnet" disabled={!isDesktop} onClick={openCreateNotebookDialog}><Plus size={16} /></button></header>
      <div className="notebook-library-actions">
        <button className="notebook-library-action" type="button" disabled={!isDesktop} onClick={openCreateNotebookDialog}><FolderPlus size={15} /><span>Nouveau carnet</span></button>
        <button className="notebook-library-action secondary" type="button" disabled={!isDesktop} onClick={() => void handleOpenNotebookFolder()}><FolderOpen size={15} /><span>Ouvrir un dossier…</span></button>
      </div>
      <div className="notebook-library-list">
        {library.map((reference) => <div className={`notebook-library-row ${activeNotebook?.manifest.id === reference.id ? 'active' : ''}`} key={reference.id} onContextMenu={(event) => openNotebookContextMenu(event, reference)}>
          <button type="button" className="notebook-library-select" onClick={() => void activateNotebook(reference)} title={hidePaths ? reference.name : reference.path}>
            <span className="notebook-library-icon"><BookOpenText size={16} /></span>
            <span><strong>{reference.name}</strong><small>{notebookPathName(reference.path)}</small></span>
          </button>
          <button className="notebook-row-menu" type="button" title={`Actions pour ${reference.name}`} aria-label={`Actions pour ${reference.name}`} aria-haspopup="menu" aria-expanded={contextNotebookMenu?.id === reference.id} onClick={(event) => { event.stopPropagation(); toggleNotebookContextMenu(event, reference); }}><MoreHorizontal size={14} /></button>
          <button className="notebook-row-remove" type="button" title={`Retirer ${reference.name} de Noto`} aria-label={`Retirer ${reference.name} de la liste`} onClick={() => void removeFromLibrary(reference)}><X size={13} /></button>
        </div>)}
        {library.length === 0 && <div className="notebook-library-empty">Vos carnets sont des dossiers locaux. Créez-en un ou ouvrez un dossier existant.</div>}
      </div>
      <div className="notebook-library-privacy"><ShieldCheck size={14} /><span>Les pages restent des fichiers sur votre appareil.</span></div>
    </aside>

    <aside className="notebook-outline-panel" aria-label="Sections et pages du carnet">
      {activeNotebook ? <>
        <div className="notebook-outline-heading">
          <div className="notebook-outline-title"><span className="notebook-overline">CARNET</span><strong title={hidePaths ? activeNotebook.manifest.name : activeNotebook.path}>{activeNotebook.manifest.name}</strong><small>{pageCount} page{pageCount === 1 ? '' : 's'}</small></div>
          <button className="notebook-small-action" type="button" title="Nouvelle section" aria-label="Nouvelle section" onClick={() => setNameDialog({ kind: 'section', title: 'Nouvelle section', value: '' })}><Plus size={15} /></button>
        </div>
        <label className="notebook-tree-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Chercher une page" aria-label="Filtrer les sections et pages" /></label>
        <div className="notebook-section-list">
          {filteredSections.map((section) => <NotebookSectionTree
            key={section.id}
            section={section}
            pages={filteredPagesForSection(activeNotebook.manifest, section, search)}
            selectedPageId={selectedPageId}
            collapsed={collapsedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            onSelectSection={() => setSelectedSectionId(section.id)}
            onSelectPage={(page) => { void loadPage(activeNotebook, page); }}
            onAddPage={() => setNameDialog({ kind: 'page', title: 'Nouvelle page', value: '', sectionId: section.id, parentId: null })}
            onAddSubpage={(page) => setNameDialog({ kind: 'subpage', title: 'Nouvelle sous-page', value: '', sectionId: section.id, parentId: page.id })}
            onRenameSection={() => setNameDialog({ kind: 'rename-section', title: 'Renommer la section', value: section.title, itemId: section.id })}
            onDeleteSection={() => setDeleteDialog({ kind: 'section', sectionId: section.id })}
            onRenamePage={(page) => setNameDialog({ kind: 'rename-page', title: 'Renommer la page', value: page.title, itemId: page.id })}
            onDeletePage={(page) => setDeleteDialog({ kind: 'page', pageId: page.id })}
          />)}
          {filteredSections.length === 0 && <div className="notebook-tree-empty">Aucune section ne correspond à la recherche.</div>}
        </div>
        <button className="notebook-add-section" type="button" onClick={() => setNameDialog({ kind: 'section', title: 'Nouvelle section', value: '' })}><Plus size={14} />Ajouter une section</button>
      </> : <div className="notebook-outline-placeholder"><BookOpenText size={19} /><strong>Choisissez un carnet</strong><span>Ses sections et ses pages apparaîtront ici.</span></div>}
    </aside>

    <main className="notebook-page-panel">
      {error && !nameDialog && <div className="notebook-error" role="alert"><CircleHelp size={15} /><span>{error}</span><button type="button" aria-label="Fermer le message" onClick={() => setError('')}><X size={13} /></button></div>}
      {loading && <div className="notebook-loading"><LoaderCircle size={17} className="spin" />Chargement du carnet…</div>}
      {activeNotebook && activePage ? <>
        <header className="notebook-page-heading">
          <div className="notebook-breadcrumb"><span>{activeNotebook.manifest.name}</span><ChevronRight size={12} /><span>{activeSection?.title ?? 'Section'}</span></div>
          <div className="notebook-page-title-row"><h2>{displayedTitle}</h2><button className="notebook-small-action" type="button" title="Renommer la page" aria-label="Renommer la page" onClick={() => setNameDialog({ kind: 'rename-page', title: 'Renommer la page', value: activePage.title, itemId: activePage.id })}><Pencil size={14} /></button><button className="notebook-small-action danger" type="button" title="Supprimer la page" aria-label="Supprimer la page" onClick={() => setDeleteDialog({ kind: 'page', pageId: activePage.id })}><Trash2 size={14} /></button></div>
          <span className="notebook-page-file">{activePage.relativePath}</span>
        </header>
        <NotebookEditor
          pageId={activePage.id}
          value={pageContent}
          assetUrls={assetUrls}
          saveState={saveState}
          onChange={handleContentChange}
          onAttachFile={createAttachment}
          onChooseFile={chooseFileReference}
          onOpenFile={onOpenFilePath}
          onOpenAttachment={openAttachment}
        />
      </> : activeNotebook ? <div className="notebook-welcome">
        <div className="notebook-welcome-icon"><NotebookPen size={23} /></div>
        <span className="eyebrow">{activeNotebook.manifest.name.toLocaleUpperCase('fr-FR')}</span>
        <h2>Un carnet, à votre façon.</h2>
        <p>Créez des sections, des pages et des sous-pages. Chaque page est enregistrée comme fichier Markdown dans ce dossier local.</p>
        <div className="notebook-welcome-actions"><button className="primary-button" type="button" onClick={() => setNameDialog({ kind: 'page', title: 'Nouvelle page', value: '', sectionId: selectedSectionId ?? activeNotebook.manifest.sections[0]?.id, parentId: null })}><Plus size={15} />Nouvelle page</button><button className="secondary-button" type="button" onClick={() => setNameDialog({ kind: 'section', title: 'Nouvelle section', value: '' })}><Plus size={15} />Nouvelle section</button></div>
      </div> : <div className="notebook-welcome">
        <div className="notebook-welcome-icon"><BookOpenText size={23} /></div>
        <span className="eyebrow">NOTES LOCALES</span>
        <h2>Un endroit pour vos idées.</h2>
        <p>Un carnet est un dossier sur votre ordinateur. Ses pages restent des fichiers Markdown que vous pouvez retrouver et utiliser hors de Noto.</p>
        <div className="notebook-welcome-actions"><button className="primary-button" type="button" disabled={!isDesktop} onClick={openCreateNotebookDialog}><FolderPlus size={15} />Créer un carnet</button><button className="secondary-button" type="button" disabled={!isDesktop} onClick={() => void handleOpenNotebookFolder()}><FolderOpen size={15} />Ouvrir un dossier…</button></div>
        {!isDesktop && <div className="notebook-browser-note"><CircleHelp size={14} />La gestion de dossiers de carnets nécessite l’application de bureau Noto.</div>}
      </div>}
    </main>

    {contextNotebookMenu && contextNotebook && <div className="notebook-context-menu notebook-context-menu-floating" role="menu" style={{ left: contextNotebookMenu.x, top: contextNotebookMenu.y }} onClick={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={() => { setContextNotebookMenu(null); void activateNotebook(contextNotebook); }}><BookOpenText size={13} />Ouvrir ce carnet</button>
      <button type="button" className="danger" role="menuitem" onClick={() => { setContextNotebookMenu(null); void removeFromLibrary(contextNotebook); }}><X size={13} />Retirer de la liste…</button>
    </div>}
    {nameDialog && <NotebookNameDialog
      dialog={nameDialog}
      parentPath={notebookParentPath}
      hidePaths={hidePaths}
      onParentChoose={() => void chooseNotebookParent()}
      onChange={(value) => setNameDialog((current) => current ? { ...current, value } : current)}
      onClose={() => { setNameDialog(null); setNotebookParentPath(''); }}
      onSubmit={(event) => void handleNameSubmit(event)}
      error={error}
    />}
    {deleteDialog && activeNotebook && <NotebookDeleteDialog
      title={deleteDialog.kind === 'page'
        ? `Supprimer « ${activeNotebook.manifest.pages.find((page) => page.id === deleteDialog.pageId)?.title ?? 'la page'} » ?`
        : `Supprimer la section « ${activeNotebook.manifest.sections.find((section) => section.id === deleteDialog.sectionId)?.title ?? ''} » ?`}
      description={deleteDialog.kind === 'page'
        ? 'Cette action concerne aussi les sous-pages. Choisissez si les fichiers Markdown et les pièces jointes doivent rester dans le dossier du carnet.'
        : 'Choisissez si les fichiers Markdown et les pièces jointes de cette section doivent rester dans le dossier du carnet.'}
      onKeepFiles={() => void (deleteDialog.kind === 'page' ? handleDeletePage(false) : handleDeleteSection(false))}
      onDeleteFiles={() => void (deleteDialog.kind === 'page' ? handleDeletePage(true) : handleDeleteSection(true))}
      onClose={() => setDeleteDialog(null)}
    />}
  </div>;
}

function NotebookSectionTree({
  section, pages, selectedPageId, collapsed, onToggle, onSelectSection, onSelectPage, onAddPage, onAddSubpage, onRenameSection, onDeleteSection, onRenamePage, onDeletePage,
}: {
  section: NotebookSection;
  pages: NotebookPage[];
  selectedPageId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onSelectSection: () => void;
  onSelectPage: (page: NotebookPage) => void;
  onAddPage: () => void;
  onAddSubpage: (page: NotebookPage) => void;
  onRenameSection: () => void;
  onDeleteSection: () => void;
  onRenamePage: (page: NotebookPage) => void;
  onDeletePage: (page: NotebookPage) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => { if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) setMenuOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [menuOpen]);
  return <section className="notebook-section-tree">
    <div className="notebook-section-row" onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true); }}>
      <button className="notebook-section-title" type="button" onClick={() => { onToggle(); onSelectSection(); }}>
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<span>{section.title}</span><small>{pages.length}</small>
      </button>
      <button className="notebook-tree-action" type="button" title="Créer une page dans cette section" aria-label={`Créer une page dans ${section.title}`} onClick={onAddPage}><Plus size={13} /></button>
      <div className="notebook-more-wrap" ref={menuRef}><button className="notebook-tree-action" type="button" title="Actions de section" aria-label={`Actions pour ${section.title}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}><MoreHorizontal size={14} /></button>
        {menuOpen && <div className="notebook-context-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onRenameSection(); }}><Pencil size={13} />Renommer</button><button type="button" className="danger" role="menuitem" onClick={() => { setMenuOpen(false); onDeleteSection(); }}><Trash2 size={13} />Supprimer…</button></div>}
      </div>
    </div>
    {!collapsed && <div className="notebook-page-tree"><PageTree pages={pages} parentId={null} depth={0} selectedPageId={selectedPageId} onSelectPage={onSelectPage} onAddSubpage={onAddSubpage} onRenamePage={onRenamePage} onDeletePage={onDeletePage} />
      {pages.length === 0 && <button className="notebook-tree-empty-action" type="button" onClick={onAddPage}>Créer la première page</button>}
    </div>}
  </section>;
}

function PageTree({ pages, parentId, depth, selectedPageId, onSelectPage, onAddSubpage, onRenamePage, onDeletePage }: {
  pages: NotebookPage[];
  parentId: string | null;
  depth: number;
  selectedPageId: string | null;
  onSelectPage: (page: NotebookPage) => void;
  onAddSubpage: (page: NotebookPage) => void;
  onRenamePage: (page: NotebookPage) => void;
  onDeletePage: (page: NotebookPage) => void;
}) {
  const children = pageChildren(pages, parentId);
  return <>
    {children.map((page) => <PageTreeItem
      key={page.id}
      page={page}
      pages={pages}
      depth={depth}
      selectedPageId={selectedPageId}
      selected={selectedPageId === page.id}
      onSelectPage={onSelectPage}
      onAddSubpage={onAddSubpage}
      onRenamePage={onRenamePage}
      onDeletePage={onDeletePage}
    />)}
  </>;
}

function PageTreeItem({ page, pages, depth, selectedPageId, selected, onSelectPage, onAddSubpage, onRenamePage, onDeletePage }: {
  page: NotebookPage;
  pages: NotebookPage[];
  depth: number;
  selectedPageId: string | null;
  selected: boolean;
  onSelectPage: (page: NotebookPage) => void;
  onAddSubpage: (page: NotebookPage) => void;
  onRenamePage: (page: NotebookPage) => void;
  onDeletePage: (page: NotebookPage) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => { if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) setMenuOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [menuOpen]);
  const hasChildren = pageChildren(pages, page.id).length > 0;
  return <div className="notebook-page-tree-item">
    <div className={`notebook-page-row ${selected ? 'selected' : ''}`} style={{ '--tree-depth': depth } as CSSProperties} onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true); }}>
      {hasChildren ? <button className="notebook-page-expand" type="button" aria-label={`${expanded ? 'Réduire' : 'Déployer'} ${page.title}`} onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button> : <span className="notebook-page-expand-placeholder" />}
      <button className="notebook-page-select" type="button" onClick={() => onSelectPage(page)}><FilePlus2 size={14} /><span>{page.title}</span></button>
      <button className="notebook-tree-action page-add-subpage" type="button" title="Créer une sous-page" aria-label={`Créer une sous-page de ${page.title}`} onClick={() => onAddSubpage(page)}><Plus size={12} /></button>
      <div className="notebook-more-wrap" ref={menuRef}><button className="notebook-tree-action" type="button" title="Actions de page" aria-label={`Actions pour ${page.title}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}><MoreHorizontal size={13} /></button>
        {menuOpen && <div className="notebook-context-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onRenamePage(page); }}><Pencil size={13} />Renommer</button><button type="button" className="danger" role="menuitem" onClick={() => { setMenuOpen(false); onDeletePage(page); }}><Trash2 size={13} />Supprimer…</button></div>}
      </div>
    </div>
    {hasChildren && expanded && <PageTree pages={pages} parentId={page.id} depth={depth + 1} selectedPageId={selectedPageId} onSelectPage={onSelectPage} onAddSubpage={onAddSubpage} onRenamePage={onRenamePage} onDeletePage={onDeletePage} />}
  </div>;
}

function NotebookNameDialog({ dialog, parentPath, hidePaths, onParentChoose, onChange, onClose, onSubmit, error }: {
  dialog: NameDialog;
  parentPath: string;
  hidePaths: boolean;
  onParentChoose: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return <div className="notebook-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="notebook-modal" role="dialog" aria-modal="true" aria-labelledby="notebook-name-title" onSubmit={onSubmit}>
      <header><span className="notebook-modal-icon"><BookOpenText size={17} /></span><div><h2 id="notebook-name-title">{dialog.title}</h2><p>Les changements sont enregistrés dans les fichiers du carnet.</p></div><button className="notebook-small-action" type="button" aria-label="Fermer" onClick={onClose}><X size={15} /></button></header>
      <label className="notebook-modal-label" htmlFor="notebook-name-input">{dialog.kind === 'notebook' ? 'Nom du carnet' : dialog.kind.includes('section') ? 'Nom de la section' : 'Titre de la page'}</label>
      <input ref={inputRef} id="notebook-name-input" className="notebook-modal-input" value={dialog.value} onChange={(event) => onChange(event.target.value)} maxLength={100} required />
      {dialog.kind === 'notebook' && <div className="notebook-folder-picker-row"><div><strong>Dossier parent</strong><small>{parentPath ? hidePaths ? notebookPathName(parentPath) : parentPath : 'Choisissez où créer le dossier du carnet.'}</small></div><button className="secondary-button" type="button" onClick={onParentChoose}><FolderOpen size={14} />Parcourir…</button></div>}
      {error && <div className="notebook-modal-error" role="alert">{error}</div>}
      <footer><button className="secondary-button" type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={dialog.kind === 'notebook' && !parentPath}><Check size={14} />{dialog.kind === 'notebook' ? 'Créer le dossier' : 'Enregistrer'}</button></footer>
    </form>
  </div>;
}

function NotebookDeleteDialog({ title, description, onKeepFiles, onDeleteFiles, onClose }: {
  title: string;
  description: string;
  onKeepFiles: () => void;
  onDeleteFiles: () => void;
  onClose: () => void;
}) {
  return <div className="notebook-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="notebook-modal notebook-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="notebook-delete-title">
      <header><span className="notebook-modal-icon danger"><Trash2 size={17} /></span><div><h2 id="notebook-delete-title">{title}</h2><p>{description}</p></div><button className="notebook-small-action" type="button" aria-label="Fermer" onClick={onClose}><X size={15} /></button></header>
      <div className="notebook-delete-choices"><button className="secondary-button" type="button" onClick={onKeepFiles}><FolderOpen size={14} />Retirer du carnet, garder les fichiers</button><button className="notebook-delete-confirm" type="button" onClick={onDeleteFiles}><Trash2 size={14} />Supprimer les fichiers du carnet</button></div>
      <footer><button className="secondary-button" type="button" onClick={onClose}>Annuler</button></footer>
    </section>
  </div>;
}
