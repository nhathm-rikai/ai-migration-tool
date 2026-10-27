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
    const repository: RunRepository = {
      ...real,
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
});
