// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PRINT_PAGES } from './printing';
import { preparePrintJob } from './printJobs';
import type { OpenDocument } from '../types';

/**
 * Impression des PDF : sélection des pages et bornes.
 *
 * Le rendu graphique des pages appartient au moteur PDF, éprouvé ailleurs
 * (`pdfOperations.test.ts` recharge les documents produits avec pdf.js). Ce qui
 * est vérifié ici, c’est la logique propre à l’impression : quelles pages sont
 * demandées au moteur, combien, et ce qui est annoncé à l’utilisateur.
 */
const getPage = vi.fn(async (pageNumber: number) => ({ pageNumber, cleanup: vi.fn() }));
const destroy = vi.fn(async () => undefined);
const renderPageToBytes = vi.fn(async (page: { pageNumber: number }, _options?: unknown) => ({
  pageNumber: page.pageNumber,
  bytes: new Uint8Array([page.pageNumber, 2, 3]),
  width: 595,
  height: 842,
  mimeType: 'image/jpeg' as const,
}));

vi.mock('./pdf/pdfEngine', () => ({
  openPdf: async () => ({ numPages: 250, getPage, destroy }),
  renderPageToBytes: (page: { pageNumber: number }, options?: unknown) => renderPageToBytes(page, options),
  dpiToScale: (dpi: number) => dpi / 72,
}));

afterEach(() => {
  vi.clearAllMocks();
});

const pdf: OpenDocument = {
  id: 'desktop:C:\\docs\\rapport.pdf', source: 'desktop', name: 'rapport.pdf', path: 'C:\\docs\\rapport.pdf',
  kind: 'pdf', extension: 'pdf', mimeType: 'application/pdf', content: '', savedContent: '',
  size: 1024, modifiedAt: Date.UTC(2026, 0, 2), truncated: false, bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
};

describe('impression d’un PDF', () => {
  it('n’imprime que la page affichée quand c’est ce qui est demandé', async () => {
    const { job, notes, urls } = await preparePrintJob({ document: pdf, scope: 'current', currentPage: 3, quality: 'normale', lineNumbers: false });
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledWith(3);
    expect(job.sections).toHaveLength(1);
    expect(job.sections[0]).toContain('Page 3 sur 250');
    expect(urls).toHaveLength(1);
    expect(notes.join(' ')).toContain('sélectionnable');
    for (const url of urls) URL.revokeObjectURL(url);
  });

  it('borne l’impression d’un document entier et le dit', async () => {
    const { job, notes, urls } = await preparePrintJob({ document: pdf, scope: 'all', currentPage: 1, quality: 'haute', lineNumbers: false });
    expect(job.sections).toHaveLength(MAX_PRINT_PAGES);
    expect(renderPageToBytes).toHaveBeenCalledTimes(MAX_PRINT_PAGES);
    // 300 ppp : le moteur reçoit bien l’échelle correspondante.
    expect(renderPageToBytes.mock.calls[0]?.[1]).toMatchObject({ scale: 300 / 72, mimeType: 'image/jpeg' });
    expect(notes.join(' ')).toContain(`${MAX_PRINT_PAGES} pages sur 250`);
    for (const url of urls) URL.revokeObjectURL(url);
  });

  it('refuse une page hors du document au lieu d’inventer une page blanche', async () => {
    const { job, urls } = await preparePrintJob({ document: pdf, scope: 'current', currentPage: 900, quality: 'normale', lineNumbers: false });
    expect(getPage).toHaveBeenCalledWith(250);
    expect(job.sections[0]).toContain('Page 250 sur 250');
    for (const url of urls) URL.revokeObjectURL(url);
  });

  it('ne fait rien imprimer d’un PDF vide et l’explique', async () => {
    const vide: OpenDocument = { ...pdf, bytes: new Uint8Array(0) };
    const { job } = await preparePrintJob({ document: vide, scope: 'all', currentPage: 1, quality: 'normale', lineNumbers: false });
    expect(job.sections[0]).toContain('aucune donnée lisible');
    expect(getPage).not.toHaveBeenCalled();
  });
});
