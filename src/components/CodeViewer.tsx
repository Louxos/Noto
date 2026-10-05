import { highlightCode } from '../lib/highlighting';
import { languageForExtension } from '../lib/fileTypes';

interface CodeViewerProps {
  content: string;
  extension: string;
  lineNumbers: boolean;
  wordWrap: boolean;
  fontSize: number;
}

export function CodeViewer({ content, extension, lineNumbers, wordWrap, fontSize }: CodeViewerProps) {
  const language = languageForExtension(extension);
  const { html: highlighted, simplified } = highlightCode(content, extension);
  const lineCount = Math.max(1, content.split('\n').length);
  const showLineNumbers = lineNumbers && lineCount <= 20_000;

  return (
    <div className={`code-viewport ${wordWrap ? 'is-wrapped' : ''}`}>
      {simplified && <div className="code-performance-hint">Coloration simplifiée pour préserver la fluidité sur ce fichier volumineux.</div>}
      <div className="code-shell" style={{ fontSize }}>
        {showLineNumbers && (
          <div className="code-gutter" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
          </div>
        )}
        <pre className="code-content"><code className={language ? `hljs language-${language}` : 'hljs'} dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
      </div>
    </div>
  );
}
