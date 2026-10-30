import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from './db/database.js';
import { createFixtureRunExecutor } from './adapters/fake/fixture-run.executor.js';
import { createLocalSourceRootPolicy } from './adapters/local/local-source-root.js';
import { createLocalWorkspaceProvider } from './adapters/local/local-workspace.provider.js';
import {
  createSourceRunExecutor,
  type SourceRunHooks,
} from './adapters/local/source-run.executor.js';
import { createFilesystemArtifactStore } from './adapters/local/filesystem-artifact.store.js';
import { createWorkerInventoryBuilder } from './adapters/local/worker-inventory.builder.js';
import { APPLICATION_ROOT } from './platform/data-directory.js';
import type { RunLimits } from './modules/jobs/analyze-run-config.js';
import {
  createJobDispatcher,
  type DispatcherLog,
} from './modules/jobs/job-dispatcher.js';
import { createJobService } from './modules/jobs/job.service.js';
import { createRunRepository } from './modules/jobs/run.repository.js';
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
import type { AgentRunner } from './ports/agent-runner.js';
import { createFakeDocumentRunner } from './adapters/fake/fake-document.runner.js';
import { createClaudeCliRunner } from './adapters/local/claude-cli.runner.js';
import { createCodexCliRunner } from './adapters/local/codex-cli.runner.js';
import { resolveAgentExecutable } from './platform/agent-executable.js';
import { createDocumentRunRepository } from './modules/documents/document-run.repository.js';
import { createDocumentDispatcher } from './modules/documents/document-dispatcher.js';
import {
  createDocumentExecutor,
  type RunSource,
} from './modules/documents/document-executor.js';
import { createSpecWorkspace } from './adapters/local/spec-workspace.js';
import { findSourceProfile } from './modules/analysis/source-profiles.js';
import { decodeSourceBytes } from './modules/analysis/source-decoder.js';
import {
  createDocumentRunService,
  type DocumentRunLimits,
} from './modules/documents/document-run.service.js';

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

// Provisional limits of document runs (JOB-07): a live spike on approved
// data must confirm them before acceptance.
export const DEFAULT_DOCUMENT_LIMITS: DocumentRunLimits = {
  // One agent session per program; up to MAX_PROGRAMS_PER_RUN programs.
  timeoutMs: 8 * 60 * 60 * 1000,
  // A whole package (up to six Markdown files) in one answer.
  maxOutputBytes: 2 * 1024 * 1024,
};
const AGENT_MAX_LINE_BYTES = 4 * 1024 * 1024;
// Long enough for the UI to show the demo log stream.
const FAKE_DOCUMENT_DELAY_MS = 1500;

export type DocumentOptions = {
  runner: 'fake' | 'claude-cli' | 'codex-cli';
  agentExecutable?: string | undefined;
  // Replaces the agent (tests).
  agentRunner?: AgentRunner;
  limits?: Partial<DocumentRunLimits>;
  stopTimeoutMs?: number;
  isProcessGone?: (pid: number) => boolean;
};

// An agent that fails every call with AGENT_UNAVAILABLE and says why.
function unavailableRunner(reason: string): AgentRunner {
  return {
    run(request) {
      request.onEvent?.({ kind: 'system', text: reason });
      return Promise.resolve({ status: 'failed', code: 'AGENT_UNAVAILABLE' });
    },
  };
}

function createDocumentAgent(
  dataDir: string,
  options: DocumentOptions,
): AgentRunner {
  if (options.agentRunner) return options.agentRunner;
  if (options.runner === 'fake')
    return createFakeDocumentRunner({ delayMs: FAKE_DOCUMENT_DELAY_MS });
  const lookup = resolveAgentExecutable({
    configured: options.agentExecutable,
    name: options.runner === 'codex-cli' ? 'codex' : 'claude',
  });
  if (lookup.status === 'missing')
    return unavailableRunner('Agent CLI not found.');
  if (lookup.status === 'unsupported')
    return unavailableRunner(
      'Agent CLI launcher is not supported (need a native executable).',
    );
  // App-owned empty working directory: no project files, no CLAUDE.md.
  const workingDirectory = join(dataDir, 'agent-workdir');
  mkdirSync(workingDirectory, { recursive: true });
  const cli = {
    executable: lookup.path,
    workingDirectory,
    stopDeadlineMs: STOP_TIMEOUT_MS,
    maxLineBytes: AGENT_MAX_LINE_BYTES,
  };
  return options.runner === 'codex-cli'
    ? createCodexCliRunner(cli)
    : createClaudeCliRunner(cli);
}

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
    documents?: DocumentOptions;
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
    const runs = createRunRepository(db);
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
      nextId: randomUUID,
      now,
    });
    late.jobs = jobs;
    const documentOptions = options.documents ?? { runner: 'fake' };
    const documentRuns = createDocumentRunRepository(db);
    const documentStore = createFilesystemArtifactStore({
      artifactsDir: join(dataDir, 'documents'),
    });
    // Agent sessions work on copies under the data directory (spec-runs/).
    const specWorkspace = createSpecWorkspace({
      packRoot: APPLICATION_ROOT,
      root: join(dataDir, 'spec-runs'),
    });
    // Decoded text of the snapshot the analysis read; demo runs have none.
    async function loadRunSource(
      projectId: string,
      analysisRunId: string,
    ): Promise<RunSource | undefined> {
      const analysis = jobs.get(projectId, analysisRunId);
      if (analysis.source.kind === 'fixture') return { snapshotId: null };
      if (!analysis.sourceSnapshotId) return undefined;
      const manifest = await snapshots.open(
        projectId,
        analysis.sourceSnapshotId,
      );
      if (!manifest) return undefined;
      const read = await snapshots.readFiles(manifest);
      if (!read) return undefined;
      const encoding =
        findSourceProfile(analysis.config.profileId)?.defaultEncoding ?? null;
      const files = new Map<string, string>();
      for (const file of read) {
        const decoded = decodeSourceBytes(file.bytes, {
          profileEncoding: encoding,
        });
        if (decoded.ok)
          files.set(file.relativePath, decoded.text.replace(/\r\n?/g, '\n'));
      }
      return { snapshotId: analysis.sourceSnapshotId, files };
    }
    const documentDispatcher = createDocumentDispatcher({
      repository: documentRuns,
      executor: createDocumentExecutor({
        runner: createDocumentAgent(dataDir, documentOptions),
        store: documentStore,
        workspace: specWorkspace,
        async loadInventory(run) {
          const artifact = await artifacts.getVersion(
            run.projectId,
            run.inventory.artifactId,
            String(run.inventory.version),
          );
          return artifact.payload;
        },
        loadSource: (run) => loadRunSource(run.projectId, run.analysisRunId),
        nextId: randomUUID,
        now,
      }),
      stopTimeoutMs:
        documentOptions.stopTimeoutMs ??
        options.jobs?.stopTimeoutMs ??
        STOP_TIMEOUT_MS,
      now,
      log: options.log,
      recoveryRequired: options.recovery?.recoveryRequired ?? false,
      ...(documentOptions.isProcessGone
        ? { isProcessGone: documentOptions.isProcessGone }
        : {}),
    });
    documentDispatcher.recover();
    const documents = createDocumentRunService({
      repository: documentRuns,
      projects,
      analyzeRuns: jobs,
      artifacts,
      store: documentStore,
      control: documentDispatcher,
      runner: documentOptions.runner,
      limits: { ...DEFAULT_DOCUMENT_LIMITS, ...documentOptions.limits },
      specPack: specWorkspace.packVersion(),
      async loadInventory(projectId, inventory) {
        const artifact = await artifacts.getVersion(
          projectId,
          inventory.artifactId,
          String(inventory.version),
        );
        return artifact.payload;
      },
      nextId: randomUUID,
      now,
    });
    return {
      projects,
      sources,
      jobs,
      snapshots,
      artifacts,
      documents,
      // Staging copies a previous process left are app-owned and never
      // public; remove them, then start queued runs from a previous process.
      async start() {
        await workspace.cleanupStaging();
        await artifactStore.cleanupStaging();
        await documentStore.cleanupStaging();
        // Workspaces of sessions a previous process left are app-owned.
        await specWorkspace.removeAll();
        dispatcher.wake();
        documentDispatcher.wake();
      },
      async close() {
        try {
          await Promise.all([dispatcher.close(), documentDispatcher.close()]);
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
