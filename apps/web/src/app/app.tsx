import { useEffect } from 'react';
import { branding } from './branding';
import { ProjectsPage } from '../features/projects/projects-page';
import { LocaleProvider } from '../shared/i18n/locale-provider';
import { useLocale } from '../shared/i18n/locale-context';
import { isLocale, LOCALES } from '../shared/i18n/locale';

export function App() {
  return (
    <LocaleProvider>
      <AppShell />
    </LocaleProvider>
  );
}

function AppShell() {
  const { locale, setLocale, messages } = useLocale();
  useEffect(() => {
    const original = document.title;
    document.title = branding.displayName;
    return () => {
      document.title = original;
    };
  }, []);
  return (
    <>
      <a className="skip-link" href="#main-content">
        {messages.app.skipToContent}
      </a>
      <header className="top">
        <div className="top-in">
          <div className="logo">
            <img src={branding.logoUrl} alt={branding.logoAlt} />
          </div>
          <div className="brand">
            <strong>{branding.displayName}</strong>
            <span>{messages.app.subtitle}</span>
          </div>
          <span className="chip demo header-demo">{messages.app.demo}</span>
          <label className="language-picker">
            <span>{messages.app.language}</span>
            <select
              value={locale}
              onChange={(event) => {
                if (isLocale(event.currentTarget.value))
                  setLocale(event.currentTarget.value);
              }}
            >
              {LOCALES.map((language) => (
                <option
                  key={language.code}
                  value={language.code}
                  lang={language.code}
                >
                  {language.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <ProjectsPage />
    </>
  );
}
