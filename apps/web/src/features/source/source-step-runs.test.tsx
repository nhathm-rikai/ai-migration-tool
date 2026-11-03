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
import { SourceStep } from './source-step';
import { newerRun, RUN_POLL_INTERVAL_MS } from '../jobs/use-analyze-runs';
import { createProjectsApi } from '../../shared/api/projects-api';
import { createRunsApi } from '../../shared/api/runs-api';
import { createSourcesApi } from '../../shared/api/sources-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { useLocale } from '../../shared/i18n/locale-context';
import {
  json,
  project,
  requestUrl,
  testCredentials,
} from '../../testing/fixtures';

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
    projectsApi: createProjectsApi(fetcher, testCredentials),
    sourcesApi: createSourcesApi(fetcher, testCredentials),
    calls,
    mutations: () => calls.filter((call) => call.method !== 'GET'),
  };
}

const empty = { items: [], nextCursor: null };

function render(ui: ReactElement) {
  return renderWithLibrary(ui, { wrapper: LocaleProvider });
}

// Step 1 of a demo project: runs lock the bundled fixture (revision 1).
function step(server: ReturnType<typeof createServer>, id: string = projectId) {
  return (
    <SourceStep
      key={id}
      project={{ ...project, id }}
      api={server.projectsApi}
      runsApi={server.api}
      sourcesApi={server.sourcesApi}
      onProjectChange={() => undefined}
      onProgress={() => undefined}
      onOpenResults={() => undefined}
    />
  );
}

function startRoute(run: Run): Handler {
  return () => json(run, 202);
}

afterEach(() => {
  vi.useRealTimers();
  // The locale test stores its choice.
  window.localStorage.clear();
});

describe('Runs of the source step (F02)', () => {
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
        {step(server)}
      </StrictMode>,
    );
    expect(
      await screen.findByRole('button', {
        name: 'Xem kết quả lần quét gần nhất',
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(
      await screen.findByRole('button', { name: '前回のスキャン結果を見る' }),
    ).toBeTruthy();
    view.rerender(
      <StrictMode>
        <LocaleSwitch />
        {step(server)}
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
    render(step(server));
    const start = await screen.findByRole('button', {
      name: 'Quét source',
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
    expect(await screen.findByText('Đang chờ bắt đầu…')).toBeTruthy();
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
    render(step(server));
    fireEvent.click(await screen.findByRole('button', { name: 'Quét source' }));
    expect(
      await screen.findByText(
        'Mã nguồn của dự án đã thay đổi. Tải lại rồi thử lại.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quét source' }));
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
    render(step(server));
    fireEvent.click(await screen.findByRole('button', { name: 'Quét source' }));
    expect(
      await screen.findByText(/Dự án đang có lượt chạy khác/),
    ).toBeTruthy();
    expect(await screen.findByText('Đang quét thư mục…')).toBeTruthy();
    expect(screen.getAllByText('Kiểm kê')).not.toHaveLength(0);
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
    render(step(server));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Hủy lượt chạy' }),
    );
    expect(await screen.findByText('Đang hủy lượt quét…')).toBeTruthy();
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        url: `${base}/${runningRunFixture.id}/cancel`,
        body: { expectedStateVersion: runningRunFixture.stateVersion },
      }),
    ]);
    expect(screen.queryByRole('button', { name: 'Hủy lượt chạy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quét source' })).toBeNull();
    detail = cancelled;
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS * 2));
    // The ended run is offered again from the scan card (UI04-AC02).
    expect(await screen.findByText('Đã hủy lượt quét')).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: 'Chạy lại' }),
    ).not.toHaveLength(0);
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
    render(step(server));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Hủy lượt chạy' }),
    );
    expect(await screen.findByText('Đang hủy lượt quét…')).toBeTruthy();
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
    render(step(server));
    expect(await screen.findByText('Đang quét thư mục…')).toBeTruthy();
    online = false;
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS + 10));
    expect(await screen.findByText(/Mất kết nối với backend/)).toBeTruthy();
    expect(screen.queryByText('Quét source thất bại')).toBeNull();
    expect(screen.getByText('Đang quét thư mục…')).toBeTruthy();
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
    const view = render(step(server));
    await waitFor(() => expect(releaseA).toBeDefined());
    view.rerender(step(server, otherProjectId));
    expect(await screen.findByText('Quét source thất bại')).toBeTruthy();
    await act(async () => {
      releaseA?.();
      await Promise.resolve();
    });
    expect(screen.queryByText('Đang quét thư mục…')).toBeNull();
    expect(screen.getByText('Quét source thất bại')).toBeTruthy();
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
    render(step(server));
    // UI04-AC02: the scan card names the reason; nothing opens by itself.
    expect(await screen.findByText('Quét source thất bại')).toBeTruthy();
    expect(
      screen.getAllByText('Mã nguồn đã thay đổi trong lúc chạy.'),
    ).not.toHaveLength(0);
    // The scan card offers the re-run of the ended run.
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Chạy lại' }))[0]!,
    );
    await waitFor(() => expect(server.mutations()).toHaveLength(1));
    expect(server.mutations()[0]?.body).toEqual({
      kind: 'analyze',
      source: { strategy: 'current-source', expectedSourceRevision: 1 },
      retryOfRunId: failedRunFixture.id,
    });
    expect(await screen.findByText('Đang chờ bắt đầu…')).toBeTruthy();
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
