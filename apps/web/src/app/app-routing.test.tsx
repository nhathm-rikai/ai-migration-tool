import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  FIXTURE_IDS,
  artifactListFixture,
  emptyArtifactListFixture,
  failedRunFixture,
  localSourceResponseFixture,
  mappedInventoryArtifactFixture,
  succeededRunFixture,
  unregisteredSourceResponseFixture,
} from '@portal/contracts/fixtures';
import type { LocalProject } from '@portal/contracts';
import { App } from './app';
import { parseRoute, routePath } from './router';
import {
  json,
  project,
  requestUrl,
  testCredentials,
} from '../testing/fixtures';
import { createProjectsApi } from '../shared/api/projects-api';
import { createRunsApi } from '../shared/api/runs-api';
import { createSourcesApi } from '../shared/api/sources-api';
import { createArtifactsApi } from '../shared/api/artifacts-api';

const projectId = FIXTURE_IDS.project;
const local: LocalProject = {
  id: projectId,
  name: 'Dự án định tuyến',
  mode: 'local',
  createdAt: '2026-10-27T00:00:00.000Z',
};
const api = `/api/v1/projects/${projectId}`;
const page = `/projects/${projectId}`;
const notFound = json(
  {
    error: {
      code: 'PROJECT_NOT_FOUND',
      message: 'safe-server-message',
      requestId: 'request-001',
    },
  },
  404,
);

type Routes = Record<string, () => Response>;

// Routes `METHOD /path` (query ignored) and records every call.
function renderAt(path: string, routes: Routes) {
  window.history.replaceState(null, '', path);
  const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const method = init?.method ?? 'GET';
    const url = requestUrl(input).split('?')[0] ?? '';
    calls.push(`${method} ${url}`);
    const handler = routes[`${method} ${url}`];
    return Promise.resolve(
      handler ? handler() : json({ error: 'no route' }, 500),
    );
  });
  render(
    <App
      api={createProjectsApi(fetcher, testCredentials)}
      runsApi={createRunsApi(fetcher, testCredentials)}
      sourcesApi={createSourcesApi(fetcher, testCredentials)}
      artifactsApi={createArtifactsApi(fetcher, testCredentials)}
      session={testCredentials}
    />,
  );
  return {
    calls,
    mutations: () => calls.filter((call) => !call.startsWith('GET ')),
  };
}

const baseRoutes = (overrides: Routes = {}): Routes => ({
  'GET /api/v1/projects': () => json({ items: [local], nextCursor: null }),
  [`GET ${api}`]: () => json(local),
  [`GET ${api}/source`]: () => json(localSourceResponseFixture),
  [`GET ${api}/runs/current`]: () => json({ run: null }),
  [`GET ${api}/runs`]: () =>
    json({ items: [succeededRunFixture], nextCursor: null }),
  [`GET ${api}/runs/${FIXTURE_IDS.runs.succeeded}/artifacts`]: () =>
    json(artifactListFixture),
  [`GET ${api}/artifacts/${FIXTURE_IDS.artifact}/versions/1`]: () =>
    json(mappedInventoryArtifactFixture),
  ...overrides,
});

function steps() {
  return screen.getByRole('navigation', { name: 'Các bước đánh giá' });
}
function step(name: RegExp) {
  return within(steps()).getByRole('link', { name });
}

describe('routes', () => {
  it('parses every page and canonicalizes short or trailing paths', () => {
    expect(parseRoute('/')).toEqual({
      route: { name: 'projects' },
      redirect: '/projects',
    });
    expect(parseRoute('/projects/')).toEqual({
      route: { name: 'projects' },
      redirect: '/projects',
    });
    expect(parseRoute('/projects/a%20b')).toEqual({
      route: { name: 'step', projectId: 'a b', step: 'source', runId: null },
      redirect: '/projects/a%20b/source',
    });
    expect(parseRoute('/projects/p/analysis/r1').route).toEqual({
      name: 'step',
      projectId: 'p',
      step: 'analysis',
      runId: 'r1',
    });
    expect(parseRoute('/projects/p/quote').redirect).toBeNull();
    for (const path of [
      '/other',
      '/projects/p/unknown',
      '/projects/p/source/r1',
      '/projects/%E0%A4%A',
    ])
      expect(parseRoute(path).route).toEqual({ name: 'not-found' });
    expect(
      routePath({
        name: 'step',
        projectId: 'a/b',
        step: 'analysis',
        runId: 'r',
      }),
    ).toBe('/projects/a%2Fb/analysis/r');
  });

  it('redirects the root address to the project list', async () => {
    renderAt('/', baseRoutes());
    await screen.findByRole('heading', { level: 1, name: 'Dự án của bạn' });
    expect(window.location.pathname).toBe('/projects');
    // Without a project the steps are shown but cannot be opened.
    expect(within(steps()).queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByText('Chọn hoặc tạo dự án để mở các bước.'),
    ).toBeTruthy();
  });
});

describe('reload at a step URL (UI01-AC01)', () => {
  it('opens the latest analysis of the project on reload and starts nothing', async () => {
    const server = renderAt(`${page}/analysis`, baseRoutes());
    await screen.findByRole('heading', { level: 1, name: local.name });
    expect(
      await screen.findByRole('region', { name: 'Đánh giá tổng quan' }),
    ).toBeTruthy();
    expect(step(/Phân tích/).getAttribute('aria-current')).toBe('step');
    expect(server.mutations()).toEqual([]);
  });

  it('opens a named run and offers the latest one', async () => {
    const older = { ...succeededRunFixture, id: FIXTURE_IDS.runs.retry };
    renderAt(
      `${page}/analysis/${older.id}`,
      baseRoutes({
        [`GET ${api}/runs/${older.id}/artifacts`]: () =>
          json(artifactListFixture),
      }),
    );
    expect(
      await screen.findByText('Đang xem kết quả của một lượt chạy cụ thể.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Xem kết quả mới nhất' }));
    expect(window.location.pathname).toBe(`${page}/analysis`);
  });

  it('shows the source step of the project named in the URL', async () => {
    const server = renderAt(`${page}/source`, baseRoutes());
    await screen.findByRole('heading', { level: 1, name: local.name });
    expect(
      await screen.findByRole('region', { name: 'Mã nguồn LOCAL' }),
    ).toBeTruthy();
    expect(step(/Nạp source/).getAttribute('aria-current')).toBe('step');
    expect(server.mutations()).toEqual([]);
  });

  it('shows a not-found page with a link to the list for an unknown project', async () => {
    renderAt(`${page}/analysis`, {
      'GET /api/v1/projects': () => json({ items: [], nextCursor: null }),
      [`GET ${api}`]: () => notFound,
    });
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Không tìm thấy dự án',
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Về danh sách dự án' }));
    expect(window.location.pathname).toBe('/projects');
    await screen.findByRole('heading', { level: 1, name: 'Dự án của bạn' });
  });

  it('shows a not-found page for an unknown address', () => {
    renderAt('/settings', baseRoutes());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' }),
    ).toBeTruthy();
  });

  it('follows browser back and forward between steps', async () => {
    renderAt(`${page}/source`, baseRoutes());
    await screen.findByRole('heading', { level: 1, name: local.name });
    fireEvent.click(step(/Báo giá/));
    expect(window.location.pathname).toBe(`${page}/quote`);
    expect(document.activeElement?.id).toBe('main-content');
    window.history.back();
    await waitFor(() =>
      expect(step(/Nạp source/).getAttribute('aria-current')).toBe('step'),
    );
  });
});

describe('step marks (UI01-AC02)', () => {
  const done = (name: RegExp) =>
    within(step(name)).queryByText(/Đã xong/) !== null;

  it('marks source and analysis done only with a saved source and a published inventory', async () => {
    renderAt(`${page}/quote`, baseRoutes());
    await waitFor(() => expect(done(/Phân tích/)).toBe(true));
    expect(done(/Nạp source/)).toBe(true);
    for (const name of [/Tạo tài liệu/, /Review & duyệt/, /Báo giá/]) {
      expect(done(name)).toBe(false);
      expect(within(step(name)).getByText(/Chưa khả dụng/)).toBeTruthy();
    }
    // Steps 3–5 say why they are not available.
    expect(screen.getByRole('heading', { name: 'Chưa khả dụng' })).toBeTruthy();
    expect(
      screen.getByText(/mô hình ước tính chưa được cấu hình/),
    ).toBeTruthy();
  });

  it('leaves both steps open without a source, and analysis open when no succeeded run has an inventory', async () => {
    renderAt(
      `${page}/analysis`,
      baseRoutes({
        [`GET ${api}/source`]: () => json(unregisteredSourceResponseFixture),
        [`GET ${api}/runs`]: () =>
          json({
            items: [failedRunFixture, succeededRunFixture],
            nextCursor: null,
          }),
        [`GET ${api}/runs/${FIXTURE_IDS.runs.succeeded}/artifacts`]: () =>
          json(emptyArtifactListFixture),
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Chưa có kết quả phân tích' }),
    ).toBeTruthy();
    expect(done(/Nạp source/)).toBe(false);
    expect(done(/Phân tích/)).toBe(false);
    expect(within(step(/Nạp source/)).getByText(/Chưa làm/)).toBeTruthy();
  });

  it('counts the bundled fixture of a demo project as its source', async () => {
    const demoApi = `/api/v1/projects/${project.id}`;
    renderAt(`/projects/${project.id}/source`, {
      'GET /api/v1/projects': () =>
        json({ items: [project], nextCursor: null }),
      [`GET ${demoApi}`]: () => json(project),
      [`GET ${demoApi}/runs/current`]: () => json({ run: null }),
      [`GET ${demoApi}/runs`]: () => json({ items: [], nextCursor: null }),
    });
    await waitFor(() => expect(done(/Nạp source/)).toBe(true));
    expect(done(/Phân tích/)).toBe(false);
    expect(screen.getAllByText('DEMO').length).toBeGreaterThan(0);
  });

  it('switches project from the sidebar picker and keeps the step', async () => {
    renderAt(
      `${page}/analysis`,
      baseRoutes({
        'GET /api/v1/projects': () =>
          json({ items: [local, project], nextCursor: null }),
        [`GET /api/v1/projects/${project.id}`]: () => json(project),
        [`GET /api/v1/projects/${project.id}/runs`]: () =>
          json({ items: [], nextCursor: null }),
      }),
    );
    const picker = await screen.findByLabelText('Dự án');
    await within(picker).findByRole('option', { name: /Dự án mẫu/ });
    fireEvent.change(picker, { target: { value: project.id } });
    expect(window.location.pathname).toBe(`/projects/${project.id}/analysis`);
    await screen.findByRole('heading', { level: 1, name: project.name });
  });
});
