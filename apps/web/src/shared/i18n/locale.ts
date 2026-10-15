import { viMessages } from './vi';
import { jaMessages } from './ja';

export const LOCALES = [
  { code: 'vi', label: 'Tiếng Việt', intl: 'vi-VN' },
  { code: 'ja', label: '日本語', intl: 'ja-JP' },
] as const;
export type Locale = (typeof LOCALES)[number]['code'];
export const DEFAULT_LOCALE: Locale = 'vi';
export const LOCALE_STORAGE_KEY = 'portal.locale';
export const catalogs = { vi: viMessages, ja: jaMessages };

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.code === value);
}

export function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    // Preferences are optional: storage can be unavailable in a restricted browser.
    return DEFAULT_LOCALE;
  }
}

export function intlLocale(locale: Locale): string {
  return (
    LOCALES.find((candidate) => candidate.code === locale)?.intl ??
    LOCALES[0].intl
  );
}
