import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  catalogs,
  intlLocale,
  LOCALE_STORAGE_KEY,
  readStoredLocale,
} from './locale';
import { LocaleContext } from './locale-context';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(readStoredLocale);
  // Match language-dependent fonts and accessibility metadata before paint.
  useLayoutEffect(() => {
    const original = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = original;
    };
  }, [locale]);
  useEffect(() => {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Keep switching languages in memory when preference storage is blocked.
    }
  }, [locale]);
  return (
    <LocaleContext.Provider
      value={{
        locale,
        setLocale,
        messages: catalogs[locale],
        formatDateTime: (date) =>
          new Intl.DateTimeFormat(intlLocale(locale), {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(new Date(date)),
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}
