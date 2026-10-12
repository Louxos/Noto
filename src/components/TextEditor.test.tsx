// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextEditor } from './TextEditor';

afterEach(cleanup);

function EditorHarness({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  return <TextEditor value={value} extension="md" onChange={setValue} lineNumbers wordWrap={false} fontSize={14} />;
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
