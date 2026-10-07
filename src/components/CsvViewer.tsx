import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { parseCsv } from '../lib/csv';

export function CsvViewer({ content }: { content: string }) {
  const parsed = useMemo(() => parseCsv(content), [content]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: number; ascending: boolean } | null>(null);
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

  if (parsed.rows.length === 0) {
    return <div className="viewer-empty"><span>Aucune donnée à afficher.</span></div>;
  }

  const visibleRows = matchingRows.slice(0, 5_000);

  return (
    <div className="csv-viewer">
      <div className="csv-status">
        <span><strong>{matchingRows.length.toLocaleString('fr-FR')}</strong>{query.trim() ? ` / ${parsed.rows.length - 1} lignes` : ' lignes'}</span>
        <span>{parsed.columns} colonnes</span>
        <span>Séparateur {parsed.delimiter === '\t' ? 'tabulation' : `« ${parsed.delimiter} »`}</span>
        {matchingRows.length > visibleRows.length && <span className="csv-truncated">Aperçu limité aux 5 000 lignes visibles</span>}
        <label className="csv-filter"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer les lignes" aria-label="Filtrer les lignes du tableau" /></label>
      </div>
      <div className="csv-scroll">
        <table className="csv-table">
          <thead>
            <tr>
              <th className="row-number-heading" scope="col">#</th>
              {Array.from({ length: parsed.columns }, (_, column) => <th scope="col" key={column}>
                <button className="csv-sort-button" type="button" title={`Trier par ${header[column] || `Colonne ${column + 1}`}`} onClick={() => setSort((current) => current?.column === column ? { column, ascending: !current.ascending } : { column, ascending: true })}>
                  <span>{header[column] || `Colonne ${column + 1}`}</span>{sort?.column === column ? sort.ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
                </button>
              </th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, index }) => <tr key={index}>
              <th className="row-number" scope="row">{index + 2}</th>
              {Array.from({ length: parsed.columns }, (_, column) => <td key={column} title={row[column] ?? ''}>{row[column] ?? ''}</td>)}
            </tr>)}
            {visibleRows.length === 0 && <tr><td className="csv-no-results" colSpan={parsed.columns + 1}>Aucune ligne ne correspond à « {query} ».</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
