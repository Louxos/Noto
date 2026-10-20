import { describe, expect, it } from 'vitest';
import { ocrEngineLoadFailureMessage } from './ocrEngine';
import { OCR_CORE_ORIGIN, OCR_ENGINE_ORIGIN, OCR_TESSDATA_ORIGIN } from './ocrConsent';

/**
 * Ces tests vérifient le message réellement affiché quand le moteur ne peut pas
 * être chargé. Le scénario hors ligne lui-même n’est pas reproductible ici :
 * seul le texte produit par l’application est contrôlé.
 */
describe('échec de chargement du moteur OCR', () => {
  it('nomme les trois adresses réellement demandées', () => {
    const message = ocrEngineLoadFailureMessage('Failed to fetch');
    expect(message).toContain(OCR_ENGINE_ORIGIN);
    expect(message).toContain(OCR_CORE_ORIGIN);
    expect(message).toContain(OCR_TESSDATA_ORIGIN);
    expect(message).toContain('connexion');
  });

  it('conserve le détail technique pour le diagnostic', () => {
    const message = ocrEngineLoadFailureMessage('net::ERR_INTERNET_DISCONNECTED');
    expect(message).toContain('net::ERR_INTERNET_DISCONNECTED');
  });
});
