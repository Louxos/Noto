import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  BookOpen, BookOpenText, Check, ChevronRight, Code2, File, FileImage, FileText,
  FileType2, FileUp, FolderOpen, Globe2, Keyboard, Pencil, Plus, Presentation, Search, ShieldCheck,
  Save, Table2, TextCursorInput, Trash2, X,
} from 'lucide-react';
import { getFormatLabel } from '../lib/fileTypes';
import { GROUP_COLORS, type FileGroup, type GroupColor } from '../lib/groups';
import type { RecentFile } from '../lib/preferences';
import type { OpenDocument } from '../types';
import type { SaveAsOptions } from '../lib/files';

export interface MenuEntry {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
}

export interface MenuDefinition {
  id: string;
  label: string;
  items: MenuEntry[];
}

export function ContextMenu({ position, items, onClose }: { position: { x: number; y: number }; items: MenuEntry[]; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ left: position.x, top: position.y });

  useEffect(() => {
    const menu = menuRef.current;
    if (menu) {
      const rect = menu.getBoundingClientRect();
      setBounds({
        left: Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)),
        top: Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8)),
      });
      menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (!menuRef.current || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const menuItems = [...menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
      if (!menuItems.length) return;
      event.preventDefault();
      const current = menuItems.indexOf(menuRef.current.ownerDocument.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? menuItems.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + menuItems.length) % menuItems.length;
      menuItems[next]?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [position.x, position.y, items.length, onClose]);

  return <div
    ref={menuRef}
    className="menu-popover context-menu-popover"
    role="menu"
    aria-label="Actions contextuelles"
    style={{ left: bounds.left, top: bounds.top }}
    onContextMenu={(event) => event.preventDefault()}
  >
    {items.map((item) => <div key={item.id}>
      {item.dividerBefore && <div className="menu-divider" role="separator" />}
      <button className="menu-item" type="button" role="menuitem" disabled={item.disabled} onClick={() => { onClose(); item.onSelect(); }}>
        <span className="menu-item-icon">{item.icon}</span><span className="menu-item-label">{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}
      </button>
    </div>)}
  </div>;
}

export interface CommandOption {
  id: string;
  label: string;
  detail?: string;
  shortcut?: string;
  keywords?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

const formatIcons: Record<string, typeof FileText> = {
  markdown: BookOpenText, text: FileText, code: Code2, html: Globe2,
  csv: Table2, pdf: FileType2, image: FileImage, presentation: Presentation,
  document: FileText, ebook: BookOpen, unknown: File,
};

const colorLabels: Record<GroupColor, string> = {
  violet: 'Violet', blue: 'Bleu', mint: 'Menthe', amber: 'Ambre', rose: 'Rose',
};

function kindIcon(kind: string, size = 17): ReactNode {
  const Icon = formatIcons[kind] ?? File;
  return <Icon size={size} strokeWidth={1.8} />;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return 'Date inconnue';
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Aujourd’hui · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function AppMenuBar({ menus, onOpenPalette }: { menus: MenuDefinition[]; onOpenPalette: () => void }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  return <nav className="app-menubar" aria-label="Menus de l’application" ref={menuRef}>
    <div className="menu-list">
      {menus.map((menu) => <div className="menu-root" key={menu.id}>
        <button className={`menu-trigger ${openMenu === menu.id ? 'open' : ''}`} type="button" aria-haspopup="menu" aria-expanded={openMenu === menu.id} onClick={() => setOpenMenu((current) => current === menu.id ? null : menu.id)}>{menu.label}</button>
        {openMenu === menu.id && <div className="menu-popover" role="menu" aria-label={menu.label}>
          {menu.items.map((item) => <div key={item.id}>
            {item.dividerBefore && <div className="menu-divider" role="separator" />}
            <button className="menu-item" type="button" role="menuitem" disabled={item.disabled} onClick={() => { setOpenMenu(null); item.onSelect(); }}>
              <span className="menu-item-icon">{item.icon}</span><span className="menu-item-label">{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          </div>)}
        </div>}
      </div>)}
    </div>
    <button className="command-trigger" type="button" onClick={onOpenPalette} title="Rechercher une commande (Ctrl+Maj+P)">
      <Search size={14} /><span>Commandes</span><kbd>Ctrl ⇧ P</kbd>
    </button>
  </nav>;
}

export function GroupScreen({
  group, onOpen, onOpenAll, onRecent, onRemoveFile, onRemoveFiles, onRename, onDelete, hidePaths,
}: {
  group: FileGroup;
  hidePaths: boolean;
  onOpen: () => void;
  onOpenAll: () => void;
  onRecent: (file: RecentFile) => void;
  onRemoveFile: (id: string) => void;
  onRemoveFiles: (ids: string[]) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'type'>('recent');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const selectedIds = selectedFileIds.filter((id) => group.files.some((file) => file.id === id));
  const allSelected = group.files.length > 0 && selectedIds.length === group.files.length;
  const sortedFiles = [...group.files].sort((left, right) => {
    if (sortBy === 'name') return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
    if (sortBy === 'type') return left.kind.localeCompare(right.kind, 'fr') || left.name.localeCompare(right.name, 'fr');
    return right.lastOpened - left.lastOpened;
  });
  return <div className="group-screen">
    <header className="group-screen-heading">
      <div className="group-heading-copy">
        <div className="eyebrow"><span className={`group-color-dot color-${group.color}`} />GROUPE LOCAL</div>
        <h2>{group.name}</h2>
        <p>{group.files.length} fichier{group.files.length === 1 ? '' : 's'} · Les documents originaux ne sont ni déplacés ni modifiés.</p>
      </div>
      <div className="group-heading-actions">
        {group.files.length > 1 && <button className="secondary-button" type="button" onClick={onOpenAll}><FileUp size={14} />Tout ouvrir</button>}
        <button className="secondary-button" type="button" onClick={onRename}><span className={`group-color-dot color-${group.color}`} />Renommer</button>
        <button className="group-delete-button" type="button" onClick={onDelete}><Trash2 size={14} /><span>Supprimer le groupe</span></button>
        <button className="primary-button group-add-button" type="button" onClick={onOpen}><Plus size={15} />Ajouter des fichiers</button>
      </div>
    </header>
    {group.files.length > 0 ? <>
      <div className="group-files-toolbar">
        <div className="group-selection-controls">
          <label><input type="checkbox" checked={allSelected} onChange={(event) => setSelectedFileIds(event.target.checked ? group.files.map((file) => file.id) : [])} aria-label="Sélectionner tous les fichiers du groupe" /><span>Tout sélectionner</span></label>
          {selectedIds.length > 0 && <><span className="group-selection-count">{selectedIds.length} sélectionné{selectedIds.length === 1 ? '' : 's'}</span><button className="group-remove-selected" type="button" onClick={() => { onRemoveFiles(selectedIds); setSelectedFileIds([]); }}>Retirer de ce groupe</button></>}
        </div>
        <label>Trier par <select aria-label="Trier les fichiers du groupe" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="recent">Ouverture récente</option><option value="name">Nom</option><option value="type">Type</option></select></label>
      </div>
      <div className="group-file-grid">
      {sortedFiles.map((file) => <div className={`group-file-card ${selectedIds.includes(file.id) ? 'is-selected' : ''}`} key={file.id} data-context-file-id={file.id}>
        <label className="group-file-check" title={`Sélectionner ${file.name}`}><input type="checkbox" checked={selectedIds.includes(file.id)} onChange={() => setSelectedFileIds((current) => current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id])} aria-label={`Sélectionner ${file.name}`} /></label>
        <button className="group-file-open" type="button" onClick={() => onRecent(file)} title={hidePaths ? file.name : file.path}>
          <span className={`home-file-icon type-${file.kind}`}>{kindIcon(file.kind, 18)}</span>
          <span className="group-file-copy"><strong>{file.name}</strong><small>{getFormatLabel(file.kind as OpenDocument['kind'])} <i /> {formatDate(file.lastOpened)}</small><small className="group-file-path">{hidePaths ? 'Chemin masqué' : file.path}</small></span>
          <ChevronRight size={15} className="group-file-arrow" />
        </button>
        <button className="group-file-remove" type="button" title={`Retirer ${file.name} du groupe`} aria-label={`Retirer ${file.name} du groupe`} onClick={() => onRemoveFile(file.id)}><X size={14} /></button>
      </div>)}
      </div></> : <div className="group-empty">
      <span className="group-empty-icon"><FolderOpen size={23} /></span>
      <h3>Ce groupe est encore vide</h3>
      <p>Ajoutez des fichiers pour les retrouver ensemble. Ils restent à leur emplacement d’origine.</p>
      <button className="primary-button" type="button" onClick={onOpen}><Plus size={15} />Ajouter des fichiers</button>
    </div>}
    <div className="group-local-note"><ShieldCheck size={14} />Les groupes et chemins sont enregistrés localement sur cet appareil. Noto ne copie pas le contenu des fichiers.</div>
  </div>;
}

export function GroupDialog({ group, onClose, onSave }: { group?: FileGroup; onClose: () => void; onSave: (name: string, color: GroupColor) => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState<GroupColor>(group?.color ?? 'violet');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed, color);
  }

  return <div className="modal-backdrop group-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="group-dialog" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" onSubmit={submit}>
      <header className="group-dialog-header"><span className="group-dialog-icon"><FolderOpen size={18} /></span><div><h2 id="group-dialog-title">{group ? 'Modifier le groupe' : 'Créer un groupe'}</h2><p>Un espace local pour rassembler vos fichiers.</p></div><button className="icon-action" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button></header>
      <label className="group-name-label" htmlFor="group-name">Nom du groupe</label>
      <input ref={inputRef} id="group-name" className="group-name-input" maxLength={48} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Projet, À lire, Travail…" required />
      <span className="group-color-label">Couleur</span>
      <div className="group-color-picker" role="radiogroup" aria-label="Couleur du groupe">
        {GROUP_COLORS.map((option) => <button className={`group-color-choice color-${option} ${color === option ? 'selected' : ''}`} type="button" key={option} role="radio" aria-checked={color === option} aria-label={colorLabels[option]} title={colorLabels[option]} onClick={() => setColor(option)}><span /></button>)}
      </div>
      <footer className="group-dialog-footer"><button className="secondary-button" type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit"><Check size={15} />{group ? 'Enregistrer' : 'Créer le groupe'}</button></footer>
    </form>
  </div>;
}

export function RenameFileDialog({ file, onClose, onRename }: { file: RecentFile; onClose: () => void; onRename: (nextName: string) => void }) {
  const extensionIndex = file.name.lastIndexOf('.');
  const extension = extensionIndex > 0 ? file.name.slice(extensionIndex) : '';
  const initialName = extension ? file.name.slice(0, extensionIndex) : file.name;
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== initialName) onRename(`${trimmed}${extension}`);
  }
  return <div className="modal-backdrop group-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="group-dialog rename-file-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-file-title" onSubmit={submit}>
      <header className="group-dialog-header"><span className="group-dialog-icon"><Pencil size={17} /></span><div><h2 id="rename-file-title">Renommer le fichier</h2><p>Le fichier original sera renommé sur votre appareil.</p></div><button className="icon-action" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button></header>
      <label className="group-name-label" htmlFor="rename-file-name">{extension ? 'Nouveau nom (extension conservée)' : 'Nouveau nom'}</label>
      <div className="rename-name-field"><input ref={inputRef} id="rename-file-name" className="group-name-input" maxLength={260} value={name} onChange={(event) => setName(event.target.value)} required />{extension && <span>{extension}</span>}</div>
      <small className="rename-file-path">{file.path}</small>
      <footer className="group-dialog-footer"><button className="secondary-button" type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit"><Check size={15} />Renommer</button></footer>
    </form>
  </div>;
}

export function GoToLineDialog({ lineCount, onGo, onClose }: { lineCount: number; onGo: (line: number) => void; onClose: () => void }) {
  const [value, setValue] = useState('1');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const line = Number(value);
    if (Number.isInteger(line) && line >= 1 && line <= lineCount) onGo(line);
  }
  return <div className="modal-backdrop group-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="group-dialog go-to-line-dialog" role="dialog" aria-modal="true" aria-labelledby="go-to-line-title" onSubmit={submit}>
      <header className="group-dialog-header"><span className="group-dialog-icon"><TextCursorInput size={18} /></span><div><h2 id="go-to-line-title">Aller à la ligne</h2><p>Choisissez une ligne de 1 à {lineCount.toLocaleString('fr-FR')}.</p></div><button className="icon-action" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button></header>
      <label className="group-name-label" htmlFor="go-to-line-number">Numéro de ligne</label>
      <input ref={inputRef} id="go-to-line-number" className="group-name-input" type="number" min={1} max={lineCount} step={1} value={value} onChange={(event) => setValue(event.target.value)} required />
      <footer className="group-dialog-footer"><button className="secondary-button" type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit"><Check size={15} />Aller à la ligne</button></footer>
    </form>
  </div>;
}

export function SaveAsDialog({ fileName, error, onSave, onClose }: { fileName: string; error: string; onSave: (options: SaveAsOptions) => void; onClose: () => void }) {
  const [encoding, setEncoding] = useState<SaveAsOptions['encoding']>('utf-8');
  const [lineEnding, setLineEnding] = useState<SaveAsOptions['lineEnding']>('preserve');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ encoding, lineEnding });
  }
  return <div className="modal-backdrop group-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="group-dialog save-as-dialog" role="dialog" aria-modal="true" aria-labelledby="save-as-title" onSubmit={submit}>
      <header className="group-dialog-header"><span className="group-dialog-icon"><Save size={18} /></span><div><h2 id="save-as-title">Enregistrer sous</h2><p>L’extension « {fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : 'aucune'} » sera conservée.</p></div><button className="icon-action" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button></header>
      <label className="group-name-label" htmlFor="save-as-encoding">Encodage du texte</label>
      <select id="save-as-encoding" className="save-as-select" value={encoding} onChange={(event) => setEncoding(event.target.value as SaveAsOptions['encoding'])}>
        <option value="utf-8">UTF-8 (recommandé)</option><option value="utf-16le">UTF-16 Little Endian</option><option value="windows-1252">Windows-1252</option>
      </select>
      <label className="group-name-label" htmlFor="save-as-line-ending">Fins de ligne</label>
      <select id="save-as-line-ending" className="save-as-select" value={lineEnding} onChange={(event) => setLineEnding(event.target.value as SaveAsOptions['lineEnding'])}>
        <option value="preserve">Conserver le style actuel</option><option value="lf">LF (Unix / macOS)</option><option value="crlf">CRLF (Windows)</option><option value="cr">CR (ancien Mac)</option>
      </select>
      {error && <div className="save-as-error" role="alert">{error}</div>}
      <footer className="group-dialog-footer"><button className="secondary-button" type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit"><Save size={15} />Choisir l’emplacement…</button></footer>
    </form>
  </div>;
}

export function GroupAssignmentDialog({ file, groups, onToggle, onCreate, onClose }: { file: RecentFile; groups: FileGroup[]; onToggle: (groupId: string) => void; onCreate: () => void; onClose: () => void }) {
  return <div className="modal-backdrop group-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="group-dialog group-assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="group-assignment-title">
      <header className="group-dialog-header"><span className="group-dialog-icon"><FolderOpen size={18} /></span><div><h2 id="group-assignment-title">Classer le fichier</h2><p>{file.name} · le fichier original reste à son emplacement.</p></div><button className="icon-action" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button></header>
      <div className="assignment-group-list">
        {groups.map((group) => {
          const selected = group.files.some((item) => item.id === file.id);
          return <button className={`assignment-group-option ${selected ? 'selected' : ''}`} type="button" key={group.id} aria-pressed={selected} onClick={() => onToggle(group.id)}><span className={`group-color-dot color-${group.color}`} /><span>{group.name}</span><small>{group.files.length} fichier{group.files.length === 1 ? '' : 's'}</small>{selected && <Check size={15} />}</button>;
        })}
        {!groups.length && <div className="assignment-empty">Aucun groupe pour le moment.</div>}
      </div>
      <footer className="group-dialog-footer"><button className="secondary-button" type="button" onClick={onCreate}><Plus size={15} />Créer un groupe</button><button className="primary-button" type="button" onClick={onClose}>Terminé</button></footer>
    </section>
  </div>;
}

export function CommandPalette({ commands, onClose }: { commands: CommandOption[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
  const filtered = commands.filter((command) => !command.disabled && `${command.label} ${command.detail ?? ''} ${command.keywords ?? ''}`.toLocaleLowerCase('fr-FR').includes(normalizedQuery));

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActiveIndex(0); }, [normalizedQuery]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    else if (event.key === 'ArrowDown' && filtered.length > 0) { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)); }
    else if (event.key === 'ArrowUp' && filtered.length > 0) { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      const command = filtered[activeIndex];
      if (command && !command.disabled) { onClose(); command.onSelect(); }
    }
  }

  return <div className="modal-backdrop palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="palette-title">
      <h2 id="palette-title" className="visually-hidden">Rechercher une commande</h2>
      <div className="palette-search"><Search size={17} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder="Que voulez-vous faire ?" aria-label="Rechercher une commande" /><kbd>Échap</kbd></div>
      <div className="palette-results" role="listbox" aria-label="Commandes disponibles">
        {filtered.length ? filtered.map((command, index) => <button className={`palette-command ${index === activeIndex ? 'active' : ''}`} type="button" role="option" aria-selected={index === activeIndex} disabled={command.disabled} key={command.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => { onClose(); command.onSelect(); }}>
          <span className="palette-command-icon">{command.icon}</span><span className="palette-command-copy"><strong>{command.label}</strong>{command.detail && <small>{command.detail}</small>}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}
        </button>) : <div className="palette-no-results">Aucune commande ne correspond à « {query} ».</div>}
      </div>
      <footer className="palette-footer"><span><Keyboard size={13} />Flèches pour naviguer</span><span><kbd>Entrée</kbd> pour lancer</span><span><kbd>Esc</kbd> pour fermer</span></footer>
    </section>
  </div>;
}

const shortcutSections = [
  { title: 'Fichiers', rows: [['Ouvrir un fichier', 'Ctrl + O'], ['Enregistrer', 'Ctrl + S'], ['Enregistrer sous', 'Ctrl + Maj + S'], ['Fermer le fichier actif', 'Ctrl + W'], ['Onglet suivant / précédent', 'Ctrl + Tab / Ctrl + Maj + Tab'], ['Aller à un onglet (1 à 9)', 'Ctrl + 1…9']] },
  { title: 'Édition & recherche', rows: [['Basculer lecture / édition', 'Ctrl + E'], ['Rechercher', 'Ctrl + F'], ['Rechercher / remplacer', 'Ctrl + H'], ['Aller à la ligne', 'Ctrl + G'], ['Résultat suivant / précédent', 'F3 / Maj + F3']] },
  { title: 'Organisation', rows: [['Créer un groupe', 'Ctrl + Maj + N'], ['Classer le fichier actif', 'Ctrl + Maj + G'], ['Renommer le groupe affiché', 'F2']] },
  { title: 'Diaporamas & livres', rows: [['Diapositive / chapitre suivant ou précédent', '← / →'], ['Plein écran dans un diaporama', 'F'], ['Quitter le plein écran', 'Échap']] },
  { title: 'Application', rows: [['Ouvrir la palette de commandes', 'Ctrl + Maj + P'], ['Ouvrir les paramètres', 'Ctrl + ,'], ['Fermer la fenêtre ou le panneau', 'Échap']] },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop shortcuts-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <header className="shortcuts-header"><span className="settings-icon"><Keyboard size={17} /></span><div><h2 id="shortcuts-title">Raccourcis clavier</h2><p>Sur Mac, Ctrl correspond à la touche ⌘.</p></div><button className="icon-action" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button></header>
      <div className="shortcuts-grid">{shortcutSections.map((section) => <section className="shortcut-section" key={section.title}><h3>{section.title}</h3>{section.rows.map(([label, keys]) => <div className="shortcut-row" key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</section>)}</div>
      <footer className="shortcuts-footer"><span>Les raccourcis ne remplacent pas les menus ; toutes les actions restent accessibles à la souris.</span><button className="secondary-button" type="button" onClick={onClose}>Terminé</button></footer>
    </section>
  </div>;
}
