import { AlertTriangle, CheckCircle2, Copy, FileWarning, ListChecks, Loader2, Play, Square, Upload, X } from 'lucide-react';
import { formatSize } from '../lib/jobs/output';
import type { JobRunResult } from '../lib/jobs/runner';
import type { StudioFile } from './useStudio';

/** Liste des fichiers de travail : provenance, doublons exacts, retrait. */
export function StudioFileList({
  files,
  duplicates,
  onRemove,
  onClear,
  onAdd,
  loading,
}: {
  files: StudioFile[];
  duplicates: { sha256: string; files: { id: string }[]; reclaimableBytes: number }[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onAdd: () => void;
  loading: boolean;
}) {
  const duplicateIds = new Set(duplicates.flatMap((group) => group.files.slice(1).map((file) => file.id)));
  return (
    <section className="studio-files" aria-label="Fichiers de l’atelier">
      <header className="studio-panel-head">
        <h2>Fichiers</h2>
        <div className="studio-panel-actions">
          <button type="button" className="studio-mini-button" onClick={onAdd} disabled={loading}>
            {loading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Ajouter
          </button>
          {files.length > 0 && <button type="button" className="studio-mini-button" onClick={onClear}>Vider</button>}
        </div>
      </header>
      {!files.length && (
        <p className="studio-empty">
          Ajoutez des fichiers pour commencer. Ils sont lus sur cet appareil : rien n’est envoyé en ligne.
        </p>
      )}
      <ul className="studio-file-list">
        {files.map((file) => (
          <li key={file.id} className={duplicateIds.has(file.id) ? 'is-duplicate' : ''}>
            <span className="studio-file-name" title={file.path ?? file.name}>{file.name}</span>
            <span className="studio-file-meta">
              {file.format.toUpperCase()} · {formatSize(file.size)}
              {duplicateIds.has(file.id) && <em className="studio-file-flag" title="Contenu identique à un autre fichier de la liste (SHA-256)">doublon exact</em>}
            </span>
            <button type="button" aria-label={`Retirer ${file.name}`} onClick={() => onRemove(file.id)}><X size={13} /></button>
          </li>
        ))}
      </ul>
      {duplicates.length > 0 && (
        <div className="studio-duplicates" role="note">
          <Copy size={13} aria-hidden="true" />
          <span>
            {duplicates.length} groupe(s) de fichiers strictement identiques (empreinte SHA-256) :
            {' '}{formatSize(duplicates.reduce((sum, group) => sum + group.reclaimableBytes, 0))} d’espace récupérables en ne gardant qu’un exemplaire.
          </span>
        </div>
      )}
    </section>
  );
}

/** Progression réelle, état par fichier et rapport de fin. */
export function StudioRunPanel({
  status,
  value,
  label,
  result,
  destination,
  onCancel,
  onRun,
  onExportReport,
  onReveal,
  runDisabledReason,
}: {
  status: 'idle' | 'running' | 'finished';
  value: number;
  label: string;
  result?: JobRunResult;
  destination?: string;
  onCancel: () => void;
  onRun: () => void;
  onExportReport: () => void;
  onReveal: (location: string) => void;
  runDisabledReason?: string;
}) {
  return (
    <section className="studio-run" aria-label="Traitement">
      <header className="studio-panel-head">
        <h2>Traitement</h2>
        <div className="studio-panel-actions">
          {status === 'running'
            ? <button type="button" className="studio-mini-button is-danger" onClick={onCancel}><Square size={12} /> Annuler</button>
            : <button type="button" className="studio-run-button" onClick={onRun} disabled={Boolean(runDisabledReason)} title={runDisabledReason}><Play size={14} /> Lancer le traitement</button>}
        </div>
      </header>

      {status !== 'idle' && (
        <div className="studio-progress">
          <div className="studio-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Progression réelle du traitement">
            <span style={{ width: `${Math.round(value * 100)}%` }} />
          </div>
          <p className="studio-progress-label">{label}{destination ? ` — vers ${destination}` : ''}</p>
        </div>
      )}

      {result && (
        <div className="studio-report">
          <div className={`studio-report-status is-${result.status}`}>
            {result.status === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <strong>{statusText(result.status)}</strong>
            <span>{result.outputs.length} fichier(s) produit(s) · {Math.max(0, Math.round((result.finishedAt - result.startedAt) / 100) / 10)} s</span>
          </div>

          {result.measurements.length > 0 && (
            <ul className="studio-measurements">
              {result.measurements.map((measurement, index) => (
                <li key={`${measurement.label}-${index}`}>
                  <strong>{measurement.label}</strong>
                  <span>
                    {measurement.unit === 'bytes' ? `${formatSize(measurement.before)} → ${formatSize(measurement.after)}` : `${measurement.before} → ${measurement.after} ${unitLabel(measurement.unit)}`}
                    {measurement.unit === 'bytes' && measurement.before > 0 && (
                      <em>{measurement.after <= measurement.before ? `−${Math.round((1 - measurement.after / measurement.before) * 100)} %` : `+${Math.round((measurement.after / measurement.before - 1) * 100)} %`}</em>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <ul className="studio-outcomes">
            {result.outcomes.map((outcome) => (
              <li key={`${outcome.file.id}-${outcome.status}`} className={`is-${outcome.status}`}>
                <span className={`studio-outcome-dot is-${outcome.status}`} aria-hidden="true" />
                <span className="studio-outcome-name" title={outcome.file.path ?? outcome.file.name}>{outcome.file.name}</span>
                <span className="studio-outcome-detail">
                  {outcome.status === 'done' && outcome.written.length > 0 && (
                    <>
                      <button type="button" className="studio-link" onClick={() => onReveal(outcome.written[0].location)}>{outcome.written.map((output) => output.name).join(', ')}</button>
                    </>
                  )}
                  {outcome.status === 'done' && outcome.written.length === 0 && <span>{outcome.outputs.length} résultat(s) en mémoire</span>}
                  {outcome.status === 'failed' && <span className="is-error">{outcome.error}</span>}
                  {outcome.status === 'cancelled' && <span>annulé</span>}
                  {outcome.status === 'done' && outcome.warnings.length > 0 && <span className="is-warning" title={outcome.warnings.join('\n')}>{outcome.warnings.length} avertissement(s)</span>}
                </span>
              </li>
            ))}
          </ul>

          {result.warnings.length > 0 && (
            <details className="studio-warnings">
              <summary><FileWarning size={13} aria-hidden="true" /> {result.warnings.length} avertissement(s) à lire</summary>
              <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}

          {result.errors.length > 0 && (
            <details className="studio-errors" open>
              <summary><AlertTriangle size={13} aria-hidden="true" /> {result.errors.length} erreur(s)</summary>
              <ul>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </details>
          )}

          <div className="studio-report-actions">
            <button type="button" className="studio-mini-button" onClick={onExportReport}><ListChecks size={13} /> Exporter le rapport</button>
          </div>
        </div>
      )}
    </section>
  );
}

function statusText(status: JobRunResult['status']): string {
  if (status === 'success') return 'Traitement terminé';
  if (status === 'partial') return 'Terminé avec des erreurs signalées';
  if (status === 'cancelled') return 'Traitement annulé';
  return 'Le traitement a échoué';
}

function unitLabel(unit: 'pages' | 'items' | 'percent'): string {
  if (unit === 'pages') return 'page(s)';
  if (unit === 'percent') return '%';
  return 'élément(s)';
}
