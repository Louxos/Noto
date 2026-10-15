import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, FileSearch, LoaderCircle, Printer, X, AlertTriangle } from 'lucide-react';
import type { OpenDocument } from '../types';
import { collectFileStats, statRowsToMarkdown } from '../lib/fileAnalysis';
import type { StatRow, StatGroup } from '../lib/fileStats';
import { buildPrintHtml, printHtmlDocument, releasePrintUrls, PRINT_QUALITY_LABELS, type PrintQuality } from '../lib/printing';
import { describePrintScope, preparePrintJob } from '../lib/printJobs';

/**
 * Outils de fichier : informations mesurées et impression.
 *
 * Les deux dialogues partagent la même règle : ne montrer que ce qui est
 * réellement calculé, et dire ce qui ne l’est pas.
 */

/** Fenêtre des informations : mesures réelles du fichier ouvert. */
export function FileInfoDialog({ document, readout, onClose, notify }: {
  document: OpenDocument;
  readout: StatRow[];
  onClose: () => void;
  notify: (message: string, kind?: 'success' | 'error') => void;
}) {
  const [groups, setGroups] = useState<StatGroup[] | null>(null);
  const [error, setError] = useState('');
  const readoutKey = readout.map((row) => `${row.label}=${row.value}`).join('|');

  useEffect(() => {
    let cancelled = false;
    setGroups(null);
    setError('');
    void collectFileStats(document, readout)
      .then((result) => { if (!cancelled) setGroups(result); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Les informations n’ont pas pu être calculées.');
      });
    return () => { cancelled = true; };
    // readoutKey résume le relevé du lecteur : recalculer à chaque changement de page serait inutile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, readoutKey]);

  const copy = useCallback(() => {
    if (!groups) return;
    const text = statRowsToMarkdown(document, groups);
    if (!navigator.clipboard?.writeText) {
      notify('Le presse-papiers n’est pas disponible dans cet environnement.', 'error');
      return;
    }
    void navigator.clipboard.writeText(text)
      .then(() => notify('Informations copiées.'))
      .catch(() => notify('Impossible d’accéder au presse-papiers.', 'error'));
  }, [document, groups, notify]);

  return <div className="modal-backdrop group-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="group-dialog file-info-dialog" role="dialog" aria-modal="true" aria-labelledby="file-info-title">
      <header className="group-dialog-header">
        <span className="group-dialog-icon"><FileSearch size={17} /></span>
        <div><h2 id="file-info-title">Informations sur le fichier</h2><p>Mesures faites sur cet appareil, sans envoi en ligne.</p></div>
        <button className="icon-action" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="file-info-body">
        {error && <div className="save-as-error" role="alert">{error}</div>}
        {!groups && !error && <div className="file-info-loading" role="status"><LoaderCircle size={15} className="spin" />Calcul des mesures…</div>}
        {groups?.map((group) => group.rows.length || group.note ? (
          <section className="file-info-group" key={group.id}>
            <h3>{group.title}</h3>
            <dl>
              {group.rows.map((row) => (
                <div className="file-info-row" key={`${group.id}-${row.label}`}>
                  <dt>{row.label}</dt>
                  <dd title={row.value}>{row.value}</dd>
                </div>
              ))}
            </dl>
            {group.note && <p className="file-info-note"><AlertTriangle size={13} />{group.note}</p>}
          </section>
        ) : null)}
      </div>
      <footer className="group-dialog-footer">
        <button className="secondary-button" type="button" onClick={copy} disabled={!groups}><Copy size={14} />Copier</button>
        <button className="primary-button" type="button" onClick={onClose}><Check size={15} />Fermer</button>
      </footer>
    </section>
  </div>;
}

/**
 * Fenêtre d’impression : choix de l’étendue et de la résolution, puis impression
 * réelle par la boîte de dialogue du système.
 */
export function PrintDialog({ document, currentPage, renderedHtml, onClose, notify }: {
  document: OpenDocument;
  currentPage: number;
  renderedHtml?: string;
  onClose: () => void;
  notify: (message: string, kind?: 'success' | 'error') => void;
}) {
  const isPdf = document.kind === 'pdf';
  const [scope, setScope] = useState<'current' | 'all'>(isPdf ? 'all' : 'current');
  const [quality, setQuality] = useState<PrintQuality>('normale');
  const [lineNumbers, setLineNumbers] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const request = useMemo(() => ({ document, scope, currentPage, quality, lineNumbers, renderedHtml }), [document, scope, currentPage, quality, lineNumbers, renderedHtml]);
  const summary = useMemo(() => {
    try {
      return describePrintScope(request, { job: { title: document.name, sections: [] }, notes: [], urls: [] });
    } catch {
      return 'Le contenu affiché sera imprimé.';
    }
  }, [request, document.name]);

  useEffect(() => { closeRef.current?.focus(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { job, notes, urls } = await preparePrintJob(request);
      await printHtmlDocument(buildPrintHtml(job));
      releasePrintUrls(urls);
      notify(notes.length ? `Impression lancée. ${notes[0]}` : 'Impression lancée.');
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'L’impression n’a pas pu être lancée.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const rasterized = isPdf || document.kind === 'image';

  return <div className="modal-backdrop group-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="group-dialog print-dialog" role="dialog" aria-modal="true" aria-labelledby="print-dialog-title" onSubmit={submit}>
      <header className="group-dialog-header">
        <span className="group-dialog-icon"><Printer size={17} /></span>
        <div><h2 id="print-dialog-title">Imprimer « {document.name} »</h2><p>L’impression passe par la boîte de dialogue de votre système.</p></div>
        <button className="icon-action" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="print-summary" role="note">{summary}</div>
      {isPdf && <fieldset className="print-fieldset">
        <legend>Étendue</legend>
        <label><input type="radio" name="print-scope" checked={scope === 'all'} onChange={() => setScope('all')} />Toutes les pages</label>
        <label><input type="radio" name="print-scope" checked={scope === 'current'} onChange={() => setScope('current')} />Page {currentPage} seulement</label>
      </fieldset>}
      {rasterized && <fieldset className="print-fieldset">
        <legend>Résolution d’impression</legend>
        {(Object.keys(PRINT_QUALITY_LABELS) as PrintQuality[]).map((value) => (
          <label key={value}><input type="radio" name="print-quality" checked={quality === value} onChange={() => setQuality(value)} />{PRINT_QUALITY_LABELS[value]}</label>
        ))}
      </fieldset>}
      {!isPdf && !rasterized && document.kind !== 'csv' && !renderedHtml && <fieldset className="print-fieldset">
        <legend>Mise en page</legend>
        <label><input type="checkbox" checked={lineNumbers} onChange={(event) => setLineNumbers(event.target.checked)} />Numéroter les lignes</label>
      </fieldset>}
      <p className="print-note">Aucun aperçu n’est simulé ici : la prévisualisation affichée par le système est la seule référence, et l’impression part réellement vers l’imprimante choisie.</p>
      <footer className="group-dialog-footer">
        <button ref={closeRef} className="secondary-button" type="button" onClick={onClose}>Annuler</button>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Printer size={15} />}{busy ? 'Préparation…' : 'Imprimer'}</button>
      </footer>
    </form>
  </div>;
}
