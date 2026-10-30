import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type {
  CurrentDocumentRunResponse,
  ArtifactList,
  DocumentLogPage,
  DocumentRun,
  PackageFileContent,
  Project,
  Run,
  SourceInventoryArtifact,
} from '@portal/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDocumentRunner } from '../../adapters/fake/fake-document.runner.js';
import { createFixtureRunExecutor } from '../../adapters/fake/fixture-run.executor.js';
import { buildApp } from '../../app.js';
import type { DocumentOptions } from '../../composition.js';
import { loadConfig } from '../../config.js';
import type { AgentRunner } from '../../ports/agent-runner.js';
import { createTrustedInject } from '../../testing/test-app.js';

// Specification-design document runs over HTTP -> service -> SQLite ->
// filesystem, with a fake agent: admission, idempotency, one package per
// program, log, cancel, failures, read and restart recovery (JOB-01..06,
// DATA-05).

type Inject = ReturnType<typeof createTrustedInject>;

describe('Document runs HTTP -> service -> SQLite', { timeout: 30_000 }, () => {
  let dataDir: string;
  let apps: ReturnType<typeof buildApp>[] = [];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'portal-documents-it-'));
  });
  afterEach(async () => {
    for (const app of apps) await app.close();
    apps = [];
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function open(documents: Partial<DocumentOptions> = {}) {
    const config = loadConfig({
      PORTAL_DATA_DIR: dataDir,
      PORTAL_LOG_LEVEL: 'silent',
    });
    const app = buildApp(config, {
      jobs: {
        stopTimeoutMs: 2000,
        fixtureExecutor: createFixtureRunExecutor({
          stageDelayMs: 0,
          nextId: randomUUID,
        }),
      },
      documents: { agentRunner: createFakeDocumentRunner(), ...documents },
    });
    apps.push(app);
    await app.ready();
    return createTrustedInject(app, config);
  }

  async function analyzedProject(inject: Inject) {
    const created = await inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Demo', fixtureId: 'sample-vb6' },
    });
    const project = created.json<Project>();
    const started = await inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/runs`,
      headers: { 'idempotency-key': `key-${randomUUID()}` },
      payload: {
        kind: 'analyze',
        source: { strategy: 'current-source', expectedSourceRevision: 1 },
        retryOfRunId: null,
      },
    });
    expect(started.statusCode).toBe(202);
    const analysis = await vi.waitFor(
      async () => {
        const run = (
          await inject(
            `/api/v1/projects/${project.id}/runs/${started.json<Run>().id}`,
          )
        ).json<Run>();
        expect(run.status).toBe('succeeded');
        return run;
      },
      { timeout: 10_000, interval: 20 },
    );
    const artifacts = (
      await inject(
        `/api/v1/projects/${project.id}/runs/${analysis.id}/artifacts`,
      )
    ).json<ArtifactList>();
    const ref = artifacts.items[0];
    if (!ref) throw new Error('no inventory');
    const inventory = (
      await inject(
        `/api/v1/projects/${project.id}/artifacts/${ref.id}/versions/${ref.version}`,
      )
    ).json<SourceInventoryArtifact>();
    const programs = inventory.payload.programs.map(
      (program) => program.projectPath,
    );
    return { project, analysis, programs };
  }

  function start(
    inject: Inject,
    projectId: string,
    analysisRunId: string,
    programs: string[],
    key = `key-${randomUUID()}`,
    documents = ['detail-design'],
  ) {
    return inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/document-runs`,
      headers: { 'idempotency-key': key },
      payload: {
        analysisRunId,
        programs,
        documents,
        model: 'haiku',
        outputLanguage: 'vi',
      },
    });
  }

  async function finished(inject: Inject, run: DocumentRun) {
    return vi.waitFor(
      async () => {
        const current = (
          await inject(
            `/api/v1/projects/${run.projectId}/document-runs/${run.id}`,
          )
        ).json<DocumentRun>();
        expect(['succeeded', 'failed', 'cancelled', 'interrupted']).toContain(
          current.status,
        );
        return current;
      },
      { timeout: 10_000, interval: 20 },
    );
  }

  it('writes the package of the chosen program with SD-CT-07 companions and serves its files', async () => {
    const inject = await open();
    const { project, analysis, programs } = await analyzedProject(inject);
    const chosen = programs.slice(1, 2);
    const accepted = await start(inject, project.id, analysis.id, chosen);
    expect(accepted.statusCode).toBe(202);
    const queued = accepted.json<DocumentRun>();
    expect(queued.status).toBe('queued');
    // Locked config (AI-05): detail-design pulls BR, DB and Basic in.
    expect(queued.config).toMatchObject({
      programs: chosen,
      selected: ['detail-design'],
      generated: [
        'business-rules',
        'db-design',
        'basic-design',
        'detail-design',
      ],
      runner: 'fake',
      effort: 'medium',
      promptVersion: 'spec-design-task-v2',
    });
    expect(queued.config.specPack).toMatch(
      /^spec-design-rules-.+ \+ spec-design-templates-/,
    );
    const done = await finished(inject, queued);
    expect(done.status).toBe('succeeded');
    expect(done.items.map((item) => item.status)).toEqual(['succeeded']);
    expect(
      done.items[0]?.documents?.map(({ name, status, sections }) => ({
        name,
        status,
        full: sections !== undefined && sections.done === sections.total,
      })),
    ).toEqual(
      ['business-rules', 'db-design', 'basic-design', 'detail-design'].map(
        (name) => ({ name: `${name}.md`, status: 'written', full: true }),
      ),
    );
    // Sections come from the templates of the pack copy.
    expect(done.items[0]?.documents?.[2]?.sections?.total).toBe(10);
    expect(done.items[0]?.reading?.done).toBe(done.items[0]?.reading?.total);
    expect(done.items[0]?.files.map((file) => file.name)).toEqual([
      'business-rules.md',
      'db-design.md',
      'basic-design.md',
      'detail-design.md',
    ]);

    const file = await inject(
      `/api/v1/projects/${project.id}/document-runs/${queued.id}/items/0/files/detail-design.md`,
    );
    expect(file.statusCode).toBe(200);
    const content = file.json<PackageFileContent>();
    expect(content.program).toBe(chosen[0]);
    expect(content.content).toContain('| Trạng thái sinh | hoàn tất |');
    expect(content.sha256).toBe(done.items[0]?.files[3]?.sha256);
    const unknown = await inject(
      `/api/v1/projects/${project.id}/document-runs/${queued.id}/items/0/files/coverage.md`,
    );
    expect(unknown.statusCode).toBe(404);

    const log = (
      await inject(
        `/api/v1/projects/${project.id}/document-runs/${queued.id}/log`,
      )
    ).json<DocumentLogPage>();
    expect(log.items.map((entry) => entry.text)).toContain(
      'Auditing the program files…',
    );
    const tail = (
      await inject(
        `/api/v1/projects/${project.id}/document-runs/${queued.id}/log?after=${log.last}`,
      )
    ).json<DocumentLogPage>();
    expect(tail).toEqual({ items: [], last: log.last });

    const current = (
      await inject(`/api/v1/projects/${project.id}/document-runs/current`)
    ).json<CurrentDocumentRunResponse>();
    expect(current).toMatchObject({
      runner: 'fake',
      runtime: { status: 'ready' },
    });
    expect(current.run?.id).toBe(queued.id);
  });

  it('gives the agent the input form, P1 and the pack, read-only, in its own workspace', async () => {
    const seen: { directory: string; files: string[]; input: string }[] = [];
    const fake = createFakeDocumentRunner();
    const inspecting: AgentRunner = {
      async run(request) {
        const directory = request.workingDirectory ?? '';
        seen.push({
          directory,
          files: readdirSync(directory, { recursive: true }).map(String),
          input: readFileSync(
            join(directory, 'context/input-context.md'),
            'utf8',
          ),
        });
        return fake.run(request);
      },
    };
    const inject = await open({ agentRunner: inspecting });
    const { project, analysis, programs } = await analyzedProject(inject);
    const run = (
      await start(
        inject,
        project.id,
        analysis.id,
        programs.slice(0, 1),
        undefined,
        ['basic-design'],
      )
    ).json<DocumentRun>();
    expect((await finished(inject, run)).status).toBe('succeeded');
    const [session] = seen;
    if (!session) throw new Error('no session');
    const files = session.files.map((path) => path.split('\\').join('/'));
    expect(files).toEqual(
      expect.arrayContaining([
        'context/docs/specification-design/README.md',
        'context/docs/specification-design/templates/basic-design.md',
        'context/docs/engineering/rules/jobs-ai.md',
        'context/p1/1.1-source-inventory.json',
        'context/p1/1.2-loc.json',
        'context/p1/1.3-dependency.json',
      ]),
    );
    // Demo projects have no source files.
    expect(files.some((path) => path.startsWith('source/'))).toBe(false);
    expect(session.input).toContain('| Tài liệu TL chọn | basic-design |');
    expect(session.input).toContain('| Tài liệu sinh kèm | business-rules |');
    expect(session.input).toContain('chưa được cung cấp (dự án demo');
    // Workspaces are removed once the run ended.
    expect(existsSync(session.directory)).toBe(false);
  });

  it('keeps document content out of the log', async () => {
    const fake = createFakeDocumentRunner();
    const talkative: AgentRunner = {
      async run(request) {
        for (const text of [
          'Reading done.',
          '=== FILE: business-rules.md ===',
          '# Secret body line',
          '=== END FILE ===',
          'All files returned.',
        ])
          request.onEvent?.({ kind: 'text', text });
        return fake.run(request);
      },
    };
    const inject = await open({ agentRunner: talkative });
    const { project, analysis, programs } = await analyzedProject(inject);
    const run = (
      await start(
        inject,
        project.id,
        analysis.id,
        programs.slice(0, 1),
        undefined,
        ['business-rules'],
      )
    ).json<DocumentRun>();
    expect((await finished(inject, run)).status).toBe('succeeded');
    const texts = (
      await inject(`/api/v1/projects/${project.id}/document-runs/${run.id}/log`)
    )
      .json<DocumentLogPage>()
      .items.map((entry) => entry.text);
    expect(texts).toContain('Reading done.');
    expect(texts).toContain('All files returned.');
    expect(texts.join('\n')).not.toMatch(/Secret body line|=== FILE:|END FILE/);
  });

  it('fails a program whose agent changed its workspace', async () => {
    const fake = createFakeDocumentRunner();
    const writer: AgentRunner = {
      async run(request) {
        writeFileSync(
          join(request.workingDirectory ?? '', 'context/input-context.md'),
          'x',
        );
        return fake.run(request);
      },
    };
    const inject = await open({ agentRunner: writer });
    const { project, analysis, programs } = await analyzedProject(inject);
    const done = await finished(
      inject,
      (
        await start(inject, project.id, analysis.id, programs.slice(0, 1))
      ).json<DocumentRun>(),
    );
    expect(done).toMatchObject({ status: 'failed', errorCode: 'AGENT_FAILED' });
    expect(done.items[0]?.files).toEqual([]);
  });

  it('accepts only runner models and known programs, and no demo project with a real agent', async () => {
    const inject = await open({ runner: 'codex-cli' });
    const { project, analysis, programs } = await analyzedProject(inject);
    const body = (model: string, chosen: string[]) => ({
      method: 'POST' as const,
      url: `/api/v1/projects/${project.id}/document-runs`,
      headers: { 'idempotency-key': `key-${randomUUID()}` },
      payload: {
        analysisRunId: analysis.id,
        programs: chosen,
        documents: ['business-rules'],
        model,
        outputLanguage: 'vi',
      },
    });
    expect((await inject(body('haiku', programs.slice(0, 1)))).statusCode).toBe(
      400,
    );
    expect((await inject(body('default', ['no/such.vbp']))).statusCode).toBe(
      400,
    );
    // A demo project has no source: a real agent is not started on it.
    const demo = await inject(body('default', programs.slice(0, 1)));
    expect(demo.statusCode).toBe(409);
    expect(demo.json<{ error: { code: string } }>().error.code).toBe(
      'PROJECT_MODE_CONFLICT',
    );
  });

  it('needs a succeeded analysis with an inventory', async () => {
    const inject = await open();
    const created = await inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Demo', fixtureId: 'sample-vb6' },
    });
    const response = await start(
      inject,
      created.json<Project>().id,
      randomUUID(),
      ['x.vbp'],
    );
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'ANALYSIS_REQUIRED',
    );
  });

  it('replays the same key, rejects a changed payload and a second active run', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = createFakeDocumentRunner();
    const blocked: AgentRunner = {
      async run(request) {
        await gate;
        return fake.run(request);
      },
    };
    const inject = await open({ agentRunner: blocked });
    const { project, analysis, programs } = await analyzedProject(inject);
    const one = programs.slice(0, 1);
    const first = await start(
      inject,
      project.id,
      analysis.id,
      one,
      'same-key-0000000001',
    );
    const replay = await start(
      inject,
      project.id,
      analysis.id,
      one,
      'same-key-0000000001',
    );
    expect(replay.statusCode).toBe(202);
    expect(replay.json<DocumentRun>().id).toBe(first.json<DocumentRun>().id);
    const changed = await start(
      inject,
      project.id,
      analysis.id,
      one,
      'same-key-0000000001',
      ['db-design'],
    );
    expect(changed.json<{ error: { code: string } }>().error.code).toBe(
      'IDEMPOTENCY_KEY_CONFLICT',
    );
    const second = await start(inject, project.id, analysis.id, one);
    expect(second.json<{ error: { code: string } }>().error.code).toBe(
      'RUN_ACTIVE_CONFLICT',
    );
    release();
    expect((await finished(inject, first.json<DocumentRun>())).status).toBe(
      'succeeded',
    );
  });

  it('cancels a running run; its packages are never served', async () => {
    const inject = await open({
      agentRunner: createFakeDocumentRunner({ delayMs: 5000 }),
    });
    const { project, analysis, programs } = await analyzedProject(inject);
    const run = (
      await start(inject, project.id, analysis.id, programs.slice(0, 1))
    ).json<DocumentRun>();
    const running = await vi.waitFor(async () => {
      const current = (
        await inject(`/api/v1/projects/${project.id}/document-runs/${run.id}`)
      ).json<DocumentRun>();
      expect(current.status).toBe('running');
      // The agent session has started for the program.
      expect(current.items[0]?.status).toBe('running');
      return current;
    });
    const cancel = await inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/document-runs/${run.id}/cancel`,
      payload: { expectedStateVersion: running.stateVersion },
    });
    expect([200, 202]).toContain(cancel.statusCode);
    const cancelled = await finished(inject, run);
    expect(cancelled.status).toBe('cancelled');
    // Nothing shows as running once the run ended.
    expect(cancelled.items.map((item) => item.status)).toEqual(['stopped']);
    const file = await inject(
      `/api/v1/projects/${project.id}/document-runs/${run.id}/items/0/files/business-rules.md`,
    );
    expect(file.statusCode).toBe(404);
  });

  it('takes one program per run in this phase', async () => {
    const inject = await open();
    const { project, analysis, programs } = await analyzedProject(inject);
    const two = await start(
      inject,
      project.id,
      analysis.id,
      programs.slice(0, 2),
    );
    expect(two.statusCode).toBe(400);
  });

  it('records an agent auth failure on the program', async () => {
    const inject = await open({
      agentRunner: createFakeDocumentRunner({ scenario: 'auth' }),
    });
    const { project, analysis, programs } = await analyzedProject(inject);
    const done = await finished(
      inject,
      (
        await start(inject, project.id, analysis.id, programs.slice(0, 1))
      ).json<DocumentRun>(),
    );
    expect(done).toMatchObject({
      status: 'failed',
      errorCode: 'AGENT_AUTH_FAILED',
    });
    expect(done.items.map((item) => item.errorCode)).toEqual([
      'AGENT_AUTH_FAILED',
    ]);
  });

  it('rejects a malformed package and a document not yet hoàn tất', async () => {
    for (const [scenario, code] of [
      ['invalid-output', 'AGENT_OUTPUT_INVALID'],
      ['incomplete', 'PACKAGE_INCOMPLETE'],
    ] as const) {
      const inject = await open({
        agentRunner: createFakeDocumentRunner({ scenario }),
      });
      const { project, analysis, programs } = await analyzedProject(inject);
      const done = await finished(
        inject,
        (
          await start(inject, project.id, analysis.id, programs.slice(0, 1))
        ).json<DocumentRun>(),
      );
      expect(done).toMatchObject({ status: 'failed', errorCode: code });
      expect(done.items.map((item) => item.errorCode)).toEqual([code]);
      expect(done.items[0]?.files).toEqual([]);
      for (const app of apps) await app.close();
      apps = [];
    }
  });

  it('blocks dispatch after restart while a recorded agent PID may be alive', async () => {
    const inject = await open();
    const { project, analysis, programs } = await analyzedProject(inject);
    const one = programs.slice(0, 1);
    const run = (
      await start(inject, project.id, analysis.id, one)
    ).json<DocumentRun>();
    await finished(inject, run);
    for (const app of apps) await app.close();
    apps = [];
    // A previous backend crashed with an agent process on record.
    const db = new Database(join(dataDir, 'portal.db'));
    db.prepare(
      'INSERT INTO agent_processes (run_id, pid, started_at) VALUES (?, ?, ?)',
    ).run(run.id, 424242, new Date().toISOString());
    db.close();

    // An older build left an interrupted run with its program "running".
    const stale = new Database(join(dataDir, 'portal.db'));
    const items = JSON.parse(
      (
        stale
          .prepare('SELECT items_json FROM document_runs WHERE id = ?')
          .get(run.id) as {
          items_json: string;
        }
      ).items_json,
    ) as { status: string }[];
    stale
      .prepare(
        "UPDATE document_runs SET status = 'interrupted', items_json = ? WHERE id = ?",
      )
      .run(
        JSON.stringify(items.map((item) => ({ ...item, status: 'running' }))),
        run.id,
      );
    stale.close();

    const alive = await open({ isProcessGone: () => false });
    const blocked = (
      await alive(`/api/v1/projects/${project.id}/document-runs/current`)
    ).json<CurrentDocumentRunResponse>();
    expect(blocked.runtime.status).toBe('recovery_required');
    expect(blocked.run?.items.map((item) => item.status)).toEqual(['stopped']);
    const refused = await start(alive, project.id, analysis.id, one);
    expect(refused.json<{ error: { code: string } }>().error.code).toBe(
      'RUNTIME_RECOVERY_REQUIRED',
    );
    for (const app of apps) await app.close();
    apps = [];

    // Once the OS reports the PID gone, the record is cleared and runs go.
    const gone = await open({ isProcessGone: () => true });
    const ready = (
      await gone(`/api/v1/projects/${project.id}/document-runs/current`)
    ).json<CurrentDocumentRunResponse>();
    expect(ready.runtime.status).toBe('ready');
  });
});
