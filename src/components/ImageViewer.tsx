import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2, ImageOff } from 'lucide-react';
import * as UTIF from 'utif';
import type { OpenDocument } from '../types';
import type { StatRow } from '../lib/fileStats';
import { formatBytes } from '../lib/files';
import { findAdjacentImagePaths } from '../lib/imageNavigation';
import { ContextMenu, type MenuEntry } from './WorkspaceTools';

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

export function ImageViewer({ document, fileContextItems, onOpenPath, onReadout }: { document: OpenDocument; fileContextItems: MenuEntry[]; onOpenPath: (path: string) => void; onReadout?: (rows: StatRow[]) => void }) {
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [source, setSource] = useState<string>();
  const [error, setError] = useState('');
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [adjacentImages, setAdjacentImages] = useState<{ previousPath: string | null; nextPath: string | null }>({ previousPath: null, nextPath: null });
  const [adjacentImagesLoading, setAdjacentImagesLoading] = useState(false);
  const isTiff = document.extension === 'tif' || document.extension === 'tiff';

  useEffect(() => {
    setAdjacentImages({ previousPath: null, nextPath: null });
    setAdjacentImagesLoading(false);
    if (document.source !== 'desktop' || !document.path) return;
    let cancelled = false;
    setAdjacentImagesLoading(true);
    void findAdjacentImagePaths(document.path).then((neighbors) => {
      if (!cancelled) setAdjacentImages(neighbors);
    }).catch(() => {
      if (!cancelled) setAdjacentImages({ previousPath: null, nextPath: null });
    }).finally(() => {
      if (!cancelled) setAdjacentImagesLoading(false);
    });
    return () => { cancelled = true; };
  }, [document.id, document.path, document.source]);

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

  // Relevé pour la barre d’état et la fenêtre d’informations. Les dimensions
  // viennent du décodage réel de l’image, jamais d’une supposition.
  useEffect(() => {
    if (!onReadout || !naturalSize.width || !naturalSize.height) return;
    onReadout([
      { label: 'Dimensions', value: `${naturalSize.width} × ${naturalSize.height} px` },
      { label: 'Zoom', value: fit ? 'ajusté à la fenêtre' : `${Math.round(zoom * 100)} %` },
      ...(rotation % 360 !== 0 ? [{ label: 'Rotation', value: `${rotation % 360}°` }] : []),
    ]);
  }, [onReadout, naturalSize, zoom, fit, rotation]);
  const imageContextItems: MenuEntry[] = [
    ...fileContextItems,
    { id: 'rotate-image-left', label: 'Pivoter à gauche', icon: <RotateCcw size={15} />, dividerBefore: true, onSelect: () => setRotation((value) => value - 90) },
    { id: 'rotate-image-right', label: 'Pivoter à droite', icon: <RotateCw size={15} />, onSelect: () => setRotation((value) => value + 90) },
    { id: 'fit-image', label: 'Ajuster à la fenêtre', icon: <Maximize2 size={15} />, onSelect: () => { setFit(true); setZoom(1); } },
    { id: 'zoom-image-in', label: 'Agrandir', icon: <ZoomIn size={15} />, onSelect: () => { setFit(false); setZoom((value) => Math.min(4, value + 0.1)); } },
    { id: 'zoom-image-out', label: 'Réduire', icon: <ZoomOut size={15} />, onSelect: () => { setFit(false); setZoom((value) => Math.max(0.2, value - 0.1)); } },
  ];

  return (
    <div className="image-viewer" onContextMenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY });
    }}>
      <div className="viewer-tools image-tools">
        <div className="tool-group image-navigation-tools" aria-label="Images voisines du même dossier">
          <button className="tool-button" type="button" title={adjacentImages.previousPath ? `Image précédente : ${imagePathName(adjacentImages.previousPath)}` : 'Aucune image précédente dans ce dossier'} aria-label={adjacentImages.previousPath ? `Ouvrir l’image précédente ${imagePathName(adjacentImages.previousPath)}` : 'Aucune image précédente'} disabled={!adjacentImages.previousPath || adjacentImagesLoading} onClick={() => { if (adjacentImages.previousPath) onOpenPath(adjacentImages.previousPath); }}><ChevronLeft size={16} /></button>
          <button className="tool-button" type="button" title={adjacentImages.nextPath ? `Image suivante : ${imagePathName(adjacentImages.nextPath)}` : 'Aucune image suivante dans ce dossier'} aria-label={adjacentImages.nextPath ? `Ouvrir l’image suivante ${imagePathName(adjacentImages.nextPath)}` : 'Aucune image suivante'} disabled={!adjacentImages.nextPath || adjacentImagesLoading} onClick={() => { if (adjacentImages.nextPath) onOpenPath(adjacentImages.nextPath); }}><ChevronRight size={16} /></button>
          {adjacentImagesLoading && <span className="image-neighbor-loading" aria-live="polite">Images voisines…</span>}
        </div>
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
      {contextMenu && <ContextMenu position={contextMenu} items={imageContextItems} onClose={() => setContextMenu(null)} />}
    </div>
  );
}

function imagePathName(path: string): string {
  return path.split(/[\\/]/u).at(-1) || path;
}
