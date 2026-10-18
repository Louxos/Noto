import type { CommandOption, MenuDefinition } from '../components/WorkspaceTools';
import type { Language } from '../lib/i18n';

const menuTitles: Record<string, string> = {
  file: 'File', edit: 'Edit', view: 'View', help: 'Help',
};

const menuItems: Record<string, Record<string, string>> = {
  file: {
    open: 'Open a file…', 'folder-search': 'Search in a folder…', 'compare-text': 'Compare text files…',
    save: 'Save', 'save-as': 'Save as…', print: 'Print…', 'file-info': 'File information…', close: 'Close active file',
    'new-group': 'Create a group…', 'rename-group': 'Rename current group…', 'delete-group': 'Delete current group…',
  },
  edit: {
    'toggle-edit': 'Edit file', find: 'Find in file…', replace: 'Find and replace…', 'go-to-line': 'Go to line…', classify: 'Add current file to a group…',
  },
  view: {
    home: 'Home', recents: 'Recent files', 'smart-pdf': 'Recently opened PDFs', 'smart-images': 'Recent images',
    studio: 'Processing studio…', 'studio-pdf': 'PDF studio (merge, split, watermark…)', 'studio-image': 'Image studio (convert, optimize…)',
    'studio-ocr': 'OCR and scan cleanup', 'studio-convert': 'Document conversion', sidebar: 'Toggle sidebar',
    'toolbar-density': 'Toggle toolbar density', 'fullscreen-window': 'Toggle window fullscreen', immersive: 'Toggle immersive mode',
    theme: 'Toggle light and dark theme', settings: 'Settings…',
  },
  help: { 'welcome-guide': 'Getting started guide', palette: 'Quick open…', shortcuts: 'Keyboard shortcuts' },
};

const commandLabels: Record<string, string> = {
  open: 'Open a file', 'folder-search': 'Search in a folder', 'studio-open': 'Open the studio', 'studio-pdf-open': 'PDF studio',
  'studio-images-open': 'Image studio', 'studio-ocr-open': 'OCR and scans', 'compare-text': 'Compare text files',
  save: 'Save', print: 'Print file', 'file-info': 'File information', find: 'Find', replace: 'Find and replace',
  'go-to-line': 'Go to line', edit: 'Edit file', 'group-new': 'Create a group', 'group-rename': 'Rename current group',
  'fullscreen-window': 'Toggle fullscreen', immersive: 'Toggle immersive mode', theme: 'Change theme', settings: 'Open settings',
  'welcome-guide': 'Show getting started guide', shortcuts: 'Show keyboard shortcuts',
};

const commandDetails: Record<string, string> = {
  open: 'Browse your device', 'folder-search': 'On-demand local search', 'studio-open': 'Process, convert and analyze files locally',
  'studio-pdf-open': 'Merge, split, compress and watermark', 'studio-images-open': 'Convert, optimize, edit and create contact sheets',
  'studio-ocr-open': 'Recognize text and create searchable PDFs', 'compare-text': 'Show differences between two tabs',
  save: 'Save changes', print: 'Send the current file to the printer', 'file-info': 'Pages, characters, words, dimensions and metadata',
  find: 'Find text in the active file', replace: 'Replace multiple occurrences', 'go-to-line': 'Move the cursor to a line',
  edit: 'Switch between reading and editing', 'group-new': 'Organize files without moving them', 'group-rename': 'Rename the selected group',
  'fullscreen-window': 'Expand the whole window', immersive: 'Hide navigation, menus and tabs', theme: 'Switch between light and dark themes',
  settings: 'Appearance, toolbar and editor', 'welcome-guide': 'Review the getting started steps', shortcuts: 'View keyboard commands',
};

export function localizeMenus(menus: MenuDefinition[], language: Language): MenuDefinition[] {
  if (language === 'fr') return menus;
  return menus.map((menu) => ({
    ...menu,
    label: menuTitles[menu.id] ?? menu.label,
    items: menu.items.map((item) => {
      let label = menuItems[menu.id]?.[item.id] ?? item.label;
      if (item.id === 'toggle-edit' && item.label === 'Terminer la modification') label = 'Finish editing';
      if (item.id === 'fullscreen-window' && item.label.startsWith('Quitter')) label = 'Exit window fullscreen';
      if (item.id === 'immersive' && item.label.startsWith('Quitter')) label = 'Exit immersive mode';
      if (item.id === 'theme') label = item.label.includes('sombre') ? 'Enable dark theme' : 'Enable light theme';
      if (item.id === 'sidebar') label = item.label.includes('Déployer') ? 'Expand sidebar' : 'Collapse sidebar';
      if (item.id === 'toolbar-density') label = item.label.includes('Aérer') ? 'Expand toolbar spacing' : 'Compact toolbar';
      return { ...item, label };
    }),
  }));
}

export function localizeCommands(commands: CommandOption[], language: Language): CommandOption[] {
  if (language === 'fr') return commands;
  return commands.map((command) => {
    let label = commandLabels[command.id] ?? command.label;
    let detail = commandDetails[command.id] ?? command.detail;
    if (command.id === 'edit' && command.label === 'Terminer la modification') label = 'Finish editing';
    if (command.id.startsWith('open-tab:') && command.detail) detail = command.detail.replace('Onglet ouvert', 'Open tab');
    if (command.id.startsWith('open-recent:') && command.detail) detail = command.detail.replace('Fichier récent', 'Recent file');
    return { ...command, label, detail };
  });
}
