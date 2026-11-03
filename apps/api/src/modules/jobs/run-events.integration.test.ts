import { randomUUID } from 'node:crypto';
import {
  LOCAL_SESSION_PATH,
  RunEventSchema,
  type LocalSession,
  type Project,
  type Run,
  type RunEvent,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import { createControlledExecutor } from '../../testing/controlled-executor.js';
import {
  createTestApp,
  freeLoopbackPort,
  trustedHeaders,
} from '../../testing/test-app.js';

// B09 over a real loopback socket: the SSE stream of a run, its first event
// (committed state now), progress and terminal events, the credential and
// run checks, and a client that goes away without touching the run.

type Context = Awaited<ReturnType<typeof open>>;

async function open() {
  const controlled = createControlledExecutor({ stopOnAbort: true });
  const context = createTestApp(
    { PORTAL_PORT: String(await freeLoopbackPort()) },
    { jobs: { executor: controlled.executor } },
  );
  const base = await context.app.listen({
    host: context.config.host,
    port: context.config.port,
  });
  const headers = trustedHeaders(context.config);
  const session = await fetch(`${base}${LOCAL_SESSION_PATH}`, {
    method: 'POST',
    headers,
  });
  const { token } = (await session.json()) as LocalSession;
  const auth = { ...headers, authorization: `Bearer ${token}` };
  const json = async <T>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...auth,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    return { status: response.status, body: (await response.json()) as T };
  };
  const project = (
    await json<Project>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Events', fixtureId: 'sample-vb6' }),
    })
  ).body;
  const runs = `/api/v1/projects/${project.id}/runs`;
  const start = async () =>
    (
      await fetch(`${base}${runs}`, {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          kind: 'analyze',
          source: { strategy: 'current-source', expectedSourceRevision: 1 },
          retryOfRunId: null,
        }),
      })
    ).json() as Promise<Run>;
  return { context, controlled, base, auth, json, project, runs, start };
}

// Reads SSE `run` events until `stop` says so or the stream ends.
async function readEvents(
  response: Response,
  stop: (events: RunEvent[]) => boolean = () => false,
): Promise<{ events: RunEvent[]; ended: boolean }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: RunEvent[] = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { events, ended: true };
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = block
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6);
      if (!data) continue;
      expect(block).toMatch(/^event: run\nid: \d+\n/);
      const event: unknown = JSON.parse(data);
      expect(Check(RunEventSchema, event)).toBe(true);
      events.push(event as RunEvent);
    }
    if (stop(events)) {
      await reader.cancel();
      return { events, ended: false };
    }
  }
}

// Real sockets: slower than inject when the whole suite runs in parallel.
describe('run events SSE (B09)', { timeout: 20_000 }, () => {
  let ctx: Context | undefined;
  afterEach(async () => {
    await ctx?.context.cleanup();
    ctx = undefined;
  });

  it('streams the committed state, progress and the terminal state, then ends', async () => {
    ctx = await open();
    const { controlled, base, auth, runs, start } = ctx;
    const run = await start();
    await expect.poll(() => controlled.executions.length).toBe(1);
    const response = await fetch(`${base}${runs}/${run.id}/events`, {
      headers: auth,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const execution = controlled.executions[0]!;
    const reading = readEvents(response);
    execution.report({ stage: 'snapshot' });
    execution.reportFiles?.({
      phase: 'snapshot',
      filesSnapshotted: 1,
      filesAnalyzed: 0,
      filesTotal: 2,
      bytesDone: 10,
      bytesTotal: 20,
      recentPaths: ['programs/A.BAS'],
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    execution.finish({ status: 'succeeded', sourceSnapshotId: randomUUID() });
    const { events, ended } = await reading;
    expect(ended).toBe(true);
    expect(events[0]).toMatchObject({ runId: run.id, status: 'running' });
    expect(events.map((event) => event.sequence)).toEqual(
      events.map((_, index) => index + 1),
    );
    expect(events.find((event) => event.progress)?.progress).toMatchObject({
      filesSnapshotted: 1,
      filesTotal: 2,
    });
    expect(events.at(-1)).toMatchObject({ status: 'succeeded' });
    expect(events.at(-1)).not.toHaveProperty('progress');
    // GET run carries the same progress while active; none once ended.
    expect((await ctx.json<Run>(`${runs}/${run.id}`)).body).not.toHaveProperty(
      'progress',
    );
  });

  it('GET run includes the in-memory progress of an active run', async () => {
    ctx = await open();
    const { controlled, runs, start } = ctx;
    const run = await start();
    await expect.poll(() => controlled.executions.length).toBe(1);
    controlled.executions[0]!.reportFiles?.({
      phase: 'listing',
      filesSnapshotted: 0,
      filesAnalyzed: 0,
      filesTotal: null,
      bytesDone: 0,
      bytesTotal: null,
      recentPaths: [],
    });
    expect((await ctx.json<Run>(`${runs}/${run.id}`)).body).toMatchObject({
      progress: { phase: 'listing', filesTotal: null },
    });
    controlled.executions[0]!.finish({ status: 'stopped' });
  });

  it('B09-AC03 rejects a missing credential, a foreign Origin and an unknown run', async () => {
    ctx = await open();
    const { base, auth, runs, start, controlled } = ctx;
    const run = await start();
    const anonymous = await fetch(`${base}${runs}/${run.id}/events`, {
      headers: trustedHeaders(ctx.context.config),
    });
    expect(anonymous.status).toBe(401);
    const foreign = await fetch(`${base}${runs}/${run.id}/events`, {
      headers: { ...auth, origin: 'http://evil.example' },
    });
    expect(foreign.status).toBe(403);
    const unknown = await fetch(`${base}${runs}/${randomUUID()}/events`, {
      headers: auth,
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).not.toContain('Bearer');
    await expect.poll(() => controlled.executions.length).toBe(1);
    controlled.executions[0]!.finish({ status: 'stopped' });
  });

  it('B09-AC02 a client that goes away does not cancel the run', async () => {
    ctx = await open();
    const { base, auth, runs, start, controlled, json } = ctx;
    const run = await start();
    await expect.poll(() => controlled.executions.length).toBe(1);
    const response = await fetch(`${base}${runs}/${run.id}/events`, {
      headers: auth,
    });
    await readEvents(response, (events) => events.length >= 1);
    const execution = controlled.executions[0]!;
    expect(execution.signal.aborted).toBe(false);
    execution.finish({ status: 'succeeded', sourceSnapshotId: randomUUID() });
    await expect
      .poll(async () => (await json<Run>(`${runs}/${run.id}`)).body.status)
      .toBe('succeeded');
  });

  it('ends open streams when the app shuts down', async () => {
    ctx = await open();
    const { base, auth, runs, start, controlled } = ctx;
    const run = await start();
    await expect.poll(() => controlled.executions.length).toBe(1);
    const response = await fetch(`${base}${runs}/${run.id}/events`, {
      headers: auth,
    });
    const reading = readEvents(response);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await ctx.context.app.close();
    const { ended } = await reading;
    expect(ended).toBe(true);
  });
});
