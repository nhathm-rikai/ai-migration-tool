import { createContext, useContext } from 'react';
import type { Locale } from './locale';
import type { Messages } from './vi';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Messages;
  formatDateTime: (date: string) => string;
};

// Keep context identity independent of provider/catalog hot updates in development.
export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value)
    throw new Error('Localized UI must be rendered inside LocaleProvider.');
  return value;
}
