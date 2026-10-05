import { useMemo } from 'react';
import { parseCsv } from '../lib/csv';

export function CsvViewer({ content }: { content: string }) {
  const parsed = useMemo(() => parseCsv(content), [content]);
  if (parsed.rows.length === 0) {
    return <div className="viewer-empty"><span>Aucune donnée à afficher.</span></div>;
  }

  const visibleRows = parsed.rows.slice(0, 5_000);
  const header = visibleRows[0] ?? [];

  return (
    <div className="csv-viewer">
      <div className="csv-status">
        <span><strong>{parsed.rows.length.toLocaleString('fr-FR')}</strong> lignes</span>
        <span>{parsed.columns} colonnes</span>
        <span>Séparateur {parsed.delimiter === '\t' ? 'tabulation' : `« ${parsed.delimiter} »`}</span>
        {parsed.rows.length > visibleRows.length && <span className="csv-truncated">Aperçu limité aux 5 000 premières lignes</span>}
      </div>
      <div className="csv-scroll">
        <table className="csv-table">
          <thead>
            <tr>
              <th className="row-number-heading" scope="col">#</th>
              {Array.from({ length: parsed.columns }, (_, column) => (
                <th scope="col" key={column}>{header[column] || `Colonne ${column + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.slice(1).map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className="row-number" scope="row">{rowIndex + 2}</th>
                {Array.from({ length: parsed.columns }, (_, column) => (
                  <td key={column} title={row[column] ?? ''}>{row[column] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
