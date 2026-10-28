import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { startRunFixture } from '@portal/contracts/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUN_LIMITS } from '../../composition.js';
import { openDatabase } from '../../db/database.js';
import { createControlledExecutor } from '../../testing/controlled-executor.js';
import { createProjectRepository } from '../projects/project.repository.js';
import { createProjectService } from '../projects/project.service.js';
import { createJobDispatcher } from './job-dispatcher.js';
import { createJobService } from './job.service.js';
import { createSourceRegistrationRepository } from '../projects/source-registration.repository.js';
import { createSourceRegistrationService } from '../projects/source-registration.service.js';
import { createRunRepository, type RunRepository } from './run.repository.js';

// Dispatcher over real SQLite with a repository whose writes can be made to
// fail, to prove a lost terminal write never leaves the runtime `ready`.
describe('dispatcher when a state write fails', () => {
  let dataDir: string;
  let db: Database.Database;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'portal-dispatcher-test-'));
    db = openDatabase(dataDir);
  });
  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    const real = createRunRepository(db);
    let failTransitions = false;
    let failClaims = 0;
    const repository: RunRepository = {
      ...real,
      claimNextQueued(now) {
        if (failClaims > 0) {
          failClaims--;
          throw new Error('database is locked');
        }
        return real.claimNextQueued(now);
      },
      transition(...args) {
        if (failTransitions) throw new Error('disk I/O error at C:/private');
        return real.transition(...args);
      },
    };
    const controlled = createControlledExecutor();
    const log = { error: vi.fn(), warn: vi.fn() };
    const dispatcher = createJobDispatcher({
      repository,
      executor: controlled.executor,
      stopTimeoutMs: 1000,
      now: () => new Date(),
      log,
    });
    const projects = createProjectService({
      repository: createProjectRepository(db),
      nextId: randomUUID,
      now: () => new Date(),
    });
    const jobs = createJobService({
      repository,
      projects,
      // Demo projects only: no source root is ever checked here.
      sources: createSourceRegistrationService({
        repository: createSourceRegistrationRepository(db),
        roots: {
          resolve: () => ({ ok: false, code: 'SOURCE_UNREADABLE' }),
          check: () => 'unreadable',
        },
        projects,
        nextId: randomUUID,
        now: () => new Date(),
      }),
      control: dispatcher,
      limits: DEFAULT_RUN_LIMITS,
      nextId: randomUUID,
      now: () => new Date(),
    });
    const project = () =>
      projects.create({ name: 'Sample', fixtureId: 'sample-vb6' });
    return {
      real,
      jobs,
      dispatcher,
      controlled,
      log,
      project,
      setFailing: (value: boolean) => {
        failTransitions = value;
      },
      failNextClaims: (count: number) => {
        failClaims = count;
      },
    };
  }

  it('a lost terminal write turns the runtime recovery_required, and a cancel of that run still ends', async () => {
    const ctx = setup();
    const a = ctx.project();
    const b = ctx.project();
    const { run } = ctx.jobs.start(
      a.id,
      `key-${randomUUID()}`,
      startRunFixture,
    );
    await vi.waitFor(() => expect(ctx.controlled.executions).toHaveLength(1));
    ctx.setFailing(true);
    ctx.controlled.executions[0]?.finish({
      status: 'succeeded',
      sourceSnapshotId: randomUUID(),
    });
    await vi.waitFor(() =>
      expect(ctx.jobs.runtimeStatus()).toEqual({
        status: 'recovery_required',
        reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED',
      }),
    );
    expect(ctx.log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RUN_STATE_WRITE_FAILED',
        runId: run.id,
      }),
      expect.any(String),
    );
    ctx.setFailing(false);
    expect(ctx.jobs.get(a.id, run.id).status).toBe('running');
    // New runs are refused instead of being queued behind a stuck slot.
    expect(() =>
      ctx.jobs.start(b.id, `key-${randomUUID()}`, startRunFixture),
    ).toThrow(expect.objectContaining({ code: 'RUNTIME_RECOVERY_REQUIRED' }));
    // Its execution has ended, so a cancel completes instead of hanging.
    const running = ctx.jobs.get(a.id, run.id);
    expect(
      ctx.jobs.cancel(a.id, run.id, {
        expectedStateVersion: running.stateVersion,
      }).status,
    ).toBe('cancelling');
    expect(ctx.jobs.get(a.id, run.id).status).toBe('cancelled');
    await ctx.dispatcher.close();
  });

  it('restart after a lost terminal write marks the run interrupted and the runtime ready again', async () => {
    const ctx = setup();
    const a = ctx.project();
    const { run } = ctx.jobs.start(
      a.id,
      `key-${randomUUID()}`,
      startRunFixture,
    );
    await vi.waitFor(() => expect(ctx.controlled.executions).toHaveLength(1));
    ctx.setFailing(true);
    ctx.controlled.executions[0]?.finish({
      status: 'failed',
      errorCode: 'INTERNAL_ERROR',
    });
    await vi.waitFor(() =>
      expect(ctx.jobs.runtimeStatus().status).toBe('recovery_required'),
    );
    ctx.setFailing(false);
    await ctx.dispatcher.close();
    const restarted = setup();
    expect(restarted.dispatcher.recover()).toBe(1);
    expect(restarted.real.findAny(run.id)?.status).toBe('interrupted');
    expect(restarted.jobs.runtimeStatus().status).toBe('ready');
    await restarted.dispatcher.close();
  });

  it('retries a failed claim by itself, so a queued run does not wait for another wake', async () => {
    const ctx = setup();
    const a = ctx.project();
    ctx.failNextClaims(1);
    const { run } = ctx.jobs.start(
      a.id,
      `key-${randomUUID()}`,
      startRunFixture,
    );
    await vi.waitFor(
      () =>
        expect(ctx.controlled.executions.map((e) => e.run.id)).toEqual([
          run.id,
        ]),
      { timeout: 5000 },
    );
    expect(ctx.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RUN_CLAIM_FAILED' }),
      expect.any(String),
    );
    expect(ctx.jobs.runtimeStatus().status).toBe('ready');
    await ctx.dispatcher.close();
  });

  it('a repeated cancel finishes a stopped run whose cancelled write failed', async () => {
    const ctx = setup();
    const a = ctx.project();
    const { run } = ctx.jobs.start(
      a.id,
      `key-${randomUUID()}`,
      startRunFixture,
    );
    await vi.waitFor(() => expect(ctx.controlled.executions).toHaveLength(1));
    const running = ctx.jobs.get(a.id, run.id);
    expect(
      ctx.jobs.cancel(a.id, run.id, {
        expectedStateVersion: running.stateVersion,
      }).status,
    ).toBe('cancelling');
    // The executor stops; writing `cancelled` fails.
    ctx.setFailing(true);
    ctx.controlled.executions[0]?.finish({ status: 'stopped' });
    await vi.waitFor(() =>
      expect(ctx.jobs.runtimeStatus().status).toBe('recovery_required'),
    );
    expect(ctx.jobs.get(a.id, run.id).status).toBe('cancelling');
    ctx.setFailing(false);
    const repeated = ctx.jobs.cancel(a.id, run.id, { expectedStateVersion: 1 });
    expect(repeated).toMatchObject({ status: 'cancelled', stateVersion: 4 });
    // Terminal stays terminal.
    expect(ctx.jobs.cancel(a.id, run.id, { expectedStateVersion: 1 })).toEqual(
      repeated,
    );
    await ctx.dispatcher.close();
  });

  it('a repeated cancel of a run still stopping keeps it cancelling', async () => {
    const ctx = setup();
    const a = ctx.project();
    const { run } = ctx.jobs.start(
      a.id,
      `key-${randomUUID()}`,
      startRunFixture,
    );
    await vi.waitFor(() => expect(ctx.controlled.executions).toHaveLength(1));
    const running = ctx.jobs.get(a.id, run.id);
    ctx.jobs.cancel(a.id, run.id, {
      expectedStateVersion: running.stateVersion,
    });
    // The executor ignores the abort and has not settled yet.
    const repeated = ctx.jobs.cancel(a.id, run.id, { expectedStateVersion: 1 });
    expect(repeated.status).toBe('cancelling');
    ctx.controlled.executions[0]?.finish({ status: 'stopped' });
    await vi.waitFor(() =>
      expect(ctx.jobs.get(a.id, run.id).status).toBe('cancelled'),
    );
    await ctx.dispatcher.close();
  });
});
