import { randomUUID } from 'node:crypto';
import {
  RunSchema,
  type CurrentRunResponse,
  type Project,
  type Run,
  type RunList,
  type RuntimeStatus,
  type StartRunInput,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { openDatabase } from '../../db/database.js';
import { createControlledExecutor } from '../../testing/controlled-executor.js';
import {
  createTestApp,
  createTrustedInject,
  trustedHeaders,
} from '../../testing/test-app.js';
import type { JobOptions } from '../../composition.js';

type Inject = ReturnType<typeof createTestApp>['inject'];

const startBody = {
  kind: 'analyze',
  source: { strategy: 'current-source', expectedSourceRevision: 1 },
  retryOfRunId: null,
} as const satisfies StartRunInput;

const newKey = () => `key-${randomUUID()}`;

async function createProject(
  inject: Inject,
  name = 'Sample',
): Promise<Project> {
  const response = await inject({
    method: 'POST',
    url: '/api/v1/projects',
    payload: { name, fixtureId: 'sample-vb6' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Project>();
}

function start(
  inject: Inject,
  projectId: string,
  key: string,
  body: unknown = startBody,
) {
  return inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/runs`,
    headers: { 'idempotency-key': key },
    payload: body as object,
  });
}

async function getRun(inject: Inject, run: { projectId: string; id: string }) {
  const response = await inject(
    `/api/v1/projects/${run.projectId}/runs/${run.id}`,
  );
  expect(response.statusCode).toBe(200);
  return response.json<Run>();
}

function cancel(
  inject: Inject,
  run: Run,
  expectedStateVersion = run.stateVersion,
) {
  return inject({
    method: 'POST',
    url: `/api/v1/projects/${run.projectId}/runs/${run.id}/cancel`,
    payload: { expectedStateVersion },
  });
}

async function waitForStatus(
  inject: Inject,
  run: { projectId: string; id: string },
  status: Run['status'],
): Promise<Run> {
  return vi.waitFor(
    async () => {
      const current = await getRun(inject, run);
      expect(current.status).toBe(status);
      return current;
    },
    { timeout: 8000, interval: 10 },
  );
}

// Each test opens a fresh SQLite app; several walk runs through many states.
describe(
  'Analyze runs HTTP -> service -> dispatcher -> real SQLite',
  { timeout: 20_000 },
  () => {
    let context: ReturnType<typeof createTestApp> | undefined;
    // Executions the test leaves hanging stop quickly at cleanup.
    function setup(jobs: JobOptions = {}) {
      context = createTestApp({}, { jobs: { stopTimeoutMs: 100, ...jobs } });
      return context;
    }
    afterEach(async () => {
      await context?.cleanup();
      context = undefined;
    });

    describe('admission (B04)', () => {
      it('persists a queued run, answers 202 with Location and does not wait for execution', async () => {
        const controlled = createControlledExecutor();
        const { inject } = setup({ executor: controlled.executor });
        const project = await createProject(inject);
        const response = await start(inject, project.id, newKey());
        expect(response.statusCode).toBe(202);
        const run = response.json<Run>();
        expect(Check(RunSchema, run)).toBe(true);
        expect(run).toMatchObject({
          projectId: project.id,
          status: 'queued',
          stateVersion: 1,
          source: { kind: 'fixture', fixtureId: 'sample-vb6', revision: 1 },
          sourceStrategy: 'current-source',
          config: {
            profileId: 'vb6-cp932-v1',
            tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
            analyzer: { metricVersion: 'vb6-physical-code-v1' },
          },
        });
        expect(response.headers.location).toBe(
          `/api/v1/projects/${project.id}/runs/${run.id}`,
        );
        const running = await waitForStatus(inject, run, 'running');
        expect(running.stateVersion).toBe(2);
        expect(running.stage).toBe('snapshot');
        expect(controlled.executions).toHaveLength(1);
      });

      it('B04-AC01: concurrent requests with one key and input create one run', async () => {
        const { inject, config } = setup({
          executor: createControlledExecutor().executor,
        });
        const project = await createProject(inject);
        const key = newKey();
        const responses = await Promise.all(
          Array.from({ length: 5 }, () => start(inject, project.id, key)),
        );
        const ids = new Set(responses.map((r) => r.json<Run>().id));
        expect(responses.map((r) => r.statusCode)).toEqual([
          202, 202, 202, 202, 202,
        ]);
        expect(ids.size).toBe(1);
        expect(new Set(responses.map((r) => r.headers.location)).size).toBe(1);
        const list = (
          await inject(`/api/v1/projects/${project.id}/runs`)
        ).json<RunList>();
        expect(list.items).toHaveLength(1);
        // The DB constraint backs the transaction: a duplicate key row is refused.
        const db = openDatabase(config.dataDir);
        try {
          expect(() =>
            db
              .prepare(
                `INSERT INTO runs (id, project_id, kind, status, state_version,
                source_json, source_strategy, config_json, idempotency_key,
                request_fingerprint, created_at, updated_at)
               SELECT ?, project_id, kind, 'failed', 1, source_json,
                 source_strategy, config_json, idempotency_key, 'x',
                 created_at, updated_at FROM runs`,
              )
              .run(randomUUID()),
          ).toThrow(/UNIQUE/);
        } finally {
          db.close();
        }
      });

      it('replays a key after the run ended and keeps answering the same run', async () => {
        const controlled = createControlledExecutor();
        const { inject } = setup({ executor: controlled.executor });
        const project = await createProject(inject);
        const key = newKey();
        const first = (await start(inject, project.id, key)).json<Run>();
        await waitForStatus(inject, first, 'running');
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        const done = await waitForStatus(inject, first, 'succeeded');
        const replay = await start(inject, project.id, key);
        expect(replay.statusCode).toBe(202);
        expect(replay.json()).toEqual(done);
      });

      it('B04-AC02: an old key with different input is 409 and adds no row', async () => {
        const { inject } = setup({
          executor: createControlledExecutor().executor,
        });
        const project = await createProject(inject);
        const key = newKey();
        expect((await start(inject, project.id, key)).statusCode).toBe(202);
        const conflict = await start(inject, project.id, key, {
          ...startBody,
          source: { strategy: 'current-source', expectedSourceRevision: 2 },
        });
        expect(conflict.statusCode).toBe(409);
        expect(conflict.json()).toMatchObject({
          error: { code: 'IDEMPOTENCY_KEY_CONFLICT' },
        });
        // Key order alone is not a different request.
        const reordered = await start(inject, project.id, key, {
          retryOfRunId: null,
          source: { expectedSourceRevision: 1, strategy: 'current-source' },
          kind: 'analyze',
        });
        expect(reordered.statusCode).toBe(202);
        expect(
          (await inject(`/api/v1/projects/${project.id}/runs`)).json<RunList>()
            .items,
        ).toHaveLength(1);
      });

      it('answers 409 RUN_ACTIVE_CONFLICT for a different key while a run is active, per project', async () => {
        const { inject } = setup({
          executor: createControlledExecutor().executor,
        });
        const project = await createProject(inject);
        const other = await createProject(inject, 'Other');
        expect((await start(inject, project.id, newKey())).statusCode).toBe(
          202,
        );
        const conflict = await start(inject, project.id, newKey());
        expect(conflict.statusCode).toBe(409);
        expect(conflict.json()).toMatchObject({
          error: { code: 'RUN_ACTIVE_CONFLICT' },
        });
        // Another project is not blocked from queueing.
        expect((await start(inject, other.id, newKey())).statusCode).toBe(202);
      });

      it('rejects invalid input before any write', async () => {
        const { inject } = setup({
          executor: createControlledExecutor().executor,
        });
        const project = await createProject(inject);
        const cases = [
          start(inject, project.id, 'short'),
          start(inject, project.id, 'bad key with spaces!!'),
          inject({
            method: 'POST',
            url: `/api/v1/projects/${project.id}/runs`,
            payload: startBody,
          }),
          start(inject, project.id, newKey(), { ...startBody, config: {} }),
          start(inject, project.id, newKey(), {
            ...startBody,
            kind: 'understand',
          }),
          start(inject, project.id, newKey(), {
            ...startBody,
            source: { strategy: 'reuse-snapshot' },
          }),
          start(inject, 'not-a-uuid', newKey()),
        ];
        for (const response of await Promise.all(cases)) {
          expect(response.statusCode).toBe(400);
          expect(response.json()).toMatchObject({
            error: { code: 'INVALID_INPUT' },
          });
        }
        expect(
          (await inject(`/api/v1/projects/${project.id}/runs`)).json<RunList>()
            .items,
        ).toHaveLength(0);
      });

      it('answers 404 for a missing project and for a run of another project', async () => {
        const { inject } = setup({
          executor: createControlledExecutor().executor,
        });
        const missing = await start(inject, randomUUID(), newKey());
        expect(missing.statusCode).toBe(404);
        expect(missing.json()).toMatchObject({
          error: { code: 'PROJECT_NOT_FOUND' },
        });
        const project = await createProject(inject);
        const other = await createProject(inject, 'Other');
        const run = (await start(inject, project.id, newKey())).json<Run>();
        for (const url of [
          `/api/v1/projects/${other.id}/runs/${run.id}`,
          `/api/v1/projects/${project.id}/runs/${randomUUID()}`,
        ]) {
          const response = await inject(url);
          expect(response.statusCode).toBe(404);
          expect(response.json()).toMatchObject({
            error: { code: 'RUN_NOT_FOUND' },
          });
        }
        const foreignCancel = await inject({
          method: 'POST',
          url: `/api/v1/projects/${other.id}/runs/${run.id}/cancel`,
          payload: { expectedStateVersion: 1 },
        });
        expect(foreignCancel.statusCode).toBe(404);
        const foreignRetry = await start(inject, other.id, newKey(), {
          ...startBody,
          retryOfRunId: run.id,
        });
        expect(foreignRetry.statusCode).toBe(404);
        expect(foreignRetry.json()).toMatchObject({
          error: { code: 'RUN_NOT_FOUND' },
        });
        for (const url of [
          `/api/v1/projects/${randomUUID()}/runs`,
          `/api/v1/projects/${randomUUID()}/runs/current`,
        ]) {
          expect((await inject(url)).statusCode).toBe(404);
        }
      });

      it('answers 409 SOURCE_REVISION_CONFLICT for another source revision', async () => {
        const { inject } = setup({
          executor: createControlledExecutor().executor,
        });
        const project = await createProject(inject);
        const response = await start(inject, project.id, newKey(), {
          ...startBody,
          source: { strategy: 'current-source', expectedSourceRevision: 2 },
        });
        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          error: { code: 'SOURCE_REVISION_CONFLICT' },
        });
      });

      it('retries as a new run, linked to the old one, reusing its snapshot only when it has one', async () => {
        const controlled = createControlledExecutor({ stopOnAbort: true });
        const { inject } = setup({ executor: controlled.executor });
        const project = await createProject(inject);
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        await waitForStatus(inject, queued, 'running');
        controlled.executions[0]?.finish({
          status: 'failed',
          errorCode: 'ANALYSIS_OUTPUT_INVALID',
        });
        const failed = await waitForStatus(inject, queued, 'failed');
        expect(failed.errorCode).toBe('ANALYSIS_OUTPUT_INVALID');
        const noSnapshot = await start(inject, project.id, newKey(), {
          kind: 'analyze',
          source: { strategy: 'reuse-snapshot' },
          retryOfRunId: failed.id,
        });
        expect(noSnapshot.statusCode).toBe(409);
        expect(noSnapshot.json()).toMatchObject({
          error: { code: 'SNAPSHOT_UNAVAILABLE' },
        });

        const retry = (
          await start(inject, project.id, newKey(), {
            ...startBody,
            retryOfRunId: failed.id,
          })
        ).json<Run>();
        expect(retry).toMatchObject({
          status: 'queued',
          retryOfRunId: failed.id,
          sourceStrategy: 'current-source',
        });
        expect(retry.id).not.toBe(failed.id);
        await waitForStatus(inject, retry, 'running');
        const snapshotId = randomUUID();
        controlled.executions[1]?.report({
          stage: 'inventory',
          sourceSnapshotId: snapshotId,
        });
        controlled.executions[1]?.finish({
          status: 'succeeded',
          sourceSnapshotId: snapshotId,
        });
        const succeeded = await waitForStatus(inject, retry, 'succeeded');
        expect(succeeded.sourceSnapshotId).toBe(snapshotId);

        const reuse = (
          await start(inject, project.id, newKey(), {
            kind: 'analyze',
            source: { strategy: 'reuse-snapshot' },
            retryOfRunId: succeeded.id,
          })
        ).json<Run>();
        expect(reuse).toMatchObject({
          status: 'queued',
          sourceStrategy: 'reuse-snapshot',
          retryOfRunId: succeeded.id,
          sourceSnapshotId: snapshotId,
        });
        // The old runs are untouched history.
        expect(await getRun(inject, failed)).toEqual(failed);
      });
    });

    describe('reads (B04)', () => {
      it('lists newest first with an opaque cursor and reports the current run', async () => {
        const controlled = createControlledExecutor({ stopOnAbort: true });
        const { inject } = setup({ executor: controlled.executor });
        const project = await createProject(inject);
        expect(
          (await inject(`/api/v1/projects/${project.id}/runs/current`)).json(),
        ).toEqual({ run: null });
        const created: Run[] = [];
        for (let index = 0; index < 3; index++) {
          const run = (await start(inject, project.id, newKey())).json<Run>();
          created.push(run);
          const running = await waitForStatus(inject, run, 'running');
          expect((await cancel(inject, running)).statusCode).toBe(202);
          await waitForStatus(inject, run, 'cancelled');
        }
        const first = (
          await inject(`/api/v1/projects/${project.id}/runs?limit=2`)
        ).json<RunList>();
        expect(first.items.map((run) => run.id)).toEqual([
          created[2]?.id,
          created[1]?.id,
        ]);
        expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
        const second = (
          await inject(
            `/api/v1/projects/${project.id}/runs?limit=2&cursor=${first.nextCursor}`,
          )
        ).json<RunList>();
        expect(second.items.map((run) => run.id)).toEqual([created[0]?.id]);
        expect(second.nextCursor).toBeNull();
        const current = (
          await inject(`/api/v1/projects/${project.id}/runs/current`)
        ).json<CurrentRunResponse>();
        expect(current.run?.id).toBe(created[2]?.id);
        // The active run wins over a newer terminal one.
        const active = (await start(inject, project.id, newKey())).json<Run>();
        expect(
          (
            await inject(`/api/v1/projects/${project.id}/runs/current`)
          ).json<CurrentRunResponse>().run?.id,
        ).toBe(active.id);
      });

      it.each([
        'limit=0',
        'limit=101',
        'cursor=%21%21',
        'cursor=bm90LWpzb24',
        'extra=1',
      ])('rejects invalid list query %s', async (query) => {
        const { inject } = setup({
          executor: createControlledExecutor().executor,
        });
        const project = await createProject(inject);
        const response = await inject(
          `/api/v1/projects/${project.id}/runs?${query}`,
        );
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          error: { code: 'INVALID_INPUT' },
        });
      });

      it('keeps history after reopening the app and does not start anything on reads', async () => {
        const controlled = createControlledExecutor({ stopOnAbort: true });
        const ctx = setup({ executor: controlled.executor });
        const project = await createProject(ctx.inject);
        const run = (await start(ctx.inject, project.id, newKey())).json<Run>();
        await waitForStatus(ctx.inject, run, 'running');
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        const done = await waitForStatus(ctx.inject, run, 'succeeded');
        await ctx.app.close();
        const reopened = buildApp(ctx.config, {
          jobs: { executor: controlled.executor },
        });
        try {
          const inject = createTrustedInject(reopened, ctx.config);
          expect(
            (
              await inject(`/api/v1/projects/${project.id}/runs/current`)
            ).json<CurrentRunResponse>().run,
          ).toEqual(done);
          expect(
            (
              await inject(`/api/v1/projects/${project.id}/runs`)
            ).json<RunList>().items,
          ).toEqual([done]);
          expect(controlled.executions).toHaveLength(1);
        } finally {
          await reopened.close();
        }
      });

      it('requires the local credential on every run route', async () => {
        const { app, config, inject } = setup({
          executor: createControlledExecutor().executor,
        });
        const project = await createProject(inject);
        for (const request of [
          {
            method: 'GET' as const,
            url: `/api/v1/projects/${project.id}/runs`,
          },
          {
            method: 'GET' as const,
            url: `/api/v1/projects/${project.id}/runs/current`,
          },
          { method: 'GET' as const, url: '/api/v1/runtime/status' },
          {
            method: 'POST' as const,
            url: `/api/v1/projects/${project.id}/runs`,
            headers: { 'idempotency-key': newKey() },
            payload: startBody,
          },
        ]) {
          const response = await app.inject({
            ...request,
            headers: { ...trustedHeaders(config), ...request.headers },
          });
          expect(response.statusCode).toBe(401);
        }
        expect(
          (await inject(`/api/v1/projects/${project.id}/runs`)).json<RunList>()
            .items,
        ).toHaveLength(0);
      });
    });

    describe('cancel (B04)', () => {
      it('cancels a queued run at once (200) and repeats idempotently', async () => {
        // Hold the slot with another project so the run stays queued.
        const controlled = createControlledExecutor();
        const { inject } = setup({ executor: controlled.executor });
        const busy = await createProject(inject, 'Busy');
        const project = await createProject(inject);
        const holder = (await start(inject, busy.id, newKey())).json<Run>();
        await waitForStatus(inject, holder, 'running');
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        const response = await cancel(inject, queued);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          status: 'cancelled',
          stateVersion: 2,
          startedAt: null,
        });
        const again = await cancel(inject, queued, 99);
        expect(again.statusCode).toBe(200);
        expect(again.json()).toEqual(response.json());
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        await waitForStatus(inject, holder, 'succeeded');
        // The cancelled run is never executed.
        expect(controlled.executions).toHaveLength(1);
      });

      it('cancels a running run through cancelling (202) to cancelled', async () => {
        const controlled = createControlledExecutor({ stopOnAbort: true });
        const { inject } = setup({ executor: controlled.executor });
        const project = await createProject(inject);
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        const running = await waitForStatus(inject, queued, 'running');
        const response = await cancel(inject, running);
        expect(response.statusCode).toBe(202);
        expect(response.json()).toMatchObject({
          status: 'cancelling',
          stateVersion: 3,
        });
        expect(controlled.executions[0]?.signal.aborted).toBe(true);
        const repeat = await cancel(inject, running);
        expect([200, 202]).toContain(repeat.statusCode);
        const cancelled = await waitForStatus(inject, queued, 'cancelled');
        expect(cancelled.stateVersion).toBe(4);
        expect(cancelled.startedAt).toBe(running.startedAt);
        // The slot is free again: a new run of the project can start.
        expect((await start(inject, project.id, newKey())).statusCode).toBe(
          202,
        );
      });

      it('B04-AC03: a stale version or a terminal run answers RUN_STATE_CONFLICT and stays unchanged', async () => {
        const controlled = createControlledExecutor();
        const { inject } = setup({ executor: controlled.executor });
        const project = await createProject(inject);
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        const running = await waitForStatus(inject, queued, 'running');
        const stale = await cancel(inject, running, 1);
        expect(stale.statusCode).toBe(409);
        expect(stale.json()).toMatchObject({
          error: { code: 'RUN_STATE_CONFLICT' },
        });
        expect(await getRun(inject, running)).toEqual(running);
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        const succeeded = await waitForStatus(inject, queued, 'succeeded');
        for (const version of [succeeded.stateVersion, running.stateVersion]) {
          const response = await cancel(inject, succeeded, version);
          expect(response.statusCode).toBe(409);
          expect(response.json()).toMatchObject({
            error: { code: 'RUN_STATE_CONFLICT' },
          });
        }
        expect(await getRun(inject, succeeded)).toEqual(succeeded);
      });
    });

    describe('dispatcher (B05)', () => {
      it('B05-AC01: two queued projects never execute at once and each run is claimed once', async () => {
        const controlled = createControlledExecutor();
        const { inject } = setup({ executor: controlled.executor });
        const a = await createProject(inject, 'A');
        const b = await createProject(inject, 'B');
        const runA = (await start(inject, a.id, newKey())).json<Run>();
        const runB = (await start(inject, b.id, newKey())).json<Run>();
        await waitForStatus(inject, runA, 'running');
        // B waits while A holds the only slot.
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect((await getRun(inject, runB)).status).toBe('queued');
        expect(controlled.executions).toHaveLength(1);
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        await waitForStatus(inject, runB, 'running');
        controlled.executions[1]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        await waitForStatus(inject, runB, 'succeeded');
        expect(controlled.maxConcurrent()).toBe(1);
        expect(controlled.executions.map((e) => e.run.id)).toEqual([
          runA.id,
          runB.id,
        ]);
      });

      it('records stage progress without bumping stateVersion', async () => {
        const controlled = createControlledExecutor();
        const { inject } = setup({ executor: controlled.executor });
        const project = await createProject(inject);
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        const running = await waitForStatus(inject, queued, 'running');
        const snapshotId = randomUUID();
        controlled.executions[0]?.report({
          stage: 'inventory',
          sourceSnapshotId: snapshotId,
        });
        expect(await getRun(inject, queued)).toMatchObject({
          stage: 'inventory',
          sourceSnapshotId: snapshotId,
          stateVersion: running.stateVersion,
        });
      });

      it('B05-AC02: a late completion after a committed cancel ends cancelled, never succeeded', async () => {
        // The executor ignores the abort and completes later.
        const controlled = createControlledExecutor();
        const { inject } = setup({ executor: controlled.executor });
        const project = await createProject(inject);
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        const running = await waitForStatus(inject, queued, 'running');
        const cancelling = (await cancel(inject, running)).json<Run>();
        expect(cancelling.status).toBe('cancelling');
        // Progress after the cancel is ignored.
        controlled.executions[0]?.report({ stage: 'publish' });
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        const cancelled = await waitForStatus(inject, queued, 'cancelled');
        expect([
          queued.stateVersion,
          running.stateVersion,
          cancelling.stateVersion,
          cancelled.stateVersion,
        ]).toEqual([1, 2, 3, 4]);
      });

      it.each([
        [
          'failed',
          { status: 'failed', errorCode: 'SOURCE_UNREADABLE' },
          'SOURCE_UNREADABLE',
        ],
        ['stopped', { status: 'stopped' }, 'INTERNAL_ERROR'],
      ] as const)(
        'records a %s execution as a failed run',
        async (_name, result, errorCode) => {
          const controlled = createControlledExecutor();
          const { inject } = setup({ executor: controlled.executor });
          const project = await createProject(inject);
          const queued = (
            await start(inject, project.id, newKey())
          ).json<Run>();
          await waitForStatus(inject, queued, 'running');
          controlled.executions[0]?.finish(result);
          expect(await waitForStatus(inject, queued, 'failed')).toMatchObject({
            errorCode,
            stage: 'snapshot',
          });
        },
      );

      it('records an executor exception as failed INTERNAL_ERROR and keeps dispatching', async () => {
        let calls = 0;
        const { inject } = setup({
          executor: {
            execute() {
              calls++;
              return calls === 1
                ? Promise.reject(new Error('C:/private/path broke'))
                : Promise.resolve({
                    status: 'succeeded',
                    sourceSnapshotId: randomUUID(),
                  });
            },
          },
        });
        const project = await createProject(inject);
        const first = (await start(inject, project.id, newKey())).json<Run>();
        expect(await waitForStatus(inject, first, 'failed')).toMatchObject({
          errorCode: 'INTERNAL_ERROR',
        });
        const second = (await start(inject, project.id, newKey())).json<Run>();
        await waitForStatus(inject, second, 'succeeded');
      });

      it('times out a run as failed/TIMEOUT once the execution stopped', async () => {
        const controlled = createControlledExecutor({ stopOnAbort: true });
        const { inject } = setup({
          executor: controlled.executor,
          limits: { timeoutMs: 30 },
        });
        const project = await createProject(inject);
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        expect(queued.config.limits.timeoutMs).toBe(30);
        const failed = await waitForStatus(inject, queued, 'failed');
        expect(failed).toMatchObject({ errorCode: 'TIMEOUT', stateVersion: 3 });
        expect(controlled.executions[0]?.signal.aborted).toBe(true);
      });

      it('a cancel during a timeout stop still ends cancelled', async () => {
        const controlled = createControlledExecutor();
        const { inject } = setup({
          executor: controlled.executor,
          limits: { timeoutMs: 20 },
          stopTimeoutMs: 2000,
        });
        const project = await createProject(inject);
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        await vi.waitFor(
          () => expect(controlled.executions[0]?.signal.aborted).toBe(true),
          { timeout: 8000 },
        );
        const running = await getRun(inject, queued);
        expect((await cancel(inject, running)).statusCode).toBe(202);
        controlled.executions[0]?.finish({ status: 'stopped' });
        await waitForStatus(inject, queued, 'cancelled');
      });

      it('an unconfirmed stop ends failed/STOP_UNCONFIRMED and blocks new runs with 503', async () => {
        // The execution never settles after the abort.
        const controlled = createControlledExecutor();
        const { inject } = setup({
          executor: controlled.executor,
          stopTimeoutMs: 30,
        });
        const project = await createProject(inject);
        const queued = (await start(inject, project.id, newKey())).json<Run>();
        const running = await waitForStatus(inject, queued, 'running');
        expect((await cancel(inject, running)).statusCode).toBe(202);
        const failed = await waitForStatus(inject, queued, 'failed');
        expect(failed.errorCode).toBe('STOP_UNCONFIRMED');
        expect(
          (await inject('/api/v1/runtime/status')).json<RuntimeStatus>(),
        ).toEqual({
          status: 'recovery_required',
          reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED',
        });
        const blocked = await start(inject, project.id, newKey());
        expect(blocked.statusCode).toBe(503);
        expect(blocked.json()).toMatchObject({
          error: { code: 'RUNTIME_RECOVERY_REQUIRED' },
        });
        // A late settle does not overwrite the terminal state.
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(await getRun(inject, queued)).toEqual(failed);
      });

      it('B05-AC03: a run persisted running before a crash is interrupted on restart and not retried', async () => {
        const controlled = createControlledExecutor();
        const ctx = setup({
          executor: controlled.executor,
          stopTimeoutMs: 20,
        });
        const project = await createProject(ctx.inject);
        const queued = (
          await start(ctx.inject, project.id, newKey())
        ).json<Run>();
        await waitForStatus(ctx.inject, queued, 'running');
        // Simulate a crash: another queued run and the running row stay as
        // they are in the DB, without the shutdown path.
        const db = openDatabase(ctx.config.dataDir);
        const other = await createProject(ctx.inject, 'Other');
        const waiting = (
          await start(ctx.inject, other.id, newKey())
        ).json<Run>();
        const crashedRows = db
          .prepare('SELECT id, status FROM runs ORDER BY created_at')
          .all();
        db.close();
        expect(crashedRows).toEqual([
          { id: queued.id, status: 'running' },
          { id: waiting.id, status: 'queued' },
        ]);
        const restarted = createControlledExecutor({ stopOnAbort: true });
        // A second app on the same data dir stands for the restarted process.
        const reopened = buildApp(ctx.config, {
          jobs: { executor: restarted.executor },
        });
        try {
          const inject = createTrustedInject(reopened, ctx.config);
          const interrupted = await getRun(inject, queued);
          expect(interrupted).toMatchObject({
            status: 'interrupted',
            stateVersion: 3,
            stage: 'snapshot',
          });
          expect(interrupted.finishedAt).not.toBeNull();
          // The queue continues with the other project's run only.
          await waitForStatus(inject, waiting, 'running');
          expect(restarted.executions.map((e) => e.run.id)).toEqual([
            waiting.id,
          ]);
        } finally {
          await reopened.close();
        }
      });

      it('shutdown stops dispatching and records the executing run interrupted', async () => {
        const controlled = createControlledExecutor({ stopOnAbort: true });
        const ctx = setup({ executor: controlled.executor });
        const project = await createProject(ctx.inject);
        const queued = (
          await start(ctx.inject, project.id, newKey())
        ).json<Run>();
        await waitForStatus(ctx.inject, queued, 'running');
        await ctx.app.close();
        expect(controlled.executions[0]?.signal.aborted).toBe(true);
        const db = openDatabase(ctx.config.dataDir);
        try {
          expect(
            db.prepare('SELECT status FROM runs WHERE id = ?').get(queued.id),
          ).toEqual({ status: 'interrupted' });
        } finally {
          db.close();
        }
      });
    });
  },
);
