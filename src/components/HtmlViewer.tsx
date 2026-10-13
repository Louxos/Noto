import { useMemo } from 'react';
import { makeHtmlPreview } from '../lib/security';

export function HtmlViewer({ source, mode }: { source: string; mode: 'code' | 'preview' }) {
  const srcDoc = useMemo(() => makeHtmlPreview(source), [source]);
  return (
    <div className="html-viewer">
      {mode === 'preview' ? (
        <iframe
          className="html-frame"
          title="Aperçu HTML isolé"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
        />
      ) : (
        <div className="html-code-note">Le code HTML est affiché en lecture seule. Passez en aperçu pour voir le rendu isolé.</div>
      )}
    </div>
  );
}
