/**
 * Consentement explicite pour les modèles OCR.
 *
 * Noto ne télécharge jamais de modèle sans un accord clair de l’utilisateur.
 * Le moteur Tesseract a besoin de fichiers de langue (`*.traineddata`) qui ne
 * sont pas inclus dans l’application : ils sont donc téléchargés une première
 * fois depuis une source libre, puis mis en cache localement par le moteur.
 *
 * Ce module conserve la trace de cet accord, avec les informations exactes
 * présentées à l’utilisateur : origine, taille estimée et licence.
 */

export const OCR_CONSENT_KEY = 'noto.ocr.consent.v1';

/** Source officielle des modèles de langue, publiée par le projet Tesseract. */
export const OCR_TESSDATA_ORIGIN = 'https://tessdata.projectnaptha.com/4.0.0';
export const OCR_TESSDATA_VERSION = '4.0.0';

/**
 * Le moteur Tesseract.js ne transporte ni son script de travail ni son cœur
 * WebAssembly dans le paquet applicatif : par défaut, la bibliothèque les
 * charge elle-même depuis jsDelivr. Noto ne masque pas ce repli : ces deux
 * adresses sont affichées avant l’accord, comme celles des modèles de langue.
 *
 * Les versions ci-dessous sont celles déclarées par la dépendance installée
 * (relevées dans `package-lock.json`) ; un test échoue si elles divergent, afin
 * de ne jamais afficher une adresse obsolète.
 */
export const OCR_ENGINE_VERSION = '5.1.1';
export const OCR_CORE_VERSION = '5.1.1';
export const OCR_ENGINE_ORIGIN = `https://cdn.jsdelivr.net/npm/tesseract.js@v${OCR_ENGINE_VERSION}/dist/worker.min.js`;
export const OCR_CORE_ORIGIN = `https://cdn.jsdelivr.net/npm/tesseract.js-core@v${OCR_CORE_VERSION}`;

export interface OcrConsentRecord {
  grantedAt: number;
  /** Langues acceptées par l’utilisateur (`osd` inclus si demandé). */
  languages: string[];
  origin: string;
  version: string;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadOcrConsent(): OcrConsentRecord | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(OCR_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OcrConsentRecord>;
    if (!Array.isArray(parsed.languages) || typeof parsed.grantedAt !== 'number') return null;
    return {
      grantedAt: parsed.grantedAt,
      languages: parsed.languages.filter((language): language is string => typeof language === 'string'),
      origin: typeof parsed.origin === 'string' ? parsed.origin : OCR_TESSDATA_ORIGIN,
      version: typeof parsed.version === 'string' ? parsed.version : OCR_TESSDATA_VERSION,
    };
  } catch {
    return null;
  }
}

export function grantOcrConsent(languages: string[]): OcrConsentRecord {
  const record: OcrConsentRecord = {
    grantedAt: Date.now(),
    languages: [...new Set(languages)],
    origin: OCR_TESSDATA_ORIGIN,
    version: OCR_TESSDATA_VERSION,
  };
  const store = storage();
  try {
    store?.setItem(OCR_CONSENT_KEY, JSON.stringify(record));
  } catch {
    // L’accord reste valable pour la session en cours même si le stockage est
    // indisponible : il sera redemandé à la prochaine ouverture.
  }
  return record;
}

export function revokeOcrConsent(): void {
  const store = storage();
  try {
    store?.removeItem(OCR_CONSENT_KEY);
  } catch {
    // Rien à faire : l’absence de trace suffit à redemander l’accord.
  }
}

/**
 * Vérifie que l’accord couvre bien toutes les langues demandées. Un accord
 * accordé pour le français ne vaut pas pour l’allemand.
 */
export function hasOcrConsentFor(languages: string[]): boolean {
  const record = loadOcrConsent();
  if (!record) return false;
  return languages.every((language) => record.languages.includes(language));
}

/** Message d’erreur présenté tel quel à l’utilisateur. */
export function ocrConsentRequiredMessage(languages: string[]): string {
  return `L’OCR nécessite le téléchargement du moteur de reconnaissance et des modèles de langue (${languages.join(', ')}). `
    + 'Noto ne télécharge rien sans votre accord : le script de travail du moteur vient de '
    + `${OCR_ENGINE_ORIGIN}, son cœur WebAssembly de ${OCR_CORE_ORIGIN}, `
    + `et les modèles de ${OCR_TESSDATA_ORIGIN}. `
    + 'Ouvrez le panneau « Modèles OCR » de l’atelier pour connaître la taille estimée et la licence de chaque modèle, puis autorisez le téléchargement.';
}
