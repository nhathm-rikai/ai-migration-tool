import { randomUUID } from 'node:crypto';
import { openDatabase } from './db/database.js';
import { createFixtureRunExecutor } from './adapters/fake/fixture-run.executor.js';
import type { RunLimits } from './modules/jobs/analyze-run-config.js';
import {
  createJobDispatcher,
  type DispatcherLog,
} from './modules/jobs/job-dispatcher.js';
import { createJobService } from './modules/jobs/job.service.js';
import { createRunRepository } from './modules/jobs/run.repository.js';
import { createProjectRepository } from './modules/projects/project.repository.js';
import { createProjectService } from './modules/projects/project.service.js';
import type { RunExecutor } from './ports/run-executor.js';

// Placeholder limits locked into each run's config until the analysis spike
// fixes real numbers (JOB-07). The fixture executor does not read source.
export const DEFAULT_RUN_LIMITS: RunLimits = {
  maxFiles: 5000,
  maxFileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  timeoutMs: 10 * 60 * 1000,
};
const STOP_TIMEOUT_MS = 5000;
// Long enough for the UI to show each stage of a demo run.
const FIXTURE_STAGE_DELAY_MS = 700;

// Tests swap the executor and shorten timeouts.
export type JobOptions = {
  executor?: RunExecutor;
  limits?: Partial<RunLimits>;
  stopTimeoutMs?: number;
};

// From the instance lock taken by server.ts before the DB opens.
export type StartupRecovery = {
  // A previous process cannot be accounted for: runs it left executing still
  // end interrupted, but dispatch stays blocked (recovery_required).
  recoveryRequired: boolean;
};

export function createDependencies(
  dataDir: string,
  options: {
    log: DispatcherLog;
    jobs?: JobOptions;
    recovery?: StartupRecovery;
  },
) {
  const db = openDatabase(dataDir);
  try {
    const now = () => new Date();
    const projects = createProjectService({
      repository: createProjectRepository(db),
      nextId: randomUUID,
      now,
    });
    const runs = createRunRepository(db);
    const dispatcher = createJobDispatcher({
      repository: runs,
      executor:
        options.jobs?.executor ??
        createFixtureRunExecutor({
          stageDelayMs: FIXTURE_STAGE_DELAY_MS,
          nextId: randomUUID,
        }),
      stopTimeoutMs: options.jobs?.stopTimeoutMs ?? STOP_TIMEOUT_MS,
      now,
      log: options.log,
      recoveryRequired: options.recovery?.recoveryRequired ?? false,
    });
    // Before any request: runs a previous process left executing end
    // interrupted and are never resumed.
    dispatcher.recover();
    const jobs = createJobService({
      repository: runs,
      projects,
      control: dispatcher,
      limits: { ...DEFAULT_RUN_LIMITS, ...options.jobs?.limits },
      nextId: randomUUID,
      now,
    });
    return {
      projects,
      jobs,
      // Queued runs from a previous process start once the app is ready.
      start: () => dispatcher.wake(),
      async close() {
        try {
          await dispatcher.close();
        } finally {
          db.close();
        }
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
