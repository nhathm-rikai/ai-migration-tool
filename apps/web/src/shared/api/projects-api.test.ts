import { describe, expect, it, vi } from 'vitest';
import { createProjectsApi } from './projects-api';
import { ApiError } from './api-error';
import { API_REQUEST_TIMEOUT_MS } from './api-client';
import { json, project } from '../../testing/fixtures';

const signal = () => new AbortController().signal;
const input = { name: project.name, fixtureId: project.fixtureId };

describe('Projects API boundary', () => {
  it('uses the public API and validates its response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(project));
    expect(await createProjectsApi(fetcher).create(input, signal())).toEqual(
      project,
    );
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/projects',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
  });

  it.each([
    { status: 404, code: 'PROJECT_NOT_FOUND' },
    { status: 404, code: 'ROUTE_NOT_FOUND' },
    { status: 400, code: 'INVALID_INPUT' },
    { status: 409, code: 'FUTURE_ERROR' },
  ])(
    'preserves structured HTTP metadata for $code without exposing server text',
    async ({ status, code }) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        json(
          {
            error: {
              code,
              message: 'private-path-secret',
              requestId: 'request-001',
            },
          },
          status,
        ),
      );
      const failure: unknown = await createProjectsApi(fetcher)
        .get(project.id, signal())
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({
        kind: 'http',
        status,
        code,
        requestId: 'request-001',
        outcomeUnknown: false,
      });
      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).toHaveProperty('message', 'API http failure');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves an HTTP failure with a malformed body without inventing a business code', async () => {
    const api = createProjectsApi(() =>
      Promise.resolve(
        new Response('<html>private-path-secret</html>', { status: 404 }),
      ),
    );
    await expect(api.get(project.id, signal())).rejects.toMatchObject({
      kind: 'http',
      status: 404,
      code: undefined,
      requestId: undefined,
    });
  });

  it.each(['malformed-json', 'wrong-schema'])(
    'classifies a successful HTTP response with %s as invalid-response',
    async (scenario) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(() =>
          Promise.resolve(
            scenario === 'malformed-json'
              ? new Response('{broken', { status: 200 })
              : json({ ...project, mode: 'live' }),
          ),
        );
      await expect(
        createProjectsApi(fetcher).get(project.id, signal()),
      ).rejects.toMatchObject({
        kind: 'invalid-response',
        status: 200,
        outcomeUnknown: false,
      });
      await expect(
        createProjectsApi(fetcher).create(input, signal()),
      ).rejects.toMatchObject({
        kind: 'invalid-response',
        outcomeUnknown: true,
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it.each([400, 500])(
    'does not retry HTTP %s after a mutation',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ message: 'private-path-secret' }, status));
      await expect(
        createProjectsApi(fetcher).create(input, signal()),
      ).rejects.toMatchObject({ kind: 'http', outcomeUnknown: status >= 500 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('distinguishes a network failure and records mutation uncertainty without raw details', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private-path-secret'));
    const api = createProjectsApi(fetcher);
    await expect(api.get(project.id, signal())).rejects.toMatchObject({
      kind: 'network',
      outcomeUnknown: false,
    });
    await expect(api.create(input, signal())).rejects.toMatchObject({
      kind: 'network',
      outcomeUnknown: true,
    });
    await expect(api.create(input, signal())).rejects.toThrow(
      'API network failure',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not start a request when the caller already cancelled', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createProjectsApi(fetcher).list(null, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'timeout-read', 'timeout-create'])(
    'passes cancellation to fetch, distinguishes %s and cleans the timer',
    async (scenario) => {
      vi.useFakeTimers();
      try {
        const fetcher = vi.fn<typeof fetch>().mockImplementation(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            }),
        );
        const controller = new AbortController();
        const api = createProjectsApi(fetcher);
        const pending =
          scenario === 'timeout-create'
            ? api.create(input, controller.signal)
            : api.list(null, controller.signal);
        const assertion = expect(pending).rejects.toMatchObject(
          scenario === 'cancel'
            ? { name: 'AbortError' }
            : {
                kind: 'timeout',
                outcomeUnknown: scenario === 'timeout-create',
              },
        );
        if (scenario === 'cancel') controller.abort();
        else await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
        await assertion;
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('times out while reading the response body as well as while waiting for headers', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) =>
        Promise.resolve(
          Object.assign(json(project), {
            json: () =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener(
                  'abort',
                  () => reject(new DOMException('Aborted', 'AbortError')),
                  { once: true },
                );
              }),
          }),
        ),
      );
      const pending = createProjectsApi(fetcher).get(project.id, signal());
      const assertion = expect(pending).rejects.toBeInstanceOf(ApiError);
      const classification = expect(pending).rejects.toMatchObject({
        kind: 'timeout',
      });
      await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
      await assertion;
      await classification;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
