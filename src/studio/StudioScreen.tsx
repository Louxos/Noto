import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, HardDriveDownload, ShieldCheck, Wrench } from 'lucide-react';
import { ALL_OPERATIONS, operationsForFormat } from '../lib/operations';
import { describeFormat, familyOf, type FormatId } from '../lib/documents/formats';
import { formatDuration, historyToMarkdown } from '../lib/reports';
import { loadHistory, saveHistory, type HistoryEntry } from '../lib/history';
import { createOutputWriter } from '../lib/jobs/output';
import { OPERATION_CATEGORIES } from '../lib/operations';
import { OperationDetails, OperationPicker, ParameterForm, NoticeStack, FileSummary } from './StudioPanels';
import { OcrModelsPanel } from './OcrModelsPanel';
import { StudioFileList, StudioRunPanel } from './StudioRunPanel';
import { useStudio } from './useStudio';
import './studio.css';

/**
 * Atelier : espace de traitement unifié de Noto.
 *
 * Toutes les opérations déclarées dans le registre sont exécutables ici sur des
 * fichiers choisis localement, avec progression réelle, annulation, écriture
 * vérifiée, rapport et historique. Les sections « atelier » de la navigation
 * ouvrent cet espace sur la famille de fichiers correspondante.
 */

export interface StudioRequest {
  /** Identifiant d’opération à présélectionner. */
  operationId?: string;
  /** Chemins de fichiers à ajouter immédiatement. */
  paths?: string[];
  /** Filtre de départ par famille de formats. */
  family?: 'pdf' | 'image' | 'text' | 'office';
}

export default function StudioScreen({ request, onClose }: { request?: StudioRequest | null; onClose: () => void }) {
  const studio = useStudio();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [pendingPaths, setPendingPaths] = useState<string[]>([]);

  useEffect(() => {
    if (request?.paths?.length) {
      setPendingPaths(request.paths);
      return;
    }
    if (request?.operationId) studio.selectOperation(request.operationId);
    // Le hook est stable : l’effet ne doit s’exécuter qu’à l’ouverture d’une nouvelle demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.operationId, request?.paths]);

  useEffect(() => {
    if (!pendingPaths.length) return;
    setPendingPaths([]);
    void studio.addDesktopPaths(pendingPaths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPaths]);

  const refreshHistory = useCallback(() => setHistory(loadHistory()), []);

  const clearHistory = useCallback(() => {
    saveHistory([]);
    setHistory([]);
  }, []);

  const exportHistory = useCallback(async () => {
    const entries = loadHistory();
    if (!entries.length) {
      studio.notify('info', 'L’historique est vide : il n’y a rien à exporter.');
      return;
    }
    try {
      const writer = await createOutputWriter({});
      const name = `noto-historique-${new Date().toISOString().slice(0, 10)}.md`;
      const location = await writer.write({ name, bytes: new TextEncoder().encode(historyToMarkdown(entries)), format: 'md', note: 'Historique local des traitements' });
      studio.notify('success', `Historique exporté : ${location.name}.`);
    } catch (error) {
      studio.notify('error', error instanceof Error ? error.message : 'Export impossible.');
    }
  }, [studio]);

  const families = request?.family === 'text' ? ['text', 'table'] : request?.family ? [request.family] : [];
  const scopedOperations = families.length
    ? studio.availableOperations
    : ALL_OPERATIONS;

  const runDisabledReason = !studio.files.length
    ? 'Ajoutez au moins un fichier.'
    : !studio.operation
      ? 'Aucun outil de Noto ne prend en charge ces fichiers.'
      : undefined;

  return (
    <div className="studio">
      <header className="studio-head">
        <div className="studio-head-title">
          <span className="studio-head-icon"><Wrench size={16} /></span>
          <div>
            <h1>Atelier</h1>
            <p>{studio.operation ? studio.operation.label : 'Traitement local de vos fichiers, sans envoi en ligne'}</p>
          </div>
        </div>
        <div className="studio-head-actions">
          <button type="button" className="studio-mini-button" onClick={() => void studio.pickDesktopFiles()}>
            <FolderOpen size={13} /> Choisir des fichiers
          </button>
          <button type="button" className="studio-mini-button" onClick={() => void studio.runToDirectory()} disabled={Boolean(runDisabledReason)} title={runDisabledReason}>
            <HardDriveDownload size={13} /> Dossier de sortie
          </button>
          <button type="button" className="studio-mini-button" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>
            Historique {history.length > 0 ? `(${history.length})` : ''}
          </button>
          <button type="button" className="studio-mini-button" onClick={onClose}>Fermer l’atelier</button>
        </div>
      </header>

      <NoticeStack notices={studio.notices} onDismiss={studio.dismissNotice} />

      <div className="studio-body">
        <aside className="studio-column studio-column-tools" aria-label="Outils disponibles">
          <h2>Outils</h2>
          {studio.files.length === 0 ? (
            <p className="studio-empty">
              Ajoutez des fichiers : Noto n’affiche ensuite que les outils réellement capables de les traiter.
            </p>
          ) : !studio.availableOperations.length ? (
            <p className="studio-empty">
              Ces fichiers ne sont pas encore pris en charge par un outil de traitement. Noto préfère ne rien proposer plutôt qu’un bouton sans effet.
            </p>
          ) : (
            <OperationPicker operations={scopedOperations} selected={studio.operation} onSelect={studio.selectOperation} allowedIds={new Set(studio.availableOperations.map((operation) => operation.id))} />
          )}
        </aside>

        <section className="studio-column studio-column-work" aria-label="Fichiers et réglages">
          <StudioFileList
            files={studio.visibleFiles}
            duplicates={studio.duplicates}
            onRemove={studio.removeFile}
            onClear={studio.clearFiles}
            onAdd={() => void studio.pickDesktopFiles()}
            loading={studio.loadingFiles}
          />

          {studio.operation && (
            <>
              <section className="studio-settings" aria-label="Réglages de l’outil">
                <header className="studio-panel-head">
                  <h2>Réglages</h2>
                  <FileSummary files={studio.files} />
                </header>
                <ParameterForm operation={studio.operation} values={studio.params} onChange={studio.setParam} />
              </section>
              <OperationDetails operation={studio.operation} />
              {studio.operation.category === 'ocr' && (
                <OcrModelsPanel
                  languages={String(studio.params.languages ?? 'fra').split(/[,;\s]+/u).filter(Boolean)}
                  onConsentChanged={() => studio.notify('info', 'Accord OCR enregistré : le téléchargement des modèles aura lieu au premier traitement, puis restera en cache local.')}
                />
              )}
            </>
          )}

          {studio.files.length > 0 && (
            <section className="studio-capabilities" aria-label="Prise en charge des formats présents">
              <h2>Prise en charge constatée</h2>
              <ul>
                {uniqueFormats(studio.files.map((file) => file.format)).map((format) => {
                  const descriptor = describeFormat(format);
                  return (
                    <li key={format}>
                      <strong>{descriptor.label}</strong>
                      <span className="studio-support" data-level={descriptor.write}>
                        {supportLabel(descriptor.read, descriptor.write)}
                      </span>
                      <span className="studio-support-note">{descriptor.notes}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </section>

        <div className="studio-column studio-column-run">
          <StudioRunPanel
            status={studio.run.status}
            value={studio.run.value}
            label={studio.run.label}
            result={studio.run.result}
            destination={studio.run.destination}
            onCancel={studio.cancel}
            onRun={() => void studio.runOperation()}
            onExportReport={() => void studio.exportReport()}
            onReveal={(location) => void studio.revealLastOutput(location)}
            runDisabledReason={runDisabledReason}
          />

          <section className="studio-privacy" aria-label="Confidentialité">
            <ShieldCheck size={14} aria-hidden="true" />
            <p>
              Tout le traitement se fait sur cet appareil. Noto n’envoie aucun fichier, ne dépose aucune donnée sur un serveur
              et n’interroge aucun service en ligne. Les fichiers d’origine ne sont jamais modifiés.
            </p>
          </section>

          {historyOpen && (
            <section className="studio-history" aria-label="Historique local">
              <header className="studio-panel-head">
                <h2>Historique local</h2>
                <div className="studio-panel-actions">
                  <button type="button" className="studio-mini-button" onClick={refreshHistory}>Actualiser</button>
                  <button type="button" className="studio-mini-button" onClick={() => void exportHistory()}>Exporter</button>
                  <button type="button" className="studio-mini-button" onClick={clearHistory}>Vider</button>
                </div>
              </header>
              {!history.length && <p className="studio-empty">Aucun traitement enregistré pour l’instant. Seuls des noms, tailles et réglages sont conservés.</p>}
              <ul className="studio-history-list">
                {history.slice(0, 40).map((entry) => (
                  <li key={entry.id}>
                    <div className="studio-history-head">
                      <strong>{entry.operationLabel}</strong>
                      <span className={`studio-history-status is-${entry.status}`}>{entry.status === 'success' ? 'réussi' : entry.status === 'partial' ? 'partiel' : entry.status === 'cancelled' ? 'annulé' : 'échec'}</span>
                    </div>
                    <div className="studio-history-meta">
                      {new Date(entry.startedAt).toLocaleString('fr-FR')} · {entry.sourceFiles.length} fichier(s) · durée {formatDuration(entry.finishedAt - entry.startedAt)}
                    </div>
                    {entry.producedFiles.length > 0 && (
                      <div className="studio-history-files">
                        {entry.producedFiles.map((file) => <code key={`${entry.id}-${file.name}`}>{file.name}</code>)}
                      </div>
                    )}
                    {entry.paramsSummary && <div className="studio-history-params">{entry.paramsSummary}</div>}
                    {entry.errors.length > 0 && <div className="studio-history-errors">{entry.errors.join(' · ')}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function supportLabel(read: string, write: string): string {
  if (read === 'full' && write === 'full') return 'Lecture et écriture complètes';
  if (read === 'full' && write === 'partial') return 'Écriture partielle';
  if (read === 'full' && write === 'read-only') return 'Lecture seule';
  if (read === 'partial') return 'Prise en charge partielle';
  if (read === 'none' && write === 'none') return 'Non pris en charge';
  return `${read} / ${write}`;
}

function uniqueFormats(formats: FormatId[]): FormatId[] {
  return [...new Set(formats)];
}

export { OPERATION_CATEGORIES, operationsForFormat, familyOf };
