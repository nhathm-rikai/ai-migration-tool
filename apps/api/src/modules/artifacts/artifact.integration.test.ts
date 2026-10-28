import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ArtifactListSchema,
  SourceInventoryArtifactSchema,
  type ArtifactList,
  type ErrorResponse,
  type Project,
  type Run,
  type SourceInventoryArtifact,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { createFilesystemArtifactStore } from '../../adapters/local/filesystem-artifact.store.js';
import {
  DEMO_SNAPSHOT_HASH,
  demoInventory,
} from '../../adapters/fake/demo-inventory.js';
import type { JobOptions } from '../../composition.js';
import type { ArtifactStore } from '../../ports/artifact-store.js';
import { createControlledExecutor } from '../../testing/controlled-executor.js';
import { createTestApp, createTrustedInject } from '../../testing/test-app.js';

type Inject = ReturnType<typeof createTestApp>['inject'];

const startBody = {
  kind: 'analyze',
  source: { strategy: 'current-source', expectedSourceRevision: 1 },
  retryOfRunId: null,
} as const;

async function createProject(inject: Inject, name: string): Promise<Project> {
  const response = await inject({
    method: 'POST',
    url: '/api/v1/projects',
    payload: { name, fixtureId: 'sample-vb6' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Project>();
}

async function start(inject: Inject, projectId: string): Promise<Run> {
  const response = await inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/runs`,
    headers: { 'idempotency-key': `key-${randomUUID()}` },
    payload: startBody,
  });
  expect(response.statusCode).toBe(202);
  return response.json<Run>();
}

function waitForStatus(inject: Inject, run: Run, status: Run['status']) {
  return vi.waitFor(
    async () => {
      const current = (
        await inject(`/api/v1/projects/${run.projectId}/runs/${run.id}`)
      ).json<Run>();
      expect(current.status).toBe(status);
      return current;
    },
    { timeout: 8000, interval: 10 },
  );
}

const listUrl = (run: Run) =>
  `/api/v1/projects/${run.projectId}/runs/${run.id}/artifacts`;
const versionUrl = (projectId: string, id: string, version: number | string) =>
  `/api/v1/projects/${projectId}/artifacts/${id}/versions/${version}`;

// A store that records what it was asked to publish and can fail on demand.
function recordingStore(
  inner: ArtifactStore,
  options: { failPublish?: boolean; beforeReturn?: () => Promise<void> } = {},
) {
  const published: { id: string; version: number }[] = [];
  const store: ArtifactStore = {
    ...inner,
    async publish(id, version, bytes) {
      if (options.failPublish) throw new Error('disk full');
      const stored = await inner.publish(id, version, bytes);
      published.push({ id, version });
      await options.beforeReturn?.();
      return stored;
    },
  };
  return { store, published };
}

describe(
  'Artifacts HTTP -> service -> store/SQLite (B07)',
  { timeout: 20_000 },
  () => {
    let context: ReturnType<typeof createTestApp> | undefined;
    function setup(jobs: JobOptions = {}) {
      context = createTestApp({}, { jobs: { stopTimeoutMs: 100, ...jobs } });
      return context;
    }
    afterEach(async () => {
      await context?.cleanup();
      context = undefined;
    });

    async function finishRun(
      ctx: ReturnType<typeof setup>,
      controlled: ReturnType<typeof createControlledExecutor>,
    ) {
      const project = await createProject(ctx.inject, 'Demo');
      const run = await start(ctx.inject, project.id);
      await waitForStatus(ctx.inject, run, 'running');
      const snapshotId = randomUUID();
      controlled.executions.at(-1)?.finish({
        status: 'succeeded',
        sourceSnapshotId: snapshotId,
      });
      const done = await waitForStatus(ctx.inject, run, 'succeeded');
      return { project, run: done, snapshotId };
    }

    it('publishes the demo inventory once a demo run succeeds and serves the exact version', async () => {
      const controlled = createControlledExecutor();
      const ctx = setup({ fixtureExecutor: controlled.executor });
      const project = await createProject(ctx.inject, 'Demo');
      const run = await start(ctx.inject, project.id);
      await waitForStatus(ctx.inject, run, 'running');
      // Not finished: nothing is listed yet.
      const pending = await ctx.inject(listUrl(run));
      expect(pending.statusCode).toBe(200);
      expect(pending.json<ArtifactList>()).toEqual({ items: [] });

      const snapshotId = randomUUID();
      controlled.executions[0]?.finish({
        status: 'succeeded',
        sourceSnapshotId: snapshotId,
      });
      const done = await waitForStatus(ctx.inject, run, 'succeeded');
      const list = (await ctx.inject(listUrl(done))).json<ArtifactList>();
      expect(Check(ArtifactListSchema, list)).toBe(true);
      expect(list.items).toHaveLength(1);
      const ref = list.items[0];
      expect(ref).toMatchObject({
        version: 1,
        kind: 'source-inventory',
        schemaVersion: 'source-inventory-v1',
        projectId: project.id,
        runId: run.id,
        sourceSnapshotId: snapshotId,
        sourceSnapshotHash: DEMO_SNAPSHOT_HASH,
        mode: 'demo',
      });
      if (!ref) throw new Error('missing ref');

      const response = await ctx.inject(versionUrl(project.id, ref.id, 1));
      expect(response.statusCode).toBe(200);
      const artifact = response.json<SourceInventoryArtifact>();
      expect(Check(SourceInventoryArtifactSchema, artifact)).toBe(true);
      expect(artifact.payload).toEqual(demoInventory);
      const bytes = Buffer.from(JSON.stringify(demoInventory), 'utf8');
      expect(artifact.sha256).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
      expect(artifact.byteLength).toBe(bytes.byteLength);
      // Staging is empty once published.
      expect(
        readdirSync(join(ctx.config.dataDir, 'artifacts', '.staging')),
      ).toEqual([]);
    });

    it('rejects a foreign project, an unknown version and a non-numeric version without leaking content', async () => {
      const controlled = createControlledExecutor();
      const ctx = setup({ fixtureExecutor: controlled.executor });
      const { project, run } = await finishRun(ctx, controlled);
      const ref = (await ctx.inject(listUrl(run))).json<ArtifactList>()
        .items[0];
      if (!ref) throw new Error('missing ref');
      const other = await createProject(ctx.inject, 'Other');

      const foreign = await ctx.inject(versionUrl(other.id, ref.id, 1));
      expect(foreign.statusCode).toBe(404);
      expect(foreign.json<ErrorResponse>().error.code).toBe(
        'ARTIFACT_NOT_FOUND',
      );
      expect(foreign.body).not.toContain('ORDER');
      const foreignRun = await ctx.inject(
        `/api/v1/projects/${other.id}/runs/${run.id}/artifacts`,
      );
      expect(foreignRun.statusCode).toBe(404);
      expect(foreignRun.json<ErrorResponse>().error.code).toBe('RUN_NOT_FOUND');

      const missing = await ctx.inject(versionUrl(project.id, ref.id, 2));
      expect(missing.json<ErrorResponse>().error.code).toBe(
        'ARTIFACT_NOT_FOUND',
      );
      for (const version of ['latest', '0', '01']) {
        const invalid = await ctx.inject(
          versionUrl(project.id, ref.id, version),
        );
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json<ErrorResponse>().error.code).toBe('INVALID_INPUT');
      }
      const unknownProject = await ctx.inject(
        versionUrl(randomUUID(), ref.id, 1),
      );
      expect(unknownProject.json<ErrorResponse>().error.code).toBe(
        'PROJECT_NOT_FOUND',
      );
    });

    it('reads the same version, hash and payload after a restart', async () => {
      const controlled = createControlledExecutor();
      const ctx = setup({ fixtureExecutor: controlled.executor });
      const { project, run } = await finishRun(ctx, controlled);
      const ref = (await ctx.inject(listUrl(run))).json<ArtifactList>()
        .items[0];
      if (!ref) throw new Error('missing ref');
      const before = (
        await ctx.inject(versionUrl(project.id, ref.id, 1))
      ).json<SourceInventoryArtifact>();
      await ctx.app.close();
      const reopened = buildApp(ctx.config, {
        jobs: { fixtureExecutor: controlled.executor },
      });
      try {
        const inject = createTrustedInject(reopened, ctx.config);
        expect((await inject(listUrl(run))).json<ArtifactList>().items).toEqual(
          [ref],
        );
        const after = await inject(versionUrl(project.id, ref.id, 1));
        expect(after.statusCode).toBe(200);
        expect(after.json<SourceInventoryArtifact>()).toEqual(before);
      } finally {
        await reopened.close();
      }
    });

    it('fails the run with ARTIFACT_WRITE_FAILED and lists nothing when the payload write fails', async () => {
      const controlled = createControlledExecutor();
      const ctx = setup({ fixtureExecutor: controlled.executor });
      // Replace the store only after setup knows the data directory.
      await ctx.app.close();
      const { store } = recordingStore(
        createFilesystemArtifactStore({
          artifactsDir: join(ctx.config.dataDir, 'artifacts'),
        }),
        { failPublish: true },
      );
      const failing = buildApp(ctx.config, {
        jobs: { fixtureExecutor: controlled.executor, artifactStore: store },
      });
      try {
        const inject = createTrustedInject(failing, ctx.config);
        const project = await createProject(inject, 'Demo');
        const run = await start(inject, project.id);
        await waitForStatus(inject, run, 'running');
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        const done = await waitForStatus(inject, run, 'failed');
        expect(done.errorCode).toBe('ARTIFACT_WRITE_FAILED');
        expect((await inject(listUrl(done))).json<ArtifactList>()).toEqual({
          items: [],
        });
      } finally {
        await failing.close();
      }
    });

    it('fails the run and publishes nothing when the rename into place fails', async () => {
      const controlled = createControlledExecutor();
      const ctx = setup({ fixtureExecutor: controlled.executor });
      await ctx.app.close();
      const artifactsDir = join(ctx.config.dataDir, 'artifacts');
      const store = createFilesystemArtifactStore({
        artifactsDir,
        beforePublish: () => Promise.reject(new Error('rename failed')),
      });
      const failing = buildApp(ctx.config, {
        jobs: { fixtureExecutor: controlled.executor, artifactStore: store },
      });
      try {
        const inject = createTrustedInject(failing, ctx.config);
        const project = await createProject(inject, 'Demo');
        const run = await start(inject, project.id);
        await waitForStatus(inject, run, 'running');
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        const done = await waitForStatus(inject, run, 'failed');
        expect(done.errorCode).toBe('ARTIFACT_WRITE_FAILED');
        expect(
          (await inject(listUrl(done))).json<ArtifactList>().items,
        ).toEqual([]);
        // Neither a published directory nor a staging copy is left.
        expect(readdirSync(artifactsDir)).toEqual(['.staging']);
        expect(readdirSync(join(artifactsDir, '.staging'))).toEqual([]);
      } finally {
        await failing.close();
      }
    });

    it('keeps an artifact isolated when cancel wins after the payload was published', async () => {
      const controlled = createControlledExecutor();
      const ctx = setup({ fixtureExecutor: controlled.executor });
      await ctx.app.close();
      let releasePublish: () => void = () => undefined;
      const { store, published } = recordingStore(
        createFilesystemArtifactStore({
          artifactsDir: join(ctx.config.dataDir, 'artifacts'),
        }),
        {
          beforeReturn: () =>
            new Promise<void>((resolve) => {
              releasePublish = resolve;
            }),
        },
      );
      const app = buildApp(ctx.config, {
        jobs: {
          fixtureExecutor: controlled.executor,
          artifactStore: store,
          stopTimeoutMs: 2000,
        },
      });
      try {
        const inject = createTrustedInject(app, ctx.config);
        const project = await createProject(inject, 'Demo');
        const run = await start(inject, project.id);
        const running = await waitForStatus(inject, run, 'running');
        controlled.executions[0]?.finish({
          status: 'succeeded',
          sourceSnapshotId: randomUUID(),
        });
        await vi.waitFor(() => expect(published).toHaveLength(1));
        const cancel = await inject({
          method: 'POST',
          url: `/api/v1/projects/${project.id}/runs/${run.id}/cancel`,
          payload: { expectedStateVersion: running.stateVersion },
        });
        expect(cancel.statusCode).toBe(202);
        releasePublish();
        const done = await waitForStatus(inject, run, 'cancelled');
        expect(
          (await inject(listUrl(done))).json<ArtifactList>().items,
        ).toEqual([]);
        const hidden = published[0];
        if (!hidden) throw new Error('missing publish');
        const response = await inject(versionUrl(project.id, hidden.id, 1));
        expect(response.statusCode).toBe(404);
        expect(response.json<ErrorResponse>().error.code).toBe(
          'ARTIFACT_NOT_FOUND',
        );
      } finally {
        await app.close();
      }
    });

    it('never serves an unrecorded (orphan) payload directory', async () => {
      const ctx = setup();
      const store = createFilesystemArtifactStore({
        artifactsDir: join(ctx.config.dataDir, 'artifacts'),
      });
      const orphanId = randomUUID();
      await store.publish(orphanId, 1, Buffer.from('{}'));
      const project = await createProject(ctx.inject, 'Demo');
      const response = await ctx.inject(versionUrl(project.id, orphanId, 1));
      expect(response.statusCode).toBe(404);
      expect(response.json<ErrorResponse>().error.code).toBe(
        'ARTIFACT_NOT_FOUND',
      );
    });

    it('answers 500 without content when the stored bytes no longer match the recorded hash', async () => {
      const controlled = createControlledExecutor();
      const fresh = setup({ fixtureExecutor: controlled.executor });
      const { project, run } = await finishRun(fresh, controlled);
      const ref = (await fresh.inject(listUrl(run))).json<ArtifactList>()
        .items[0];
      if (!ref) throw new Error('missing ref');
      writeFileSync(
        join(fresh.config.dataDir, 'artifacts', `${ref.id}-v1`, 'payload.json'),
        '{"tampered":true}',
      );
      const response = await fresh.inject(versionUrl(project.id, ref.id, 1));
      expect(response.statusCode).toBe(500);
      expect(response.json<ErrorResponse>().error.code).toBe('INTERNAL_ERROR');
      expect(response.body).not.toContain('tampered');
    });

    it('requires the local credential on artifact routes', async () => {
      const ctx = setup();
      const project = await createProject(ctx.inject, 'Demo');
      const response = await ctx.app.inject({
        url: versionUrl(project.id, randomUUID(), 1),
        headers: {
          host: `127.0.0.1:${ctx.config.port}`,
          origin: `http://127.0.0.1:${ctx.config.port}`,
        },
      });
      expect(response.statusCode).toBe(401);
    });
  },
);
