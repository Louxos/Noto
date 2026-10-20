// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { getLanguage, setLanguage, tLang } from './i18n';
import { defaultPreferences, normalizePreferences } from './preferences';

afterEach(() => setLanguage('fr'));

describe('langue de l’interface', () => {
  it('charge les chaînes disponibles en français et en anglais', () => {
    expect(tLang('fr', 'settings.title')).toBe('Paramètres');
    expect(tLang('en', 'settings.title')).toBe('Settings');
  });

  it('change de langue sans perdre la valeur française par défaut', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(defaultPreferences.language).toBe('fr');
  });

  it('normalise les valeurs de langue inconnues en français', () => {
    expect(normalizePreferences({ language: 'de' }).language).toBe('fr');
    expect(normalizePreferences({ language: 'en' }).language).toBe('en');
  });
});
