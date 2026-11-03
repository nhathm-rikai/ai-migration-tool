import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '@portal/contracts';
import { createRunEventStream } from './run-events';
import { ApiError } from './api-error';
import { requestUrl, testCredentials, testToken } from '../../testing/fixtures';

const event = (sequence: number): RunEvent => ({
  runId: '00000000-0000-4000-8000-0000000000aa',
  sequence,
  stateVersion: 2,
  status: 'running',
  stage: 'snapshot',
  occurredAt: '2026-11-02T00:00:00.000Z',
});

// A response whose body arrives in the given chunks.
function streamOf(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('run event stream client (F05)', () => {
  it('reads run events split across chunks, drops invalid ones, sends the token in a header only', async () => {
    const first = JSON.stringify(event(1));
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        streamOf([
          `event: run\nid: 1\ndata: ${first.slice(0, 20)}`,
          `${first.slice(20)}\n\n: keep-alive\n\n`,
          `event: other\ndata: ${JSON.stringify(event(9))}\n\n`,
          'event: run\ndata: {"runId":"x"}\n\n',
          `event: run\nid: 2\ndata: ${JSON.stringify(event(2))}\n\n`,
        ]),
      ),
    );
    const events: RunEvent[] = [];
    await createRunEventStream(testCredentials, fetcher)(
      'p',
      'r',
      new AbortController().signal,
      (received) => events.push(received),
    );
    expect(events.map((received) => received.sequence)).toEqual([1, 2]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/v1/projects/p/runs/r/events');
    expect(requestUrl(url)).not.toContain(testToken);
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${testToken}`,
    );
  });

  it('rejects a refused stream and drops a rejected credential', async () => {
    const invalidate = vi.fn();
    const credentials = { ...testCredentials, invalidate };
    const stream = createRunEventStream(credentials, () =>
      Promise.resolve(new Response('{}', { status: 401 })),
    );
    await expect(
      stream('p', 'r', new AbortController().signal, () => undefined),
    ).rejects.toBeInstanceOf(ApiError);
    expect(invalidate).toHaveBeenCalledWith(testToken);
  });

  it('a broken connection is a network error, an abort is not reported as one', async () => {
    const broken = createRunEventStream(testCredentials, () =>
      Promise.reject(new TypeError('offline')),
    );
    await expect(
      broken('p', 'r', new AbortController().signal, () => undefined),
    ).rejects.toMatchObject({ kind: 'network' });
    const controller = new AbortController();
    const hanging = createRunEventStream(
      testCredentials,
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    );
    const pending = hanging('p', 'r', controller.signal, () => undefined);
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });
});
