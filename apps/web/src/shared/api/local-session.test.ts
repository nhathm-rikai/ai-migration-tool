import { LOCAL_SESSION_PATH } from '@portal/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createLocalSession } from './local-session';
import { createProjectsApi } from './projects-api';
import { json, project, requestUrl } from '../../testing/fixtures';

const token = 'A'.repeat(43);
const freshToken = 'B'.repeat(43);
const input = { name: project.name, fixtureId: project.fixtureId };
const signal = () => new AbortController().signal;
const rejected = (code: string, status: number) =>
  json({ error: { code, message: 'private', requestId: 'r-1' } }, status);

// Routes the session bootstrap to `session` and everything else to `api`.
function backend(
  session: () => Promise<Response>,
  api: (url: string, init?: RequestInit) => Promise<Response>,
) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation((input, init) =>
      requestUrl(input) === LOCAL_SESSION_PATH
        ? session()
        : api(requestUrl(input), init),
    );
}

function sessionCalls(fetcher: ReturnType<typeof backend>) {
  return fetcher.mock.calls.filter(
    ([url]) => requestUrl(url) === LOCAL_SESSION_PATH,
  );
}
function apiCalls(fetcher: ReturnType<typeof backend>, method?: string) {
  return fetcher.mock.calls.filter(
    ([url, init]) =>
      requestUrl(url) !== LOCAL_SESSION_PATH &&
      (method === undefined || init?.method === method),
  );
}

describe('local credential transport (F00)', () => {
  // F00-AC02
  it('bootstraps once and sends the credential only in the Authorization header', async () => {
    const fetcher = backend(
      () => Promise.resolve(json({ token })),
      (url, init) =>
        Promise.resolve(
          json(
            init?.method === 'POST' || url.endsWith(project.id)
              ? project
              : { items: [], nextCursor: null },
          ),
        ),
    );
    const session = createLocalSession(fetcher);
    const api = createProjectsApi(fetcher, session);
    expect(session.getStatus()).toBe('idle');
    await Promise.all([
      api.list(null, signal()),
      api.get(project.id, signal()),
      api.create(input, signal()),
    ]);
    await api.list('cursor-1', signal());
    expect(session.getStatus()).toBe('ready');
    expect(sessionCalls(fetcher)).toHaveLength(1);
    const [, bootstrap] = sessionCalls(fetcher)[0] ?? [];
    expect(bootstrap?.method).toBe('POST');
    expect(bootstrap?.body).toBeUndefined();
    expect(bootstrap?.headers).toBeUndefined();
    const calls = apiCalls(fetcher);
    expect(calls).toHaveLength(4);
    for (const [url, init] of calls) {
      expect(requestUrl(url)).not.toContain(token);
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        `Bearer ${token}`,
      );
      expect(init?.body ?? '').not.toContain(token);
    }
    expect(document.cookie).not.toContain(token);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(token);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(token);
  });

  it('keeps one shared bootstrap when the first caller aborts', async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetcher = backend(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
      () => Promise.resolve(json(project)),
    );
    const session = createLocalSession(fetcher);
    const api = createProjectsApi(fetcher, session);
    const cancelled = new AbortController();
    const first = api.get(project.id, cancelled.signal);
    const second = api.get(project.id, signal());
    cancelled.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    answer(json({ token }));
    await expect(second).resolves.toEqual(project);
    expect(sessionCalls(fetcher)).toHaveLength(1);
    expect(apiCalls(fetcher)).toHaveLength(1);
  });

  // F00-AC01
  it.each([
    ['network failure', () => Promise.reject(new TypeError('offline'))],
    [
      'forbidden origin',
      () => Promise.resolve(rejected('ORIGIN_NOT_ALLOWED', 403)),
    ],
    ['malformed session body', () => Promise.resolve(json({ token: 'short' }))],
  ])(
    'never sends the mutation when bootstrap fails (%s) and recovers on explicit retry',
    async (_name, failure) => {
      const sessionResponses = [
        failure,
        () => Promise.resolve(json({ token })),
      ];
      const fetcher = backend(
        () => (sessionResponses.shift() ?? failure)(),
        () => Promise.resolve(json(project, 201)),
      );
      const session = createLocalSession(fetcher);
      const api = createProjectsApi(fetcher, session);
      const error: unknown = await api
        .create(input, signal())
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({
        kind: 'credential',
        method: 'POST',
        outcomeUnknown: false,
      });
      expect(apiCalls(fetcher, 'POST')).toHaveLength(0);
      expect(session.getStatus()).toBe('failed');
      session.retry();
      expect(session.getStatus()).toBe('pending');
      await vi.waitFor(() => expect(session.getStatus()).toBe('ready'));
      expect(sessionCalls(fetcher)).toHaveLength(2);
      // The failed submission is not replayed; only the user's new submit sends.
      expect(apiCalls(fetcher, 'POST')).toHaveLength(0);
      await expect(api.create(input, signal())).resolves.toEqual(project);
      expect(apiCalls(fetcher, 'POST')).toHaveLength(1);
    },
  );

  it('does not retry a POST whose credential expired, and re-bootstraps on the next request', async () => {
    const tokens = [token, freshToken];
    const fetcher = backend(
      () => Promise.resolve(json({ token: tokens.shift() ?? freshToken })),
      (_url, init) =>
        Promise.resolve(
          new Headers(init?.headers).get('Authorization') === `Bearer ${token}`
            ? rejected('CREDENTIAL_INVALID', 401)
            : json(project, 201),
        ),
    );
    const session = createLocalSession(fetcher);
    const api = createProjectsApi(fetcher, session);
    const error: unknown = await api
      .create(input, signal())
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      kind: 'http',
      status: 401,
      code: 'CREDENTIAL_INVALID',
      outcomeUnknown: false,
    });
    expect(apiCalls(fetcher, 'POST')).toHaveLength(1);
    expect(session.getStatus()).toBe('expired');
    await expect(api.create(input, signal())).resolves.toEqual(project);
    expect(sessionCalls(fetcher)).toHaveLength(2);
    expect(apiCalls(fetcher, 'POST')).toHaveLength(2);
  });

  it('retries a GET once with a fresh credential, then stops', async () => {
    const tokens = [token, freshToken];
    const fetcher = backend(
      () => Promise.resolve(json({ token: tokens.shift() ?? freshToken })),
      () => Promise.resolve(rejected('CREDENTIAL_INVALID', 401)),
    );
    const api = createProjectsApi(fetcher, createLocalSession(fetcher));
    await expect(api.get(project.id, signal())).rejects.toMatchObject({
      code: 'CREDENTIAL_INVALID',
    });
    expect(sessionCalls(fetcher)).toHaveLength(2);
    const sent = apiCalls(fetcher).map(([, init]) =>
      new Headers(init?.headers).get('Authorization'),
    );
    expect(sent).toEqual([`Bearer ${token}`, `Bearer ${freshToken}`]);
  });
});
