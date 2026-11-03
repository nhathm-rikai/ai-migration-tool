import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  localSourceResponseFixture,
  queuedRunFixture,
} from '@portal/contracts/fixtures';
import { App } from './app';
import {
  json,
  localProject,
  requestUrl,
  testCredentials,
} from '../testing/fixtures';
import { createProjectsApi } from '../shared/api/projects-api';
import { createRunsApi } from '../shared/api/runs-api';
import { createSourcesApi } from '../shared/api/sources-api';
import { createArtifactsApi } from '../shared/api/artifacts-api';
import { LOCALE_STORAGE_KEY } from '../shared/i18n/locale';
import { LocaleProvider } from '../shared/i18n/locale-provider';
import { useLocale } from '../shared/i18n/locale-context';

// The app opens on step 1 of a new project (UI04). A fake backend answers by
// `METHOD /path`; unknown routes answer an empty project list.
const ROOT = 'D:\\work\\order-module';
type Handler = (init?: RequestInit) => Response | Promise<Response>;

function backend(routes: Record<string, Handler> = {}) {
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input).split('?')[0] ?? '';
    const handler = routes[`${init?.method ?? 'GET'} ${url}`];
    if (handler) return Promise.resolve(handler(init));
    if (url === '/api/v1/local/folder-picker')
      return Promise.resolve(json({ status: 'selected', path: ROOT }));
    if (url.endsWith('/runs/current'))
      return Promise.resolve(json({ run: null }));
    return Promise.resolve(json({ items: [], nextCursor: null }));
  });
  return fetcher;
}

function TestApp({ fetcher }: { fetcher: typeof fetch }) {
  return (
    <App
      api={createProjectsApi(fetcher, testCredentials)}
      runsApi={createRunsApi(fetcher, testCredentials)}
      sourcesApi={createSourcesApi(fetcher, testCredentials)}
      artifactsApi={createArtifactsApi(fetcher, testCredentials)}
      session={testCredentials}
    />
  );
}

// Writes; opening the folder dialog is not one.
const posts = (fetcher: ReturnType<typeof backend>) =>
  fetcher.mock.calls.filter(
    ([input, init]) =>
      init?.method === 'POST' &&
      requestUrl(input) !== '/api/v1/local/folder-picker',
  );

// Chooses a folder on the scan card of the new project; the backend's
// folder dialog answers ROOT (see `backend`).
async function typeFolder() {
  fireEvent.click(await screen.findByRole('button', { name: 'Chọn thư mục' }));
  await screen.findByText('Đã chọn thư mục');
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

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

it('opens on step 1 of a new project; switching language keeps the input, persists and exposes no theme toggle', async () => {
  const fetcher = backend();
  const view = render(<TestApp fetcher={fetcher} />);
  expect(window.location.pathname).toBe('/projects/new');
  expect(await screen.findByText('Chọn thư mục source')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Tên dự án'), {
    target: { value: '入力した名前' },
  });
  fireEvent.click(screen.getByRole('radio', { name: '日本語' }));
  expect(screen.getByLabelText('プロジェクト名')).toBe(
    screen.getByDisplayValue('入力した名前'),
  );
  expect(document.documentElement.lang).toBe('ja');
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja');
  expect(screen.queryByRole('button', { name: /Giao diện|テーマ/ })).toBeNull();
  // Opening the page reads only; nothing is created.
  expect(posts(fetcher)).toEqual([]);
  view.unmount();
  render(<TestApp fetcher={fetcher} />);
  expect(screen.getByLabelText('プロジェクト名')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Tiếng Việt' }));
  expect(screen.getByLabelText('Tên dự án')).toBeTruthy();
  expect(document.documentElement.lang).toBe('vi');
});

it('retranslates a validation error without creating anything or clearing the form', async () => {
  const fetcher = backend();
  render(<TestApp fetcher={fetcher} />);
  await typeFolder();
  // The name follows the folder until edited.
  expect(screen.getByLabelText('Tên dự án')).toHaveProperty(
    'value',
    'order-module',
  );
  fireEvent.change(screen.getByLabelText('Tên dự án'), {
    target: { value: ' ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Quét source' }));
  expect(screen.getAllByRole('alert')[0]?.textContent).toContain('1 đến 120');
  fireEvent.click(screen.getByRole('radio', { name: '日本語' }));
  expect(screen.getAllByRole('alert')[0]?.textContent).toContain('1～120文字');
  expect(
    screen.getByLabelText('プロジェクト名').getAttribute('aria-invalid'),
  ).toBe('true');
  expect(posts(fetcher)).toEqual([]);
});

it('keeps a pending first scan across a language switch, then opens the created project', async () => {
  let finish: ((response: Response) => void) | undefined;
  const runsUrl = `/api/v1/projects/${localProject.id}/runs`;
  const fetcher = backend({
    'POST /api/v1/projects': () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    [`PUT /api/v1/projects/${localProject.id}/source`]: () =>
      json(localSourceResponseFixture),
    [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    [`GET /api/v1/projects/${localProject.id}`]: () => json(localProject),
  });
  render(<TestApp fetcher={fetcher} />);
  await typeFolder();
  fireEvent.click(screen.getByRole('radio', { name: 'VB6' }));
  fireEvent.click(screen.getByRole('button', { name: 'Quét source' }));
  fireEvent.click(screen.getByRole('radio', { name: '日本語' }));
  expect(
    screen
      .getByRole('button', { name: /リクエストを送信中/ })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByDisplayValue('order-module')).toBeTruthy();
  expect(posts(fetcher)).toHaveLength(1);
  await act(async () => {
    finish?.(json(localProject, 201));
    await Promise.resolve();
  });
  await vi.waitFor(() =>
    expect(window.location.pathname).toBe(
      `/projects/${localProject.id}/source`,
    ),
  );
  expect(JSON.parse(posts(fetcher)[0]?.[1]?.body as string)).toEqual({
    name: 'order-module',
    mode: 'local',
  });
});

it('retranslates list and project errors without reading them again', async () => {
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
  const view = render(<TestApp fetcher={fetcher} />);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Không tải được danh sách dự án',
  );
  expect(document.body.textContent).not.toContain('private-server-message');
  const before = fetcher.mock.calls.length;
  fireEvent.click(screen.getByRole('radio', { name: '日本語' }));
  expect(screen.getByRole('alert').textContent).toContain(
    'プロジェクト一覧を読み込めませんでした',
  );
  expect(fetcher).toHaveBeenCalledTimes(before);
  view.unmount();
  // A project that no longer exists shows the not-found page, translated in
  // place without reading it again.
  const missing = backend({
    [`GET /api/v1/projects/${localProject.id}`]: () =>
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
  });
  window.history.replaceState(null, '', `/projects/${localProject.id}/source`);
  render(<TestApp fetcher={missing} />);
  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: 'プロジェクトが見つかりません',
    }),
  ).toBeTruthy();
  const reads = missing.mock.calls.length;
  fireEvent.click(screen.getByRole('radio', { name: 'Tiếng Việt' }));
  expect(
    screen.getByRole('heading', { level: 1, name: 'Không tìm thấy dự án' }),
  ).toBeTruthy();
  expect(missing).toHaveBeenCalledTimes(reads);
});

it('retranslates an uncertain create and keeps the name', async () => {
  const fetcher = backend({
    'POST /api/v1/projects': () => json({ stored: true }, 201),
  });
  render(<TestApp fetcher={fetcher} />);
  await typeFolder();
  fireEvent.click(screen.getByRole('radio', { name: 'VB6' }));
  fireEvent.click(screen.getByRole('button', { name: 'Quét source' }));
  expect(
    (await screen.findByText(/Làm mới danh sách để kiểm tra/)).textContent,
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: '日本語' }));
  expect(screen.getByText(/再作成する前に/)).toBeTruthy();
  expect(screen.getByDisplayValue('order-module')).toBeTruthy();
  expect(posts(fetcher)).toHaveLength(1);
});

it('falls back safely for unsupported preferences and still switches when storage is blocked', async () => {
  const fetcher = backend();
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'unsupported-locale');
  const view = render(<TestApp fetcher={fetcher} />);
  await screen.findByText('Chọn thư mục source');
  expect(screen.getByRole('group', { name: 'Ngôn ngữ' })).toBeTruthy();
  view.unmount();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  render(<TestApp fetcher={fetcher} />);
  fireEvent.click(screen.getByRole('radio', { name: '日本語' }));
  expect(screen.getByLabelText('プロジェクト名')).toBeTruthy();
  expect(document.documentElement.lang).toBe('ja');
});
