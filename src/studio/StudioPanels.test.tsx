// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OperationDetails, OperationPicker, ParameterForm } from './StudioPanels';
import { StudioFileList, StudioRunPanel } from './StudioRunPanel';
import { ALL_OPERATIONS, findOperation } from '../lib/operations';
import type { JobRunResult } from '../lib/jobs/runner';
import type { StudioFile } from './useStudio';

afterEach(() => {
  cleanup();
});

function studioFile(name: string, size: number, id = name): StudioFile {
  return { id, name, format: 'pdf', size, sha256: `hash-${id}`, bytes: new Uint8Array(size), addedAt: 1 };
}

describe('panneaux de l’atelier', () => {
  it('liste les fichiers et signale les doublons exacts', () => {
    const files = [studioFile('a.pdf', 10, '1'), studioFile('copie.pdf', 10, '2')];
    render(
      <StudioFileList
        files={files}
        duplicates={[{ sha256: 'hash-1', files: [{ id: '1' }, { id: '2' }], reclaimableBytes: 10 }]}
        onRemove={() => undefined}
        onClear={() => undefined}
        onAdd={() => undefined}
        loading={false}
      />,
    );
    expect(screen.getByText('a.pdf')).toBeTruthy();
    expect(screen.getByText('doublon exact')).toBeTruthy();
    expect(screen.getByText(/empreinte SHA-256/u)).toBeTruthy();
  });

  it('affiche les mesures réelles avant et après', () => {
    const result: JobRunResult = {
      status: 'success',
      outcomes: [{ file: { id: '1', name: 'rapport.pdf', format: 'pdf', bytes: new Uint8Array(1000), size: 1000 }, status: 'done', outputs: [], written: [{ name: 'rapport-compresse.pdf', location: 'C:\\sortie\\rapport-compresse.pdf', size: 400 }], warnings: [], durationMs: 120 }],
      outputs: [{ name: 'rapport-compresse.pdf', location: 'C:\\sortie\\rapport-compresse.pdf', size: 400 }],
      measurements: [{ label: 'Taille', before: 1000, after: 400, unit: 'bytes' }],
      warnings: ['Le mode maximal peut allonger le temps de traitement.'],
      errors: [],
      startedAt: 0,
      finishedAt: 3200,
    };
    render(
      <StudioRunPanel
        status="finished"
        value={1}
        label="Traitement terminé."
        result={result}
        destination="C:\\sortie"
        onCancel={() => undefined}
        onRun={() => undefined}
        onExportReport={() => undefined}
        onReveal={() => undefined}
      />,
    );
    expect(screen.getByText('1 Ko → 400 o')).toBeTruthy();
    expect(screen.getByText('−60 %')).toBeTruthy();
    expect(screen.getByText('rapport-compresse.pdf')).toBeTruthy();
    expect(screen.getByText(/1 avertissement/u)).toBeTruthy();
    expect(screen.queryByText(/0 erreur/u)).toBeNull();
  });

  it('montre les erreurs par fichier plutôt qu’un échec global', () => {
    const files = [{ id: '1', name: 'scan.pdf', format: 'pdf' as const, bytes: new Uint8Array(4), size: 4 }];
    const result: JobRunResult = {
      status: 'partial',
      outcomes: [
        { file: files[0], status: 'failed', outputs: [], written: [], warnings: [], error: 'Ce fichier est protégé par mot de passe.', durationMs: 30 },
      ],
      outputs: [],
      measurements: [],
      warnings: [],
      errors: ['scan.pdf : Ce fichier est protégé par mot de passe.'],
      startedAt: 0,
      finishedAt: 30,
    };
    render(
      <StudioRunPanel status="finished" value={1} label="Terminé avec des erreurs signalées." result={result} onCancel={() => undefined} onRun={() => undefined} onExportReport={() => undefined} onReveal={() => undefined} />,
    );
    expect(screen.getByText('scan.pdf')).toBeTruthy();
    expect(screen.getByText('Ce fichier est protégé par mot de passe.')).toBeTruthy();
    expect(screen.getByText('Terminé avec des erreurs signalées')).toBeTruthy();
  });

  it('annonce la nature du travail et les limites connues', () => {
    const merge = findOperation('pdf.merge');
    expect(merge).toBeTruthy();
    render(<OperationDetails operation={merge!} />);
    expect(screen.getByText(/calque|native|Reconstruction/u)).toBeTruthy();
    expect(screen.getByText('Limites connues')).toBeTruthy();
  });

  it('filtre les outils par recherche', async () => {
    const user = userEvent.setup();
    const operations = ['pdf.merge', 'pdf.compress', 'image.convert'].map((id) => findOperation(id)!);
    render(<OperationPicker operations={operations} selected={null} onSelect={() => undefined} />);
    expect(screen.getByText('Fusionner des PDF')).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Filtrer les outils…'), 'compress');
    expect(screen.queryByText('Fusionner des PDF')).toBeNull();
    expect(screen.getByText('Compresser un PDF')).toBeTruthy();
  });

  it('n’affiche les réglages avancés que sur demande', () => {
    // On prend une opération qui déclare réellement des réglages avancés.
    const operation = ALL_OPERATIONS.find((entry) => entry.params.some((param) => param.advanced));
    expect(operation).toBeTruthy();
    render(<ParameterForm operation={operation!} values={{}} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: /Afficher les réglages avancés/u })).toBeTruthy();
  });
});
