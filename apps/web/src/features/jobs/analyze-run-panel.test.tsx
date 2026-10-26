import {
  act,
  fireEvent,
  render as renderWithLibrary,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIXTURE_IDS,
  failedRunFixture,
  queuedRunFixture,
  runningRunFixture,
} from '@portal/contracts/fixtures';
import type { Run } from '@portal/contracts';
import { AnalyzeRunPanel } from './analyze-run-panel';
import { newerRun, RUN_POLL_INTERVAL_MS } from './use-analyze-runs';
import { createRunsApi } from '../../shared/api/runs-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { useLocale } from '../../shared/i18n/locale-context';
import { json, requestUrl, testCredentials } from '../../testing/fixtures';

const projectId = FIXTURE_IDS.project;
const otherProjectId = FIXTURE_IDS.otherProject;
const base = `/api/v1/projects/${projectId}/runs`;

type Call = { method: string; url: string; headers: Headers; body: unknown };
type Handler = (call: Call) => Response | Promise<Response>;

// Routes `METHOD /path` (without query) to handlers and records every call.
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
    if (!handler) return Promise.resolve(json({ error: 'no route' }, 500));
    return Promise.resolve(handler(call));
  });
  return {
    api: createRunsApi(fetcher, testCredentials),
    calls,
    mutations: () => calls.filter((call) => call.method !== 'GET'),
  };
}

const empty = { items: [], nextCursor: null };

function render(ui: ReactElement) {
  return renderWithLibrary(ui, { wrapper: LocaleProvider });
}

function startRoute(run: Run): Handler {
  return () => json(run, 202);
}

afterEach(() => {
  vi.useRealTimers();
  // The locale test stores its choice.
  window.localStorage.clear();
});

describe('Analyze run panel (F02)', () => {
  it('only reads on open, re-render, StrictMode and locale change', async () => {
    const server = createServer({
      [`GET ${base}/current`]: () => json({ run: succeeded }),
      [`GET ${base}`]: () => json({ items: [succeeded], nextCursor: null }),
    });
    function LocaleSwitch() {
      const { setLocale } = useLocale();
      return <button onClick={() => setLocale('ja')}>ja</button>;
    }
    const view = render(
      <StrictMode>
        <LocaleSwitch />
        <AnalyzeRunPanel api={server.api} projectId={projectId} />
      </StrictMode>,
    );
    expect(await screen.findAllByText('Hoàn tất (demo)')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(await screen.findAllByText('完了（デモ）')).not.toHaveLength(0);
    view.rerender(
      <StrictMode>
        <LocaleSwitch />
        <AnalyzeRunPanel api={server.api} projectId={projectId} />
      </StrictMode>,
    );
    expect(server.mutations()).toEqual([]);
  });

  it('F02-AC01: a Start retried after an unknown outcome keeps its idempotency key', async () => {
    let attempt = 0;
    const server = createServer({
      [`GET ${base}/current`]: () => json({ run: null }),
      [`GET ${base}`]: () => json(empty),
      [`GET ${base}/${queuedRunFixture.id}`]: () => json(queuedRunFixture),
      // The backend persists the run, then the first answer is lost.
      [`POST ${base}`]: () => {
        attempt++;
        if (attempt === 1) throw new TypeError('connection reset');
        return json(queuedRunFixture, 202);
      },
    });
    render(<AnalyzeRunPanel api={server.api} projectId={projectId} />);
    const start = await screen.findByRole('button', {
      name: 'Bắt đầu phân tích',
    });
    // A double click sends one request.
    fireEvent.click(start);
    fireEvent.click(start);
    expect(
      await screen.findByText(
        /Chưa xác nhận được backend đã nhận yêu cầu chạy/,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại yêu cầu' }));
    expect(await screen.findAllByText('Đang chờ')).not.toHaveLength(0);
    const posts = server.mutations();
    expect(posts).toHaveLength(2);
    const [first, second] = posts.map((call) =>
      call.headers.get('Idempotency-Key'),
    );
    expect(first).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(second).toBe(first);
    expect(posts[1]?.body).toEqual(posts[0]?.body);
    expect(posts[0]?.body).toEqual({
      kind: 'analyze',
      source: { strategy: 'current-source', expectedSourceRevision: 1 },
      retryOfRunId: null,
    });
    expect(posts[0]?.url).not.toContain('Idempotency');
  });

  it('a definite rejection ends the intent: the next Start uses a new key', async () => {
    let attempt = 0;
    const server = createServer({
      [`GET ${base}/current`]: () => json({ run: null }),
      [`GET ${base}`]: () => json(empty),
      [`POST ${base}`]: () => {
        attempt++;
        return json(
          {
            error: {
              code: attempt === 1 ? 'SOURCE_REVISION_CONFLICT' : 'FUTURE_CODE',
              message: 'private',
              requestId: 'r1',
            },
          },
          409,
        );
      },
    });
    render(<AnalyzeRunPanel api={server.api} projectId={projectId} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Bắt đầu phân tích' }),
    );
    expect(
      await screen.findByText(
        'Mã nguồn của dự án đã thay đổi. Tải lại rồi thử lại.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu phân tích' }));
    await waitFor(() => expect(server.mutations()).toHaveLength(2));
    const keys = server
      .mutations()
      .map((call) => call.headers.get('Idempotency-Key'));
    expect(keys[1]).not.toBe(keys[0]);
    // An unknown code falls back without showing the server text.
    expect(await screen.findByRole('alert')).not.toHaveProperty(
      'textContent',
      expect.stringContaining('private'),
    );
  });

  it('opens the active run when Start conflicts with it', async () => {
    let current: Run | null = null;
    const server = createServer({
      [`GET ${base}/current`]: () => json({ run: current }),
      [`GET ${base}`]: () => json(empty),
      [`GET ${base}/${runningRunFixture.id}`]: () => json(runningRunFixture),
      [`POST ${base}`]: () => {
        current = runningRunFixture;
        return json(
          {
            error: {
              code: 'RUN_ACTIVE_CONFLICT',
              message: 'x',
              requestId: 'r',
            },
          },
          409,
        );
      },
    });
    render(<AnalyzeRunPanel api={server.api} projectId={projectId} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Bắt đầu phân tích' }),
    );
    expect(
      await screen.findByText(/Dự án đang có lượt chạy khác/),
    ).toBeTruthy();
    expect(await screen.findAllByText('Đang chạy')).not.toHaveLength(0);
    expect(screen.getByText('Kiểm kê')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hủy lượt chạy' })).toBeTruthy();
  });

  it('cancels with the expected version and stays pending until the backend is terminal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cancelling: Run = {
      ...runningRunFixture,
      status: 'cancelling',
      stateVersion: 3,
      updatedAt: '2026-10-22T02:00:06.000Z',
    };
    const cancelled: Run = {
      ...runningRunFixture,
      status: 'cancelled',
      stage: null,
      stateVersion: 4,
      finishedAt: '2026-10-22T02:00:07.000Z',
      updatedAt: '2026-10-22T02:00:07.000Z',
    };
    let detail: Run = runningRunFixture;
    const server = createServer({
      [`GET ${base}/current`]: () => json({ run: runningRunFixture }),
      [`GET ${base}`]: () =>
        json({ items: [runningRunFixture], nextCursor: null }),
      [`GET ${base}/${runningRunFixture.id}`]: () => json(detail),
      [`POST ${base}/${runningRunFixture.id}/cancel`]: () => {
        detail = cancelling;
        return json(cancelling, 202);
      },
    });
    render(<AnalyzeRunPanel api={server.api} projectId={projectId} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Hủy lượt chạy' }),
    );
    expect(await screen.findAllByText('Đang hủy…')).not.toHaveLength(0);
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        url: `${base}/${runningRunFixture.id}/cancel`,
        body: { expectedStateVersion: runningRunFixture.stateVersion },
      }),
    ]);
    expect(screen.queryByRole('button', { name: 'Hủy lượt chạy' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Bắt đầu phân tích' }),
    ).toBeNull();
    detail = cancelled;
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS * 2));
    expect(await screen.findAllByText('Đã hủy')).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Bắt đầu phân tích' }),
    ).toBeTruthy();
    expect(server.mutations()).toHaveLength(1);
  });

  it('re-reads a stale run on RUN_STATE_CONFLICT and cancels once more only while it is active', async () => {
    const cancelling: Run = {
      ...runningRunFixture,
      status: 'cancelling',
      stateVersion: 3,
      updatedAt: '2026-10-22T02:00:06.000Z',
    };
    const versions: unknown[] = [];
    const server = createServer({
      // The UI still shows the run queued; it is running already.
      [`GET ${base}/current`]: () =>
        json({ run: { ...queuedRunFixture, id: runningRunFixture.id } }),
      [`GET ${base}`]: () => json(empty),
      [`GET ${base}/${runningRunFixture.id}`]: () => json(runningRunFixture),
      [`POST ${base}/${runningRunFixture.id}/cancel`]: (call) => {
        versions.push(call.body);
        return versions.length === 1
          ? json(
              {
                error: {
                  code: 'RUN_STATE_CONFLICT',
                  message: 'x',
                  requestId: 'r',
                },
              },
              409,
            )
          : json(cancelling, 202);
      },
    });
    render(<AnalyzeRunPanel api={server.api} projectId={projectId} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Hủy lượt chạy' }),
    );
    expect(await screen.findAllByText('Đang hủy…')).not.toHaveLength(0);
    expect(versions).toEqual([
      { expectedStateVersion: 1 },
      { expectedStateVersion: runningRunFixture.stateVersion },
    ]);
  });

  it('a lost connection while polling is not a failed run', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let online = true;
    const server = createServer({
      [`GET ${base}/current`]: () => json({ run: runningRunFixture }),
      [`GET ${base}`]: () =>
        json({ items: [runningRunFixture], nextCursor: null }),
      [`GET ${base}/${runningRunFixture.id}`]: () => {
        if (!online) throw new TypeError('offline');
        return json(runningRunFixture);
      },
    });
    render(<AnalyzeRunPanel api={server.api} projectId={projectId} />);
    expect(await screen.findAllByText('Đang chạy')).not.toHaveLength(0);
    online = false;
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS + 10));
    expect(await screen.findByText(/Mất kết nối với backend/)).toBeTruthy();
    expect(screen.queryByText('Thất bại')).toBeNull();
    expect(screen.getAllByText('Đang chạy')).not.toHaveLength(0);
    online = true;
    // Backoff: the next poll comes after a longer delay, then recovers.
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS * 2 + 10));
    await waitFor(() =>
      expect(screen.queryByText(/Mất kết nối với backend/)).toBeNull(),
    );
    expect(server.mutations()).toEqual([]);
  });

  it('F02-AC03: a slow answer of project A never overwrites project B', async () => {
    let releaseA: (() => void) | undefined;
    const runB: Run = {
      ...failedRunFixture,
      projectId: otherProjectId,
    };
    const routes: Record<string, Handler> = {
      [`GET ${base}/current`]: () =>
        new Promise<Response>((resolve) => {
          releaseA = () => resolve(json({ run: runningRunFixture }));
        }),
      [`GET ${base}`]: () =>
        json({ items: [runningRunFixture], nextCursor: null }),
      [`GET /api/v1/projects/${otherProjectId}/runs/current`]: () =>
        json({ run: runB }),
      [`GET /api/v1/projects/${otherProjectId}/runs`]: () =>
        json({ items: [runB], nextCursor: null }),
    };
    const server = createServer(routes);
    const view = render(
      <AnalyzeRunPanel
        key={projectId}
        api={server.api}
        projectId={projectId}
      />,
    );
    await waitFor(() => expect(releaseA).toBeDefined());
    view.rerender(
      <AnalyzeRunPanel
        key={otherProjectId}
        api={server.api}
        projectId={otherProjectId}
      />,
    );
    expect(await screen.findAllByText('Thất bại')).not.toHaveLength(0);
    await act(async () => {
      releaseA?.();
      await Promise.resolve();
    });
    expect(screen.queryByText('Đang chạy')).toBeNull();
    expect(screen.getAllByText('Thất bại')).not.toHaveLength(0);
    expect(server.mutations()).toEqual([]);
  });

  it('retries a failed run as a new run with a new key and its retryOfRunId', async () => {
    const retried: Run = {
      ...queuedRunFixture,
      id: FIXTURE_IDS.runs.retry,
      retryOfRunId: failedRunFixture.id,
      createdAt: '2026-10-22T03:00:00.000Z',
      updatedAt: '2026-10-22T03:00:00.000Z',
    };
    const server = createServer({
      [`GET ${base}/current`]: () => json({ run: failedRunFixture }),
      [`GET ${base}`]: () =>
        json({ items: [failedRunFixture], nextCursor: null }),
      [`GET ${base}/${retried.id}`]: () => json(retried),
      [`POST ${base}`]: startRoute(retried),
    });
    render(<AnalyzeRunPanel api={server.api} projectId={projectId} />);
    expect(
      await screen.findByText('Mã nguồn đã thay đổi trong lúc chạy.'),
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Chạy lại' }));
    await waitFor(() => expect(server.mutations()).toHaveLength(1));
    expect(server.mutations()[0]?.body).toEqual({
      kind: 'analyze',
      source: { strategy: 'current-source', expectedSourceRevision: 1 },
      retryOfRunId: failedRunFixture.id,
    });
    expect(await screen.findAllByText('Đang chờ')).not.toHaveLength(0);
    // Both runs stay in the history.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

const succeeded: Run = {
  ...runningRunFixture,
  status: 'succeeded',
  stage: null,
  stateVersion: 3,
  finishedAt: '2026-10-22T02:00:09.000Z',
  updatedAt: '2026-10-22T02:00:09.000Z',
};

describe('newerRun', () => {
  it('ignores a stale view of the same run and of an older run', () => {
    expect(newerRun(succeeded, runningRunFixture)).toBe(succeeded);
    expect(newerRun(runningRunFixture, succeeded)).toBe(succeeded);
    const older: Run = {
      ...failedRunFixture,
      createdAt: '2026-10-21T00:00:00.000Z',
    };
    expect(newerRun(runningRunFixture, older)).toBe(runningRunFixture);
    const sameVersionLater: Run = {
      ...runningRunFixture,
      stage: 'publish',
      updatedAt: '2026-10-22T02:00:08.000Z',
    };
    expect(newerRun(runningRunFixture, sameVersionLater)).toBe(
      sameVersionLater,
    );
  });
});
