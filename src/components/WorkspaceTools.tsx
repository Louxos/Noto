import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  BookOpenText, Check, ChevronRight, Code2, File, FileImage, FileText,
  FileType2, FolderOpen, Globe2, Keyboard, Plus, Search, ShieldCheck,
  Table2, Trash2, X,
} from 'lucide-react';
import { getFormatLabel } from '../lib/fileTypes';
import { GROUP_COLORS, type FileGroup, type GroupColor } from '../lib/groups';
import type { RecentFile } from '../lib/preferences';
import type { OpenDocument } from '../types';

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
  csv: Table2, pdf: FileType2, image: FileImage, unknown: File,
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
  group, onOpen, onRecent, onRemoveFile, onRename, onDelete,
}: {
  group: FileGroup;
  onOpen: () => void;
  onRecent: (file: RecentFile) => void;
  onRemoveFile: (id: string) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return <div className="group-screen">
    <header className="group-screen-heading">
      <div className="group-heading-copy">
        <div className="eyebrow"><span className={`group-color-dot color-${group.color}`} />GROUPE LOCAL</div>
        <h2>{group.name}</h2>
        <p>{group.files.length} fichier{group.files.length === 1 ? '' : 's'} · Les documents originaux ne sont ni déplacés ni modifiés.</p>
      </div>
      <div className="group-heading-actions">
        <button className="secondary-button" type="button" onClick={onRename}><span className={`group-color-dot color-${group.color}`} />Renommer</button>
        <button className="group-delete-button" type="button" onClick={onDelete}><Trash2 size={14} /><span>Supprimer le groupe</span></button>
        <button className="primary-button group-add-button" type="button" onClick={onOpen}><Plus size={15} />Ajouter des fichiers</button>
      </div>
    </header>
    {group.files.length > 0 ? <div className="group-file-grid">
      {group.files.map((file) => <div className="group-file-card" key={file.id}>
        <button className="group-file-open" type="button" onClick={() => onRecent(file)} title={file.path}>
          <span className={`home-file-icon type-${file.kind}`}>{kindIcon(file.kind, 18)}</span>
          <span className="group-file-copy"><strong>{file.name}</strong><small>{getFormatLabel(file.kind as OpenDocument['kind'])} <i /> {formatDate(file.lastOpened)}</small><small className="group-file-path">{file.path}</small></span>
          <ChevronRight size={15} className="group-file-arrow" />
        </button>
        <button className="group-file-remove" type="button" title={`Retirer ${file.name} du groupe`} aria-label={`Retirer ${file.name} du groupe`} onClick={() => onRemoveFile(file.id)}><X size={14} /></button>
      </div>)}
    </div> : <div className="group-empty">
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
  { title: 'Édition & recherche', rows: [['Basculer lecture / édition', 'Ctrl + E'], ['Rechercher', 'Ctrl + F'], ['Rechercher / remplacer', 'Ctrl + H']] },
  { title: 'Organisation', rows: [['Créer un groupe', 'Ctrl + Maj + N'], ['Classer le fichier actif', 'Ctrl + Maj + G'], ['Renommer le groupe affiché', 'F2']] },
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
