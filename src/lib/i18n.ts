import fr from '../i18n/fr.json';
import en from '../i18n/en.json';

export type Language = 'fr' | 'en';

const catalogs: Record<Language, Record<string, unknown>> = {
  fr: fr as Record<string, unknown>,
  en: en as Record<string, unknown>,
};

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  let currentValue: unknown = obj;
  for (const part of path.split('.')) {
    if (currentValue && typeof currentValue === 'object' && part in (currentValue as Record<string, unknown>)) {
      currentValue = (currentValue as Record<string, unknown>)[part];
    } else return undefined;
  }
  return typeof currentValue === 'string' ? currentValue : undefined;
}

let current: Language = 'fr';
const listeners = new Set<(language: Language) => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  if (language !== 'fr' && language !== 'en') return;
  current = language;
  try { document.documentElement.lang = language; } catch { /* May be called by a non-DOM test. */ }
  for (const listener of listeners) listener(language);
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: string, fallback?: string): string {
  const value = getNested(catalogs[current], key) ?? getNested(catalogs.fr, key);
  return value ?? fallback ?? key;
}

export function tLang(language: Language, key: string): string {
  return getNested(catalogs[language], key) ?? key;
}
