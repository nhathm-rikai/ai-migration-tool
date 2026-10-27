import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  ProjectSourceResponseSchema,
  type Project,
  type ProjectSourceResponse,
  type PutProjectSourceInput,
  type Run,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../config.js';
import { APPLICATION_ROOT } from '../../platform/data-directory.js';
import { createTrustedInject } from '../../testing/test-app.js';

type Inject = ReturnType<typeof createTrustedInject>;

function linkDirectory(target: string, path: string): void {
  symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
}

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);

const body = (
  rootPath: string,
  expectedSourceRevision: number | null = null,
): PutProjectSourceInput => ({
  rootPath,
  profileId: 'vb6-cp932-v1',
  tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
  expectedSourceRevision,
});

describe(
  'Source registration and snapshot HTTP -> service -> SQLite (B03, B06)',
  { timeout: 20_000 },
  () => {
    let base: string;
    let dataDir: string;
    let sourceA: string;
    let sourceB: string;
    let apps: ReturnType<typeof buildApp>[] = [];

    beforeEach(() => {
      base = realpathSync.native(
        mkdtempSync(join(tmpdir(), 'portal-source-it-')),
      );
      dataDir = join(base, 'data');
      sourceA = join(base, 'order-module');
      sourceB = join(base, 'billing-module');
      mkdirSync(dataDir);
      mkdirSync(sourceA);
      mkdirSync(sourceB);
      writeFileSync(
        join(sourceA, 'ORDER.BAS'),
        'Attribute VB_Name = "ORDER"\r\n',
      );
      writeFileSync(
        join(sourceB, 'BILL.BAS'),
        'Attribute VB_Name = "BILL"\r\n',
      );
    });
    afterEach(async () => {
      for (const app of apps) await app.close();
      apps = [];
      rmSync(base, { recursive: true, force: true });
    });

    async function open(): Promise<{ inject: Inject }> {
      const config = loadConfig({
        PORTAL_DATA_DIR: dataDir,
        PORTAL_LOG_LEVEL: 'silent',
      });
      const app = buildApp(config, { jobs: { stopTimeoutMs: 100 } });
      apps.push(app);
      await app.ready();
      return { inject: createTrustedInject(app, config) };
    }

    async function closeAll() {
      for (const app of apps) await app.close();
      apps = [];
    }

    async function createProject(
      inject: Inject,
      payload: object = { name: 'Local', mode: 'local' },
    ): Promise<Project> {
      const response = await inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload,
      });
      expect(response.statusCode).toBe(201);
      return response.json<Project>();
    }

    const put = (inject: Inject, projectId: string, payload: unknown) =>
      inject({
        method: 'PUT',
        url: `/api/v1/projects/${projectId}/source`,
        payload: payload as object,
      });

    async function getSource(inject: Inject, projectId: string) {
      const response = await inject(`/api/v1/projects/${projectId}/source`);
      expect(response.statusCode).toBe(200);
      const json: unknown = response.json();
      expect(Check(ProjectSourceResponseSchema, json)).toBe(true);
      return response.json<ProjectSourceResponse>();
    }

    function start(inject: Inject, projectId: string, revision: number) {
      return inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/runs`,
        headers: { 'idempotency-key': `key-${randomUUID()}` },
        payload: {
          kind: 'analyze',
          source: {
            strategy: 'current-source',
            expectedSourceRevision: revision,
          },
          retryOfRunId: null,
        },
      });
    }

    async function finished(inject: Inject, run: Run): Promise<Run> {
      return vi.waitFor(
        async () => {
          const response = await inject(
            `/api/v1/projects/${run.projectId}/runs/${run.id}`,
          );
          const current = response.json<Run>();
          expect(['succeeded', 'failed']).toContain(current.status);
          return current;
        },
        { timeout: 8000, interval: 20 },
      );
    }

    it('B03-AC01 rejects relative, forbidden, link-escaping and missing roots without writing', async () => {
      const { inject } = await open();
      const project = await createProject(inject);
      const alias = join(base, 'alias');
      linkDirectory(dataDir, alias);
      const cases: [string, number, string][] = [
        ['order-module', 400, 'INVALID_INPUT'],
        [APPLICATION_ROOT, 422, 'SOURCE_FORBIDDEN'],
        [join(dataDir, 'snapshots'), 422, 'SOURCE_FORBIDDEN'],
        [base, 422, 'SOURCE_FORBIDDEN'],
        [alias, 422, 'SOURCE_FORBIDDEN'],
        [join(base, 'missing'), 422, 'SOURCE_UNREADABLE'],
        [join(sourceA, 'ORDER.BAS'), 422, 'SOURCE_UNREADABLE'],
      ];
      for (const [rootPath, status, code] of cases) {
        const response = await put(inject, project.id, body(rootPath));
        expect(response.statusCode, rootPath).toBe(status);
        expect(response.json<{ error: { code: string } }>().error.code).toBe(
          code,
        );
        // The submitted path is never echoed back.
        expect(response.body).not.toContain(rootPath.replaceAll('\\', '\\\\'));
      }
      expect(await getSource(inject, project.id)).toEqual({ source: null });
    });

    it('registers, reads and reopens a source without exposing its root', async () => {
      let { inject } = await open();
      const project = await createProject(inject);
      const response = await put(inject, project.id, body(sourceA));
      expect(response.statusCode).toBe(200);
      const saved = response.json<ProjectSourceResponse>();
      expect(saved.source).toMatchObject({
        kind: 'local',
        displayName: 'order-module',
        revision: 1,
        status: 'ready',
        tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
      });
      expect(response.body).not.toContain(base.replaceAll('\\', '\\\\'));

      await closeAll();
      ({ inject } = await open());
      const reopened = await getSource(inject, project.id);
      expect(reopened.source).toMatchObject({
        kind: 'local',
        revision: 1,
        status: 'ready',
      });
      expect(
        reopened.source?.kind === 'local' && reopened.source.sourceId,
      ).toBe(saved.source?.kind === 'local' && saved.source.sourceId);
      // A root removed later reads as unreadable; nothing is rewritten.
      rmSync(sourceA, { recursive: true });
      expect((await getSource(inject, project.id)).source).toMatchObject({
        status: 'unreadable',
        revision: 1,
      });
    });

    it('B03-AC02 answers 409 to a stale revision and keeps the newer source', async () => {
      const { inject } = await open();
      const project = await createProject(inject);
      expect((await put(inject, project.id, body(sourceA))).statusCode).toBe(
        200,
      );
      const again = await put(inject, project.id, body(sourceA));
      expect(again.statusCode).toBe(409);
      expect(again.json<{ error: { code: string } }>().error.code).toBe(
        'SOURCE_REVISION_CONFLICT',
      );
      expect((await put(inject, project.id, body(sourceB, 1))).statusCode).toBe(
        200,
      );
      const stale = await put(inject, project.id, body(sourceA, 1));
      expect(stale.statusCode).toBe(409);
      expect(stale.json<{ error: { code: string } }>().error.code).toBe(
        'SOURCE_REVISION_CONFLICT',
      );
      expect((await getSource(inject, project.id)).source).toMatchObject({
        displayName: 'billing-module',
        revision: 2,
      });
    });

    it('keeps demo projects on the fixture and checks project ownership and input', async () => {
      const { inject } = await open();
      const demo = await createProject(inject, {
        name: 'Demo',
        fixtureId: 'sample-vb6',
      });
      expect(await getSource(inject, demo.id)).toEqual({
        source: {
          kind: 'fixture',
          fixtureId: 'sample-vb6',
          displayName: 'sample-vb6',
          profileId: 'vb6-cp932-v1',
          revision: 1,
          tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
          status: 'ready',
        },
      });
      const demoPut = await put(inject, demo.id, body(sourceA));
      expect(demoPut.statusCode).toBe(409);
      expect(demoPut.json<{ error: { code: string } }>().error.code).toBe(
        'PROJECT_MODE_CONFLICT',
      );

      const local = await createProject(inject);
      const missing = await put(inject, randomUUID(), body(sourceA));
      expect(missing.statusCode).toBe(404);
      expect(missing.json<{ error: { code: string } }>().error.code).toBe(
        'PROJECT_NOT_FOUND',
      );
      expect(
        (await inject(`/api/v1/projects/not-a-uuid/source`)).statusCode,
      ).toBe(400);
      const profile = await put(inject, local.id, {
        ...body(sourceA),
        profileId: 'cobol-v1',
      });
      expect(profile.statusCode).toBe(422);
      expect(profile.json<{ error: { code: string } }>().error.code).toBe(
        'SOURCE_PROFILE_UNSUPPORTED',
      );
      expect(
        (await put(inject, local.id, { ...body(sourceA), extra: true }))
          .statusCode,
      ).toBe(400);
      expect(await getSource(inject, local.id)).toEqual({ source: null });
    });

    it('snapshots the locked revision at execution and leaves the source unchanged', async () => {
      const { inject } = await open();
      const project = await createProject(inject);
      const unregistered = await start(inject, project.id, 1);
      expect(unregistered.statusCode).toBe(409);
      expect(unregistered.json<{ error: { code: string } }>().error.code).toBe(
        'SOURCE_NOT_REGISTERED',
      );

      expect((await put(inject, project.id, body(sourceA))).statusCode).toBe(
        200,
      );
      const before = readFileSync(join(sourceA, 'ORDER.BAS'));
      const accepted = await start(inject, project.id, 1);
      expect(accepted.statusCode).toBe(202);
      const first = await finished(inject, accepted.json<Run>());
      expect(first).toMatchObject({
        status: 'succeeded',
        source: { kind: 'local', revision: 1 },
      });
      const firstSnapshot = join(
        dataDir,
        'snapshots',
        first.sourceSnapshotId ?? '',
      );
      expect(existsSync(join(firstSnapshot, 'raw', 'ORDER.BAS'))).toBe(true);
      expect(readFileSync(join(sourceA, 'ORDER.BAS'))).toEqual(before);

      expect((await put(inject, project.id, body(sourceB, 1))).statusCode).toBe(
        200,
      );
      const stale = await start(inject, project.id, 1);
      expect(stale.statusCode).toBe(409);
      const second = await finished(
        inject,
        (await start(inject, project.id, 2)).json<Run>(),
      );
      expect(second.status).toBe('succeeded');
      const secondSnapshot = join(
        dataDir,
        'snapshots',
        second.sourceSnapshotId ?? '',
      );
      expect(existsSync(join(secondSnapshot, 'raw', 'BILL.BAS'))).toBe(true);
      expect(existsSync(join(secondSnapshot, 'raw', 'ORDER.BAS'))).toBe(false);
    });

    it('fails the run SOURCE_UNREADABLE when the registered root is gone', async () => {
      const { inject } = await open();
      const project = await createProject(inject);
      expect((await put(inject, project.id, body(sourceA))).statusCode).toBe(
        200,
      );
      rmSync(sourceA, { recursive: true });
      const run = await finished(
        inject,
        (await start(inject, project.id, 1)).json<Run>(),
      );
      expect(run).toMatchObject({
        status: 'failed',
        errorCode: 'SOURCE_UNREADABLE',
        sourceSnapshotId: null,
      });
    });

    it('B03-AC03 upgrades a 0001/0002 database and keeps the demo project and Projects API', async () => {
      const db = new Database(join(dataDir, 'portal.db'));
      db.exec(
        'CREATE TABLE schema_migrations (name TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL) STRICT',
      );
      for (const name of ['0001-initial.sql', '0002-runs.sql']) {
        const sql = readFileSync(new URL(name, MIGRATIONS), 'utf8');
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(
          name,
          createHash('sha256').update(sql).digest('hex'),
        );
      }
      const demoId = randomUUID();
      db.prepare('INSERT INTO projects VALUES (?, ?, ?, ?)').run(
        demoId,
        'Legacy demo',
        'sample-vb6',
        '2026-10-15T08:30:00.000Z',
      );
      db.close();

      const { inject } = await open();
      const detail = await inject(`/api/v1/projects/${demoId}`);
      expect(detail.json()).toEqual({
        id: demoId,
        name: 'Legacy demo',
        fixtureId: 'sample-vb6',
        mode: 'demo',
        createdAt: '2026-10-15T08:30:00.000Z',
      });
      const created = await createProject(inject, {
        name: 'Old client',
        fixtureId: 'sample-vb6',
      });
      expect(created).toMatchObject({ fixtureId: 'sample-vb6', mode: 'demo' });
      const local = await createProject(inject);
      expect(local).toEqual({
        id: local.id,
        name: 'Local',
        mode: 'local',
        createdAt: local.createdAt,
      });
      const list = await inject('/api/v1/projects?limit=10');
      expect(list.json<{ items: Project[] }>().items).toHaveLength(3);
      expect((await getSource(inject, demoId)).source?.kind).toBe('fixture');
      const demoRun = await start(inject, demoId, 1);
      expect(demoRun.statusCode).toBe(202);
    });
  },
);
