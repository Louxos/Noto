import { describe, expect, it } from 'vitest';
import { MemoryOutputWriter } from './output';
import { runJob, type JobFile } from './runner';
import type { Operation, OperationContext, OperationInput, ParamValues } from '../operations/types';
import type { FormatId } from '../documents/formats';

const input = (name: string, format: FormatId = 'txt'): JobFile => ({
  id: name,
  name,
  format,
  bytes: new TextEncoder().encode(name),
  size: name.length,
});

function makeOperation(run: (inputs: OperationInput[], params: ParamValues, context: OperationContext) => Promise<{ outputs: { name: string; bytes: Uint8Array; format: FormatId }[]; warnings: string[] }>): Operation {
  return {
    id: 'test.op',
    label: 'Test',
    description: 'Opération de test',
    category: 'report',
    inputs: { formats: 'any', min: 1, label: 'un ou plusieurs fichiers' },
    output: { format: 'same', cardinality: 'per-input', label: 'fichiers' },
    params: [],
    limits: [],
    run,
  };
}

describe('moteur de traitement', () => {
  it('traite chaque fichier et écrit les résultats', async () => {
    const writer = new MemoryOutputWriter();
    const operation = makeOperation(async (inputs) => ({
      outputs: inputs.map((entry) => ({ name: `${entry.name}.out`, bytes: entry.bytes, format: 'txt' as FormatId })),
      warnings: [],
    }));
    const progress: number[] = [];
    const result = await runJob(
      { operation, params: {}, mode: 'each', writer },
      [input('a.txt'), input('b.txt')],
      { signal: new AbortController().signal, onProgress: (value) => progress.push(value.value) },
    );
    expect(result.status).toBe('success');
    expect(result.outputs.map((entry) => entry.name)).toEqual(['a.txt.out', 'b.txt.out']);
    expect(writer.files).toHaveLength(2);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('isole les erreurs fichier par fichier sans interrompre le lot', async () => {
    const writer = new MemoryOutputWriter();
    const operation = makeOperation(async (inputs) => {
      if (inputs[0].name === 'b.txt') throw new Error('Fichier illisible');
      return { outputs: inputs.map((entry) => ({ name: `${entry.name}.ok`, bytes: entry.bytes, format: 'txt' as FormatId })), warnings: [] };
    });
    const result = await runJob(
      { operation, params: {}, mode: 'each', writer },
      [input('a.txt'), input('b.txt'), input('c.txt')],
      { signal: new AbortController().signal },
    );
    expect(result.status).toBe('partial');
    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(['done', 'failed', 'done']);
    expect(result.errors[0]).toContain('b.txt');
    expect(writer.files.map((file) => file.name)).toEqual(['a.txt.ok', 'c.txt.ok']);
  });

  it('s’arrête proprement à l’annulation', async () => {
    const controller = new AbortController();
    const operation = makeOperation(async (inputs, _params, context) => {
      controller.abort();
      if (context.signal.aborted) throw new DOMException('annulé', 'AbortError');
      return { outputs: [{ name: inputs[0].name, bytes: inputs[0].bytes, format: 'txt' as FormatId }], warnings: [] };
    });
    const result = await runJob(
      { operation, params: {}, mode: 'each' },
      [input('a.txt'), input('b.txt')],
      { signal: controller.signal },
    );
    expect(result.status).toBe('cancelled');
    expect(result.outcomes.every((outcome) => outcome.status === 'cancelled')).toBe(true);
  });

  it('exécute une opération groupée sur l’ensemble des entrées', async () => {
    const writer = new MemoryOutputWriter();
    const operation = makeOperation(async (inputs) => ({
      outputs: [{ name: 'fusion.txt', bytes: new TextEncoder().encode(inputs.map((entry) => entry.name).join('+')), format: 'txt' as FormatId }],
      warnings: ['avertissement test'],
    }));
    const result = await runJob(
      { operation, params: {}, mode: 'group', writer },
      [input('a.txt'), input('b.txt')],
      { signal: new AbortController().signal },
    );
    expect(result.status).toBe('success');
    expect(result.outputs).toHaveLength(1);
    expect(new TextDecoder().decode(writer.files[0].bytes)).toBe('a.txt+b.txt');
    expect(result.warnings).toContain('avertissement test');
  });

  it('signale l’échec de l’écriture', async () => {
    const failing = {
      write: async () => { throw new Error('Disque plein'); },
      describe: () => 'dossier de test',
    };
    const operation = makeOperation(async (inputs) => ({
      outputs: [{ name: 'a.out', bytes: inputs[0].bytes, format: 'txt' as FormatId }],
      warnings: [],
    }));
    const result = await runJob(
      { operation, params: {}, mode: 'each', writer: failing },
      [input('a.txt')],
      { signal: new AbortController().signal },
    );
    expect(result.status).toBe('failed');
    expect(result.errors[0]).toContain('Disque plein');
  });
});
