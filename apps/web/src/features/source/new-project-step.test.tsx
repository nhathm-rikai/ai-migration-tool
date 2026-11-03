import {
  fireEvent,
  render as renderWithLibrary,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  localSourceResponseFixture,
  queuedRunFixture,
} from '@portal/contracts/fixtures';
import { NewProjectStep, folderName } from './new-project-step';
import { createProjectsApi } from '../../shared/api/projects-api';
import { createRunsApi } from '../../shared/api/runs-api';
import { createSourcesApi } from '../../shared/api/sources-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import {
  json,
  localProject,
  requestUrl,
  testCredentials,
} from '../../testing/fixtures';

const ROOT = 'D:\\work\\order-module';
const PICKER = '/api/v1/local/folder-picker';
const sourceUrl = `/api/v1/projects/${localProject.id}/source`;
const runsUrl = `/api/v1/projects/${localProject.id}/runs`;

type Call = { method: string; url: string; body: unknown; key: string | null };
type Handler = () => Response | Promise<Response>;

function createServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      key: new Headers(init?.headers).get('idempotency-key'),
    });
    const handler = routes[`${method} ${url}`];
    return Promise.resolve(
      handler ? handler() : json({ error: 'no route' }, 500),
    );
  });
  return {
    calls,
    of: (method: string, url: string) =>
      calls.filter((call) => call.method === method && call.url === url),
    props: {
      api: createProjectsApi(fetcher, testCredentials),
      runsApi: createRunsApi(fetcher, testCredentials),
      sourcesApi: createSourcesApi(fetcher, testCredentials),
    },
  };
}

function render(ui: ReactElement) {
  return renderWithLibrary(ui, { wrapper: LocaleProvider });
}

const scan = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Quét source' }));

describe('Step 1 of a new project (UI04)', () => {
  it('keeps the first Start intent after the backend accepts it but its response is lost', async () => {
    let received = 0;
    const created = vi.fn();
    const server = createServer({
      [`POST ${PICKER}`]: () => json({ status: 'selected', path: ROOT }),
      'POST /api/v1/projects': () => json(localProject, 201),
      [`PUT ${sourceUrl}`]: () => json(localSourceResponseFixture),
      [`POST ${runsUrl}`]: () => {
        if (++received === 1) throw new TypeError('response lost after commit');
        return json(queuedRunFixture, 202);
      },
    });
    render(<NewProjectStep {...server.props} onCreated={created} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chọn thư mục' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'VB6' }));
    scan();
    expect(
      await screen.findByText(
        /Chưa xác nhận được backend đã nhận yêu cầu chạy/,
      ),
    ).toBeTruthy();
    expect(created).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại yêu cầu' }));
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    const posts = server.of('POST', runsUrl);
    expect(posts).toHaveLength(2);
    expect(posts[1]?.key).toBe(posts[0]?.key);
    expect(posts[1]?.body).toEqual(posts[0]?.body);
    expect(server.of('POST', '/api/v1/projects')).toHaveLength(1);
    expect(server.of('PUT', sourceUrl)).toHaveLength(1);
    expect(
      server.of('PATCH', `/api/v1/projects/${localProject.id}`),
    ).toHaveLength(0);
  });
  it('names the project after the folder', () => {
    expect(folderName('D:\\work\\order-module')).toBe('order-module');
    expect(folderName('/home/dev/legacy/')).toBe('legacy');
  });

  it('a chosen folder that is never scanned creates nothing', async () => {
    const server = createServer({
      [`POST ${PICKER}`]: () => json({ status: 'selected', path: ROOT }),
    });
    render(<NewProjectStep {...server.props} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chọn thư mục' }));
    expect(await screen.findByText('Đã chọn thư mục')).toBeTruthy();
    expect(screen.getByText('order-module')).toBeTruthy();
    expect(screen.getByLabelText('Tên dự án')).toHaveProperty(
      'value',
      'order-module',
    );
    expect(server.calls.map((call) => call.url)).toEqual([PICKER]);
  });

  it('needs a language; then creates the project, registers the folder, starts the first run and opens it', async () => {
    const created = vi.fn();
    const server = createServer({
      [`POST ${PICKER}`]: () => json({ status: 'selected', path: ROOT }),
      'POST /api/v1/projects': () => json(localProject, 201),
      [`PUT ${sourceUrl}`]: () => json(localSourceResponseFixture),
      [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    });
    render(<NewProjectStep {...server.props} onCreated={created} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chọn thư mục' }));
    await screen.findByText('Đã chọn thư mục');
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: ' Payroll ' },
    });
    scan();
    expect(
      await screen.findByText('Chọn ngôn ngữ phân tích trước khi quét.'),
    ).toBeTruthy();
    expect(server.of('POST', '/api/v1/projects')).toEqual([]);
    fireEvent.click(screen.getByRole('radio', { name: 'VB6' }));
    scan();
    await waitFor(() => expect(created).toHaveBeenCalledWith(localProject));
    expect(server.of('POST', '/api/v1/projects')[0]?.body).toEqual({
      name: 'Payroll',
      mode: 'local',
    });
    expect(server.of('PUT', sourceUrl)[0]?.body).toEqual({
      rootPath: ROOT,
      profileId: 'vb6-cp932-v1',
      tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
      expectedSourceRevision: null,
    });
    expect(server.of('POST', runsUrl)[0]?.body).toMatchObject({
      source: { strategy: 'current-source', expectedSourceRevision: 1 },
      retryOfRunId: null,
    });
    expect(server.of('POST', runsUrl)[0]?.key).toMatch(/^[\w-]{16,}$/);
  });

  it('a refused folder keeps the created project: scanning again creates no second one', async () => {
    let attempts = 0;
    const created = vi.fn();
    const server = createServer({
      [`POST ${PICKER}`]: () => json({ status: 'selected', path: ROOT }),
      'POST /api/v1/projects': () =>
        json({ ...localProject, name: 'order-module' }, 201),
      [`PUT ${sourceUrl}`]: () =>
        attempts++ === 0
          ? json(
              {
                error: {
                  code: 'SOURCE_FORBIDDEN',
                  message: 'raw server text',
                  requestId: 'r',
                },
              },
              422,
            )
          : json(localSourceResponseFixture),
      [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    });
    render(<NewProjectStep {...server.props} onCreated={created} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chọn thư mục' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'VB6' }));
    scan();
    expect(await screen.findByText(/Không được dùng thư mục này/)).toBeTruthy();
    expect(screen.queryByText('raw server text')).toBeNull();
    expect(created).not.toHaveBeenCalled();
    scan();
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(server.of('POST', '/api/v1/projects')).toHaveLength(1);
    expect(server.of('PATCH', `/api/v1/projects/${localProject.id}`)).toEqual(
      [],
    );
    expect(server.of('PUT', sourceUrl)).toHaveLength(2);
  });

  it('a double click creates one project', async () => {
    const server = createServer({
      [`POST ${PICKER}`]: () => json({ status: 'selected', path: ROOT }),
      'POST /api/v1/projects': () => json(localProject, 201),
      [`PUT ${sourceUrl}`]: () => json(localSourceResponseFixture),
      [`POST ${runsUrl}`]: () => json(queuedRunFixture, 202),
    });
    const created = vi.fn();
    render(<NewProjectStep {...server.props} onCreated={created} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chọn thư mục' }));
    await screen.findByText('Đã chọn thư mục');
    fireEvent.click(screen.getByRole('radio', { name: 'VB6' }));
    const button = screen.getByRole('button', { name: 'Quét source' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(server.of('POST', '/api/v1/projects')).toHaveLength(1);
  });
});
