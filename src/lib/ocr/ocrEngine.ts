/**
 * OCR local avec Tesseract.js (licence Apache-2.0).
 *
 * Le moteur et les modèles de langue sont chargés à la demande. Noto annonce
 * leur taille et leur origine avant tout téléchargement, ne télécharge rien
 * sans confirmation, et met les fichiers en cache localement pour un usage
 * hors ligne ensuite. Aucune image n’est envoyée à un service en ligne : le
 * traitement s’exécute sur le poste.
 */

export interface OcrWord {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrPageResult {
  page: number;
  text: string;
  words: OcrWord[];
  confidence: number;
}

export interface OcrOptions {
  languages: string[];
  onProgress?: (value: number, label: string) => void;
  signal?: AbortSignal;
}

import {
  OCR_CORE_ORIGIN,
  OCR_ENGINE_ORIGIN,
  OCR_TESSDATA_ORIGIN,
  hasOcrConsentFor,
  ocrConsentRequiredMessage,
} from './ocrConsent';

export interface OcrLanguageDescriptor {
  code: string;
  label: string;
  /** Poids approximatif du modèle, en mégaoctets. */
  sizeMb: number;
  /** Adresse officielle du modèle, chargée uniquement après consentement. */
  source: string;
  license: string;
}

export const OCR_LANGUAGES: OcrLanguageDescriptor[] = [
  { code: 'fra', label: 'Français', sizeMb: 12, source: 'https://tessdata.projectnaptha.com/4.0.0/fra.traineddata.gz', license: 'Apache-2.0 (données entraînées Tesseract)' },
  { code: 'eng', label: 'Anglais', sizeMb: 11, source: 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz', license: 'Apache-2.0 (données entraînées Tesseract)' },
  { code: 'deu', label: 'Allemand', sizeMb: 11, source: 'https://tessdata.projectnaptha.com/4.0.0/deu.traineddata.gz', license: 'Apache-2.0 (données entraînées Tesseract)' },
  { code: 'spa', label: 'Espagnol', sizeMb: 11, source: 'https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz', license: 'Apache-2.0 (données entraînées Tesseract)' },
  { code: 'ita', label: 'Italien', sizeMb: 11, source: 'https://tessdata.projectnaptha.com/4.0.0/ita.traineddata.gz', license: 'Apache-2.0 (données entraînées Tesseract)' },
  { code: 'por', label: 'Portugais', sizeMb: 11, source: 'https://tessdata.projectnaptha.com/4.0.0/por.traineddata.gz', license: 'Apache-2.0 (données entraînées Tesseract)' },
  { code: 'nld', label: 'Néerlandais', sizeMb: 11, source: 'https://tessdata.projectnaptha.com/4.0.0/nld.traineddata.gz', license: 'Apache-2.0 (données entraînées Tesseract)' },
  { code: 'osd', label: 'Détection d’orientation et de script', sizeMb: 4, source: 'https://tessdata.projectnaptha.com/4.0.0/osd.traineddata.gz', license: 'Apache-2.0 (données entraînées Tesseract)' },
];

export function ocrLanguageLabel(code: string): string {
  return OCR_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

export interface OcrSession {
  recognize: (image: Blob | HTMLCanvasElement | string) => Promise<{ text: string; words: OcrWord[]; confidence: number }>;
  terminate: () => Promise<void>;
}

/**
 * Ouvre une session OCR.
 *
 * Aucun téléchargement n’a lieu sans un accord explicite de l’utilisateur :
 * ni les fichiers du moteur (script de travail et cœur WebAssembly) ni les
 * modèles de langue (`*.traineddata`) ne sont embarqués dans l’application ;
 * ils sont récupérés depuis les adresses affichées dans le panneau de
 * consentement, uniquement si `hasOcrConsentFor()` le confirme, puis mis en
 * cache localement, ce qui rend les traitements suivants hors ligne.
 */
/**
 * Message affiché quand le moteur n’a pas pu être chargé (connexion absente ou
 * bloquée, cache vide). Il nomme les trois adresses réellement demandées plutôt
 * que de laisser remonter une erreur réseau brute.
 */
export function ocrEngineLoadFailureMessage(detail: string): string {
  return 'Le moteur OCR n’a pas pu être chargé. Le premier traitement télécharge le moteur '
    + `(${OCR_ENGINE_ORIGIN} et ${OCR_CORE_ORIGIN}, environ 4,6 Mo) ainsi que les modèles de langue `
    + `(${OCR_TESSDATA_ORIGIN}) : vérifiez la connexion, ou autorisez ces adresses dans votre pare-feu. `
    + `Détail technique : ${detail}`;
}

export async function createOcrSession(
  languages: string[],
  options: { onProgress?: (value: number, label: string) => void; ignoreConsent?: boolean } = {},
): Promise<OcrSession> {
  const requested = languages.length ? languages : ['fra'];
  if (!options.ignoreConsent && !hasOcrConsentFor(requested)) {
    throw new Error(ocrConsentRequiredMessage(requested));
  }
  options.onProgress?.(0.02, 'Chargement du moteur OCR local (Tesseract.js)…');
  const tesseract = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof tesseract.createWorker>>;
  try {
    worker = await tesseract.createWorker(requested, 1, {
      // Sources déclarées explicitement pour les modèles : c’est celle annoncée
      // dans le panneau de consentement, et non un repli implicite. Les deux
      // fichiers du moteur suivent les adresses également annoncées.
      langPath: OCR_TESSDATA_ORIGIN,
      logger: (message: { status?: string; progress?: number }) => {
        if (!message?.status) return;
        const value = typeof message.progress === 'number' ? Math.max(0, Math.min(1, message.progress)) : 0;
        options.onProgress?.(value, translateStatus(message.status));
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(ocrEngineLoadFailureMessage(detail));
  }
  return {
    recognize: async (image) => {
      const result = await worker.recognize(image as never);
      const data = result.data as unknown as {
        text?: string;
        confidence?: number;
        words?: { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }[];
      };
      const words: OcrWord[] = (data.words ?? []).map((word) => ({
        text: word.text ?? '',
        confidence: (word.confidence ?? 0) / 100,
        x: word.bbox?.x0 ?? 0,
        y: word.bbox?.y0 ?? 0,
        width: (word.bbox?.x1 ?? 0) - (word.bbox?.x0 ?? 0),
        height: (word.bbox?.y1 ?? 0) - (word.bbox?.y0 ?? 0),
      })).filter((word) => word.text.trim().length > 0);
      return {
        text: data.text ?? '',
        words,
        confidence: (data.confidence ?? 0) / 100,
      };
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
}

function translateStatus(status: string): string {
  const labels: Record<string, string> = {
    'loading tesseract core': 'Chargement du moteur OCR…',
    'initializing tesseract': 'Initialisation du moteur OCR…',
    'loading language traineddata': 'Chargement du modèle de langue…',
    'initializing api': 'Préparation de la reconnaissance…',
    'recognizing text': 'Reconnaissance du texte…',
  };
  return labels[status] ?? 'Reconnaissance en cours…';
}

export function textToSearchableHtml(options: { words: OcrWord[]; width: number; height: number; text: string }): string {
  const escape = (value: string) => value.replace(/[&<>"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] ?? character));
  const words = options.words.map((word) => `<span style="position:absolute;left:${word.x}px;top:${word.y}px;width:${word.width}px;height:${word.height}px;font-size:${Math.max(6, word.height * 0.9).toFixed(1)}px;color:transparent;white-space:pre;">${escape(word.text)}</span>`).join('');
  return `<div style="position:relative;width:${options.width}px;height:${options.height}px">${words}</div>`;
}

export interface OcrQualitySummary {
  averageConfidence: number;
  lowConfidenceWords: OcrWord[];
  wordCount: number;
  note: string;
}

export function summarizeOcrQuality(words: OcrWord[]): OcrQualitySummary {
  if (!words.length) {
    return { averageConfidence: 0, lowConfidenceWords: [], wordCount: 0, note: 'Aucun mot n’a été reconnu. Vérifiez la résolution du document (300 points par pouce recommandés).' };
  }
  const average = words.reduce((sum, word) => sum + word.confidence, 0) / words.length;
  const low = words.filter((word) => word.confidence < 0.75).slice(0, 200);
  return {
    averageConfidence: average,
    lowConfidenceWords: low,
    wordCount: words.length,
    note: low.length
      ? `${low.length} passage(s) sur ${words.length} ont une confiance inférieure à 75 % : vérifiez-les avant d’exporter. La confiance fournie par Tesseract est une estimation, pas une garantie.`
      : 'Tous les mots reconnus dépassent 75 % de confiance estimée par le moteur.',
  };
}
