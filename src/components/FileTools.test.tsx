// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileInfoDialog, PrintDialog } from './FileTools';
import { RenameFileDialog } from './WorkspaceTools';
import type { OpenDocument } from '../types';
import type { RecentFile } from '../lib/preferences';

afterEach(cleanup);

const document: OpenDocument = {
  id: 'desktop:C:\\docs\\notes.md',
  source: 'desktop',
  name: 'notes.md',
  path: 'C:\\docs\\notes.md',
  kind: 'markdown',
  extension: 'md',
  mimeType: 'text/markdown',
  content: 'Bonjour le monde\nDeuxième ligne\n',
  savedContent: 'Bonjour le monde\nDeuxième ligne\n',
  size: 2048,
  modifiedAt: Date.UTC(2026, 0, 2),
  truncated: false,
};

describe('informations sur le fichier', () => {
  it('affiche des mesures calculées, pas des valeurs fixes', async () => {
    render(<FileInfoDialog document={document} readout={[]} onClose={vi.fn()} notify={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Informations sur le fichier' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Caractères')).toBeTruthy());
    expect(screen.getByText(String(document.content.length))).toBeTruthy();
    expect(screen.getByText(/C:\\docs\\notes\.md/u)).toBeTruthy();
    // Une mesure qui n’est pas calculable n’apparaît pas du tout.
    expect(screen.queryByText('Pages')).toBeNull();
  });
});

describe('impression', () => {
  it('annonce ce qui sera imprimé et lance l’impression du système', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    const notify = vi.fn();
    const onClose = vi.fn();
    // L’iframe d’impression est hors écran : on remplace son contenu par un
    // relevé, pour vérifier la page réellement produite.
    const originalCreateElement = window.document.createElement.bind(window.document);
    let written = '';
    const createElement = vi.spyOn(window.document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tag, options);
      if (tag === 'iframe') {
        Object.defineProperty(element, 'contentWindow', { value: { focus: vi.fn(), print } });
        Object.defineProperty(element, 'contentDocument', {
          value: {
            open: vi.fn(), close: vi.fn(),
            write: (html: string) => { written = html; },
            images: [],
          },
        });
        Object.defineProperty(element, 'addEventListener', { value: (type: string, listener: () => void) => { if (type === 'load') window.setTimeout(listener, 0); } });
      }
      return element;
    }) as typeof window.document.createElement);

    render(<PrintDialog document={document} currentPage={1} onClose={onClose} notify={notify} />);
    expect(screen.getByText(/caractères/u)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Imprimer' }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(written).toContain('<title>notes.md</title>');
    expect(written).toContain('Bonjour le monde');
    expect(onClose).toHaveBeenCalledOnce();
    createElement.mockRestore();
  });

  it('explique l’échec au lieu de le masquer', async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    const createElement = vi.spyOn(window.document, 'createElement');
    createElement.mockImplementation(((tag: string) => {
      const element = window.document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      if (tag === 'iframe') Object.defineProperty(element, 'contentWindow', { value: null });
      return element;
    }) as typeof window.document.createElement);

    render(<PrintDialog document={document} currentPage={1} onClose={vi.fn()} notify={notify} />);
    await user.click(screen.getByRole('button', { name: 'Imprimer' }));
    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(String(notify.mock.calls[0]?.[0])).toContain('aperçu d’impression');
    expect(notify.mock.calls[0]?.[1]).toBe('error');
    createElement.mockRestore();
  });
});

describe('renommage avec extension', () => {
  const file: RecentFile = { id: 'desktop:C:\\docs\\notes.md', name: 'notes.md', path: 'C:\\docs\\notes.md', kind: 'markdown', lastOpened: 1, source: 'desktop' };

  it('préremplit nom et extension séparément et renvoie le nom complet', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<RenameFileDialog file={file} onClose={vi.fn()} onRename={onRename} />);
    const name = screen.getByRole('textbox', { name: 'Nom du fichier' });
    const extension = screen.getByRole('textbox', { name: 'Extension du fichier, sans le point' });
    expect((name as HTMLInputElement).value).toBe('notes');
    expect((extension as HTMLInputElement).value).toBe('md');
    await user.clear(name);
    await user.type(name, 'journal');
    await user.click(screen.getByRole('button', { name: 'Renommer' }));
    expect(onRename).toHaveBeenCalledWith('journal.md');
  });

  it('avertit quand l’extension change le lecteur utilisé', async () => {
    const user = userEvent.setup();
    render(<RenameFileDialog file={file} onClose={vi.fn()} onRename={vi.fn()} />);
    const extension = screen.getByRole('textbox', { name: 'Extension du fichier, sans le point' });
    await user.clear(extension);
    await user.type(extension, 'txt');
    expect(screen.getByRole('status').textContent).toContain('Texte');
  });

  it('refuse un nom impossible avant d’écrire quoi que ce soit', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<RenameFileDialog file={file} onClose={vi.fn()} onRename={onRename} />);
    const name = screen.getByRole('textbox', { name: 'Nom du fichier' });
    await user.clear(name);
    await user.type(name, 'notes:2026');
    expect(screen.getByRole('alert').textContent).toContain('caractères');
    await user.click(screen.getByRole('button', { name: 'Renommer' }));
    expect(onRename).not.toHaveBeenCalled();

    await user.clear(name);
    await user.type(name, '   ');
    await user.click(screen.getByRole('button', { name: 'Renommer' }));
    expect(onRename).not.toHaveBeenCalled();

    // Un renommage qui ne change rien n’écrit rien non plus.
    await user.clear(name);
    await user.type(name, 'notes');
    await user.click(screen.getByRole('button', { name: 'Renommer' }));
    expect(onRename).not.toHaveBeenCalled();
  });

  it('accepte de retirer l’extension, avec le nom seul', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<RenameFileDialog file={file} onClose={vi.fn()} onRename={onRename} />);
    const extension = screen.getByRole('textbox', { name: 'Extension du fichier, sans le point' });
    await user.clear(extension);
    await user.click(screen.getByRole('button', { name: 'Renommer' }));
    expect(onRename).toHaveBeenCalledWith('notes');
  });
});
