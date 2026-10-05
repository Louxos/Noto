import { useRef, type MutableRefObject } from 'react';
import { highlightCode } from '../lib/highlighting';

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
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const lineCount = Math.max(1, value.split('\n').length);
  const showLineNumbers = lineNumbers && lineCount <= 20_000;
  const { html, simplified } = highlightCode(value, extension);

  function syncScroll() {
    if (gutterRef.current && internalRef.current) gutterRef.current.scrollTop = internalRef.current.scrollTop;
    if (highlightRef.current && internalRef.current) {
      highlightRef.current.scrollTop = internalRef.current.scrollTop;
      highlightRef.current.scrollLeft = internalRef.current.scrollLeft;
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
        {!simplified && <pre className="editor-highlight" ref={highlightRef} aria-hidden="true"><code className="hljs"><span dangerouslySetInnerHTML={{ __html: html }} /></code></pre>}
        <textarea
          ref={(node) => {
            internalRef.current = node;
            if (textareaRef) textareaRef.current = node;
          }}
          className={`source-editor ${simplified ? 'no-highlight' : ''}`}
          aria-label="Contenu du fichier"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
          wrap={wordWrap ? 'soft' : 'off'}
          style={{ fontSize }}
        />
      </div>
    </div>
  );
}
