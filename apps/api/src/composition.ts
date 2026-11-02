import { randomUUID } from 'node:crypto';
import { FOLDER_PICKER_TIMEOUT_MS } from '@portal/contracts';
import { join } from 'node:path';
import { openDatabase } from './db/database.js';
import { createFixtureRunExecutor } from './adapters/fake/fixture-run.executor.js';
import { demoInventory } from './adapters/fake/demo-inventory.js';
import { createLocalSourceRootPolicy } from './adapters/local/local-source-root.js';
import { createLocalWorkspaceProvider } from './adapters/local/local-workspace.provider.js';
import {
  createSourceRunExecutor,
  type SourceRunHooks,
} from './adapters/local/source-run.executor.js';
import { createFilesystemArtifactStore } from './adapters/local/filesystem-artifact.store.js';
import { createWorkerInventoryBuilder } from './adapters/local/worker-inventory.builder.js';
import {
  createNativeFolderPicker,
  dialogCommands,
} from './adapters/local/native-folder-picker.js';
import { createFolderPickerService } from './modules/local-picker/folder-picker.service.js';
import type { FolderPicker } from './ports/folder-picker.js';
import { APPLICATION_ROOT } from './platform/data-directory.js';
import type { RunLimits } from './modules/jobs/analyze-run-config.js';
import {
  createJobDispatcher,
  type DispatcherLog,
} from './modules/jobs/job-dispatcher.js';
import { createJobService } from './modules/jobs/job.service.js';
import { createRunRepository } from './modules/jobs/run.repository.js';
import { createRunEventHub, withRunEvents } from './modules/jobs/run-events.js';
import { createProjectRepository } from './modules/projects/project.repository.js';
import { createProjectService } from './modules/projects/project.service.js';
import { createSourceRegistrationRepository } from './modules/projects/source-registration.repository.js';
import { createSourceRegistrationService } from './modules/projects/source-registration.service.js';
import { createSnapshotRepository } from './modules/snapshots/snapshot.repository.js';
import { createSnapshotService } from './modules/snapshots/snapshot.service.js';
import { createArtifactRepository } from './modules/artifacts/artifact.repository.js';
import { createArtifactService } from './modules/artifacts/artifact.service.js';
import type { ArtifactStore } from './ports/artifact-store.js';
import type { RunExecutor } from './ports/run-executor.js';

// Development limits locked into each run's config. Local runs enforce them
// while taking snapshots; a spike must approve real-data limits (JOB-07).
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
  // Replaces only the demo executor; local sources keep the snapshot path.
  fixtureExecutor?: RunExecutor;
  limits?: Partial<RunLimits>;
  stopTimeoutMs?: number;
  // Replaces the filesystem artifact store (fault injection).
  artifactStore?: ArtifactStore;
  // Fault injection points of the local pipeline.
  sourceRunHooks?: SourceRunHooks;
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
    // Tests replace the OS folder dialog (UI05).
    folderPicker?: FolderPicker;
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
    // A source may not overlap the application or the data directory, so
    // snapshots (written under dataDir) never land in a source.
    const roots = createLocalSourceRootPolicy({
      protectedRoots: [APPLICATION_ROOT, dataDir],
    });
    const sources = createSourceRegistrationService({
      repository: createSourceRegistrationRepository(db),
      roots,
      projects,
      nextId: randomUUID,
      now,
    });
    const workspace = createLocalWorkspaceProvider({
      snapshotsDir: join(dataDir, 'snapshots'),
    });
    const snapshots = createSnapshotService({
      repository: createSnapshotRepository(db),
      provider: workspace,
      roots,
      sources,
      nextId: randomUUID,
      now,
    });
    // Events and per-file progress of runs (B09/PF08), in memory.
    const storedRuns = createRunRepository(db);
    const runEvents = createRunEventHub({
      read: (runId) => storedRuns.findAny(runId),
      now,
    });
    const runs = withRunEvents(storedRuns, runEvents);
    const artifactStore =
      options.jobs?.artifactStore ??
      createFilesystemArtifactStore({
        artifactsDir: join(dataDir, 'artifacts'),
      });
    // Reads go through the job service, created below once the dispatcher
    // (which needs the executor, which publishes artifacts) exists.
    const late: { jobs?: ReturnType<typeof createJobService> } = {};
    const artifacts = createArtifactService({
      repository: createArtifactRepository(db),
      store: artifactStore,
      projects,
      runs: {
        get(projectId, runId) {
          if (!late.jobs) throw new Error('Job service is not ready.');
          return late.jobs.get(projectId, runId);
        },
      },
      nextId: randomUUID,
      now,
      log: options.log,
    });
    const dispatcher = createJobDispatcher({
      repository: runs,
      executor:
        options.jobs?.executor ??
        createSourceRunExecutor({
          fixture:
            options.jobs?.fixtureExecutor ??
            createFixtureRunExecutor({
              stageDelayMs: FIXTURE_STAGE_DELAY_MS,
              nextId: randomUUID,
              files: demoInventory.files.map((file) => ({
                relativePath: file.manifest.relativePath,
                byteLength: file.manifest.byteLength,
              })),
            }),
          snapshots,
          artifacts,
          inventory: createWorkerInventoryBuilder(),
          ...(options.jobs?.sourceRunHooks
            ? { hooks: options.jobs.sourceRunHooks }
            : {}),
        }),
      stopTimeoutMs: options.jobs?.stopTimeoutMs ?? STOP_TIMEOUT_MS,
      now,
      log: options.log,
      recoveryRequired: options.recovery?.recoveryRequired ?? false,
      progress: runEvents,
    });
    // Before any request: runs a previous process left executing end
    // interrupted and are never resumed.
    dispatcher.recover();
    const jobs = createJobService({
      repository: runs,
      projects,
      sources,
      control: dispatcher,
      limits: { ...DEFAULT_RUN_LIMITS, ...options.jobs?.limits },
      progressOf: runEvents.progressOf,
      nextId: randomUUID,
      now,
    });
    late.jobs = jobs;
    const folderPicker = createFolderPickerService({
      picker:
        options.folderPicker ??
        createNativeFolderPicker({
          commands: dialogCommands(process.platform),
          timeoutMs: FOLDER_PICKER_TIMEOUT_MS,
        }),
    });
    return {
      projects,
      sources,
      jobs,
      snapshots,
      artifacts,
      folderPicker,
      runEvents,
      // Staging copies a previous process left are app-owned and never
      // public; remove them, then start queued runs from a previous process.
      async start() {
        await workspace.cleanupStaging();
        await artifactStore.cleanupStaging();
        dispatcher.wake();
      },
      async close() {
        try {
          // An open folder dialog is closed (its process killed) first.
          await folderPicker.close();
          await dispatcher.close();
          // Open event streams end; nothing is sent after the DB closes.
          runEvents.close();
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
