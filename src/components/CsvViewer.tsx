import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from 'lucide-react';
import { parseCsv, serializeCsvRows } from '../lib/csv';

const MAX_VISIBLE_ROWS = 5_000;
const DEFAULT_COLUMN_WIDTH = 190;
const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 640;

export function CsvViewer({ content, fileName = 'tableau.csv' }: { content: string; fileName?: string }) {
  const parsed = useMemo(() => parseCsv(content), [content]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: number; ascending: boolean } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set<number>());
  const headerSelectionRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ pointerId: number; column: number; startX: number; startWidth: number } | null>(null);
  const header = parsed.rows[0] ?? [];
  const matchingRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
    const rows = parsed.rows.slice(1).map((row, index) => ({ row, index }));
    const filtered = normalizedQuery
      ? rows.filter(({ row }) => row.some((cell) => cell.toLocaleLowerCase('fr-FR').includes(normalizedQuery)))
      : rows;
    if (!sort) return filtered;
    return [...filtered].sort((left, right) => {
      const first = left.row[sort.column] ?? '';
      const second = right.row[sort.column] ?? '';
      const firstNumber = Number(first.replace(',', '.'));
      const secondNumber = Number(second.replace(',', '.'));
      const numeric = first.trim() !== '' && second.trim() !== '' && Number.isFinite(firstNumber) && Number.isFinite(secondNumber);
      const comparison = numeric ? firstNumber - secondNumber : first.localeCompare(second, 'fr', { numeric: true, sensitivity: 'base' });
      return (sort.ascending ? comparison : -comparison) || left.index - right.index;
    });
  }, [parsed.rows, query, sort]);
  const visibleRows = matchingRows.slice(0, MAX_VISIBLE_ROWS);
  const selectedVisibleCount = visibleRows.reduce((count, item) => count + Number(selectedRows.has(item.index)), 0);
  const allVisibleSelected = visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;

  useEffect(() => {
    setColumnWidths({});
    setSelectedRows(new Set());
    setSort(null);
    setQuery('');
  }, [content]);

  useEffect(() => {
    if (headerSelectionRef.current) headerSelectionRef.current.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
  }, [allVisibleSelected, selectedVisibleCount]);

  if (parsed.rows.length === 0) {
    return <div className="viewer-empty"><span>Aucune donnée à afficher.</span></div>;
  }

  function toggleVisibleRows(selected: boolean) {
    setSelectedRows((current) => {
      const next = new Set(current);
      visibleRows.forEach(({ index }) => selected ? next.add(index) : next.delete(index));
      return next;
    });
  }

  function startColumnResize(event: ReactPointerEvent<HTMLButtonElement>, column: number) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { pointerId: event.pointerId, column, startX: event.clientX, startWidth: columnWidths[column] ?? DEFAULT_COLUMN_WIDTH };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveColumnResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const width = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(resize.startWidth + event.clientX - resize.startX)));
    setColumnWidths((current) => current[resize.column] === width ? current : { ...current, [resize.column]: width });
  }

  function endColumnResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function exportSelection() {
    const selected = new Set(selectedRows);
    const rows = [header, ...parsed.rows.slice(1).filter((_, index) => selected.has(index))];
    if (selected.size === 0) return;
    const extension = parsed.delimiter === '\t' ? 'tsv' : 'csv';
    const basename = fileName.replace(/\.[^.]+$/u, '') || 'tableau';
    const mimeType = extension === 'tsv' ? 'text/tab-separated-values' : 'text/csv';
    const blob = new Blob([`\uFEFF${serializeCsvRows(rows, parsed.delimiter)}`], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${basename}-selection.${extension}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return (
    <div className="csv-viewer">
      <div className="csv-status">
        <span><strong>{matchingRows.length.toLocaleString('fr-FR')}</strong>{query.trim() ? ` / ${parsed.rows.length - 1} lignes` : ' lignes'}</span>
        <span>{parsed.columns} colonnes</span>
        <span>Séparateur {parsed.delimiter === '\t' ? 'tabulation' : `« ${parsed.delimiter} »`}</span>
        {matchingRows.length > visibleRows.length && <span className="csv-truncated">Aperçu limité aux 5 000 lignes visibles</span>}
        <button className="csv-export-button" type="button" disabled={!selectedRows.size} onClick={exportSelection}><Download size={13} />Exporter la sélection{selectedRows.size ? ` (${selectedRows.size})` : ''}</button>
        <label className="csv-filter"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer les lignes" aria-label="Filtrer les lignes du tableau" /></label>
      </div>
      <div className="csv-scroll">
        <table className="csv-table">
          <colgroup>
            <col style={{ width: 49 }} />
            {Array.from({ length: parsed.columns }, (_, column) => <col key={column} style={{ width: columnWidths[column] ?? DEFAULT_COLUMN_WIDTH }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="row-number-heading" scope="col"><input ref={headerSelectionRef} className="csv-row-checkbox" type="checkbox" checked={allVisibleSelected} disabled={!visibleRows.length} aria-label="Sélectionner toutes les lignes visibles" onChange={(event) => toggleVisibleRows(event.target.checked)} /></th>
              {Array.from({ length: parsed.columns }, (_, column) => <th scope="col" key={column}>
                <button className="csv-sort-button" type="button" title={`Trier par ${header[column] || `Colonne ${column + 1}`}`} onClick={() => setSort((current) => current?.column === column ? { column, ascending: !current.ascending } : { column, ascending: true })}>
                  <span>{header[column] || `Colonne ${column + 1}`}</span>{sort?.column === column ? sort.ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
                </button>
                <button className="csv-column-resizer" type="button" role="separator" aria-orientation="vertical" aria-valuemin={MIN_COLUMN_WIDTH} aria-valuemax={MAX_COLUMN_WIDTH} aria-valuenow={columnWidths[column] ?? DEFAULT_COLUMN_WIDTH} aria-label={`Redimensionner ${header[column] || `la colonne ${column + 1}`}`} title="Glisser, utiliser les flèches ← → ou double-cliquer pour ajuster la largeur" onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  const delta = event.key === 'ArrowRight' ? 10 : -10;
                  setColumnWidths((current) => ({ ...current, [column]: Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, (current[column] ?? DEFAULT_COLUMN_WIDTH) + delta)) }));
                }} onPointerDown={(event) => startColumnResize(event, column)} onPointerMove={moveColumnResize} onPointerUp={endColumnResize} onPointerCancel={endColumnResize} onDoubleClick={(event) => {
                  event.stopPropagation();
                  setColumnWidths((current) => { const next = { ...current }; delete next[column]; return next; });
                }} />
              </th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, index }) => <tr key={index}>
              <th className="row-number" scope="row"><input className="csv-row-checkbox" type="checkbox" checked={selectedRows.has(index)} aria-label={`Sélectionner la ligne ${index + 2}`} onChange={(event) => setSelectedRows((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(index); else next.delete(index);
                return next;
              })} /><span>{index + 2}</span></th>
              {Array.from({ length: parsed.columns }, (_, column) => <td key={column} title={row[column] ?? ''}>{row[column] ?? ''}</td>)}
            </tr>)}
            {visibleRows.length === 0 && <tr><td className="csv-no-results" colSpan={parsed.columns + 1}>Aucune ligne ne correspond à « {query} ».</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
