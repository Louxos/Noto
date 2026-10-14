import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, Globe2, HardDrive, Trash2 } from 'lucide-react';
import { OCR_LANGUAGES, ocrLanguageLabel } from '../lib/ocr/ocrEngine';
import {
  OCR_TESSDATA_ORIGIN,
  OCR_TESSDATA_VERSION,
  grantOcrConsent,
  hasOcrConsentFor,
  loadOcrConsent,
  revokeOcrConsent,
  type OcrConsentRecord,
} from '../lib/ocr/ocrConsent';

/**
 * Panneau « Modèles OCR ».
 *
 * Il n’existe qu’une raison à ce panneau : rendre le téléchargement des modèles
 * vérifiablement explicite. L’utilisateur y voit la langue, la taille estimée,
 * l’adresse exacte d’origine et la licence de chaque modèle, puis autorise ou
 * non le téléchargement. Rien n’est téléchargé tant que l’accord n’a pas été
 * donné, et un simple bouton permet de le retirer.
 */

export function OcrModelsPanel({ languages, onConsentChanged }: { languages: string[]; onConsentChanged?: () => void }) {
  const [consent, setConsent] = useState<OcrConsentRecord | null>(() => loadOcrConsent());
  const [selected, setSelected] = useState<string[]>(() => (languages.length ? languages : ['fra']));

  useEffect(() => {
    if (languages.length) setSelected(languages);
  }, [languages]);

  const refresh = useCallback(() => {
    setConsent(loadOcrConsent());
    onConsentChanged?.();
  }, [onConsentChanged]);

  const selectedLanguages = OCR_LANGUAGES.filter((language) => selected.includes(language.code));
  const estimatedMb = selectedLanguages.reduce((total, language) => total + language.sizeMb, 0);
  const allowed = hasOcrConsentFor(selected);

  return (
    <section className="studio-ocr-models" aria-label="Modèles OCR">
      <header className="studio-panel-head">
        <h2>Modèles OCR</h2>
        <span className="studio-ocr-state">{allowed ? <><CheckCircle2 size={12} /> autorisé</> : 'non autorisé'}</span>
      </header>

      <p className="studio-empty">
        La reconnaissance de texte utilise Tesseract.js (licence Apache-2.0). Les modèles de langue ne sont pas inclus dans
        l’application : ils sont téléchargés une seule fois, puis conservés en cache local, ce qui rend les traitements suivants
        hors ligne. Aucune image n’est envoyée en ligne.
      </p>

      <ul className="studio-ocr-languages">
        {OCR_LANGUAGES.map((language) => (
          <li key={language.code}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(language.code)}
                onChange={(event) => setSelected((current) => event.target.checked
                  ? [...new Set([...current, language.code])]
                  : current.filter((code) => code !== language.code))}
              />
              <span>{language.label}</span>
            </label>
            <span className="studio-ocr-size">{language.sizeMb} Mo</span>
          </li>
        ))}
      </ul>

      <dl className="studio-ocr-facts">
        <div><dt><Globe2 size={12} aria-hidden="true" /> Origine</dt><dd>{OCR_TESSDATA_ORIGIN}</dd></div>
        <div><dt><HardDrive size={12} aria-hidden="true" /> Taille estimée</dt><dd>environ {estimatedMb} Mo pour {selectedLanguages.length} modèle(s) ({OCR_TESSDATA_VERSION})</dd></div>
        <div><dt>Licence</dt><dd>{selectedLanguages[0]?.license ?? OCR_LANGUAGES[0].license}</dd></div>
      </dl>

      <div className="studio-ocr-actions">
        {!allowed && (
          <button
            type="button"
            className="studio-run-button"
            disabled={!selected.length}
            onClick={() => {
              grantOcrConsent(selected);
              refresh();
            }}
          >
            <Download size={13} /> J’autorise ce téléchargement
          </button>
        )}
        {consent && (
          <>
            <button type="button" className="studio-mini-button" onClick={() => { revokeOcrConsent(); refresh(); }}>
              <Trash2 size={13} /> Retirer mon accord
            </button>
            <span className="studio-ocr-memory">
              Accord donné le {new Date(consent.grantedAt).toLocaleString('fr-FR')} pour {consent.languages.map(ocrLanguageLabel).join(', ')}.
            </span>
          </>
        )}
      </div>

      {allowed && <p className="studio-ocr-ready">Vous pouvez lancer l’OCR : les modèles seront téléchargés au premier traitement, puis réutilisés hors ligne.</p>}
    </section>
  );
}
