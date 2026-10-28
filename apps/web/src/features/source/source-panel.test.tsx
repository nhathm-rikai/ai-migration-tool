import {
  act,
  fireEvent,
  render as renderWithLibrary,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localSourceResponseFixture } from '@portal/contracts/fixtures';
import type { ProjectSourceResponse } from '@portal/contracts';
import { ProjectDetail } from '../projects/project-detail';
import { createProjectsApi } from '../../shared/api/projects-api';
import { createRunsApi } from '../../shared/api/runs-api';
import { createSourcesApi } from '../../shared/api/sources-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { useLocale } from '../../shared/i18n/locale-context';
import {
  json,
  localProject,
  requestUrl,
  testCredentials,
} from '../../testing/fixtures';

const otherProject = {
  ...localProject,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Dự án B',
};
const ROOT = 'D:\\work\\order-module';
const registered = (
  overrides: Partial<NonNullable<ProjectSourceResponse['source']>> = {},
) => ({ source: { ...localSourceResponseFixture.source, ...overrides } });

type Call = { method: string; url: string; body: unknown };
type Handler = (call: Call) => Response | Promise<Response>;

// Fake backend for the three APIs; routes `METHOD /path` to handlers.
function createServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input);
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const project = [localProject, otherProject].find(
      (item) => url === `/api/v1/projects/${item.id}`,
    );
    if (project && call.method === 'GET') return Promise.resolve(json(project));
    const handler = routes[`${call.method} ${url.split('?')[0]}`];
    if (handler) return Promise.resolve(handler(call));
    if (url.endsWith('/runs/current'))
      return Promise.resolve(json({ run: null }));
    if (url.includes('/runs'))
      return Promise.resolve(json({ items: [], nextCursor: null }));
    return Promise.resolve(json({ error: 'no route' }, 500));
  });
  return {
    calls,
    puts: () => calls.filter((call) => call.method === 'PUT'),
    starts: () => calls.filter((call) => call.method === 'POST'),
    props: {
      api: createProjectsApi(fetcher, testCredentials),
      runsApi: createRunsApi(fetcher, testCredentials),
      sourcesApi: createSourcesApi(fetcher, testCredentials),
    },
  };
}

const sourceUrl = (id = localProject.id) => `/api/v1/projects/${id}/source`;

function render(ui: ReactElement) {
  return renderWithLibrary(ui, { wrapper: LocaleProvider });
}

function detail(server: ReturnType<typeof createServer>, id = localProject.id) {
  return (
    <ProjectDetail
      key={id}
      id={id}
      {...server.props}
      onClose={() => undefined}
    />
  );
}

const errorBody = (code: string, status: number) =>
  json(
    { error: { code, message: 'raw server text', requestId: 'r-1' } },
    status,
  );

afterEach(() => {
  window.localStorage.clear();
});

describe('Source registration form (F01)', () => {
  it('shows an unregistered source and blocks Start until one is registered', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
    });
    render(detail(server));
    expect(
      await screen.findByText(/chưa đăng ký thư mục mã nguồn/),
    ).toBeTruthy();
    const start = await screen.findByRole('button', {
      name: 'Bắt đầu phân tích',
    });
    expect(start).toHaveProperty('disabled', true);
    expect(screen.getByText(/Cần đăng ký một thư mục mã nguồn/)).toBeTruthy();
    expect(screen.queryByText('DEMO')).toBeNull();
  });

  it('F01-AC01 shows field errors and sends nothing for a missing path or schema', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
    });
    render(detail(server));
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng ký' }));
    expect(
      await screen.findByText('Nhập đường dẫn thư mục mã nguồn.'),
    ).toBeTruthy();
    expect(
      screen
        .getByLabelText('Đường dẫn thư mục (tuyệt đối)')
        .getAttribute('aria-invalid'),
    ).toBe('true');
    fireEvent.change(screen.getByLabelText('Đường dẫn thư mục (tuyệt đối)'), {
      target: { value: ROOT },
    });
    fireEvent.change(screen.getByLabelText('Schema mặc định của tên bảng'), {
      target: { value: 'assumed' },
    });
    fireEvent.change(screen.getByLabelText('Tên schema'), {
      target: { value: 'APP; DROP' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(await screen.findByText(/Nhập tên schema bắt đầu/)).toBeTruthy();
    expect(server.puts()).toEqual([]);
  });

  it('registers a source, then starts on its revision without the path in any URL', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`PUT ${sourceUrl()}`]: () => json(registered()),
      [`POST /api/v1/projects/${localProject.id}/runs`]: () =>
        errorBody('RUN_ACTIVE_CONFLICT', 409),
    });
    render(detail(server));
    fireEvent.change(
      await screen.findByLabelText('Đường dẫn thư mục (tuyệt đối)'),
      {
        target: { value: `  ${ROOT}  ` },
      },
    );
    fireEvent.change(screen.getByLabelText('Schema mặc định của tên bảng'), {
      target: { value: 'assumed' },
    });
    fireEvent.change(screen.getByLabelText('Tên schema'), {
      target: { value: 'APP' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(await screen.findByText('Đã lưu mã nguồn.')).toBeTruthy();
    expect(server.puts().map((call) => call.body)).toEqual([
      {
        rootPath: ROOT,
        profileId: 'vb6-cp932-v1',
        tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
        expectedSourceRevision: null,
      },
    ]);
    expect(screen.getByText('order-module')).toBeTruthy();
    expect(screen.getByText('Giả định, chưa xác nhận')).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Bắt đầu phân tích' });
    expect(start).toHaveProperty('disabled', false);
    fireEvent.click(start);
    await waitFor(() => expect(server.starts()).toHaveLength(1));
    expect(server.starts()[0]?.body).toMatchObject({
      source: { strategy: 'current-source', expectedSourceRevision: 1 },
    });
    for (const call of server.calls) expect(call.url).not.toContain('work');
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('work');
  });

  it.each([
    ['SOURCE_FORBIDDEN', 422, /Không được dùng thư mục này/],
    [
      'SOURCE_UNREADABLE',
      422,
      /không tồn tại hoặc ứng dụng không có quyền đọc/,
    ],
    ['SOURCE_REVISION_CONFLICT', 409, /vừa được cập nhật ở nơi khác/],
    ['INVALID_INPUT', 400, /đường dẫn phải là đường dẫn tuyệt đối/],
  ])(
    'F01-AC02 keeps the input and shows a safe message for %s',
    async (code, status, message) => {
      const server = createServer({
        [`GET ${sourceUrl()}`]: () => json({ source: null }),
        [`PUT ${sourceUrl()}`]: () => errorBody(code, status),
      });
      render(detail(server));
      const field = await screen.findByLabelText(
        'Đường dẫn thư mục (tuyệt đối)',
      );
      fireEvent.change(field, { target: { value: ROOT } });
      fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByText('raw server text')).toBeNull();
      expect(field).toHaveProperty('value', ROOT);
      // A backend refusal is not a field error.
      expect(field.getAttribute('aria-invalid')).toBe('false');
      expect(
        screen.getByRole('button', { name: 'Bắt đầu phân tích' }),
      ).toHaveProperty('disabled', true);
      expect(server.puts()).toHaveLength(1);
    },
  );

  it('F01-AC02 asks to reload before resending when the save outcome is unknown', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`PUT ${sourceUrl()}`]: () => Promise.reject(new TypeError('offline')),
    });
    render(detail(server));
    fireEvent.change(
      await screen.findByLabelText('Đường dẫn thư mục (tuyệt đối)'),
      {
        target: { value: ROOT },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(
      await screen.findByText(/Chưa xác nhận được backend đã lưu mã nguồn/),
    ).toBeTruthy();
    expect(server.puts()).toHaveLength(1);
  });

  it('blocks Start on an unreadable registered source and updates with its revision', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () =>
        json(registered({ status: 'unreadable', revision: 3 })),
      [`PUT ${sourceUrl()}`]: () => json(registered({ revision: 4 })),
    });
    render(detail(server));
    expect(
      await screen.findByText(/Không đọc được thư mục đã đăng ký/),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Bắt đầu phân tích' }),
    ).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mã nguồn' }));
    fireEvent.change(screen.getByLabelText('Đường dẫn thư mục (tuyệt đối)'), {
      target: { value: ROOT },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await screen.findByText('Đã lưu mã nguồn.');
    expect(server.puts()[0]?.body).toMatchObject({
      expectedSourceRevision: 3,
      tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
    });
    expect(
      screen.getByRole('button', { name: 'Bắt đầu phân tích' }),
    ).toHaveProperty('disabled', false);
  });

  it('F01-AC03 drops a late source response of the previous project', async () => {
    let releaseA: (() => void) | undefined;
    const server = createServer({
      [`GET ${sourceUrl()}`]: () =>
        new Promise((resolve) => {
          releaseA = () =>
            resolve(json(registered({ displayName: 'project-a' })));
        }),
      [`GET ${sourceUrl(otherProject.id)}`]: () => json({ source: null }),
    });
    const view = render(detail(server));
    await waitFor(() => expect(releaseA).toBeDefined());
    view.rerender(detail(server, otherProject.id));
    expect(
      await screen.findByText(/chưa đăng ký thư mục mã nguồn/),
    ).toBeTruthy();
    await act(async () => {
      releaseA?.();
      await Promise.resolve();
    });
    expect(screen.queryByText('project-a')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Bắt đầu phân tích' }),
    ).toHaveProperty('disabled', true);
  });

  it.each([
    { outcome: 'success', when: 'before PUT' },
    { outcome: 'error', when: 'before PUT' },
    { outcome: 'success', when: 'during PUT' },
    { outcome: 'error', when: 'during PUT' },
  ])(
    'keeps a saved revision when a GET started $when returns a late $outcome',
    async ({ outcome, when }) => {
      let reads = 0;
      let finishRead: (() => void) | undefined;
      let finishSave: (() => void) | undefined;
      const server = createServer({
        [`GET ${sourceUrl()}`]: () => {
          if (reads++ === 0) return json(registered());
          return new Promise((resolve) => {
            finishRead = () =>
              resolve(
                outcome === 'success'
                  ? json(
                      registered({ displayName: 'stale source', revision: 1 }),
                    )
                  : errorBody('SOURCE_UNREADABLE', 422),
              );
          });
        },
        [`PUT ${sourceUrl()}`]: () =>
          new Promise((resolve) => {
            finishSave = () =>
              resolve(
                json(registered({ displayName: 'saved source', revision: 2 })),
              );
          }),
        [`POST /api/v1/projects/${localProject.id}/runs`]: () =>
          errorBody('RUN_ACTIVE_CONFLICT', 409),
      });
      render(detail(server));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Đổi mã nguồn' }),
      );
      fireEvent.change(screen.getByLabelText('Đường dẫn thư mục (tuyệt đối)'), {
        target: { value: ROOT },
      });
      if (when === 'before PUT') {
        fireEvent.click(
          screen.getByRole('button', { name: 'Tải lại mã nguồn' }),
        );
        await waitFor(() => expect(finishRead).toBeDefined());
      }
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await waitFor(() => expect(finishSave).toBeDefined());
      if (when === 'during PUT') {
        fireEvent.click(
          screen.getByRole('button', { name: 'Tải lại mã nguồn' }),
        );
        await waitFor(() => expect(finishRead).toBeDefined());
      }
      await act(async () => {
        finishSave?.();
        await Promise.resolve();
      });
      await screen.findByText('Đã lưu mã nguồn.');
      await act(async () => {
        finishRead?.();
        await Promise.resolve();
      });
      expect(screen.getByText('saved source')).toBeTruthy();
      expect(screen.queryByText('stale source')).toBeNull();
      expect(screen.queryByText(/Thư mục không tồn tại hoặc/)).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: 'Bắt đầu phân tích' }),
      );
      await waitFor(() => expect(server.starts()).toHaveLength(1));
      expect(server.starts()[0]?.body).toMatchObject({
        source: { expectedSourceRevision: 2 },
      });
    },
  );

  it('F01-AC03 keeps the input and the pending save when the locale changes', async () => {
    let finish: (() => void) | undefined;
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`PUT ${sourceUrl()}`]: () =>
        new Promise((resolve) => {
          finish = () => resolve(errorBody('SOURCE_UNREADABLE', 422));
        }),
    });
    function LocaleSwitch() {
      const { setLocale } = useLocale();
      return <button onClick={() => setLocale('ja')}>ja</button>;
    }
    render(
      <>
        <LocaleSwitch />
        {detail(server)}
      </>,
    );
    fireEvent.change(
      await screen.findByLabelText('Đường dẫn thư mục (tuyệt đối)'),
      {
        target: { value: ROOT },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(
      await screen.findByRole('button', { name: 'Đang kiểm tra…' }),
    ).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(
      await screen.findByRole('button', { name: '確認中…' }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByLabelText('フォルダーのパス（絶対パス）'),
    ).toHaveProperty('value', ROOT);
    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
    expect(await screen.findByText(/フォルダーが存在しないか/)).toBeTruthy();
    expect(server.puts()).toHaveLength(1);
  });
});
