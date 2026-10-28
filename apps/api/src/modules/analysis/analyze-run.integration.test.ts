import { createHash, randomUUID } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  ArtifactListSchema,
  SourceInventoryArtifactSchema,
  type ArtifactList,
  type Project,
  type Run,
  type SourceInventoryArtifact,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilesystemArtifactStore } from '../../adapters/local/filesystem-artifact.store.js';
import type { SourceRunHooks } from '../../adapters/local/source-run.executor.js';
import { buildApp } from '../../app.js';
import type { JobOptions } from '../../composition.js';
import { loadConfig } from '../../config.js';
import type { ArtifactStore } from '../../ports/artifact-store.js';
import { createTrustedInject } from '../../testing/test-app.js';
import { buildSourceInventory } from './source-inventory.js';
import { findSourceProfile } from './source-profiles.js';
import { createTableNameMapping } from './table-names.js';

// B08: a local run turns its snapshot into a published inventory through the
// analyzer library, over HTTP -> service -> SQLite -> filesystem.

type Inject = ReturnType<typeof createTrustedInject>;

const FIXTURE_ROOT = fileURLToPath(
  new URL('../../../../../tests/fixtures/vb6-sample/', import.meta.url),
);

function readTree(root: string) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolute = join(entry.parentPath, entry.name);
      return {
        relativePath: relative(root, absolute).split(sep).join('/'),
        bytes: readFileSync(absolute),
      };
    })
    .sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
}

function treeHash(root: string): string {
  const hash = createHash('sha256');
  for (const file of readTree(root))
    hash.update(file.relativePath).update('\0').update(file.bytes);
  return hash.digest('hex');
}

describe(
  'Analyze run inventory HTTP -> service -> SQLite (B08)',
  { timeout: 30_000 },
  () => {
    let base: string;
    let dataDir: string;
    let source: string;
    let apps: ReturnType<typeof buildApp>[] = [];

    beforeEach(() => {
      base = realpathSync.native(
        mkdtempSync(join(tmpdir(), 'portal-analyze-it-')),
      );
      dataDir = join(base, 'data');
      source = join(base, 'order-system');
      mkdirSync(dataDir);
      cpSync(FIXTURE_ROOT, source, { recursive: true });
      rmSync(join(source, 'README.md'));
    });
    afterEach(async () => {
      await closeAll();
      rmSync(base, { recursive: true, force: true });
    });

    async function open(jobs: JobOptions = {}): Promise<{ inject: Inject }> {
      const config = loadConfig({
        PORTAL_DATA_DIR: dataDir,
        PORTAL_LOG_LEVEL: 'silent',
      });
      const app = buildApp(config, { jobs: { stopTimeoutMs: 2000, ...jobs } });
      apps.push(app);
      await app.ready();
      return { inject: createTrustedInject(app, config) };
    }

    async function closeAll() {
      for (const app of apps) await app.close();
      apps = [];
    }

    async function registeredProject(
      inject: Inject,
      tableNameMapping: object = {
        defaultSchema: 'APP',
        status: 'assumed',
      },
    ): Promise<Project> {
      const created = await inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: 'Order system', mode: 'local' },
      });
      expect(created.statusCode).toBe(201);
      const project = created.json<Project>();
      const put = await inject({
        method: 'PUT',
        url: `/api/v1/projects/${project.id}/source`,
        payload: {
          rootPath: source,
          profileId: 'vb6-cp932-v1',
          tableNameMapping,
          expectedSourceRevision: null,
        },
      });
      expect(put.statusCode).toBe(200);
      return project;
    }

    function start(inject: Inject, projectId: string, body?: object) {
      return inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/runs`,
        headers: { 'idempotency-key': `key-${randomUUID()}` },
        payload: body ?? {
          kind: 'analyze',
          source: { strategy: 'current-source', expectedSourceRevision: 1 },
          retryOfRunId: null,
        },
      });
    }

    async function getRun(inject: Inject, run: Run): Promise<Run> {
      const response = await inject(
        `/api/v1/projects/${run.projectId}/runs/${run.id}`,
      );
      return response.json<Run>();
    }

    async function finished(inject: Inject, run: Run): Promise<Run> {
      return vi.waitFor(
        async () => {
          const current = await getRun(inject, run);
          expect(['succeeded', 'failed', 'cancelled']).toContain(
            current.status,
          );
          return current;
        },
        { timeout: 15_000, interval: 20 },
      );
    }

    async function startAndFinish(inject: Inject, projectId: string) {
      const accepted = await start(inject, projectId);
      expect(accepted.statusCode).toBe(202);
      return finished(inject, accepted.json<Run>());
    }

    async function artifacts(inject: Inject, run: Run): Promise<ArtifactList> {
      const response = await inject(
        `/api/v1/projects/${run.projectId}/runs/${run.id}/artifacts`,
      );
      expect(response.statusCode).toBe(200);
      const json: unknown = response.json();
      expect(Check(ArtifactListSchema, json)).toBe(true);
      return response.json<ArtifactList>();
    }

    async function inventoryOf(
      inject: Inject,
      run: Run,
    ): Promise<SourceInventoryArtifact> {
      const [ref] = (await artifacts(inject, run)).items;
      expect(ref).toBeDefined();
      const response = await inject(
        `/api/v1/projects/${run.projectId}/artifacts/${ref?.id}/versions/${ref?.version}`,
      );
      expect(response.statusCode).toBe(200);
      const json: unknown = response.json();
      expect(Check(SourceInventoryArtifactSchema, json)).toBe(true);
      return response.json<SourceInventoryArtifact>();
    }

    function artifactRows(): number {
      const db = new Database(join(dataDir, 'portal.db'), { readonly: true });
      try {
        const row = db.prepare('SELECT COUNT(*) AS n FROM artifacts').get() as {
          n: number;
        };
        return row.n;
      } finally {
        db.close();
      }
    }

    it('B08-AC01 publishes a schema-valid inventory with snapshot/config/versions and reopens the same hash', async () => {
      const before = treeHash(source);
      const { inject } = await open();
      const project = await registeredProject(inject);
      const run = await startAndFinish(inject, project.id);
      expect(run).toMatchObject({ status: 'succeeded', errorCode: null });

      const artifact = await inventoryOf(inject, run);
      const manifest = JSON.parse(
        readFileSync(
          join(
            dataDir,
            'snapshots',
            run.sourceSnapshotId ?? '',
            'manifest.json',
          ),
          'utf8',
        ),
      ) as { snapshotHash: string; skipped: { relativePath: string }[] };
      expect(artifact).toMatchObject({
        kind: 'source-inventory',
        mode: 'local',
        version: 1,
        runId: run.id,
        sourceSnapshotId: run.sourceSnapshotId,
        sourceSnapshotHash: manifest.snapshotHash,
      });
      const { payload } = artifact;
      // The versions the run locked at admission are the ones that counted.
      expect(payload).toMatchObject({
        profileId: run.config.profileId,
        metricVersion: run.config.analyzer.metricVersion,
        decoderVersion: run.config.analyzer.decoderVersion,
        normalizationVersion: run.config.analyzer.normalizationVersion,
        sqlAccessVersion: run.config.analyzer.sqlAccessVersion,
        callGraphVersion: run.config.analyzer.callGraphVersion,
        complexityVersion: run.config.analyzer.complexityVersion,
        tableNames: {
          version: run.config.analyzer.tableNameVersion,
          defaultSchema: 'APP',
          status: 'assumed',
        },
      });
      // BUILD.LOG is not a source type: not copied, not a coverage gap.
      expect(manifest.skipped.map((entry) => entry.relativePath)).toEqual([
        'programs/SAMPLE/BUILD.LOG',
      ]);
      expect(payload.skipped).toEqual([]);

      // Parity: the library over the same source gives the same program
      // numbers; only the excluded file the snapshot never copied differs.
      const profile = findSourceProfile('vb6-cp932-v1');
      if (!profile) throw new Error('profile missing');
      const tableNames = createTableNameMapping('APP');
      if (!tableNames) throw new Error('mapping missing');
      const direct = buildSourceInventory({
        profile,
        files: readTree(source),
        tableNames,
      });
      expect(payload.programs).toEqual(direct.programs);
      expect(payload.totals.uniqueCounters).toEqual(
        direct.totals.uniqueCounters,
      );
      expect(payload.totals.files).toBe(direct.totals.files - 1);
      expect(payload.files).toEqual(
        direct.files.filter(
          (file) => file.manifest.relativePath !== 'programs/SAMPLE/BUILD.LOG',
        ),
      );
      expect(treeHash(source)).toBe(before);

      // Restart: the same version reads back with the same bytes.
      await closeAll();
      const reopened = await open();
      const again = await inventoryOf(reopened.inject, run);
      expect(again.sha256).toBe(artifact.sha256);
      expect(again).toEqual(artifact);
    });

    it('reproduces the inventory from the recorded snapshot without the source', async () => {
      const { inject } = await open();
      const project = await registeredProject(inject);
      const first = await startAndFinish(inject, project.id);
      const original = await inventoryOf(inject, first);
      rmSync(source, { recursive: true });

      const accepted = await start(inject, project.id, {
        kind: 'analyze',
        source: { strategy: 'reuse-snapshot' },
        retryOfRunId: first.id,
      });
      expect(accepted.statusCode).toBe(202);
      const retry = await finished(inject, accepted.json<Run>());
      expect(retry).toMatchObject({
        status: 'succeeded',
        sourceSnapshotId: first.sourceSnapshotId,
      });
      const reproduced = await inventoryOf(inject, retry);
      expect(reproduced.id).not.toBe(original.id);
      expect(reproduced.sourceSnapshotHash).toBe(original.sourceSnapshotHash);
      expect(reproduced.payload).toEqual(original.payload);
      expect(reproduced.sha256).toBe(original.sha256);
    });

    it('B08-AC02 keeps missing members incomplete and skipped files as coverage warnings', async () => {
      // MISSING.BAS is declared by the project but absent; BIG.BAS exceeds
      // the run's file size limit and is listed, never read.
      writeFileSync(
        join(source, 'programs', 'SAMPLE', 'BIG.BAS'),
        `Attribute VB_Name = "Big"\r\n${"' padding\r\n".repeat(400)}`,
      );
      const { inject } = await open({ limits: { maxFileBytes: 2048 } });
      const project = await registeredProject(inject, {
        defaultSchema: null,
        status: 'unconfigured',
      });
      const run = await startAndFinish(inject, project.id);
      expect(run.status).toBe('succeeded');
      const { payload } = await inventoryOf(inject, run);
      const [program] = payload.programs;
      expect(program?.complete).toBe(false);
      expect(
        program?.members.find(
          (member) => member.declaredPath === 'MISSING.BAS',
        ),
      ).toMatchObject({ resolution: 'missing', relativePath: null });
      expect(payload.skipped).toEqual([
        { relativePath: 'programs/SAMPLE/BIG.BAS', reason: 'too-large' },
      ]);
      expect(payload.tableNames).toMatchObject({
        defaultSchema: null,
        status: 'unconfigured',
      });
    });

    it('B08-AC03 publishes nothing when a cancel wins before the publish', async () => {
      const hooks: SourceRunHooks = {};
      const { inject } = await open({ sourceRunHooks: hooks });
      const project = await registeredProject(inject);
      hooks.beforePublish = async () => {
        const current = await getRun(inject, running);
        const cancel = await inject({
          method: 'POST',
          url: `/api/v1/projects/${project.id}/runs/${running.id}/cancel`,
          payload: { expectedStateVersion: current.stateVersion },
        });
        expect(cancel.statusCode).toBe(202);
      };
      const accepted = await start(inject, project.id);
      const running = accepted.json<Run>();
      const run = await finished(inject, running);
      expect(run.status).toBe('cancelled');
      expect((await artifacts(inject, run)).items).toEqual([]);
      await closeAll();
      expect(artifactRows()).toBe(0);
    });

    it('B08-AC03 isolates an inventory whose publish finished after the cancel', async () => {
      const store = createFilesystemArtifactStore({
        artifactsDir: join(dataDir, 'artifacts'),
      });
      const late: { cancel?: () => Promise<void> } = {};
      const slowStore: ArtifactStore = {
        ...store,
        async publish(id, version, bytes) {
          // The cancel lands while the bytes are being written: the
          // executor's completion arrives after it.
          await late.cancel?.();
          return store.publish(id, version, bytes);
        },
      };
      const { inject } = await open({ artifactStore: slowStore });
      const project = await registeredProject(inject);
      const accepted = await start(inject, project.id);
      const running = accepted.json<Run>();
      late.cancel = async () => {
        const current = await getRun(inject, running);
        await inject({
          method: 'POST',
          url: `/api/v1/projects/${project.id}/runs/${running.id}/cancel`,
          payload: { expectedStateVersion: current.stateVersion },
        });
      };
      const run = await finished(inject, running);
      expect(run.status).toBe('cancelled');
      expect((await artifacts(inject, run)).items).toEqual([]);
      await closeAll();
      // The row exists but its run never succeeded: not readable.
      const db = new Database(join(dataDir, 'portal.db'), { readonly: true });
      const row = db
        .prepare('SELECT id, version FROM artifacts WHERE run_id = ?')
        .get(run.id) as { id: string; version: number } | undefined;
      db.close();
      expect(row).toBeDefined();
      const reopened = await open();
      const response = await reopened.inject(
        `/api/v1/projects/${project.id}/artifacts/${row?.id}/versions/${row?.version}`,
      );
      expect(response.statusCode).toBe(404);
      expect(response.json<{ error: { code: string } }>().error.code).toBe(
        'ARTIFACT_NOT_FOUND',
      );
    });

    it('B08-AC03 stops reading the snapshot on cancel and keeps the runtime ready', async () => {
      // Enough files that reading the snapshot back outlasts the stop
      // deadline unless the read loop honours the cancel.
      const many = join(source, 'many');
      mkdirSync(many);
      for (let i = 0; i < 600; i++)
        writeFileSync(
          join(many, `M${i}.BAS`),
          `Attribute VB_Name = "M${i}"\r\n`,
        );
      const hooks: SourceRunHooks = {};
      const { inject } = await open({
        stopTimeoutMs: 300,
        sourceRunHooks: hooks,
      });
      const project = await registeredProject(inject);
      let cancelled: Promise<unknown> | undefined;
      hooks.beforeReadFiles = () => {
        delete hooks.beforeReadFiles;
        // Not awaited: the cancel lands while the files are being read.
        cancelled = (async () => {
          const current = await getRun(inject, running);
          return inject({
            method: 'POST',
            url: `/api/v1/projects/${project.id}/runs/${running.id}/cancel`,
            payload: { expectedStateVersion: current.stateVersion },
          });
        })();
      };
      const running = (await start(inject, project.id)).json<Run>();
      const run = await finished(inject, running);
      await cancelled;
      expect(run).toMatchObject({ status: 'cancelled', errorCode: null });
      const runtime = await inject('/api/v1/runtime/status');
      expect(runtime.json()).toEqual({ status: 'ready', reasonCode: null });
      const next = await startAndFinish(inject, project.id);
      expect(next.status).toBe('succeeded');
    });

    it('fails INTERNAL_ERROR without publishing when the stored snapshot bytes changed', async () => {
      const { inject } = await open();
      const project = await registeredProject(inject);
      const first = await startAndFinish(inject, project.id);
      writeFileSync(
        join(
          dataDir,
          'snapshots',
          first.sourceSnapshotId ?? '',
          'raw',
          'cmn',
          'COMMON.BAS',
        ),
        'tampered',
      );
      const retry = await finished(
        inject,
        (
          await start(inject, project.id, {
            kind: 'analyze',
            source: { strategy: 'reuse-snapshot' },
            retryOfRunId: first.id,
          })
        ).json<Run>(),
      );
      expect(retry).toMatchObject({
        status: 'failed',
        errorCode: 'INTERNAL_ERROR',
      });
      expect((await artifacts(inject, retry)).items).toEqual([]);
    });
  },
);
