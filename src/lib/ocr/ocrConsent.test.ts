import { describe, expect, it, beforeEach } from 'vitest';
import {
  OCR_CONSENT_KEY,
  OCR_TESSDATA_ORIGIN,
  grantOcrConsent,
  hasOcrConsentFor,
  loadOcrConsent,
  ocrConsentRequiredMessage,
  revokeOcrConsent,
} from './ocrConsent';

/** Stockage minimal imitant localStorage, pour vérifier le comportement réel. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('consentement OCR', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  });

  it('n’autorise rien sans accord explicite', () => {
    expect(loadOcrConsent()).toBeNull();
    expect(hasOcrConsentFor(['fra'])).toBe(false);
  });

  it('enregistre l’accord avec l’origine et la version réellement utilisées', () => {
    const record = grantOcrConsent(['fra', 'eng']);
    expect(record.origin).toBe(OCR_TESSDATA_ORIGIN);
    expect(record.version).toBe('4.0.0');
    expect(hasOcrConsentFor(['fra'])).toBe(true);
    expect(hasOcrConsentFor(['fra', 'eng'])).toBe(true);
  });

  it('ne considère pas une langue non autorisée comme consentie', () => {
    grantOcrConsent(['fra']);
    expect(hasOcrConsentFor(['deu'])).toBe(false);
    expect(hasOcrConsentFor(['fra', 'deu'])).toBe(false);
  });

  it('permet de retirer l’accord, qui est alors redemandé', () => {
    grantOcrConsent(['fra']);
    revokeOcrConsent();
    expect(loadOcrConsent()).toBeNull();
    expect(hasOcrConsentFor(['fra'])).toBe(false);
  });

  it('résiste à un enregistrement corrompu', () => {
    localStorage.setItem(OCR_CONSENT_KEY, '{ceci n’est pas du JSON');
    expect(loadOcrConsent()).toBeNull();
    localStorage.setItem(OCR_CONSENT_KEY, JSON.stringify({ grantedAt: 'hier', languages: 'fra' }));
    expect(loadOcrConsent()).toBeNull();
  });

  it('explique ce qui serait téléchargé, et depuis où', () => {
    const message = ocrConsentRequiredMessage(['fra', 'eng']);
    expect(message).toContain('fra, eng');
    expect(message).toContain(OCR_TESSDATA_ORIGIN);
    expect(message).toContain('licence');
    expect(message).toContain('sans votre accord');
  });
});
