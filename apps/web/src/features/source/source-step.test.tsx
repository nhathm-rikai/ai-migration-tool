import {
  act,
  fireEvent,
  render as renderWithLibrary,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  localSourceResponseFixture,
  queuedRunFixture,
  runningRunFixture,
} from '@portal/contracts/fixtures';
import type {
  LocalProject,
  ProjectSourceResponse,
  Run,
  RunEvent,
  RunProgress,
} from '@portal/contracts';
import { SourceStep } from './source-step';
import { useProjectSource } from './use-project-source';
import { AUTO_OPEN_DELAY_MS, stepStates } from '../jobs/scan-stage';
import { RUN_POLL_INTERVAL_MS } from '../jobs/use-analyze-runs';
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

const otherProject: LocalProject = {
  ...localProject,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Dự án B',
};
const ROOT = 'D:\\work\\order-module';
const registered = (
  overrides: Partial<NonNullable<ProjectSourceResponse['source']>> = {},
) => ({ source: { ...localSourceResponseFixture.source, ...overrides } });
const runsUrl = `/api/v1/projects/${localProject.id}/runs`;
const run = (overrides: Record<string, unknown>): Run =>
  // Overrides may change the status; the server under test validates runs.
  ({ ...runningRunFixture, projectId: localProject.id, ...overrides });
const succeededRun = () =>
  run({
    status: 'succeeded',
    stage: null,
    stateVersion: 3,
    finishedAt: '2026-10-22T02:00:09.000Z',
    updatedAt: '2026-10-22T02:00:09.000Z',
  });

type Call = { method: string; url: string; headers: Headers; body: unknown };
type Handler = (call: Call) => Response | Promise<Response>;

// Fake backend for the projects, sources and runs APIs; routes
// `METHOD /path` to handlers and records every call.
function createServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input);
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const handler = routes[`${call.method} ${url.split('?')[0]}`];
    if (handler) return Promise.resolve(handler(call));
    if (url.endsWith('/runs/current'))
      return Promise.resolve(json({ run: null }));
    if (url.includes('/runs') && call.method === 'GET')
      return Promise.resolve(json({ items: [], nextCursor: null }));
    return Promise.resolve(json({ error: 'no route' }, 500));
  });
  return {
    calls,
    puts: () => calls.filter((call) => call.method === 'PUT'),
    patches: () => calls.filter((call) => call.method === 'PATCH'),
    starts: () =>
      calls.filter((call) => call.method === 'POST' && call.url === runsUrl),
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

function step(
  server: ReturnType<typeof createServer>,
  options: {
    project?: LocalProject;
    onOpenResults?: (runId: string) => void;
    onProjectChange?: (project: LocalProject) => void;
  } = {},
) {
  const shown = options.project ?? localProject;
  return (
    <SourceStep
      key={shown.id}
      project={shown}
      {...server.props}
      onProjectChange={(next) =>
        options.onProjectChange?.(next as LocalProject)
      }
      onProgress={() => undefined}
      onOpenResults={options.onOpenResults ?? (() => undefined)}
    />
  );
}

const errorBody = (code: string, status: number) =>
  json(
    { error: { code, message: 'raw server text', requestId: 'r-1' } },
    status,
  );

const FOLDER = 'Đường dẫn thư mục source (tuyệt đối)';
const PICKER = '/api/v1/local/folder-picker';
const scanButton = () => screen.getByRole('button', { name: 'Quét source' });
// The folder dialog (stubbed by the fake backend) is the only way to choose.
const pickButton = () => screen.findByRole('button', { name: 'Chọn thư mục' });
const chosen = () => screen.findByText('Đã chọn thư mục');
const vb6Chosen = () =>
  waitFor(() =>
    expect(screen.getByRole('radio', { name: 'VB6' })).toHaveProperty(
      'checked',
      true,
    ),
  );
const selected =
  (path = ROOT) =>
  () =>
    json({ status: 'selected', path });

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('Choosing the source folder (F01 on the UI04 scan card)', () => {
  it('asks for a folder first with the dialog only; nothing can be scanned without one', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
    });
    render(step(server));
    expect(await screen.findByText('Chọn thư mục source')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Quét source' })).toBeNull();
    expect(await pickButton()).toBeTruthy();
    // No path field while a dialog exists.
    expect(screen.queryByLabelText(FOLDER)).toBeNull();
    expect(screen.queryByRole('button', { name: /Nhập đường dẫn/ })).toBeNull();
    expect(server.puts()).toEqual([]);
    expect(screen.queryByText('DEMO')).toBeNull();
  });

  it('offers VB6, COBOL, PHP, C#, Java; only VB6 can be chosen and none is chosen for a new source', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
    });
    render(step(server));
    const vb6 = await screen.findByRole('radio', { name: 'VB6' });
    expect(vb6).toHaveProperty('checked', false);
    const others = screen.getAllByRole('radio').filter((chip) => chip !== vb6);
    expect(others).toHaveLength(4);
    for (const chip of others) expect(chip).toHaveProperty('disabled', true);
    for (const language of ['COBOL', 'PHP', 'C#', 'Java'])
      expect(screen.getByText(language)).toBeTruthy();
    expect(screen.queryByText('PL/SQL')).toBeNull();
    expect(screen.queryByText('JavaScript')).toBeNull();
  });

  it('registers the chosen folder, keeps the path out of URLs and shows it', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`POST ${PICKER}`]: selected(),
      [`PUT ${sourceUrl()}`]: () => json(registered()),
    });
    render(step(server));
    fireEvent.click(await pickButton());
    await chosen();
    expect(server.puts().map((call) => call.body)).toEqual([
      {
        rootPath: ROOT,
        profileId: 'vb6-cp932-v1',
        tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
        expectedSourceRevision: null,
      },
    ]);
    expect(screen.getByText('order-module')).toBeTruthy();
    expect(scanButton()).toHaveProperty('disabled', false);
    for (const call of server.calls) expect(call.url).not.toContain('work');
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('work');
    expect(server.starts()).toEqual([]);
  });

  it.each([
    ['SOURCE_FORBIDDEN', 422, /Không được dùng thư mục này/],
    [
      'SOURCE_UNREADABLE',
      422,
      /không tồn tại hoặc ứng dụng không có quyền đọc/,
    ],
    ['INVALID_INPUT', 400, /đường dẫn phải là đường dẫn tuyệt đối/],
  ])(
    'F01-AC02 shows a safe message for %s and lets another folder be chosen',
    async (code, status, message) => {
      const server = createServer({
        [`GET ${sourceUrl()}`]: () => json({ source: null }),
        [`POST ${PICKER}`]: selected(),
        [`PUT ${sourceUrl()}`]: () => errorBody(code, status),
      });
      render(step(server));
      fireEvent.click(await pickButton());
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByText('raw server text')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Quét source' })).toBeNull();
      expect(await pickButton()).toHaveProperty('disabled', false);
      expect(server.puts()).toHaveLength(1);
    },
  );

  it('F01-AC02 "Đổi thư mục" opens the dialog; a stale save reloads on request before saving again', async () => {
    let reads = 0;
    const server = createServer({
      [`GET ${sourceUrl()}`]: () =>
        json(registered({ revision: reads++ === 0 ? 1 : 2 })),
      [`POST ${PICKER}`]: selected(),
      [`PUT ${sourceUrl()}`]: (call) =>
        (call.body as { expectedSourceRevision: number })
          .expectedSourceRevision === 1
          ? errorBody('SOURCE_REVISION_CONFLICT', 409)
          : json(registered({ revision: 3 })),
    });
    render(step(server));
    await chosen();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi thư mục' }));
    expect(
      await screen.findByText(/vừa được cập nhật ở nơi khác/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại mã nguồn' }));
    await waitFor(() => expect(reads).toBe(2));
    fireEvent.click(await pickButton());
    await chosen();
    expect(server.calls.filter((call) => call.url === PICKER)).toHaveLength(2);
    expect(server.puts().map((call) => call.body)).toMatchObject([
      { expectedSourceRevision: 1 },
      {
        expectedSourceRevision: 2,
        // The registered mapping stays as it was (UI hidden).
        tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
      },
    ]);
  });

  it('F01-AC02 asks to reload before resending when the save outcome is unknown', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`POST ${PICKER}`]: selected(),
      [`PUT ${sourceUrl()}`]: () => Promise.reject(new TypeError('offline')),
    });
    render(step(server));
    fireEvent.click(await pickButton());
    expect(
      await screen.findByText(/Chưa xác nhận được backend đã lưu mã nguồn/),
    ).toBeTruthy();
    expect(server.puts()).toHaveLength(1);
  });

  it('asks for another folder when the registered one is unreadable', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () =>
        json(registered({ status: 'unreadable', revision: 3 })),
      [`POST ${PICKER}`]: selected(),
      [`PUT ${sourceUrl()}`]: () => json(registered({ revision: 4 })),
    });
    render(step(server));
    expect(
      await screen.findByText(/Không đọc được thư mục đã chọn/),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Quét source' })).toBeNull();
    fireEvent.click(await pickButton());
    await chosen();
    expect(server.puts()[0]?.body).toMatchObject({
      expectedSourceRevision: 3,
      tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
    });
    expect(scanButton()).toHaveProperty('disabled', false);
  });

  it('a dialog cancelled from "Đổi thư mục" keeps the chosen folder', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`POST ${PICKER}`]: () => json({ status: 'cancelled' }),
    });
    render(step(server));
    await chosen();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi thư mục' }));
    await waitFor(() =>
      expect(server.calls.some((call) => call.url === PICKER)).toBe(true),
    );
    expect(await chosen()).toBeTruthy();
    expect(server.puts()).toEqual([]);
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
    const view = render(step(server));
    await waitFor(() => expect(releaseA).toBeDefined());
    view.rerender(step(server, { project: otherProject }));
    expect(await screen.findByText('Chọn thư mục source')).toBeTruthy();
    await act(async () => {
      releaseA?.();
      await Promise.resolve();
    });
    expect(screen.queryByText(/project-a/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quét source' })).toBeNull();
  });

  it('F01-AC03 keeps a pending save when the locale changes', async () => {
    let finish: (() => void) | undefined;
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`POST ${PICKER}`]: selected(),
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
        {step(server)}
      </>,
    );
    fireEvent.click(await pickButton());
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.getByRole('button', { name: 'Chọn thư mục' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(
      await screen.findByRole('button', { name: 'フォルダーを選択' }),
    ).toHaveProperty('disabled', true);
    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
    expect(await screen.findByText(/フォルダーが存在しないか/)).toBeTruthy();
    expect(server.puts()).toHaveLength(1);
  });
});

describe('Native folder dialog on the scan card (UI05)', () => {
  it('registers the folder chosen in the dialog', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`POST ${PICKER}`]: () => json({ status: 'selected', path: ROOT }),
      [`PUT ${sourceUrl()}`]: () => json(registered()),
    });
    render(step(server));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Chọn thư mục' }),
    );
    await chosen();
    expect(server.puts().map((call) => call.body)).toMatchObject([
      { rootPath: ROOT, expectedSourceRevision: null },
    ]);
    expect(
      server.calls
        .filter((call) => call.url === PICKER)
        .map((call) => call.body),
    ).toEqual([undefined]);
    expect(screen.getByText('order-module')).toBeTruthy();
  });

  it('a cancelled dialog changes nothing', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`POST ${PICKER}`]: () => json({ status: 'cancelled' }),
    });
    render(step(server));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Chọn thư mục' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Chọn thư mục' }),
      ).toHaveProperty('disabled', false),
    );
    expect(screen.getByText('Chọn thư mục source')).toBeTruthy();
    expect(server.puts()).toEqual([]);
  });

  it.each([
    ['no-tool', /không có hộp thoại chọn thư mục/],
    ['failed', /Không mở được hộp thoại/],
    ['timeout', /quá lâu không chọn/],
  ])(
    'an unavailable dialog (%s) leaves the path field only',
    async (reason, message) => {
      const server = createServer({
        [`GET ${sourceUrl()}`]: () => json({ source: null }),
        [`POST ${PICKER}`]: () => json({ status: 'unavailable', reason }),
      });
      render(step(server));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Chọn thư mục' }),
      );
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Chọn thư mục' })).toBeNull();
      expect(screen.getByLabelText(FOLDER)).toBeTruthy();
      expect(server.puts()).toEqual([]);
    },
  );

  it('a chosen folder the backend refuses shows why; no path field appears', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`POST ${PICKER}`]: () => json({ status: 'selected', path: ROOT }),
      [`PUT ${sourceUrl()}`]: () => errorBody('SOURCE_FORBIDDEN', 422),
    });
    render(step(server));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Chọn thư mục' }),
    );
    expect(await screen.findByText(/Không được dùng thư mục này/)).toBeTruthy();
    expect(screen.queryByLabelText(FOLDER)).toBeNull();
  });

  it('says when another dialog is already open', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`POST ${PICKER}`]: () => errorBody('FOLDER_PICKER_BUSY', 409),
    });
    render(step(server));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Chọn thư mục' }),
    );
    expect(
      await screen.findByText(/Hộp thoại chọn thư mục đang mở/),
    ).toBeTruthy();
    expect(screen.queryByText('raw server text')).toBeNull();
  });
});

// The hook behind the folder form: a saved revision is never overwritten by
// a GET that started before the save completed.
describe('useProjectSource', () => {
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
      });
      const { result } = renderHook(() =>
        useProjectSource(server.props.sourcesApi, localProject.id),
      );
      await waitFor(() => expect(result.current.state.status).toBe('ready'));
      if (when === 'before PUT') {
        act(() => result.current.refresh());
        await waitFor(() => expect(finishRead).toBeDefined());
      }
      let saving: Promise<unknown> | undefined;
      act(() => {
        saving = result.current.put({
          rootPath: ROOT,
          profileId: 'vb6-cp932-v1',
          tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
          expectedSourceRevision: 1,
        });
      });
      await waitFor(() => expect(finishSave).toBeDefined());
      if (when === 'during PUT') {
        act(() => result.current.refresh());
        await waitFor(() => expect(finishRead).toBeDefined());
      }
      await act(async () => {
        finishSave?.();
        await saving;
      });
      await act(async () => {
        finishRead?.();
        await Promise.resolve();
      });
      expect(result.current.state).toMatchObject({
        status: 'ready',
        source: { displayName: 'saved source', revision: 2 },
      });
    },
  );
});

describe('Scan card (UI04)', () => {
  it('needs a project name and a language before scanning', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`POST ${PICKER}`]: selected(),
      [`PUT ${sourceUrl()}`]: () => json(registered()),
      [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    });
    render(step(server));
    fireEvent.click(await pickButton());
    await chosen();
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: '  ' },
    });
    fireEvent.click(scanButton());
    expect(await screen.findByText(/Nhập tên dự án từ 1 đến 120/)).toBeTruthy();
    expect(
      screen.getByText('Chọn ngôn ngữ phân tích trước khi quét.'),
    ).toBeTruthy();
    expect(server.starts()).toEqual([]);
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: localProject.name },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'VB6' }));
    fireEvent.click(scanButton());
    await waitFor(() => expect(server.starts()).toHaveLength(1));
    expect(server.starts()[0]?.body).toMatchObject({
      source: { strategy: 'current-source', expectedSourceRevision: 1 },
    });
    expect(server.patches()).toEqual([]);
  });

  it('a source registered before the page opened has its language chosen', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
    });
    render(step(server));
    await chosen();
    await vb6Chosen();
  });

  it('saves a changed name before the scan and reports the saved project', async () => {
    const saved = { ...localProject, name: 'Payroll' };
    const changed = vi.fn();
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`PATCH /api/v1/projects/${localProject.id}`]: () => json(saved),
      [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    });
    render(step(server, { onProjectChange: changed }));
    await chosen();
    await vb6Chosen();
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: ' Payroll ' },
    });
    fireEvent.click(scanButton());
    await waitFor(() => expect(server.starts()).toHaveLength(1));
    expect(server.patches().map((call) => call.body)).toEqual([
      { name: 'Payroll' },
    ]);
    expect(server.calls.indexOf(server.patches()[0]!)).toBeLessThan(
      server.calls.indexOf(server.starts()[0]!),
    );
    expect(changed).toHaveBeenCalledWith(saved);
  });

  it('a refused name save starts nothing', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`PATCH /api/v1/projects/${localProject.id}`]: () =>
        errorBody('INVALID_INPUT', 400),
    });
    render(step(server));
    await chosen();
    await vb6Chosen();
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: 'Payroll' },
    });
    fireEvent.click(scanButton());
    expect(
      await screen.findByText(/Thông tin dự án không hợp lệ/),
    ).toBeTruthy();
    expect(server.starts()).toEqual([]);
  });

  it('UI04-AC01 a double click starts one run', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    });
    render(step(server));
    await chosen();
    await vb6Chosen();
    const scan = scanButton();
    fireEvent.click(scan);
    fireEvent.click(scan);
    await screen.findByText('Đang chờ bắt đầu…');
    expect(server.starts()).toHaveLength(1);
  });

  it('UI04-AC01 resends a Start lost after the backend wrote it with the same key', async () => {
    let attempt = 0;
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`POST ${runsUrl}`]: () => {
        attempt++;
        if (attempt === 1) throw new TypeError('connection reset');
        return json(queuedRunFixture, 202);
      },
    });
    render(step(server));
    await chosen();
    await vb6Chosen();
    fireEvent.click(scanButton());
    expect(
      await screen.findByText(/Chưa xác nhận được backend đã nhận yêu cầu/),
    ).toBeTruthy();
    // The main button resends the same intent too.
    fireEvent.click(scanButton());
    await screen.findByText('Đang chờ bắt đầu…');
    const keys = server
      .starts()
      .map((call) => call.headers.get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('UI04-AC03 shows the real stage without a percentage or file count', async () => {
    const running = run({ stage: 'snapshot' });
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: running }),
      [`GET ${runsUrl}/${running.id}`]: () => json(running),
    });
    render(step(server));
    expect(await screen.findByText('Đang quét thư mục…')).toBeTruthy();
    expect(screen.getByText('Bước hiện tại: Chụp nguồn')).toBeTruthy();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /\d+\s*%|\d+\s*\/\s*\d+ file/,
    );
    expect(screen.getByText('Tiến trình')).toBeTruthy();
    expect(screen.getByText('order-module')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Quét source' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hủy lượt chạy' })).toBeTruthy();
  });

  it('maps the four progress steps on the run stage', () => {
    expect(stepStates(null)).toEqual(['todo', 'todo', 'todo', 'todo']);
    expect(stepStates('snapshot')).toEqual([
      'active',
      'active',
      'todo',
      'todo',
    ]);
    expect(stepStates('inventory')).toEqual(['done', 'done', 'active', 'todo']);
    expect(stepStates('publish')).toEqual(['done', 'done', 'done', 'active']);
  });

  it('opens the analysis step after a run seen running succeeds, or at once on request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = run({ stage: 'publish' });
    let detail: Run = running;
    const opened = vi.fn();
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: running }),
      [`GET ${runsUrl}/${running.id}`]: () => json(detail),
    });
    render(step(server, { onOpenResults: opened }));
    await screen.findByText('Đang quét thư mục…');
    detail = succeededRun();
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS + 10));
    expect(
      await screen.findByText('Quét xong · đang chuyển sang Phân tích…'),
    ).toBeTruthy();
    expect(opened).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xem kết quả ngay' }));
    expect(opened).toHaveBeenCalledWith(running.id);
  });

  it('opens the results by itself after the pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = run({ stage: 'inventory' });
    let detail: Run = running;
    const opened = vi.fn();
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: running }),
      [`GET ${runsUrl}/${running.id}`]: () => json(detail),
    });
    render(step(server, { onOpenResults: opened }));
    await screen.findByText('Đang quét thư mục…');
    detail = succeededRun();
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS + 10));
    await screen.findByText('Quét xong · đang chuyển sang Phân tích…');
    await act(() => vi.advanceTimersByTimeAsync(AUTO_OPEN_DELAY_MS - 100));
    expect(opened).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(opened).toHaveBeenCalledWith(running.id);
  });

  it('a run that had already succeeded before the page opened never opens by itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opened = vi.fn();
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: succeededRun() }),
    });
    render(step(server, { onOpenResults: opened }));
    expect(
      await screen.findByRole('button', {
        name: 'Xem kết quả lần quét gần nhất',
      }),
    ).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_OPEN_DELAY_MS * 2));
    expect(opened).not.toHaveBeenCalled();
    expect(server.starts()).toEqual([]);
    expect(scanButton()).toHaveProperty('disabled', false);
  });

  it.each([
    [
      'failed',
      'Quét source thất bại',
      'SOURCE_CHANGED',
      /đã thay đổi trong lúc chạy/,
    ],
    ['cancelled', 'Đã hủy lượt quét', null, /dừng theo yêu cầu/],
    ['interrupted', 'Lượt quét bị gián đoạn', null, /Backend đã dừng/],
  ] as const)(
    'UI04-AC02 a %s run stays on the step with its reason and a re-run',
    async (status, title, errorCode, reason) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const running = run({ stage: 'inventory' });
      let detail: Run = running;
      const opened = vi.fn();
      const server = createServer({
        [`GET ${sourceUrl()}`]: () => json(registered()),
        [`GET ${runsUrl}/current`]: () => json({ run: running }),
        [`GET ${runsUrl}/${running.id}`]: () => json(detail),
        [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
      });
      render(step(server, { onOpenResults: opened }));
      await screen.findByText('Đang quét thư mục…');
      detail = run({
        status,
        stage: null,
        stateVersion: 3,
        errorCode,
        finishedAt: '2026-10-22T02:00:09.000Z',
        updatedAt: '2026-10-22T02:00:09.000Z',
      });
      await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS + 10));
      expect(await screen.findByText(title)).toBeTruthy();
      expect(screen.getByText(reason)).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(AUTO_OPEN_DELAY_MS * 2));
      expect(opened).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Chạy lại' }));
      await waitFor(() => expect(server.starts()).toHaveLength(1));
      expect(server.starts()[0]?.body).toMatchObject({
        retryOfRunId: running.id,
        source: { expectedSourceRevision: 1 },
      });
    },
  );
});

// An SSE response the test writes to (F05).
function eventStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
  return {
    response,
    push(event: RunEvent) {
      controller?.enqueue(
        encoder.encode(
          `event: run\nid: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`,
        ),
      );
    },
    close() {
      controller?.close();
    },
  };
}

const progressOf = (patch: Partial<RunProgress>): RunProgress => ({
  phase: 'snapshot',
  filesSnapshotted: 3,
  filesAnalyzed: 0,
  filesTotal: 10,
  bytesDone: 3 * 1024 * 1024,
  bytesTotal: 10 * 1024 * 1024,
  recentPaths: ['programs/A/MAIN.BAS', 'programs/A/FORM1.FRM'],
  ...patch,
});

describe('Scan progress per file (PF08)', () => {
  it('F05-AC04 shows the real share, files, size and the latest files read', async () => {
    const running = run({ stage: 'snapshot', progress: progressOf({}) });
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: running }),
      [`GET ${runsUrl}/${running.id}`]: () => json(running),
    });
    render(step(server));
    expect(await screen.findByText('15%')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '15',
    );
    expect(screen.getByText('3 / 10 file')).toBeTruthy();
    expect(screen.getByText('3.0 MB')).toBeTruthy();
    expect(screen.getByText('File đang đọc')).toBeTruthy();
    // Lines of a report come in one after the other.
    expect(await screen.findByText('programs/A/FORM1.FRM')).toBeTruthy();
  });

  it('F05-AC04 shows no number while the folder is still being listed', async () => {
    const running = run({
      stage: 'snapshot',
      progress: progressOf({
        phase: 'listing',
        filesSnapshotted: 0,
        filesTotal: null,
        bytesTotal: null,
        recentPaths: [],
      }),
    });
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: running }),
      [`GET ${runsUrl}/${running.id}`]: () => json(running),
    });
    render(step(server));
    await screen.findByText('Đang quét thư mục…');
    expect(
      screen.getByRole('progressbar').getAttribute('aria-valuenow'),
    ).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+\s*%|\/ \d+ file/);
  });

  it('F05-AC01 follows events of the shown run, drops stale or foreign ones, never goes back, reads a new version with GET', async () => {
    const running = run({ stage: 'snapshot' });
    const stream = eventStream();
    let detail: Run = running;
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: running }),
      [`GET ${runsUrl}/${running.id}`]: () => json(detail),
      [`GET ${runsUrl}/${running.id}/events`]: () => stream.response,
    });
    const opened = vi.fn();
    render(step(server, { onOpenResults: opened }));
    await screen.findByText('Đang quét thư mục…');
    const base = {
      runId: running.id,
      stateVersion: running.stateVersion,
      status: 'running',
      stage: 'snapshot',
      occurredAt: '2026-10-22T02:00:05.000Z',
    } as const;
    await act(async () => {
      stream.push({ ...base, sequence: 1, progress: progressOf({}) });
      await Promise.resolve();
    });
    expect(await screen.findByText('15%')).toBeTruthy();
    await act(async () => {
      // A lower share, a stale version and another run: nothing changes.
      stream.push({
        ...base,
        sequence: 2,
        progress: progressOf({ filesSnapshotted: 1 }),
      });
      stream.push({
        ...base,
        sequence: 3,
        stateVersion: running.stateVersion - 1,
        progress: progressOf({ filesSnapshotted: 9 }),
      });
      stream.push({
        ...base,
        sequence: 4,
        runId: '00000000-0000-4000-8000-00000000ffff',
        progress: progressOf({ filesSnapshotted: 8 }),
      });
      await Promise.resolve();
    });
    expect(screen.getByText('15%')).toBeTruthy();
    // A newer version is read back with GET.
    detail = succeededRun();
    await act(async () => {
      stream.push({
        ...base,
        sequence: 5,
        stateVersion: 3,
        status: 'succeeded',
        stage: null,
      });
      stream.close();
      await Promise.resolve();
    });
    expect(
      await screen.findByText('Quét xong · đang chuyển sang Phân tích…'),
    ).toBeTruthy();
    expect(server.calls.some((call) => call.method !== 'GET')).toBe(false);
  });
});
