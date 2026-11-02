import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownView } from './markdown-view';

afterEach(cleanup);

// Generated documents are untrusted: Markdown is rendered, HTML is not.
describe('MarkdownView', () => {
  it('renders headings and GitHub tables', () => {
    render(
      <MarkdownView
        content={
          '# Business rules\n\n| BR ID | Basis |\n| --- | --- |\n| BR-001 | observed |\n'
        }
      />,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Business rules' }),
    ).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'BR-001' })).toBeTruthy();
  });

  it('drops raw HTML and script links', () => {
    const { container } = render(
      <MarkdownView
        content={
          '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1)) [ok](https://example.com)\n'
        }
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    const links = [...container.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '',
      'https://example.com',
    ]);
    expect(links[1]?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
