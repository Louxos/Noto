import { strToU8, strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { findOperation } from '../lib/operations';
import { runJob, type JobFile } from '../lib/jobs/runner';
import { MemoryOutputWriter } from '../lib/jobs/output';
import { defaultParamValues } from '../lib/operations/types';

/**
 * Vérifie le chemin exact utilisé par l’atelier : registre → runner → écrivain.
 * L’écriture est réelle (en mémoire) et les fichiers produits sont relus pour
 * confirmer le contenu, pas seulement l’absence d’exception.
 */

function jobFile(name: string, content: string, format: JobFile['format'] = 'md'): JobFile {
  const bytes = strToU8(content);
  return { id: name, name, format, bytes, size: bytes.length };
}

describe('chaîne de traitement de l’atelier', () => {
  it('exécute une opération réelle et écrit le fichier produit', async () => {
    const operation = findOperation('markdown.to-text');
    expect(operation).toBeTruthy();
    const writer = new MemoryOutputWriter();
    const result = await runJob(
      { operation: operation!, params: defaultParamValues(operation!.params), mode: 'each', writer },
      [jobFile('notes.md', '# Titre\n\nUn **texte** important.\n')],
      { signal: new AbortController().signal },
    );
    expect(result.status).toBe('success');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].name).toBe('notes-texte.txt');
    const produced = writer.files[0];
    expect(strFromU8(produced.bytes)).toBe('Titre\n\nUn texte important.');
  });

  it('regroupe plusieurs fichiers en une archive réellement lisible', async () => {
    const operation = findOperation('archive.create');
    expect(operation).toBeTruthy();
    const writer = new MemoryOutputWriter();
    const result = await runJob(
      {
        operation: operation!,
        params: { ...defaultParamValues(operation!.params), name: 'lot' },
        mode: 'group',
        writer,
      },
      [jobFile('a.txt', 'premier', 'txt'), jobFile('b.txt', 'second', 'txt')],
      { signal: new AbortController().signal },
    );
    expect(result.status).toBe('success');
    expect(result.outputs[0].name).toBe('lot.zip');
    const entries = unzipSync(writer.files[0].bytes);
    expect(Object.keys(entries).sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('signale une erreur par fichier sans interrompre le lot', async () => {
    const operation = findOperation('office.to-pdf');
    expect(operation).toBeTruthy();
    const writer = new MemoryOutputWriter();
    const result = await runJob(
      { operation: operation!, params: defaultParamValues(operation!.params), mode: 'each', writer },
      [jobFile('casse.docx', 'ceci n’est pas un document Word', 'docx'), jobFile('casse2.docx', 'non plus', 'docx')],
      { signal: new AbortController().signal },
    );
    expect(result.status).toBe('failed');
    expect(result.outcomes.every((outcome) => outcome.status === 'failed')).toBe(true);
    expect(result.errors.length).toBe(2);
  });

  it('respecte l’annulation coopérative avant tout travail', async () => {
    const operation = findOperation('pdf.merge');
    expect(operation).toBeTruthy();
    const controller = new AbortController();
    controller.abort();
    const result = await runJob(
      { operation: operation!, params: defaultParamValues(operation!.params), mode: 'group', writer: new MemoryOutputWriter() },
      [jobFile('a.pdf', '%PDF-1.7', 'pdf')],
      { signal: controller.signal },
    );
    expect(result.status).toBe('cancelled');
  });
});
