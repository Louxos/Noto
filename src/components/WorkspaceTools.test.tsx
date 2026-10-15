// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../App';
import { defaultPreferences, type RecentFile } from '../lib/preferences';
import { createGroup, toggleGroupFile } from '../lib/groups';
import { AppMenuBar, CommandPalette, ContextMenu, GroupAssignmentDialog, GroupDialog, type MenuDefinition } from './WorkspaceTools';

afterEach(cleanup);

const recentFile: RecentFile = {
  id: 'desktop:/docs/readme.md',
  name: 'readme.md',
  path: '/docs/readme.md',
  kind: 'markdown',
  lastOpened: 1,
  source: 'desktop',
};

describe('workspace keyboard and menu integration', () => {
  it('opens a recent-file result from the command palette with the keyboard', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette onClose={onClose} commands={[
      { id: 'recent', label: 'readme.md', detail: 'Fichier récent', keywords: 'ouvrir récent', onSelect: onOpen },
      { id: 'settings', label: 'Paramètres', onSelect: vi.fn() },
    ]} />);

    const search = screen.getByRole('textbox', { name: 'Rechercher une commande, un onglet ou un fichier récent' });
    await user.type(search, 'readme');
    expect(screen.getByRole('option', { name: /readme\.md/ })).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('supports arrow-key focus and keyboard activation in a context menu', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDelete = vi.fn();
    render(<ContextMenu position={{ x: 20, y: 20 }} onClose={onClose} items={[
      { id: 'open', label: 'Ouvrir', onSelect: vi.fn() },
      { id: 'delete', label: 'Retirer', onSelect: onDelete },
    ]} />);

    const open = screen.getByRole('menuitem', { name: 'Ouvrir' });
    const remove = screen.getByRole('menuitem', { name: 'Retirer' });
    await waitFor(() => expect(document.activeElement).toBe(open));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(remove);
    await user.keyboard('{Enter}');
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('creates a group using the selected name and color', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<GroupDialog onClose={vi.fn()} onSave={onSave} />);
    await user.type(screen.getByRole('textbox', { name: 'Nom du groupe' }), 'À lire');
    await user.click(screen.getByRole('radio', { name: 'Bleu' }));
    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(onSave).toHaveBeenCalledWith('À lire', 'blue');
  });

  it('updates group assignment state through an accessible menu action', async () => {
    const user = userEvent.setup();
    const initialGroup = createGroup('À lire', 'violet', 'group-1')!;
    function Harness() {
      const [groups, setGroups] = useState([initialGroup]);
      return <GroupAssignmentDialog file={recentFile} groups={groups} onClose={vi.fn()} onCreate={vi.fn()} onToggle={(groupId) => {
        setGroups((current) => toggleGroupFile(current, groupId, recentFile));
      }} />;
    }
    render(<Harness />);
    const group = screen.getByRole('button', { name: /À lire/ });
    expect(group.getAttribute('aria-pressed')).toBe('false');
    await user.click(group);
    await waitFor(() => expect(group.getAttribute('aria-pressed')).toBe('true'));
  });

  it('applies theme and accent changes from settings controls', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onToggleToolbar = vi.fn();
    render(<SettingsModal
      preferences={{ ...defaultPreferences, toolbarOrder: [...defaultPreferences.toolbarOrder], hiddenToolbarActions: [] }}
      onChange={onChange}
      onClose={vi.fn()}
      onClearRecents={vi.fn()}
      onResetDefaults={vi.fn()}
      onClearDrafts={vi.fn()}
      onMoveToolbar={vi.fn()}
      onToggleToolbar={onToggleToolbar}
      onOpenShortcuts={vi.fn()}
      onOpenWindowsDefaults={vi.fn()}
      onExportBackup={vi.fn()}
      onImportBackup={vi.fn()}
    />);

    await user.click(screen.getByRole('button', { name: 'Sombre' }));
    await user.click(screen.getByRole('radio', { name: 'Bleu' }));
    await user.click(screen.getByRole('switch', { name: 'Masquer Rechercher' }));
    expect(onChange).toHaveBeenCalledWith('theme', 'dark');
    expect(onChange).toHaveBeenCalledWith('accent', 'blue');
    expect(onToggleToolbar).toHaveBeenCalledWith('search');
  });
});

describe('barre de menus', () => {
  const menus: MenuDefinition[] = [
    { id: 'file', label: 'Fichier', items: [
      { id: 'open', label: 'Ouvrir un fichier…', shortcut: 'Ctrl+O', onSelect: () => {} },
      { id: 'save', label: 'Enregistrer', shortcut: 'Ctrl+S', disabled: true, onSelect: () => {} },
    ] },
    { id: 'view', label: 'Affichage', items: [
      { id: 'immersive', label: 'Mode immersion', shortcut: 'Ctrl+Maj+F', onSelect: () => {} },
    ] },
  ];

  it('affiche les menus côte à côte quand la place le permet', () => {
    render(<AppMenuBar menus={menus} onOpenPalette={() => {}} />);
    expect(screen.getByRole('button', { name: 'Fichier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Affichage' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tous les menus de Noto' })).toBeNull();
  });

  it('regroupe tous les menus sans perdre une commande quand la place manque', async () => {
    const user = userEvent.setup();
    render(<AppMenuBar menus={menus} onOpenPalette={() => {}} collapsed />);

    // Les déclencheurs individuels disparaissent au profit d’un seul bouton.
    expect(screen.queryByRole('button', { name: 'Fichier' })).toBeNull();
    const all = screen.getByRole('button', { name: 'Tous les menus de Noto' });
    expect(all.getAttribute('aria-expanded')).toBe('false');

    await user.click(all);
    expect(all.getAttribute('aria-expanded')).toBe('true');
    // Chaque menu reste présent, titré, avec ses entrées et leurs raccourcis.
    for (const menu of menus) expect(screen.getByText(menu.label)).toBeTruthy();
    for (const item of menus.flatMap((menu) => menu.items)) expect(screen.getByRole('menuitem', { name: new RegExp(item.label) })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Enregistrer/ }).hasAttribute('disabled')).toBe(true);
  });

  it('exécute la commande choisie depuis le menu regroupé', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const withAction: MenuDefinition[] = [{ id: 'view', label: 'Affichage', items: [{ id: 'immersive', label: 'Mode immersion', onSelect }] }];
    render(<AppMenuBar menus={withAction} onOpenPalette={() => {}} collapsed />);
    await user.click(screen.getByRole('button', { name: 'Tous les menus de Noto' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mode immersion' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
