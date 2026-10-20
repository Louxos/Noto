import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, FileDiff, FileUp, X } from 'lucide-react';
import { compareTextLines, type DiffRow } from '../lib/textDiff';
import type { OpenDocument } from '../types';

const COMPARABLE_KINDS = new Set(['markdown', 'text', 'code', 'html', 'csv', 'unknown']);

function canCompare(document: OpenDocument): boolean {
  return COMPARABLE_KINDS.has(document.kind) && !document.truncated;
}

export function TextDiffDialog({ documents, initialLeftId, onOpenFile, onClose }: { documents: OpenDocument[]; initialLeftId: string | null; onOpenFile: () => void; onClose: () => void }) {
  const comparable = documents.filter(canCompare);
  const [leftId, setLeftId] = useState(initialLeftId && comparable.some((file) => file.id === initialLeftId) ? initialLeftId : comparable[0]?.id ?? '');
  const [rightId, setRightId] = useState('');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreLineEndings, setIgnoreLineEndings] = useState(true);
  const [activeChangeIndex, setActiveChangeIndex] = useState(0);
  const leftScroll = useRef<HTMLDivElement>(null);
  const rightScroll = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);

  useEffect(() => {
    if (!comparable.some((file) => file.id === leftId)) setLeftId(comparable[0]?.id ?? '');
    const alternatives = comparable.filter((file) => file.id !== leftId);
    if (!alternatives.some((file) => file.id === rightId)) setRightId(alternatives[0]?.id ?? '');
  }, [comparable, leftId, rightId]);

  const left = comparable.find((file) => file.id === leftId);
  const right = comparable.find((file) => file.id === rightId);
  const comparison = useMemo(() => {
    if (!left || !right) return { result: null, error: '' };
    try { return { result: compareTextLines(left.content, right.content, { ignoreWhitespace, ignoreLineEndings }), error: '' }; }
    catch (cause) { return { result: null, error: cause instanceof Error ? cause.message : 'La comparaison a échoué.' }; }
  }, [ignoreLineEndings, ignoreWhitespace, left, right]);

  function syncScroll(source: HTMLDivElement | null, target: HTMLDivElement | null) {
    if (!source || !target || syncingScroll.current) return;
    syncingScroll.current = true;
    target.scrollTop = source.scrollTop;
    window.requestAnimationFrame(() => { syncingScroll.current = false; });
  }

  const rows = useMemo(() => comparison.result?.rows ?? [], [comparison.result]);
  const changeIndexes = useMemo(() => rows.flatMap((row, index) => row.kind === 'equal' ? [] : [index]), [rows]);

  useEffect(() => { setActiveChangeIndex(0); }, [leftId, rightId, ignoreLineEndings, ignoreWhitespace]);
  useEffect(() => { setActiveChangeIndex((current) => Math.min(current, Math.max(0, changeIndexes.length - 1))); }, [changeIndexes.length]);

  function navigateChange(direction: -1 | 1) {
    if (!changeIndexes.length) return;
    const nextIndex = (activeChangeIndex + direction + changeIndexes.length) % changeIndexes.length;
    setActiveChangeIndex(nextIndex);
    const rowIndex = changeIndexes[nextIndex];
    window.requestAnimationFrame(() => {
      const leftRow = leftScroll.current?.querySelector<HTMLElement>(`[data-diff-index="${rowIndex}"]`);
      const rightRow = rightScroll.current?.querySelector<HTMLElement>(`[data-diff-index="${rowIndex}"]`);
      leftRow?.scrollIntoView({ block: 'center' });
      rightRow?.scrollIntoView({ block: 'center' });
    });
  }
  const summary = comparison.result
    ? `${comparison.result.changes} modifiée${comparison.result.changes === 1 ? '' : 's'} · +${comparison.result.additions} · −${comparison.result.deletions}`
    : '';

  return <div className="modal-backdrop diff-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="text-diff-dialog" role="dialog" aria-modal="true" aria-labelledby="text-diff-title">
      <header className="text-diff-header">
        <span className="group-dialog-icon"><FileDiff size={18} /></span>
        <div><h2 id="text-diff-title">Comparer des fichiers</h2><p>Comparaison locale ; les documents originaux restent inchangés.</p></div>
        <button className="icon-action" type="button" title="Fermer" aria-label="Fermer la comparaison" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="text-diff-controls">
        <label><span>Fichier A</span><select aria-label="Fichier A" value={leftId} onChange={(event) => setLeftId(event.target.value)}>
          {comparable.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
        </select></label>
        <ArrowLeftRight className="text-diff-swap-icon" size={16} aria-hidden="true" />
        <label><span>Fichier B</span><select aria-label="Fichier B" value={rightId} onChange={(event) => setRightId(event.target.value)} disabled={!comparable.some((file) => file.id !== leftId)}>
          {comparable.filter((file) => file.id !== leftId).map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
        </select></label>
        <div className="text-diff-options">
          <label className="text-diff-option"><input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} />Ignorer les espaces</label>
          <label className="text-diff-option"><input type="checkbox" checked={ignoreLineEndings} onChange={(event) => setIgnoreLineEndings(event.target.checked)} />Ignorer les fins de ligne</label>
        </div>
        <div className="text-diff-change-nav" aria-label="Navigation des différences">
          <button className="tool-button" type="button" title="Différence précédente" aria-label="Différence précédente" disabled={!changeIndexes.length} onClick={() => navigateChange(-1)}><ArrowUp size={14} /></button>
          <span>{changeIndexes.length ? `${activeChangeIndex + 1}/${changeIndexes.length}` : '0/0'}</span>
          <button className="tool-button" type="button" title="Différence suivante" aria-label="Différence suivante" disabled={!changeIndexes.length} onClick={() => navigateChange(1)}><ArrowDown size={14} /></button>
        </div>
        <button className="secondary-button" type="button" onClick={onOpenFile}><FileUp size={14} />Ouvrir un fichier…</button>
      </div>
      <div className="text-diff-summary" aria-live="polite">{comparison.error ? <span role="alert">{comparison.error}</span> : summary || 'Ouvrez un second fichier texte pour commencer.'}</div>
      {comparison.result ? <div className="text-diff-grid">
        <div className="text-diff-pane-heading"><strong>{left?.name}</strong><span>Fichier A</span></div><div className="text-diff-pane-heading"><strong>{right?.name}</strong><span>Fichier B</span></div>
        <div className="text-diff-pane" ref={leftScroll} onScroll={() => syncScroll(leftScroll.current, rightScroll.current)} aria-label={`Comparaison du contenu de ${left?.name}`}>
          {rows.map((row, index) => <DiffLine key={`left-${index}`} index={index} active={changeIndexes[activeChangeIndex] === index} row={row} side="left" />)}
        </div>
        <div className="text-diff-pane" ref={rightScroll} onScroll={() => syncScroll(rightScroll.current, leftScroll.current)} aria-label={`Comparaison du contenu de ${right?.name}`}>
          {rows.map((row, index) => <DiffLine key={`right-${index}`} index={index} active={changeIndexes[activeChangeIndex] === index} row={row} side="right" />)}
        </div>
      </div> : !comparison.error && <div className="text-diff-empty"><FileDiff size={24} /><strong>Deux fichiers texte ouverts sont nécessaires.</strong><span>Ouvrez le second fichier, puis sélectionnez-le dans « Fichier B ».</span><button className="primary-button" type="button" onClick={onOpenFile}><FileUp size={15} />Ouvrir un fichier à comparer</button></div>}
      <footer className="text-diff-footer"><span>La comparaison est limitée à 3 000 lignes par fichier pour préserver la réactivité.</span><button className="secondary-button" type="button" onClick={onClose}>Terminé</button></footer>
    </section>
  </div>;
}

function DiffLine({ row, index, active, side }: { row: DiffRow; index: number; active: boolean; side: 'left' | 'right' }) {
  const isLeft = side === 'left';
  const number = isLeft ? row.leftLine : row.rightLine;
  const content = isLeft ? row.left : row.right;
  const empty = content === undefined;
  const marker = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : row.kind === 'changed' ? '~' : ' ';
  return <div className={`text-diff-line diff-${row.kind} ${empty ? 'diff-empty-line' : ''} ${active ? 'is-active' : ''}`} data-diff-index={index}>
    <span className="text-diff-line-number">{number ?? ''}</span><span className="text-diff-marker">{empty ? '' : marker}</span><code>{content ?? ' '}</code>
  </div>;
}
