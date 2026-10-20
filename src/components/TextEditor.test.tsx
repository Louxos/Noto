// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextEditor } from './TextEditor';

afterEach(cleanup);

function EditorHarness({ initialValue, extension = 'md', wordWrap = false }: { initialValue: string; extension?: string; wordWrap?: boolean }) {
  const [value, setValue] = useState(initialValue);
  return <TextEditor value={value} extension={extension} onChange={setValue} lineNumbers wordWrap={wordWrap} fontSize={14} />;
}

describe('TextEditor keyboard integration', () => {
  it('keeps the clicked selection and replaces it with normally typed text', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialValue="alpha beta" />);
    const editor = screen.getByRole('textbox', { name: 'Contenu du fichier .md' }) as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(6, 10);
    fireEvent.click(editor);
    expect(editor.selectionStart).toBe(6);
    expect(editor.selectionEnd).toBe(10);

    await user.keyboard('gamma');
    await waitFor(() => expect(editor.value).toBe('alpha gamma'));
    expect(editor.selectionStart).toBe(11);
    expect(editor.selectionEnd).toBe(11);
  });

  it('continues normal typing from the caret without losing inserted characters', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialValue="hello" />);
    const editor = screen.getByRole('textbox', { name: 'Contenu du fichier .md' }) as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(5, 5);
    await user.keyboard(' world');
    await waitFor(() => expect(editor.value).toBe('hello world'));
    expect(editor.selectionStart).toBe(11);
    expect(editor.selectionEnd).toBe(11);
  });
});

/**
 * Coloration pendant l’édition : le texte visible doit porter les marques de
 * highlight.js, la couche colorée doit rester en arrière-plan, et l’éditeur doit
 * savoir y renoncer plutôt que de ralentir la frappe.
 */
const highlightLayer = () => document.querySelector('pre.editor-highlight');

describe('coloration de l’éditeur', () => {
  it('colorie le code écrit, avec les classes standard de highlight.js', () => {
    render(<EditorHarness initialValue={'const total = 42;\n'} extension="js" />);
    const layer = highlightLayer();
    expect(layer).not.toBeNull();
    expect(layer?.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(layer?.querySelector('.hljs-number')?.textContent).toBe('42');
    expect(document.querySelector('.editor-code-layer')?.className).toContain('is-highlighted');
  });

  it('garde l’éditeur au-dessus de la couche colorée et hors du regard des lecteurs d’écran', () => {
    render(<EditorHarness initialValue="fn main() {}" extension="rs" />);
    const layer = highlightLayer();
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.querySelector('code')?.className).toContain('language-rust');
    const editor = screen.getByRole('textbox', { name: 'Contenu du fichier .rs' });
    expect(editor.className).toContain('source-editor');
    expect(editor.tagName).toBe('TEXTAREA');
  });

  it('suit le défilement de l’éditeur pour ne jamais afficher un texte décalé', () => {
    render(<EditorHarness initialValue={'let x = 1;\nlet y = 2;\nlet z = 3;\n'} extension="js" />);
    const editor = screen.getByRole('textbox', { name: 'Contenu du fichier .js' }) as HTMLTextAreaElement;
    editor.scrollTop = 120;
    editor.scrollLeft = 30;
    fireEvent.scroll(editor);
    const layer = highlightLayer() as HTMLPreElement;
    expect(layer.scrollTop).toBe(120);
    expect(layer.scrollLeft).toBe(30);
  });

  it('conserve la dernière ligne vide visible après un saut de ligne final', () => {
    render(<EditorHarness initialValue={'a\n'} extension="js" />);
    expect(highlightLayer()?.querySelector('code')?.innerHTML.endsWith('a\n ')).toBe(true);
  });

  it('affiche du texte simple là où aucune grammaire ne s’applique', () => {
    render(<EditorHarness initialValue="du texte neutre" extension="txt" />);
    expect(highlightLayer()).toBeNull();
    expect(document.querySelector('.editor-code-layer')?.className).not.toContain('is-highlighted');
  });

  it('renonce à la coloration sur un fichier trop volumineux pour la frappe', () => {
    render(<EditorHarness initialValue={'const x = 1;\n'.repeat(20_000)} extension="js" />);
    expect(highlightLayer()).toBeNull();
  });
});
