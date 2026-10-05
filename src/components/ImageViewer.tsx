import { useEffect, useState } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2, ImageOff } from 'lucide-react';
import * as UTIF from 'utif';
import type { OpenDocument } from '../types';
import { formatBytes } from '../lib/files';

function makeTiffPreview(bytes: Uint8Array): string {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const pages = UTIF.decode(buffer);
  if (!pages.length) throw new Error('Aucune page TIFF lisible.');
  UTIF.decodeImage(buffer, pages[0]);
  const rgba = UTIF.toRGBA8(pages[0]);
  const canvas = window.document.createElement('canvas');
  canvas.width = Number(pages[0].width);
  canvas.height = Number(pages[0].height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Impossible de préparer l’image.');
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
  return canvas.toDataURL('image/png');
}

export function ImageViewer({ document }: { document: OpenDocument }) {
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [source, setSource] = useState<string>();
  const [error, setError] = useState('');
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const isTiff = document.extension === 'tif' || document.extension === 'tiff';

  useEffect(() => {
    setZoom(1);
    setFit(true);
    setRotation(0);
    setNaturalSize({ width: 0, height: 0 });
    setSource(undefined);
    setError('');
    if (!document.bytes) {
      setError('Les données de cette image ne sont pas disponibles.');
      return;
    }
    if (isTiff) {
      try {
        setSource(makeTiffPreview(document.bytes));
      } catch {
        setError('Cette image TIFF ne peut pas être affichée.');
      }
      return;
    }
    const imageBuffer = document.bytes.buffer.slice(document.bytes.byteOffset, document.bytes.byteOffset + document.bytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([imageBuffer], { type: document.mimeType }));
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [document, isTiff]);

  const dimensions = `${naturalSize.width && naturalSize.height ? `${naturalSize.width} × ${naturalSize.height} px · ` : ''}${formatBytes(document.size)}`;

  return (
    <div className="image-viewer">
      <div className="viewer-tools image-tools">
        <div className="tool-group">
          <button className="tool-button" type="button" aria-label="Réduire le zoom" title="Réduire" onClick={() => { setFit(false); setZoom((value) => Math.max(0.2, value - 0.1)); }}><ZoomOut size={16} /></button>
          <button className="zoom-label" type="button" onClick={() => { setFit(false); setZoom(1); }}>{Math.round(zoom * 100)}%</button>
          <button className="tool-button" type="button" aria-label="Augmenter le zoom" title="Agrandir" onClick={() => { setFit(false); setZoom((value) => Math.min(4, value + 0.1)); }}><ZoomIn size={16} /></button>
          <span className="tool-divider" />
          <button className={`tool-button ${fit ? 'is-selected' : ''}`} type="button" title="Ajuster à la fenêtre" aria-label="Ajuster à la fenêtre" onClick={() => { setFit(true); setZoom(1); }}><Maximize2 size={15} /></button>
        </div>
        <div className="tool-group">
          <button className="tool-button" type="button" title="Pivoter à gauche" aria-label="Pivoter à gauche" onClick={() => setRotation((value) => value - 90)}><RotateCcw size={15} /></button>
          <button className="tool-button" type="button" title="Pivoter à droite" aria-label="Pivoter à droite" onClick={() => setRotation((value) => value + 90)}><RotateCw size={15} /></button>
          <span className="image-size-label">{dimensions}</span>
        </div>
      </div>
      <div className="image-stage">
        {error ? (
          <div className="viewer-empty"><ImageOff size={22} /><span>{error}</span></div>
        ) : source ? (
          <img
            className={`image-preview ${fit ? 'image-fit' : 'image-natural'}`}
            src={source}
            alt={document.name}
            draggable={false}
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setError('Impossible de décoder cette image.')}
          />
        ) : <div className="viewer-empty">Chargement de l’image…</div>}
      </div>
    </div>
  );
}
