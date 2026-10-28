import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './app';
import { json, project, testCredentials } from '../testing/fixtures';
import { createProjectsApi } from '../shared/api/projects-api';

import { LOCALE_STORAGE_KEY } from '../shared/i18n/locale';
import { LocaleProvider } from '../shared/i18n/locale-provider';
import { useLocale } from '../shared/i18n/locale-context';

// Global fetch is stubbed per test; the credential is ready without network.
function TestApp() {
  return (
    <App
      api={createProjectsApi(
        (input, init) => fetch(input, init),
        testCredentials,
      )}
      session={testCredentials}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function mockEmptyList() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(() =>
      Promise.resolve(json({ items: [], nextCursor: null })),
    );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('synchronizes document language before descendant passive effects on mount and switch', () => {
  const originalLanguage = document.documentElement.lang;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ja');
  const observed: string[] = [];
  function LanguageObserver() {
    const { locale, setLocale } = useLocale();
    useEffect(() => {
      observed.push(`${locale}:${document.documentElement.lang}`);
    }, [locale]);
    return <button onClick={() => setLocale('vi')}>Tiếng Việt</button>;
  }
  const view = render(
    <LocaleProvider>
      <LanguageObserver />
    </LocaleProvider>,
  );
  expect(observed).toEqual(['ja:ja']);
  fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
  expect(observed).toEqual(['ja:ja', 'vi:vi']);
  view.unmount();
  expect(document.documentElement.lang).toBe(originalLanguage);
});

it('switches Vietnamese/Japanese, preserves input, persists the locale and exposes no theme toggle', async () => {
  const fetcher = mockEmptyList();
  const view = render(<TestApp />);
  await screen.findByText('Chưa có dự án');
  fireEvent.change(screen.getByLabelText('Tên dự án'), {
    target: { value: '入力した名前' },
  });
  fireEvent.change(screen.getByLabelText('Ngôn ngữ'), {
    target: { value: 'ja' },
  });
  expect(screen.getByLabelText('プロジェクト名')).toBe(
    screen.getByDisplayValue('入力した名前'),
  );
  expect(
    screen.getByRole('navigation', { name: 'プロジェクトツリー' }),
  ).toBeTruthy();
  expect(document.documentElement.lang).toBe('ja');
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja');
  expect(screen.queryByRole('button', { name: /Giao diện|テーマ/ })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  view.unmount();
  render(<TestApp />);
  expect(screen.getByLabelText('プロジェクト名')).toBeTruthy();
  await screen.findByText('プロジェクトはまだありません');
  fireEvent.change(screen.getByLabelText('言語'), { target: { value: 'vi' } });
  expect(screen.getByLabelText('Tên dự án')).toBeTruthy();
  expect(document.documentElement.lang).toBe('vi');
});

it('retranslates an existing validation error without submitting or clearing the form', async () => {
  const fetcher = mockEmptyList();
  render(<TestApp />);
  await screen.findByText('Chưa có dự án');
  fireEvent.click(screen.getByRole('button', { name: /^Tạo dự án$/ }));
  expect(screen.getByRole('alert').textContent).toContain('1 đến 120');
  fireEvent.change(screen.getByLabelText('Ngôn ngữ'), {
    target: { value: 'ja' },
  });
  expect(screen.getByRole('alert').textContent).toContain('1～120文字');
  expect(
    screen.getByLabelText('プロジェクト名').getAttribute('aria-invalid'),
  ).toBe('true');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('preserves a pending create, then selection, success notice and dates when switching locale', async () => {
  let finish: ((response: Response) => void) | undefined;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ items: [], nextCursor: null }))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation((url) =>
      Promise.resolve(
        typeof url === 'string' && url.endsWith(project.id)
          ? json(project)
          : json({ items: [project], nextCursor: null }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<TestApp />);
  await screen.findByText('Chưa có dự án');
  fireEvent.change(screen.getByLabelText('Tên dự án'), {
    target: { value: project.name },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Tạo dự án$/ }));
  fireEvent.change(screen.getByLabelText('Ngôn ngữ'), {
    target: { value: 'ja' },
  });
  expect(
    screen.getByRole('button', { name: '作成中…' }).hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByDisplayValue(project.name)).toBeTruthy();
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === 'POST'),
  ).toHaveLength(1);
  await act(async () => {
    finish?.(json(project, 201));
    await Promise.resolve();
  });
  await screen.findByText(project.id);
  expect(screen.getByText('プロジェクトを作成しました。')).toBeTruthy();
  expect(screen.getByRole('heading', { name: project.name })).toBeTruthy();
  const formatted = new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(project.createdAt));
  expect(screen.getByText(formatted)).toBeTruthy();
  const requestsBeforeSwitch = fetcher.mock.calls.length;
  fireEvent.change(screen.getByLabelText('言語'), { target: { value: 'vi' } });
  expect(screen.getByText(project.id)).toBeTruthy();
  expect(screen.getByText('Đã tạo dự án.')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(requestsBeforeSwitch);
});

it('retranslates list and detail HTTP errors without refetching them', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    json(
      {
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'private-server-message',
          requestId: 'request-001',
        },
      },
      404,
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  const view = render(<TestApp />);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Không tìm thấy API',
  );
  fireEvent.change(screen.getByLabelText('Ngôn ngữ'), {
    target: { value: 'ja' },
  });
  expect(screen.getByRole('alert').textContent).toContain('要求されたAPI');
  expect(fetcher).toHaveBeenCalledTimes(1);
  view.unmount();
  fetcher
    .mockReset()
    .mockResolvedValueOnce(json({ items: [project], nextCursor: null }))
    .mockResolvedValueOnce(
      json(
        {
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'safe-server-message',
            requestId: 'request-002',
          },
        },
        404,
      ),
    );
  render(<TestApp />);
  fireEvent.click(await screen.findByRole('button', { name: project.name }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'プロジェクトが見つかりません。',
  );
  fireEvent.change(screen.getByLabelText('言語'), { target: { value: 'vi' } });
  expect(screen.getByRole('alert').textContent).toBe(
    'Không tìm thấy dự án này.',
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('retranslates an uncertain submission outcome and preserves a valid name', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(json({ stored: true }, 201));
  vi.stubGlobal('fetch', fetcher);
  render(<TestApp />);
  await screen.findByText('Chưa có dự án');
  fireEvent.change(screen.getByLabelText('Tên dự án'), {
    target: { value: '変更しない名前' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Tạo dự án$/ }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Làm mới danh sách',
  );
  fireEvent.change(screen.getByLabelText('Ngôn ngữ'), {
    target: { value: 'ja' },
  });
  expect(screen.getByRole('alert').textContent).toContain('再作成する前に');
  expect(
    screen.getByDisplayValue('変更しない名前').getAttribute('aria-invalid'),
  ).toBe('false');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('falls back safely for unsupported preferences and still switches when storage is blocked', async () => {
  mockEmptyList();
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'unsupported-locale');
  const view = render(<TestApp />);
  await screen.findByText('Chưa có dự án');
  expect(screen.getByLabelText('Ngôn ngữ')).toBeTruthy();
  view.unmount();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  render(<TestApp />);
  fireEvent.change(screen.getByLabelText('Ngôn ngữ'), {
    target: { value: 'ja' },
  });
  expect(screen.getByLabelText('プロジェクト名')).toBeTruthy();
  expect(document.documentElement.lang).toBe('ja');
});
