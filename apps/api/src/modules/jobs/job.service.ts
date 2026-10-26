import { createHash } from 'node:crypto';
import {
  ListRunsQuerySchema,
  RUN_PAGE_SIZE_DEFAULT,
  type CancelRunInput,
  type CurrentRunResponse,
  type ListRunsQuery,
  type Project,
  type Run,
  type RunList,
  type RuntimeStatus,
  type StartRunInput,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { AppError } from '../../shared/app-error.js';
import {
  analyzeRunConfig,
  projectRunSource,
  type RunLimits,
} from './analyze-run-config.js';
import { cancelPatch, isTerminalStatus } from './job-state.js';
import type { RunPosition, RunRepository } from './run.repository.js';

// What the service needs from the dispatcher: wake it after a commit, ask it
// to stop an execution, and know whether the runtime may admit runs.
export interface JobControl {
  wake(): void;
  requestStop(runId: string): void;
  runtimeStatus(): RuntimeStatus;
}

// Key order never changes the fingerprint of the same start request.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function startRunFingerprint(input: StartRunInput): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

// The history cursor is the opaque base64url of the last item's position.
function encodeCursor(run: Run): string {
  return Buffer.from(JSON.stringify([run.createdAt, run.id])).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string): RunPosition {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('INVALID_INPUT');
  }
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'string' ||
    typeof value[1] !== 'string' ||
    Number.isNaN(Date.parse(value[0]))
  )
    throw new AppError('INVALID_INPUT');
  return { createdAt: value[0], id: value[1] };
}

export function createJobService(deps: {
  repository: RunRepository;
  projects: { get(projectId: string): Project };
  control: JobControl;
  limits: RunLimits;
  nextId(): string;
  now(): Date;
}) {
  const { repository } = deps;
  function findRun(projectId: string, runId: string): Run {
    deps.projects.get(projectId);
    const run = repository.findById(projectId, runId);
    if (!run) throw new AppError('RUN_NOT_FOUND');
    return run;
  }

  // New run on admission: everything is checked and inserted in one write
  // transaction, so a replayed key, the active-run invariant and the insert
  // cannot interleave with another request. No I/O happens inside.
  function admit(
    project: Project,
    idempotencyKey: string,
    input: StartRunInput,
  ): { run: Run; created: boolean } {
    const requestFingerprint = startRunFingerprint(input);
    return repository.transaction(() => {
      const existing = repository.findByIdempotencyKey(
        project.id,
        idempotencyKey,
      );
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint)
          throw new AppError('IDEMPOTENCY_KEY_CONFLICT');
        return { run: existing.run, created: false };
      }
      if (deps.control.runtimeStatus().status !== 'ready')
        throw new AppError('RUNTIME_RECOVERY_REQUIRED');
      const current = projectRunSource(project);
      const retried =
        input.retryOfRunId === null
          ? null
          : repository.findById(project.id, input.retryOfRunId);
      if (input.retryOfRunId !== null && !retried)
        throw new AppError('RUN_NOT_FOUND');
      let profileId = current.profileId;
      let tableNameMapping = current.tableNameMapping;
      let sourceSnapshotId: string | null = null;
      let source = current.source;
      if (input.source.strategy === 'current-source') {
        if (input.source.expectedSourceRevision !== current.revision)
          throw new AppError('SOURCE_REVISION_CONFLICT');
      } else {
        // reuse-snapshot is only valid with retryOfRunId (schema).
        if (!retried?.sourceSnapshotId)
          throw new AppError('SNAPSHOT_UNAVAILABLE');
        sourceSnapshotId = retried.sourceSnapshotId;
        source = retried.source;
        profileId = retried.config.profileId;
        tableNameMapping = retried.config.tableNameMapping;
      }
      const config = analyzeRunConfig(profileId, tableNameMapping, deps.limits);
      if (!config) throw new AppError('SOURCE_PROFILE_UNSUPPORTED');
      if (repository.findActive(project.id))
        throw new AppError('RUN_ACTIVE_CONFLICT');
      const now = deps.now().toISOString();
      const common = {
        id: deps.nextId(),
        projectId: project.id,
        kind: 'analyze',
        status: 'queued',
        stage: null,
        stateVersion: 1,
        source,
        config,
        errorCode: null,
        startedAt: null,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      } as const;
      const run: Run =
        sourceSnapshotId !== null && input.retryOfRunId !== null
          ? {
              ...common,
              sourceStrategy: 'reuse-snapshot',
              retryOfRunId: input.retryOfRunId,
              sourceSnapshotId,
            }
          : {
              ...common,
              sourceStrategy: 'current-source',
              retryOfRunId: input.retryOfRunId,
              sourceSnapshotId: null,
            };
      repository.insert({ run, idempotencyKey, requestFingerprint });
      return { run, created: true };
    });
  }

  return {
    // Persists a queued run and returns at once; the dispatcher executes it.
    start(projectId: string, idempotencyKey: string, input: StartRunInput) {
      const project = deps.projects.get(projectId);
      const result = admit(project, idempotencyKey, input);
      if (result.created) deps.control.wake();
      return result;
    },
    get: findRun,
    current(projectId: string): CurrentRunResponse {
      deps.projects.get(projectId);
      return {
        run:
          repository.findActive(projectId) ??
          repository.findLatest(projectId) ??
          null,
      };
    },
    list(projectId: string, query: ListRunsQuery): RunList {
      if (!Check(ListRunsQuerySchema, query))
        throw new AppError('INVALID_INPUT');
      const position =
        query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      deps.projects.get(projectId);
      const limit = Number(query.limit ?? RUN_PAGE_SIZE_DEFAULT);
      const rows = repository.listBefore(projectId, position, limit + 1);
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      };
    },
    // queued -> cancelled (done), running -> cancelling (the dispatcher stops
    // the execution and commits cancelled). Repeating a cancel is idempotent.
    cancel(projectId: string, runId: string, input: CancelRunInput): Run {
      const run = findRun(projectId, runId);
      if (run.status === 'cancelling' || run.status === 'cancelled') return run;
      if (
        isTerminalStatus(run.status) ||
        run.stateVersion !== input.expectedStateVersion
      )
        throw new AppError('RUN_STATE_CONFLICT');
      const now = deps.now().toISOString();
      const patch = cancelPatch(run, now);
      const updated = patch
        ? repository.transition(
            run.id,
            { status: run.status, stateVersion: run.stateVersion },
            patch,
            now,
          )
        : undefined;
      // Moved between the read and the compare-and-set (claim or completion).
      if (!updated) throw new AppError('RUN_STATE_CONFLICT');
      if (updated.status === 'cancelling') deps.control.requestStop(updated.id);
      return updated;
    },
    runtimeStatus: (): RuntimeStatus => deps.control.runtimeStatus(),
  };
}

export type JobService = ReturnType<typeof createJobService>;
