import {
  act,
  fireEvent,
  render as renderWithLibrary,
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
} from '@portal/contracts';
import { SourceStep } from './source-step';
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

const FOLDER = 'Thư mục source (đường dẫn tuyệt đối)';
const startButton = () =>
  screen.getByRole('button', { name: 'Bắt đầu phân tích' });
const saveButton = () => screen.getByRole('button', { name: 'Lưu thông tin' });
const openMapping = () => fireEvent.click(screen.getByText(/Ánh xạ tên bảng/));

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('Source step form (F01 on the UI04 layout)', () => {
  it('blocks Start without a source until a path is entered', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
    });
    render(step(server));
    expect(await screen.findByText('Chưa có thư mục source')).toBeTruthy();
    expect(startButton()).toHaveProperty('disabled', true);
    expect(screen.getByText(/Cần đăng ký một thư mục mã nguồn/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(FOLDER), {
      target: { value: ROOT },
    });
    expect(startButton()).toHaveProperty('disabled', false);
    expect(screen.queryByText('DEMO')).toBeNull();
  });

  it('offers VB6 only; other languages are listed as coming', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
    });
    render(step(server));
    expect(await screen.findByRole('radio', { name: 'VB6' })).toHaveProperty(
      'checked',
      true,
    );
    const others = screen
      .getAllByRole('radio')
      .filter((chip) => !(chip as HTMLInputElement).checked);
    expect(others).toHaveLength(6);
    for (const chip of others) expect(chip).toHaveProperty('disabled', true);
    for (const language of ['Java', 'C#', 'PHP', 'PL/SQL', 'COBOL'])
      expect(screen.getByText(language)).toBeTruthy();
    expect(screen.getAllByText('Sắp hỗ trợ')).toHaveLength(6);
  });

  it('F01-AC01 shows field errors and sends nothing for a missing path or schema', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
    });
    render(step(server));
    await screen.findByText('Chưa có thư mục source');
    openMapping();
    fireEvent.change(screen.getByLabelText('Schema mặc định của tên bảng'), {
      target: { value: 'assumed' },
    });
    fireEvent.change(screen.getByLabelText('Tên schema'), {
      target: { value: 'APP' },
    });
    fireEvent.click(saveButton());
    expect(
      await screen.findByText(/Nhập lại đường dẫn thư mục để lưu/),
    ).toBeTruthy();
    expect(screen.getByLabelText(FOLDER).getAttribute('aria-invalid')).toBe(
      'true',
    );
    fireEvent.change(screen.getByLabelText(FOLDER), {
      target: { value: ROOT },
    });
    fireEvent.change(screen.getByLabelText('Tên schema'), {
      target: { value: 'APP; DROP' },
    });
    fireEvent.click(saveButton());
    expect(await screen.findByText(/Nhập tên schema bắt đầu/)).toBeTruthy();
    expect(server.puts()).toEqual([]);
    expect(server.patches()).toEqual([]);
  });

  it('saves a source, then starts on its revision without the path in any URL', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`PUT ${sourceUrl()}`]: () => json(registered()),
      [`POST ${runsUrl}`]: () => errorBody('RUN_ACTIVE_CONFLICT', 409),
    });
    render(step(server));
    fireEvent.change(await screen.findByLabelText(FOLDER), {
      target: { value: `  ${ROOT}  ` },
    });
    openMapping();
    fireEvent.change(screen.getByLabelText('Schema mặc định của tên bảng'), {
      target: { value: 'assumed' },
    });
    fireEvent.change(screen.getByLabelText('Tên schema'), {
      target: { value: 'APP' },
    });
    fireEvent.click(saveButton());
    expect(await screen.findByText('Đã lưu mã nguồn.')).toBeTruthy();
    expect(server.puts().map((call) => call.body)).toEqual([
      {
        rootPath: ROOT,
        profileId: 'vb6-cp932-v1',
        tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
        expectedSourceRevision: null,
      },
    ]);
    expect(screen.getByLabelText(FOLDER)).toHaveProperty('value', '');
    expect(screen.getAllByText('order-module')).not.toHaveLength(0);
    expect(
      screen.getByLabelText('Schema mặc định của tên bảng'),
    ).toHaveProperty('value', 'assumed');
    expect(startButton()).toHaveProperty('disabled', false);
    fireEvent.click(startButton());
    await waitFor(() => expect(server.starts()).toHaveLength(1));
    expect(server.puts()).toHaveLength(1);
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
    'F01-AC02 keeps the input, shows a safe message and starts nothing for %s',
    async (code, status, message) => {
      const server = createServer({
        [`GET ${sourceUrl()}`]: () => json({ source: null }),
        [`PUT ${sourceUrl()}`]: () => errorBody(code, status),
      });
      render(step(server));
      const field = await screen.findByLabelText(FOLDER);
      fireEvent.change(field, { target: { value: ROOT } });
      // Start saves first; a refused save starts nothing.
      fireEvent.click(startButton());
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByText('raw server text')).toBeNull();
      expect(field).toHaveProperty('value', ROOT);
      // A backend refusal is not a field error.
      expect(field.getAttribute('aria-invalid')).toBe('false');
      expect(server.puts()).toHaveLength(1);
      expect(server.starts()).toEqual([]);
    },
  );

  it('F01-AC02 asks to reload before resending when the save outcome is unknown', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`PUT ${sourceUrl()}`]: () => Promise.reject(new TypeError('offline')),
    });
    render(step(server));
    fireEvent.change(await screen.findByLabelText(FOLDER), {
      target: { value: ROOT },
    });
    fireEvent.click(saveButton());
    expect(
      await screen.findByText(/Chưa xác nhận được backend đã lưu mã nguồn/),
    ).toBeTruthy();
    expect(server.puts()).toHaveLength(1);
  });

  it('blocks Start on an unreadable source and saves a new path on its revision', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () =>
        json(registered({ status: 'unreadable', revision: 3 })),
      [`PUT ${sourceUrl()}`]: () => json(registered({ revision: 4 })),
    });
    render(step(server));
    expect(
      await screen.findByText(/Không đọc được thư mục đã đăng ký. Nhập lại/),
    ).toBeTruthy();
    expect(startButton()).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText(FOLDER), {
      target: { value: ROOT },
    });
    fireEvent.click(saveButton());
    await screen.findByText('Đã lưu mã nguồn.');
    // The registered mapping is sent again as it was.
    expect(server.puts()[0]?.body).toMatchObject({
      expectedSourceRevision: 3,
      tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
    });
    expect(startButton()).toHaveProperty('disabled', false);
    expect(server.starts()).toEqual([]);
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
    expect(await screen.findByText('Chưa có thư mục source')).toBeTruthy();
    await act(async () => {
      releaseA?.();
      await Promise.resolve();
    });
    expect(screen.queryByText(/project-a/)).toBeNull();
    expect(startButton()).toHaveProperty('disabled', true);
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
        [`POST ${runsUrl}`]: () => errorBody('RUN_ACTIVE_CONFLICT', 409),
      });
      render(step(server));
      await screen.findByText(/Thư mục order-module đọc được/);
      fireEvent.change(screen.getByLabelText(FOLDER), {
        target: { value: ROOT },
      });
      const reload = () =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Tải lại mã nguồn' }),
        );
      if (when === 'before PUT') {
        reload();
        await waitFor(() => expect(finishRead).toBeDefined());
      }
      fireEvent.click(saveButton());
      await waitFor(() => expect(finishSave).toBeDefined());
      if (when === 'during PUT') {
        reload();
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
      expect(screen.getAllByText('saved source')).not.toHaveLength(0);
      expect(screen.queryByText('stale source')).toBeNull();
      expect(screen.queryByText(/Thư mục không tồn tại hoặc/)).toBeNull();
      fireEvent.click(startButton());
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
        {step(server)}
      </>,
    );
    fireEvent.change(await screen.findByLabelText(FOLDER), {
      target: { value: ROOT },
    });
    fireEvent.click(saveButton());
    expect(
      await screen.findByRole('button', { name: 'Đang lưu…' }),
    ).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(
      await screen.findByRole('button', { name: '保存中…' }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByLabelText('ソースフォルダー（絶対パス）'),
    ).toHaveProperty('value', ROOT);
    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
    expect(await screen.findByText(/フォルダーが存在しないか/)).toBeTruthy();
    expect(server.puts()).toHaveLength(1);
  });
});

describe('Project information (UI04 customer)', () => {
  it('saves name and customer before Start and reports the saved project', async () => {
    const saved = { ...localProject, name: 'Payroll', customerName: 'Corp' };
    const changed = vi.fn();
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`PATCH /api/v1/projects/${localProject.id}`]: () => json(saved),
      [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    });
    render(step(server, { onProjectChange: changed }));
    await screen.findByText(/Thư mục order-module đọc được/);
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: ' Payroll ' },
    });
    fireEvent.change(screen.getByLabelText('Khách hàng'), {
      target: { value: ' Corp ' },
    });
    fireEvent.click(startButton());
    await waitFor(() => expect(server.starts()).toHaveLength(1));
    expect(server.patches().map((call) => call.body)).toEqual([
      { name: 'Payroll', customerName: 'Corp' },
    ]);
    expect(server.calls.indexOf(server.patches()[0]!)).toBeLessThan(
      server.calls.indexOf(server.starts()[0]!),
    );
    expect(changed).toHaveBeenCalledWith(saved);
    expect(server.puts()).toEqual([]);
  });

  it('clears the customer with null and sends nothing when nothing changed', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`PATCH /api/v1/projects/${localProject.id}`]: () =>
        json({ ...localProject }),
    });
    const project = { ...localProject, customerName: 'Corp' };
    render(step(server, { project }));
    await screen.findByText(/Thư mục order-module đọc được/);
    expect(screen.getByLabelText('Khách hàng')).toHaveProperty('value', 'Corp');
    fireEvent.change(screen.getByLabelText('Khách hàng'), {
      target: { value: '   ' },
    });
    fireEvent.click(saveButton());
    expect(await screen.findByText('Đã lưu thông tin dự án.')).toBeTruthy();
    expect(server.patches().map((call) => call.body)).toEqual([
      { name: localProject.name, customerName: null },
    ]);
  });

  it('rejects a too long customer before any request and keeps it', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
    });
    render(step(server));
    await screen.findByText(/Thư mục order-module đọc được/);
    const long = 'x'.repeat(121);
    fireEvent.change(screen.getByLabelText('Khách hàng'), {
      target: { value: long },
    });
    fireEvent.click(startButton());
    expect(await screen.findByText(/Tên khách hàng tối đa 120/)).toBeTruthy();
    expect(screen.getByLabelText('Khách hàng')).toHaveProperty('value', long);
    expect(server.patches()).toEqual([]);
    expect(server.starts()).toEqual([]);
  });

  it('a refused project save starts nothing', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`PATCH /api/v1/projects/${localProject.id}`]: () =>
        errorBody('INVALID_INPUT', 400),
    });
    render(step(server));
    await screen.findByText(/Thư mục order-module đọc được/);
    fireEvent.change(screen.getByLabelText('Khách hàng'), {
      target: { value: 'Corp' },
    });
    fireEvent.click(startButton());
    expect(
      await screen.findByText(/Thông tin dự án không hợp lệ/),
    ).toBeTruthy();
    expect(server.starts()).toEqual([]);
  });
});

describe('Scan card (UI04)', () => {
  it('UI04-AC01 a double click saves once and starts one run', async () => {
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`PUT ${sourceUrl()}`]: () => json(registered()),
      [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    });
    render(step(server));
    fireEvent.change(await screen.findByLabelText(FOLDER), {
      target: { value: ROOT },
    });
    const start = startButton();
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(server.starts()).toHaveLength(1));
    await screen.findByText('Đang chờ bắt đầu…');
    expect(server.puts()).toHaveLength(1);
    expect(server.starts()).toHaveLength(1);
  });

  it('UI04-AC01 resends a Start lost after the backend wrote it with the same key and saves nothing again', async () => {
    let attempt = 0;
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json({ source: null }),
      [`PUT ${sourceUrl()}`]: () => json(registered()),
      [`POST ${runsUrl}`]: () => {
        attempt++;
        if (attempt === 1) throw new TypeError('connection reset');
        return json(queuedRunFixture, 202);
      },
    });
    render(step(server));
    fireEvent.change(await screen.findByLabelText(FOLDER), {
      target: { value: ROOT },
    });
    fireEvent.click(startButton());
    expect(
      await screen.findByText(/Chưa xác nhận được backend đã nhận yêu cầu/),
    ).toBeTruthy();
    // The main button resends the same intent too.
    fireEvent.click(startButton());
    await screen.findByText('Đang chờ bắt đầu…');
    const keys = server
      .starts()
      .map((call) => call.headers.get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(server.puts()).toHaveLength(1);
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
    expect(
      screen.queryByRole('button', { name: 'Bắt đầu phân tích' }),
    ).toBeNull();
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
    const succeeded = run({
      status: 'succeeded',
      stage: null,
      stateVersion: 3,
      finishedAt: '2026-10-22T02:00:09.000Z',
      updatedAt: '2026-10-22T02:00:09.000Z',
    });
    let detail: Run = running;
    const opened = vi.fn();
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: running }),
      [`GET ${runsUrl}/${running.id}`]: () => json(detail),
    });
    render(step(server, { onOpenResults: opened }));
    await screen.findByText('Đang quét thư mục…');
    detail = succeeded;
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS + 10));
    expect(
      await screen.findByText('Quét xong · đang chuyển sang Phân tích…'),
    ).toBeTruthy();
    expect(opened).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xem kết quả ngay' }));
    expect(opened).toHaveBeenCalledWith(running.id);
    await act(() => vi.advanceTimersByTimeAsync(AUTO_OPEN_DELAY_MS + 10));
    expect(opened).toHaveBeenLastCalledWith(running.id);
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
    const succeeded = succeededRun();
    const opened = vi.fn();
    const server = createServer({
      [`GET ${sourceUrl()}`]: () => json(registered()),
      [`GET ${runsUrl}/current`]: () => json({ run: succeeded }),
      [`GET ${runsUrl}`]: () => json({ items: [succeeded], nextCursor: null }),
    });
    render(step(server, { onOpenResults: opened }));
    expect(
      await screen.findByRole('button', {
        name: 'Xem kết quả lần phân tích gần nhất',
      }),
    ).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_OPEN_DELAY_MS * 2));
    expect(opened).not.toHaveBeenCalled();
    expect(server.starts()).toEqual([]);
    expect(startButton()).toHaveProperty('disabled', false);
  });

  it.each([
    [
      'failed',
      'Phân tích thất bại',
      'SOURCE_CHANGED',
      /đã thay đổi trong lúc chạy/,
    ],
    ['cancelled', 'Đã hủy lượt chạy', null, /dừng theo yêu cầu/],
    ['interrupted', 'Lượt chạy bị gián đoạn', null, /Backend đã dừng/],
  ] as const)(
    'UI04-AC02 a %s run stays on the step with its reason and a re-run',
    async (status, title, errorCode, reason) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const running = run({ stage: 'inventory' });
      const ended = run({
        status,
        stage: null,
        stateVersion: 3,
        errorCode,
        finishedAt: '2026-10-22T02:00:09.000Z',
        updatedAt: '2026-10-22T02:00:09.000Z',
      });
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
      detail = ended;
      await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS + 10));
      expect(await screen.findByText(title)).toBeTruthy();
      expect(screen.getAllByText(reason)).not.toHaveLength(0);
      await act(() => vi.advanceTimersByTimeAsync(AUTO_OPEN_DELAY_MS * 2));
      expect(opened).not.toHaveBeenCalled();
      fireEvent.click(screen.getAllByRole('button', { name: 'Chạy lại' })[0]!);
      await waitFor(() => expect(server.starts()).toHaveLength(1));
      expect(server.starts()[0]?.body).toMatchObject({
        retryOfRunId: running.id,
        source: { expectedSourceRevision: 1 },
      });
    },
  );
});
