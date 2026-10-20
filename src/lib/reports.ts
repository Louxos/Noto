import type { OperationReport } from './operations/types';
import type { HistoryEntry } from './history';
import { formatSize } from './jobs/output';
import type { JobRunResult } from './jobs/runner';

/**
 * Rapports exportables.
 *
 * Les rapports décrivent le travail réellement effectué : fichiers traités,
 * erreurs par fichier, mesures avant/après. Ils ne contiennent jamais le
 * contenu des documents, uniquement des métadonnées et des résultats.
 */

export function operationReportToMarkdown(report: OperationReport): string {
  const lines: string[] = [`# ${report.title}`, '', report.summary, ''];
  for (const section of report.sections) {
    lines.push(`## ${section.title}`, '');
    if (section.table?.length) {
      const [header, ...rows] = section.table;
      lines.push(`| ${header.join(' | ')} |`);
      lines.push(`| ${header.map(() => '---').join(' | ')} |`);
      for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
      lines.push('');
    }
    for (const line of section.lines) lines.push(`- ${line}`);
    if (section.lines.length) lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd() + '\n';
}

export function jobResultToMarkdown(result: JobRunResult, title = 'Rapport de traitement Noto'): string {
  const statusLabels: Record<JobRunResult['status'], string> = {
    success: 'Terminé sans erreur',
    partial: 'Terminé avec des erreurs sur certains fichiers',
    failed: 'Échec',
    cancelled: 'Annulé',
  };
  const lines: string[] = [
    `# ${title}`,
    '',
    `- Statut : ${statusLabels[result.status]}`,
    `- Début : ${new Date(result.startedAt).toLocaleString('fr-FR')}`,
    `- Fin : ${new Date(result.finishedAt).toLocaleString('fr-FR')}`,
    `- Durée : ${formatDuration(result.finishedAt - result.startedAt)}`,
    `- Fichiers traités : ${result.outcomes.filter((outcome) => outcome.status === 'done').length} sur ${result.outcomes.length}`,
    `- Fichiers produits : ${result.outputs.length}`,
    '',
  ];
  if (result.measurements.length) {
    lines.push('## Mesures', '');
    for (const measurement of result.measurements) {
      lines.push(`- ${measurement.label} : ${formatMeasurement(measurement)}`);
    }
    lines.push('');
  }
  lines.push('## Fichiers', '');
  lines.push('| Fichier | Statut | Produits | Durée | Remarque |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const outcome of result.outcomes) {
    lines.push([
      outcome.file.name,
      outcome.status === 'done' ? 'traité' : outcome.status === 'failed' ? 'échec' : outcome.status === 'cancelled' ? 'annulé' : 'en attente',
      outcome.written.length ? outcome.written.map((file) => file.name).join(', ') : '—',
      formatDuration(outcome.durationMs),
      outcome.error ?? (outcome.warnings.length ? outcome.warnings.join(' ; ') : ''),
    ].map(escapeCell).join(' | ').replace(/^/u, '| ').concat(' |'));
  }
  lines.push('');
  if (result.warnings.length) {
    lines.push('## Avertissements', '');
    for (const warning of result.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }
  if (result.errors.length) {
    lines.push('## Erreurs', '');
    for (const error of result.errors) lines.push(`- ${error}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function jobResultToCsv(result: JobRunResult): string {
  const rows: string[][] = [['fichier', 'statut', 'produits', 'duree_ms', 'erreur']];
  for (const outcome of result.outcomes) {
    rows.push([
      outcome.file.name,
      outcome.status,
      outcome.written.map((file) => file.name).join(' '),
      String(outcome.durationMs),
      outcome.error ?? '',
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function historyToCsv(entries: HistoryEntry[]): string {
  const rows: string[][] = [['date', 'operation', 'statut', 'fichiers_sources', 'fichiers_produits', 'duree_ms', 'erreurs']];
  for (const entry of entries) {
    rows.push([
      new Date(entry.startedAt).toISOString(),
      entry.operationLabel,
      entry.status,
      entry.sourceFiles.map((file) => file.name).join(' '),
      entry.producedFiles.map((file) => file.name).join(' '),
      String(entry.finishedAt - entry.startedAt),
      entry.errors.join(' ; '),
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function historyToMarkdown(entries: HistoryEntry[]): string {
  const lines: string[] = [
    '# Historique des opérations Noto',
    '',
    `- Entrées : ${entries.length}`,
    `- Export : ${new Date().toLocaleString('fr-FR')}`,
    '',
    '| Date | Opération | Statut | Fichiers | Produits | Durée |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of entries) {
    lines.push([
      new Date(entry.startedAt).toLocaleString('fr-FR'),
      entry.operationLabel,
      entry.status,
      entry.sourceFiles.map((file) => file.name).join(', ') || '—',
      entry.producedFiles.map((file) => file.name).join(', ') || '—',
      formatDuration(entry.finishedAt - entry.startedAt),
    ].map(escapeCell).join(' | ').replace(/^/u, '| ').concat(' |'));
  }
  return lines.join('\n') + '\n';
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1_000;
  if (seconds < 60) return `${seconds.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

function formatMeasurement(measurement: { label: string; before: number; after: number; unit: string }): string {
  if (measurement.unit === 'bytes') {
    const saved = measurement.before - measurement.after;
    const percent = measurement.before ? Math.round((saved / measurement.before) * 1000) / 10 : 0;
    return `${formatSize(measurement.before)} → ${formatSize(measurement.after)} (${saved >= 0 ? 'économie' : 'augmentation'} de ${Math.abs(percent)} %)`;
  }
  if (measurement.unit === 'percent') {
    return `${measurement.before} % → ${measurement.after} %`;
  }
  return `${measurement.before} → ${measurement.after}`;
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export const REPORT_FILE_EXTENSIONS = ['md', 'csv', 'json'] as const;
export type ReportFormat = (typeof REPORT_FILE_EXTENSIONS)[number];
