import { useCallback, useRef, type KeyboardEvent, type MutableRefObject } from 'react';

interface TextEditorProps {
  value: string;
  extension: string;
  onChange: (value: string) => void;
  lineNumbers: boolean;
  wordWrap: boolean;
  fontSize: number;
  disabled?: boolean;
  textareaRef?: MutableRefObject<HTMLTextAreaElement | null>;
}

export function TextEditor({ value, extension, onChange, lineNumbers, wordWrap, fontSize, disabled, textareaRef }: TextEditorProps) {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const lineCount = Math.max(1, value.split('\n').length);
  const showLineNumbers = lineNumbers && lineCount <= 20_000;

  const setEditorRef = useCallback((node: HTMLTextAreaElement | null) => {
    internalRef.current = node;
    if (textareaRef) textareaRef.current = node;
  }, [textareaRef]);

  function syncScroll() {
    if (gutterRef.current && internalRef.current) gutterRef.current.scrollTop = internalRef.current.scrollTop;
  }

  function replaceSelection(nextValue: string, selectionStart: number, selectionEnd = selectionStart) {
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      const editor = internalRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (disabled || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const editor = event.currentTarget;
    const { selectionStart, selectionEnd } = editor;

    if (event.key === 'Tab') {
      event.preventDefault();
      const indent = '  ';
      if (event.shiftKey) {
        const lineStart = editor.value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
        const leading = editor.value.slice(lineStart, lineStart + indent.length);
        if (leading === indent) {
          const next = `${editor.value.slice(0, lineStart)}${editor.value.slice(lineStart + indent.length)}`;
          const delta = Math.max(0, Math.min(indent.length, selectionStart - lineStart));
          replaceSelection(next, selectionStart - delta, Math.max(selectionStart - delta, selectionEnd - indent.length));
        }
        return;
      }
      const next = `${editor.value.slice(0, selectionStart)}${indent}${editor.value.slice(selectionEnd)}`;
      replaceSelection(next, selectionStart + indent.length);
      return;
    }

    if (event.key === 'Enter') {
      const lineStart = editor.value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
      const currentLine = editor.value.slice(lineStart, selectionStart);
      const indentation = currentLine.match(/^\s*/)?.[0] ?? '';
      const extraIndent = /(?:\{|\(|\[)\s*$/.test(currentLine) ? '  ' : '';
      const insertion = `\n${indentation}${extraIndent}`;
      event.preventDefault();
      const next = `${editor.value.slice(0, selectionStart)}${insertion}${editor.value.slice(selectionEnd)}`;
      const caret = selectionStart + insertion.length;
      replaceSelection(next, caret);
    }
  }

  return (
    <div className={`editor-frame ${wordWrap ? 'editor-wrap' : ''}`}>
      {showLineNumbers && (
        <div className="editor-gutter" ref={gutterRef} aria-hidden="true" style={{ fontSize }}>
          {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
      )}
      <div className="editor-code-layer">
        <textarea
          ref={setEditorRef}
          className="source-editor"
          aria-label={`Contenu du fichier${extension ? ` .${extension}` : ''}`}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          wrap={wordWrap ? 'soft' : 'off'}
          style={{ fontSize }}
        />
      </div>
    </div>
  );
}
