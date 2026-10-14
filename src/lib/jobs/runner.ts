import type { FormatId } from '../documents/formats';
import { isAbortError, type Operation, type OperationInput, type OperationMeasurement, type OperationOutput, type OperationReport, type OperationResult, type ParamValues } from '../operations/types';

/**
 * Moteur commun des traitements Noto.
 *
 * Il sert à la fois aux outils de l’atelier, aux traitements par lots et aux
 * workflows : une opération déclarée une seule fois est exécutée ici, avec une
 * progression fondée sur le travail réel, une annulation coopérative, une
 * gestion d’erreur fichier par fichier et l’écriture vérifiée des résultats.
 */

export interface JobFile {
  id: string;
  name: string;
  path?: string;
  format: FormatId;
  bytes: Uint8Array;
  size: number;
}

export type FileStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface WrittenOutput {
  name: string;
  location: string;
  size: number;
}

export interface FileOutcome {
  file: JobFile;
  status: FileStatus;
  outputs: OperationOutput[];
  written: WrittenOutput[];
  warnings: string[];
  error?: string;
  durationMs: number;
}

export interface JobProgress {
  value: number;
  label: string;
  fileIndex: number;
  fileCount: number;
  currentFile?: string;
}

export type JobMode = 'each' | 'group';

export interface JobDefinition {
  operation: Operation;
  params: ParamValues;
  /** `each` exécute l’opération pour chaque fichier, `group` sur l’ensemble. */
  mode: JobMode;
  nameTemplate?: string;
  /** Écrit les fichiers produits ; absent = exécution sans écriture (aperçu, analyse). */
  writer?: OutputWriter;
}

export interface OutputLocation {
  name: string;
  location: string;
  size: number;
}

export interface OutputWriter {
  /** Écrit réellement le fichier et renvoie son emplacement ou une erreur explicite. */
  write(output: OperationOutput): Promise<OutputLocation>;
  describe(): string;
}

export type JobStatus = 'success' | 'partial' | 'failed' | 'cancelled';

export interface JobRunResult {
  status: JobStatus;
  outcomes: FileOutcome[];
  outputs: WrittenOutput[];
  report?: OperationReport;
  measurements: OperationMeasurement[];
  warnings: string[];
  errors: string[];
  startedAt: number;
  finishedAt: number;
}

export interface JobOptions {
  signal: AbortSignal;
  onProgress?: (progress: JobProgress) => void;
  onOutcome?: (outcome: FileOutcome) => void;
  onMessage?: (message: string) => void;
}

export function createAbortController(): AbortController {
  return new AbortController();
}

export async function runJob(job: JobDefinition, files: JobFile[], options: JobOptions): Promise<JobRunResult> {
  const startedAt = Date.now();
  const outcomes: FileOutcome[] = [];
  const outputs: WrittenOutput[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const measurements: OperationMeasurement[] = [];
  let report: OperationReport | undefined;
  let cancelled = false;

  const totalWork = Math.max(1, files.length);
  const emit = (value: number, label: string, fileIndex: number, currentFile?: string) => {
    options.onProgress?.({
      value: Math.max(0, Math.min(1, value)),
      label,
      fileIndex,
      fileCount: files.length,
      currentFile,
    });
  };

  emit(0, `Préparation de « ${job.operation.label} »…`, 0);

  if (job.mode === 'group') {
    const inputs: OperationInput[] = files.map(toOperationInput);
    const context = createContext({
      signal: options.signal,
      onMessage: options.onMessage,
      onProgress: (value, label) => emit(value, label, files.length, job.operation.label),
      warnings,
    });
    const outcomeFiles = files.map((file) => ({ file, status: 'running' as FileStatus }));
    try {
      const result: OperationResult = await job.operation.run(inputs, job.params, context);
      collectResult(result, { outputs, warnings, measurements, report: (value) => { report = value; } });
      const written = await writeOutputs(result.outputs, job, options);
      outputs.length = 0;
      outputs.push(...written.written);
      warnings.push(...written.warnings);
      for (const entry of outcomeFiles) {
        const outcome: FileOutcome = {
          file: entry.file,
          status: written.error && !written.written.length ? 'failed' : 'done',
          outputs: result.outputs,
          written: written.written,
          warnings: [...result.warnings],
          error: written.error,
          durationMs: Date.now() - startedAt,
        };
        outcomes.push(outcome);
        options.onOutcome?.(outcome);
      }
      if (written.error) errors.push(written.error);
    } catch (error) {
      if (isAbortError(error) || options.signal.aborted) {
        cancelled = true;
        for (const entry of outcomeFiles) outcomes.push(failedOutcome(entry.file, 'Opération annulée.', startedAt, 'cancelled'));
      } else {
        const message = describeError(error);
        errors.push(message);
        for (const entry of outcomeFiles) outcomes.push(failedOutcome(entry.file, message, startedAt));
      }
    }
    emit(cancelled ? 0 : 1, cancelled ? 'Traitement annulé.' : 'Traitement terminé.', files.length);
  } else {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (options.signal.aborted) {
        cancelled = true;
        outcomes.push(failedOutcome(file, 'Opération annulée.', startedAt, 'cancelled'));
        continue;
      }
      const base = index / totalWork;
      const step = 1 / totalWork;
      const fileStarted = Date.now();
      emit(base, `Traitement de « ${file.name} »…`, index, file.name);
      const fileWarnings: string[] = [];
      try {
        const context = createContext({
          signal: options.signal,
          onMessage: options.onMessage,
          onProgress: (value, label) => emit(base + value * step, label, index, file.name),
          warnings: fileWarnings,
        });
        const result = await job.operation.run([toOperationInput(file)], job.params, context);
        const written = await writeOutputs(result.outputs, job, options);
        fileWarnings.push(...written.warnings);
        if (written.error) throw new Error(written.error);
        outputs.push(...written.written);
        const outcome: FileOutcome = {
          file,
          status: 'done',
          outputs: result.outputs,
          written: written.written,
          warnings: [...result.warnings, ...fileWarnings],
          durationMs: Date.now() - fileStarted,
        };
        outcomes.push(outcome);
        options.onOutcome?.(outcome);
        collectResult(result, { outputs, warnings, measurements, report: (value) => { report = report ?? value; } });
      } catch (error) {
        if (isAbortError(error) || options.signal.aborted) {
          cancelled = true;
          const outcome = failedOutcome(file, 'Opération annulée.', fileStarted, 'cancelled');
          outcomes.push(outcome);
          options.onOutcome?.(outcome);
          continue;
        }
        const message = describeError(error);
        const outcome = failedOutcome(file, message, fileStarted);
        outcome.warnings = fileWarnings;
        outcomes.push(outcome);
        options.onOutcome?.(outcome);
        errors.push(`${file.name} : ${message}`);
      }
      emit((index + 1) / totalWork, `« ${file.name} » traité.`, index + 1, file.name);
    }
  }

  const status: JobStatus = cancelled
    ? 'cancelled'
    : errors.length === 0
      ? 'success'
      : outcomes.some((outcome) => outcome.status === 'done')
        ? 'partial'
        : 'failed';

  emit(status === 'cancelled' ? 0 : 1, statusLabel(status), files.length);

  return {
    status,
    outcomes,
    outputs,
    report,
    measurements,
    warnings: dedupe(warnings),
    errors: dedupe(errors),
    startedAt,
    finishedAt: Date.now(),
  };
}

function statusLabel(status: JobStatus): string {
  if (status === 'success') return 'Terminé.';
  if (status === 'partial') return 'Terminé avec des erreurs signalées.';
  if (status === 'cancelled') return 'Traitement annulé.';
  return 'Le traitement a échoué.';
}

async function writeOutputs(
  outputs: OperationOutput[],
  job: JobDefinition,
  options: JobOptions,
): Promise<{ written: WrittenOutput[]; warnings: string[]; error?: string }> {
  const written: WrittenOutput[] = [];
  const warnings: string[] = [];
  if (!job.writer || !outputs.length) return { written, warnings };
  for (const output of outputs) {
    if (options.signal.aborted) throw new DOMException('Opération annulée par l’utilisateur.', 'AbortError');
    if (!output.bytes.length) {
      warnings.push(`« ${output.name} » est vide et n’a pas été écrit.`);
      continue;
    }
    try {
      const location = await job.writer.write(output);
      written.push({ name: location.name, location: location.location, size: location.size });
    } catch (error) {
      return { written, warnings, error: `Écriture de « ${output.name} » impossible : ${describeError(error)}` };
    }
  }
  return { written, warnings };
}

function collectResult(
  result: OperationResult,
  sink: {
    outputs: WrittenOutput[];
    warnings: string[];
    measurements: OperationMeasurement[];
    report: (report: OperationReport) => void;
  },
): void {
  sink.warnings.push(...result.warnings);
  if (result.measurements?.length) sink.measurements.push(...result.measurements);
  if (result.report) {
    sink.report(result.report);
    for (const artifact of result.report.artifacts ?? []) {
      if (artifact.bytes.length) sink.outputs.push({ name: artifact.name, location: 'rapport', size: artifact.bytes.length });
    }
  }
}

function failedOutcome(file: JobFile, error: string, startedAt: number, status: FileStatus = 'failed'): FileOutcome {
  return {
    file,
    status,
    outputs: [],
    written: [],
    warnings: [],
    error,
    durationMs: Date.now() - startedAt,
  };
}

export function toOperationInput(file: JobFile): OperationInput {
  return { name: file.name, path: file.path, bytes: file.bytes, format: file.format, size: file.size };
}

function createContext(options: {
  signal: AbortSignal;
  onMessage?: (message: string) => void;
  onProgress: (value: number, label: string) => void;
  warnings: string[];
}): Parameters<Operation['run']>[2] {
  return {
    signal: options.signal,
    progress: ({ value, label }) => options.onProgress(Math.max(0, Math.min(1, value)), label),
    report: (message) => options.onMessage?.(message),
    warn: (message) => options.warnings.push(message),
  };
}

export function describeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.name;
  return 'Erreur inconnue.';
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
