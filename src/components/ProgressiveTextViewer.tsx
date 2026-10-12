import { useEffect, useState } from 'react';
import { ArrowDown, LoaderCircle } from 'lucide-react';
import type { OpenDocument } from '../types';
import { formatBytes, readBrowserTextChunk, readDesktopTextChunk } from '../lib/files';
import { CodeViewer } from './CodeViewer';

export function ProgressiveTextViewer({ document, lineNumbers, wordWrap, fontSize, onContentLoaded }: { document: OpenDocument; lineNumbers: boolean; wordWrap: boolean; fontSize: number; onContentLoaded: (documentId: string, content: string, loadedBytes: number) => void }) {
  const [content, setContent] = useState(document.content);
  const [loadedBytes, setLoadedBytes] = useState(document.loadedBytes ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canReadMore = document.source === 'desktop' || Boolean(document.handle);
  const isComplete = loadedBytes >= document.size;

  useEffect(() => {
    setContent(document.content);
    setLoadedBytes(document.loadedBytes ?? 0);
    setLoading(false);
    setError('');
  }, [document.id, document.content, document.loadedBytes]);

  async function loadNextChunk() {
    if (!canReadMore || loading || isComplete || !document.textEncoding) return;
    setLoading(true);
    setError('');
    try {
      const chunk = document.source === 'desktop'
        ? await readDesktopTextChunk(document.path, loadedBytes, document.textEncoding)
        : await readBrowserTextChunk(document.handle!, loadedBytes, document.textEncoding);
      if (chunk.nextOffset <= loadedBytes) {
        setError('Aucune donnée supplémentaire n’a pu être lue. Le fichier a peut-être changé depuis son ouverture.');
        return;
      }
      const nextContent = content + chunk.content;
      const nextOffset = Math.min(document.size, chunk.nextOffset);
      setContent(nextContent);
      setLoadedBytes(nextOffset);
      onContentLoaded(document.id, nextContent, nextOffset);
    } catch {
      setError('Impossible de lire la suite du fichier. Vérifiez qu’il est toujours accessible.');
    } finally {
      setLoading(false);
    }
  }

  const progress = document.size > 0 ? Math.min(100, Math.round((loadedBytes / document.size) * 100)) : 100;

  return <div className="progressive-text-viewer">
    <CodeViewer content={content} extension={document.extension} lineNumbers={lineNumbers} wordWrap={wordWrap} fontSize={fontSize} />
    <div className="progressive-text-controls">
      <span>Lecture par blocs · {formatBytes(loadedBytes)} / {formatBytes(document.size)} · {progress}%</span>
      {!isComplete && <button className="subtle-button" type="button" disabled={!canReadMore || loading} title={!canReadMore ? 'Ouvrez ce fichier via le sélecteur pour autoriser la lecture progressive.' : undefined} onClick={() => void loadNextChunk()}>
        {loading ? <><LoaderCircle className="spin" size={13} />Chargement…</> : <><ArrowDown size={13} />Charger la suite</>}
      </button>}
      {!canReadMore && !isComplete && <small>Pour poursuivre, rouvrez ce fichier depuis le sélecteur Noto afin d’accorder un accès local contrôlé.</small>}
      {error && <small className="progressive-text-error" role="alert">{error}</small>}
    </div>
  </div>;
}
