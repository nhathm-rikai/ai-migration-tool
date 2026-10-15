import { useEffect, useState } from 'react';
import { branding } from './branding';
import { ProjectsPage } from '../features/projects/projects-page';
import { Icon } from '../shared/ui/icon';

export function App() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [dark]);
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
        Đến nội dung chính
      </a>
      <header className="top">
        <div className="top-in">
          <div className="logo">
            <img src={branding.logoUrl} alt={branding.logoAlt} />
          </div>
          <div className="brand">
            <strong>{branding.displayName}</strong>
            <span>{branding.subtitle}</span>
          </div>
          <span className="chip demo header-demo">DEMO · dữ liệu mẫu</span>
          <button
            className="button theme-toggle"
            aria-label={dark ? 'Giao diện sáng' : 'Giao diện tối'}
            aria-pressed={dark}
            onClick={() => setDark((value) => !value)}
          >
            <Icon name={dark ? 'sun' : 'moon'} />
            <span>{dark ? 'Giao diện sáng' : 'Giao diện tối'}</span>
          </button>
        </div>
      </header>
      <ProjectsPage />
    </>
  );
}
