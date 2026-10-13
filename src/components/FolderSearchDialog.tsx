import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FileSearch, FolderOpen, LoaderCircle, Pin, Search, ShieldCheck, X } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { searchLocalFolder, type FolderSearchHit, type FolderSearchProgress } from '../lib/folderSearch';
import { loadPinnedSearchFolders, savePinnedSearchFolders, togglePinnedSearchFolder, type PinnedSearchFolder } from '../lib/searchFolders';

export function FolderSearchDialog({ hidePaths, onOpenFile, onClose }: { hidePaths: boolean; onOpenFile: (path: string, line: number | null, query: string) => void; onClose: () => void }) {
  const [folder, setFolder] = useState('');
  const [pinnedFolders, setPinnedFolders] = useState<PinnedSearchFolder[]>(() => loadPinnedSearchFolders());
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FolderSearchHit[]>([]);
  const [progress, setProgress] = useState<FolderSearchProgress>({ directoriesVisited: 0, filesScanned: 0, matchesFound: 0 });
  const [filesSkipped, setFilesSkipped] = useState(0);
  const [directoriesSkipped, setDirectoriesSkipped] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function chooseFolder() {
    if (!isTauri()) { setError('La recherche dans les dossiers est disponible dans l’application de bureau.'); return; }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Choisir le dossier à rechercher' });
      const selectedPath = typeof selected === 'string' ? selected : Array.isArray(selected) ? selected[0] : null;
      if (selectedPath) { setFolder(selectedPath); setError(''); setSearched(false); setHits([]); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : 'Impossible d’ouvrir le sélecteur de dossier.');
    }
  }

  function toggleFolderPin() {
    if (!folder) return;
    const isPinned = pinnedFolders.some((item) => item.path.toLocaleLowerCase('en-US') === folder.toLocaleLowerCase('en-US'));
    if (!isPinned && pinnedFolders.length >= 10) { setError('Vous pouvez épingler jusqu’à 10 dossiers de recherche.'); return; }
    const next = togglePinnedSearchFolder(pinnedFolders, folder);
    setPinnedFolders(next);
    savePinnedSearchFolders(next);
  }

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folder || !query.trim() || busy) return;
    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    setBusy(true);
    setError('');
    setSearched(false);
    setHits([]);
    setFilesSkipped(0);
    setDirectoriesSkipped(0);
    setTruncated(false);
    setProgress({ directoriesVisited: 0, filesScanned: 0, matchesFound: 0 });
    try {
      const result = await searchLocalFolder({ root: folder, query, signal: activeController.signal, onProgress: setProgress });
      setHits(result.hits);
      setFilesSkipped(result.filesSkipped);
      setDirectoriesSkipped(result.directoriesSkipped);
      setTruncated(result.truncated);
      setSearched(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : 'La recherche a échoué.';
      if (message !== 'Recherche annulée.') setError(message);
    } finally {
      setBusy(false);
      if (controller.current === activeController) controller.current = null;
    }
  }

  const folderIsPinned = pinnedFolders.some((item) => item.path.toLocaleLowerCase('en-US') === folder.toLocaleLowerCase('en-US'));
  const folderLabel = hidePaths ? folder.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? folder : folder;
  return <div className="modal-backdrop group-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="folder-search-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-search-title">
      <header className="folder-search-header"><span className="group-dialog-icon"><FileSearch size={18} /></span><div><h2 id="folder-search-title">Rechercher dans un dossier</h2><p>La recherche reste sur cet appareil et ne démarre qu’à votre demande.</p></div><button className="icon-action" type="button" aria-label="Fermer la recherche" disabled={busy} onClick={onClose}><X size={17} /></button></header>
      <form onSubmit={(event) => void runSearch(event)}>
        <label className="group-name-label" htmlFor="folder-search-query">Texte à rechercher</label>
        <div className="folder-search-query-row"><input id="folder-search-query" className="group-name-input" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mot, phrase ou nom de fichier" /><button className="secondary-button" type="button" onClick={() => void chooseFolder()}><FolderOpen size={14} />Choisir un dossier</button></div>
        <div className="folder-search-location-row">
          <select aria-label="Dossiers locaux épinglés" value={folder} onChange={(event) => { setFolder(event.target.value); setSearched(false); setHits([]); }}>
            <option value="">Dossiers épinglés…</option>
            {folder && !folderIsPinned && <option value={folder}>{folderLabel}</option>}
            {pinnedFolders.map((item) => <option key={item.path} value={item.path}>{hidePaths ? item.name : item.path}</option>)}
          </select>
          {folder && <button className={`folder-pin-button ${folderIsPinned ? 'is-pinned' : ''}`} type="button" title="Mémoriser ce dossier localement pour la recherche" onClick={toggleFolderPin}><Pin size={13} />{folderIsPinned ? 'Épinglé' : 'Épingler'}</button>}
        </div>
        <div className={`folder-search-path ${folder ? '' : 'empty'}`} title={hidePaths ? undefined : folder}>{folder ? folderLabel : 'Aucun dossier sélectionné'}</div>
        <div className="folder-search-limits"><ShieldCheck size={14} /><span>Parcourt les fichiers texte courants, ignore les dossiers de dépendances et limite le volume lu. Aucun contenu n’est indexé ni envoyé.</span></div>
        {error && <div className="folder-search-error" role="alert">{error}</div>}
        <footer className="group-dialog-footer"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Fermer</button><button className="primary-button" type="submit" disabled={!folder || !query.trim() || busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}{busy ? 'Recherche…' : 'Rechercher'}</button></footer>
      </form>
      {busy && <div className="folder-search-progress" role="status"><LoaderCircle size={14} className="spin" />{progress.filesScanned.toLocaleString('fr-FR')} fichier{progress.filesScanned === 1 ? '' : 's'} parcouru{progress.filesScanned === 1 ? '' : 's'} · {progress.matchesFound.toLocaleString('fr-FR')} résultat{progress.matchesFound === 1 ? '' : 's'}<button type="button" onClick={() => controller.current?.abort()}>Annuler</button></div>}
      {searched && <div className="folder-search-results" aria-live="polite">
        <div className="folder-search-summary"><strong>{hits.length ? `${hits.length} fichier${hits.length === 1 ? '' : 's'} trouvé${hits.length === 1 ? '' : 's'}` : 'Aucun résultat'}</strong><span>{progress.filesScanned.toLocaleString('fr-FR')} fichier{progress.filesScanned === 1 ? '' : 's'} analysé{progress.filesScanned === 1 ? '' : 's'}</span></div>
        {hits.map((hit) => <button className="folder-search-hit" type="button" key={hit.path} title={hidePaths ? hit.name : hit.path} onClick={() => onOpenFile(hit.path, hit.line, query.trim())}>
          <span className="folder-search-hit-icon"><FileSearch size={15} /></span><span className="folder-search-hit-copy"><strong>{hit.name}{hit.line ? <small>ligne {hit.line} · {hit.matches} occurrence{hit.matches === 1 ? '' : 's'}</small> : <small>Nom de fichier correspondant</small>}</strong><span>{hidePaths ? 'Chemin masqué' : hit.path}</span><em>{hit.preview}</em></span><span className="folder-search-hit-action">Ouvrir</span>
        </button>)}
        {!hits.length && <div className="folder-search-no-results">Essayez un autre terme ou un dossier différent.</div>}
        {(truncated || filesSkipped > 0 || directoriesSkipped > 0) && <div className="folder-search-limit-note">{truncated ? 'Résultats partiels : une limite de sécurité a été atteinte. ' : ''}{filesSkipped ? `${filesSkipped} fichier${filesSkipped === 1 ? '' : 's'} ignoré${filesSkipped === 1 ? '' : 's'} (taille ou accès). ` : ''}{directoriesSkipped ? `${directoriesSkipped} dossier${directoriesSkipped === 1 ? '' : 's'} ignoré${directoriesSkipped === 1 ? '' : 's'} (dossiers générés, profondeur ou accès).` : ''}</div>}
      </div>}
    </section>
  </div>;
}
