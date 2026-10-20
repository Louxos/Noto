import { useCallback, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { FormatId } from '../lib/documents/formats';
import { formatForDocument, familyOf } from '../lib/documents/formats';
import { readDesktopPath } from '../lib/files';
import { runJob, type FileOutcome, type JobFile, type JobRunResult, type JobStatus } from '../lib/jobs/runner';
import { createOutputWriter, formatSize, pickOutputDirectory, revealOutput, type OutputDestinationChoice } from '../lib/jobs/output';
import { findOperation, operationsForFormat } from '../lib/operations';
import { analyzeFile, filterFileList, findExactDuplicates, findSimilarNames, type AnalyzedFile, type ListFilter } from '../lib/jobs/analysis';
import { defaultParamValues, type Operation, type ParamValues } from '../lib/operations/types';
import { appendHistory, describeParams, historyEntryId, loadHistory, type HistoryEntry } from '../lib/history';
import { jobResultToMarkdown } from '../lib/reports';

/**
 * Atelier Noto : état et actions de l’espace de traitement.
 *
 * L’atelier ne fait rien à moitié : chaque action appelle réellement un moteur
 * d’opération, la progression affichée vient du travail effectué, et les échecs
 * sont montrés fichier par fichier au lieu d’être masqués.
 */

export interface StudioFile extends AnalyzedFile {
  path?: string;
  bytes: Uint8Array;
  addedAt: number;
}

export interface StudioRunState {
  status: 'idle' | 'running' | 'finished';
  value: number;
  label: string;
  currentFile?: string;
  result?: JobRunResult;
  destination?: string;
}

export interface StudioState {
  files: StudioFile[];
  filter: ListFilter;
  selectedOperationId: string | null;
  params: ParamValues;
  run: StudioRunState;
  notices: { kind: 'info' | 'success' | 'warning' | 'error'; message: string }[];
  history: HistoryEntry[];
  duplicates: ReturnType<typeof findExactDuplicates>;
  similarNames: ReturnType<typeof findSimilarNames>;
}

const DEFAULT_FILTER: ListFilter = { query: '', families: [], sort: 'name', descending: false };

function formatForName(name: string): FormatId {
  return formatForDocument(name);
}

export function useStudio() {
  const [files, setFiles] = useState<StudioFile[]>([]);
  const [filter, setFilter] = useState<ListFilter>(DEFAULT_FILTER);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [params, setParams] = useState<ParamValues>({});
  const [run, setRun] = useState<StudioRunState>({ status: 'idle', value: 0, label: 'Prêt.' });
  const [notices, setNotices] = useState<StudioState['notices']>([]);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const notify = useCallback((kind: StudioState['notices'][number]['kind'], message: string) => {
    setNotices((current) => [...current, { kind, message }].slice(-6));
  }, []);

  const dismissNotice = useCallback((index: number) => {
    setNotices((current) => current.filter((_, position) => position !== index));
  }, []);

  const visibleFiles = useMemo(() => filterFileList(files, filter), [files, filter]);

  const duplicates = useMemo(() => findExactDuplicates(files), [files]);
  const similarNames = useMemo(() => findSimilarNames(files), [files]);

  const availableOperations = useMemo<Operation[]>(() => {
    if (!files.length) return [];
    // Une opération est proposée si toutes les entrées sont acceptées par son
    // moteur : sinon, un bouton existerait sans pouvoir fonctionner.
    const candidates = operationsForFormat(files[0].format);
    return candidates.filter((operation) => files.every((file) => acceptsFormat(operation, file.format)));
  }, [files]);

  const operation = useMemo<Operation | null>(() => {
    if (!files.length || !availableOperations.length) return null;
    return availableOperations.find((entry) => entry.id === selectedOperationId) ?? availableOperations[0];
  }, [availableOperations, selectedOperationId, files.length]);

  const selectOperation = useCallback((id: string) => {
    const target = findOperation(id) ?? availableOperations.find((entry) => entry.id === id);
    if (!target) return;
    setSelectedOperationId(id);
    setParams((current) => {
      // Les valeurs déjà saisies pour les paramètres communs sont conservées.
      const defaults = defaultParamValues(target.params);
      const next: ParamValues = { ...defaults };
      for (const [key, value] of Object.entries(defaults)) {
        if (current[key] !== undefined && typeof current[key] === typeof value) next[key] = current[key];
      }
      return next;
    });
  }, [availableOperations]);

  const setParam = useCallback((id: string, value: ParamValues[string]) => {
    setParams((current) => ({ ...current, [id]: value }));
  }, []);

  const addDocuments = useCallback((incoming: StudioFile[]) => {
    setFiles((current) => {
      const byPath = new Set(current.map((file) => file.path ?? `${file.name}:${file.sha256}`));
      const added: StudioFile[] = [];
      for (const file of incoming) {
        const key = file.path ?? `${file.name}:${file.sha256}`;
        if (byPath.has(key)) continue;
        byPath.add(key);
        added.push(file);
      }
      const duplicateOfExisting = incoming.filter((file) => !added.some((entry) => entry.id === file.id));
      if (duplicateOfExisting.length) {
        window.setTimeout(() => notify('info', `${duplicateOfExisting.length} fichier(s) déjà présents dans l’atelier ont été ignorés.`), 0);
      }
      return [...current, ...added];
    });
  }, [notify]);

  const addDesktopPaths = useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    setLoadingFiles(true);
    const loaded: StudioFile[] = [];
    const failures: string[] = [];
    for (const path of paths) {
      try {
        const document = await readDesktopPath(path);
        const bytes = document.bytes;
        if (!bytes) {
          failures.push(`${document.name} : contenu binaire indisponible pour le traitement.`);
          continue;
        }
        const analyzed = analyzeFile({ id: `${path}`, name: document.name, path, format: formatForName(document.name), bytes });
        loaded.push({ ...analyzed, path, bytes, addedAt: Date.now() });
      } catch (error) {
        failures.push(`${path} : ${error instanceof Error ? error.message : 'lecture impossible'}`);
      }
    }
    setLoadingFiles(false);
    if (loaded.length) addDocuments(loaded);
    for (const failure of failures.slice(0, 3)) notify('warning', failure);
  }, [addDocuments, notify]);

  const pickDesktopFiles = useCallback(async () => {
    if (!isTauri()) {
      notify('info', 'Dans le navigateur, ajoutez vos fichiers avec le bouton de sélection : Noto les lit localement, sans les envoyer.');
      return;
    }
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ multiple: true, title: 'Ajouter des fichiers à l’atelier' });
    const paths = Array.isArray(selected) ? selected : typeof selected === 'string' ? [selected] : [];
    await addDesktopPaths(paths);
  }, [addDesktopPaths, notify]);

  const removeFile = useCallback((id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setRun({ status: 'idle', value: 0, label: 'Prêt.' });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    notify('info', 'Annulation demandée : le traitement en cours s’arrête à la prochaine étape vérifiée.');
  }, [notify]);

  const runOperation = useCallback(async (destination?: OutputDestinationChoice) => {
    if (!operation) {
      notify('error', 'Choisissez d’abord une opération disponible pour les fichiers sélectionnés.');
      return;
    }
    if (!files.length) {
      notify('error', 'Ajoutez au moins un fichier.');
      return;
    }
    if (files.length < operation.inputs.min) {
      notify('error', `« ${operation.label} » demande au moins ${operation.inputs.min} fichier(s).`);
      return;
    }
    if (operation.inputs.max !== undefined && files.length > operation.inputs.max) {
      notify('error', `« ${operation.label} » accepte au maximum ${operation.inputs.max} fichier(s) : ${files.length} sont sélectionnés.`);
      return;
    }

    let writer;
    try {
      writer = await createOutputWriter(destination ?? {});
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Destination indisponible.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const jobFiles: JobFile[] = files.map((file) => ({
      id: file.id,
      name: file.name,
      path: file.path,
      format: file.format,
      bytes: file.bytes,
      size: file.size,
    }));
    setRun({ status: 'running', value: 0, label: `Préparation de « ${operation.label} »…`, destination: writer.describe() });

    const result = await runJob(
      { operation, params, mode: modeFor(operation), writer },
      jobFiles,
      {
        signal: controller.signal,
        onProgress: (progress) => setRun((current) => ({ ...current, status: 'running', value: progress.value, label: progress.label, currentFile: progress.currentFile })),
        onMessage: (message) => notify('info', message),
      },
    );

    abortRef.current = null;
    setRun({ status: 'finished', value: 1, label: statusLabel(result.status), result, destination: writer.describe() });

    const entry: HistoryEntry = {
      id: historyEntryId(),
      operationId: operation.id,
      operationLabel: operation.label,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      status: result.status,
      sourceFiles: files.map((file) => ({ name: file.name, path: file.path, size: file.size })),
      producedFiles: result.outputs.map((output) => ({ name: output.name, location: output.location, size: output.size })),
      paramsSummary: describeParams(params),
      measurements: result.measurements,
      warnings: result.warnings,
      errors: result.errors,
    };
    setHistory(appendHistory(entry));
    if (result.status === 'success') notify('success', `« ${operation.label} » terminé : ${result.outputs.length} fichier(s) produit(s) dans ${writer.describe()}.`);
    else if (result.status === 'partial') notify('warning', `« ${operation.label} » terminé avec ${result.errors.length} erreur(s) : voir le détail par fichier.`);
    else if (result.status === 'cancelled') notify('info', 'Traitement annulé.');
    else notify('error', `« ${operation.label} » a échoué : ${result.errors[0] ?? 'cause inconnue.'}`);
  }, [files, notify, operation, params]);

  const runToDirectory = useCallback(async () => {
    const directory = await pickOutputDirectory();
    if (!directory) {
      notify('info', 'Aucun dossier choisi : le traitement n’a pas été lancé.');
      return;
    }
    await runOperation({ directory });
  }, [notify, runOperation]);

  const revealLastOutput = useCallback(async (location: string) => {
    try {
      await revealOutput(location);
    } catch (error) {
      notify('warning', error instanceof Error ? error.message : 'Impossible d’ouvrir l’emplacement.');
    }
  }, [notify]);

  const exportReport = useCallback(async () => {
    if (!run.result) return;
    const markdown = jobResultToMarkdown(run.result, operation ? `Rapport — ${operation.label}` : undefined);
    const name = `noto-rapport-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.md`;
    try {
      const writer = await createOutputWriter({});
      const location = await writer.write({ name, bytes: new TextEncoder().encode(markdown), format: 'md', note: 'Rapport de traitement' });
      notify('success', `Rapport exporté : ${location.name}.`);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Export du rapport impossible.');
    }
  }, [notify, operation, run.result]);

  return {
    files,
    visibleFiles,
    loadingFiles,
    filter,
    setFilter,
    duplicates,
    similarNames,
    availableOperations,
    operation,
    selectOperation,
    params,
    setParam,
    run,
    notices,
    notify,
    dismissNotice,
    history,
    addDesktopPaths,
    pickDesktopFiles,
    addDocuments,
    removeFile,
    clearFiles,
    cancel,
    runOperation,
    runToDirectory,
    revealLastOutput,
    exportReport,
    formatSize,
    familyOf,
  };
}

function acceptsFormat(operation: Operation, format: FormatId): boolean {
  const requirement = operation.inputs;
  if (requirement.formats === 'any') return true;
  if (requirement.formats.includes(format)) return true;
  // Les outils d’analyse d’images acceptent toutes les images reconnues.
  return familyOf(format) === 'image' && requirement.formats.includes('jpeg') && operation.category === 'ocr';
}

function modeFor(operation: Operation): 'each' | 'group' {
  return operation.output.cardinality === 'one' ? 'group' : 'each';
}

function statusLabel(status: JobStatus): string {
  if (status === 'success') return 'Traitement terminé.';
  if (status === 'partial') return 'Terminé avec des erreurs signalées.';
  if (status === 'cancelled') return 'Traitement annulé.';
  return 'Le traitement a échoué.';
}

export type { FileOutcome };
