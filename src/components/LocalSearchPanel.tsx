import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { ArrowUpRight, FileSearch, FolderOpen, LoaderCircle, RefreshCw, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { scanFolderForIndex, type IndexScanProgress } from '../lib/indexFolder';
import { clearSearchIndex, buildSearchIndex, hydrateSearchIndex, persistSearchIndex, querySearchIndex, type SearchIndexMeta } from '../lib/searchIndex';
import type { Language } from '../lib/i18n';

const copy = {
  fr: {
    title: 'Recherche indexée', subtitle: 'Retrouvez rapidement des mots dans les fichiers d’un dossier choisi.', choose: 'Choisir un dossier', build: 'Construire l’index', rebuild: 'Actualiser l’index', clear: 'Effacer', query: 'Rechercher dans l’index', queryPlaceholder: 'Nom de fichier ou contenu…', empty: 'Aucun résultat. Essayez un autre terme.', noIndex: 'Choisissez un dossier, puis construisez l’index à votre demande.', ready: 'Index local prêt', scan: 'Lecture des fichiers…', index: 'Création de l’index…', scanning: 'Parcours : {files} fichiers · {dirs} dossiers', indexed: '{count} fichiers indexés', skipped: '{count} fichiers ignorés (type, taille ou accès)', truncated: 'Limite atteinte : le résultat est partiel.', privacy: 'L’index est conservé uniquement sur cet appareil. Il mémorise les chemins et les termes extraits des 16 000 premiers caractères de chaque fichier, pas le contenu complet. Rien ne part en ligne. Effacez l’index quand vous le souhaitez.', storageWarning: 'Le stockage local est indisponible : cet index ne restera que dans la session actuelle.', noDesktop: 'L’indexation des dossiers est disponible dans la version de bureau.', clearConfirm: 'Effacer l’index de recherche local ?', bytes: 'caractères indexés', open: 'Ouvrir le fichier', cancel: 'Annuler',
  },
  en: {
    title: 'Indexed search', subtitle: 'Quickly find words in files inside a folder you choose.', choose: 'Choose a folder', build: 'Build index', rebuild: 'Refresh index', clear: 'Clear', query: 'Search the index', queryPlaceholder: 'File name or content…', empty: 'No results. Try another term.', noIndex: 'Choose a folder, then build the index when you are ready.', ready: 'Local index ready', scan: 'Reading files…', index: 'Building the index…', scanning: 'Scanning: {files} files · {dirs} folders', indexed: '{count} files indexed', skipped: '{count} files skipped (type, size or access)', truncated: 'Limit reached: results are partial.', privacy: 'The index stays on this device. It stores paths and terms from the first 16,000 characters of each file, not complete file contents. Nothing is sent online. Clear the index whenever you like.', storageWarning: 'Local storage is unavailable: this index will only last for the current session.', noDesktop: 'Folder indexing is available in the desktop app.', clearConfirm: 'Clear the local search index?', bytes: 'characters indexed', open: 'Open file', cancel: 'Cancel',
  },
} as const;

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function LocalSearchPanel({ language = 'fr', hidePaths = false, onOpenFile }: {
  language?: Language;
  hidePaths?: boolean;
  onOpenFile: (path: string) => void;
}) {
  const strings = copy[language];
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [meta, setMeta] = useState<SearchIndexMeta | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<'scan' | 'build' | null>(null);
  const [progress, setProgress] = useState<IndexScanProgress>({ directoriesVisited: 0, filesScanned: 0, filesSkipped: 0, bytesRead: 0 });
  const [indexedCount, setIndexedCount] = useState(0);
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void hydrateSearchIndex().then((stored) => {
      if (!active) return;
      setMeta(stored);
      setFolder(stored?.rootPath ?? '');
      setHydrated(true);
    });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);

  const results = hydrated ? querySearchIndex(query, 50) : [];

  async function chooseFolder() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: strings.choose });
      if (typeof selected === 'string') setFolder(selected);
    } catch {
      setMessage(language === 'fr' ? 'Impossible d’ouvrir le sélecteur de dossiers.' : 'Could not open the folder picker.');
    }
  }

  async function buildIndex() {
    if (!isTauri()) return;
    if (!folder.trim()) {
      setMessage(language === 'fr' ? 'Choisissez un dossier avant de continuer.' : 'Choose a folder before continuing.');
      return;
    }
    const aborter = new AbortController();
    controller.current = aborter;
    setBusy('scan');
    setMessage('');
    setProgress({ directoriesVisited: 0, filesScanned: 0, filesSkipped: 0, bytesRead: 0 });
    try {
      const scan = await scanFolderForIndex({
        root: folder,
        signal: aborter.signal,
        onProgress: setProgress,
      });
      setBusy('build');
      setIndexedCount(0);
      const built = await buildSearchIndex(scan.documents, folder, setIndexedCount);
      const persisted = await persistSearchIndex();
      setMeta(built);
      setMessage(`${strings.indexed.replace('{count}', String(built.documentCount))}${scan.filesSkipped ? ` · ${strings.skipped.replace('{count}', String(scan.filesSkipped))}` : ''}${scan.truncated ? ` · ${strings.truncated}` : ''}${persisted ? '' : ` · ${strings.storageWarning}`}`);
      setQuery('');
    } catch (error) {
      const reason = aborter.signal.aborted ? strings.cancel : error instanceof Error ? error.message : String(error);
      setMessage(reason);
    } finally {
      controller.current = null;
      setBusy(null);
    }
  }

  async function clearIndex() {
    if (!window.confirm(strings.clearConfirm)) return;
    await clearSearchIndex();
    setMeta(null);
    setFolder('');
    setQuery('');
    setMessage(language === 'fr' ? 'Index local effacé.' : 'Local index cleared.');
  }

  function cancel() {
    controller.current?.abort();
    setMessage(strings.cancel);
  }

  const isDesktop = isTauri();
  const busyText = busy === 'scan' ? strings.scan : strings.index;
  return <section className="settings-section settings-indexed-search" aria-labelledby="indexed-search-title">
    <div className="settings-section-title"><span id="indexed-search-title">{strings.title.toUpperCase()}</span><small>{strings.subtitle}</small></div>
    {!isDesktop && <div className="indexed-search-disabled">{strings.noDesktop}</div>}
    <div className="indexed-search-controls">
      <div className="indexed-search-folder"><FolderOpen size={14} /><span title={folder || undefined}>{folder ? (hidePaths ? basename(folder) : folder) : strings.noIndex}</span></div>
      <button className="subtle-button" type="button" disabled={!isDesktop || Boolean(busy)} onClick={() => void chooseFolder()}><FolderOpen size={13} />{strings.choose}</button>
      <button className="subtle-button indexed-search-build" type="button" disabled={!isDesktop || Boolean(busy) || !folder} onClick={() => void buildIndex()}><RefreshCw size={13} />{meta ? strings.rebuild : strings.build}</button>
      {busy ? <button className="subtle-button" type="button" onClick={cancel}><X size={13} />{strings.cancel}</button> : meta ? <button className="subtle-button indexed-search-clear" type="button" onClick={() => void clearIndex()}><Trash2 size={13} />{strings.clear}</button> : null}
    </div>
    {busy && <div className="indexed-search-progress" role="status" aria-live="polite"><LoaderCircle size={14} className="spin" /><span>{busyText} {busy === 'scan' ? strings.scanning.replace('{files}', String(progress.filesScanned)).replace('{dirs}', String(progress.directoriesVisited)) : `${indexedCount}/${progress.filesScanned || meta?.documentCount || ''}`}</span></div>}
    {message && <div className="indexed-search-message" role="status">{message}</div>}
    {meta && <>
      <label className="indexed-search-query"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={strings.queryPlaceholder} aria-label={strings.query} /><span>{results.length}</span></label>
      {query && results.length === 0 ? <div className="indexed-search-empty">{strings.empty}</div> : results.length > 0 && <div className="indexed-search-results" role="list" aria-label={strings.query}>
        {results.map((result) => <div className="indexed-search-result" key={result.path} role="listitem">
          <div className="indexed-search-result-copy"><FileSearch size={14} /><span><strong>{result.name}</strong><small title={result.path}>{hidePaths ? basename(result.path) : result.path}</small></span></div>
          <button className="icon-action" type="button" title={strings.open} aria-label={`${strings.open}: ${result.name}`} onClick={() => onOpenFile(result.path)}><ArrowUpRight size={14} /></button>
        </div>)}
      </div>}
      <div className="indexed-search-meta"><span><ShieldCheck size={12} />{strings.ready} · {meta.documentCount}</span><span>{meta.charactersIndexed.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US')} {strings.bytes}</span></div>
    </>}
    {!meta && !busy && <div className="indexed-search-empty">{strings.noIndex}</div>}
    <div className="settings-inline-note indexed-search-privacy"><ShieldCheck size={14} />{strings.privacy}</div>
  </section>;
}
