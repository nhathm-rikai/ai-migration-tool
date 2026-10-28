import type Database from 'better-sqlite3';
import {
  RunSchema,
  type AnalyzeStage,
  type Run,
  type RunErrorCode,
  type RunStatus,
} from '@portal/contracts';
import { Check } from 'typebox/value';

// SQLite storage of runs. Admission invariants live in the schema (unique
// active run per project, one executing run, unique idempotency key) and
// every state change is a compare-and-set on status + stateVersion.

// Fields a transition writes; the repository bumps stateVersion/updatedAt.
export type RunPatch = {
  status: RunStatus;
  stage: AnalyzeStage | null;
  errorCode: RunErrorCode | null;
  startedAt: string | null;
  finishedAt: string | null;
  sourceSnapshotId: string | null;
};

export type NewRun = {
  run: Run;
  idempotencyKey: string;
  requestFingerprint: string;
};

// Keyset position of the newest-first history.
export type RunPosition = { createdAt: string; id: string };

export interface RunRepository {
  // Runs `work` in one IMMEDIATE transaction: admission reads and the insert
  // see no concurrent writer. Never pass work that awaits I/O.
  transaction<T>(work: () => T): T;
  insert(record: NewRun): Run;
  findById(projectId: string, runId: string): Run | undefined;
  findAny(runId: string): Run | undefined;
  findByIdempotencyKey(
    projectId: string,
    key: string,
  ): { run: Run; requestFingerprint: string } | undefined;
  findActive(projectId: string): Run | undefined;
  findLatest(projectId: string): Run | undefined;
  listBefore(
    projectId: string,
    position: RunPosition | undefined,
    count: number,
  ): Run[];
  findExecuting(): Run[];
  // queued -> running for the oldest queued run, only while nothing executes.
  claimNextQueued(now: string): Run | undefined;
  // Compare-and-set: applies only if the run still has `expected` status and
  // version. Returns the new run, or undefined when the run moved meanwhile.
  transition(
    runId: string,
    expected: { status: RunStatus; stateVersion: number },
    patch: RunPatch,
    now: string,
  ): Run | undefined;
  // Stage/snapshot of a running run at `stateVersion`; no version bump.
  updateProgress(
    runId: string,
    stateVersion: number,
    progress: { stage: AnalyzeStage; sourceSnapshotId: string | null },
    now: string,
  ): Run | undefined;
}

type RunRow = {
  id: string;
  project_id: string;
  kind: string;
  status: string;
  stage: string | null;
  state_version: number;
  source_json: string;
  source_strategy: string;
  retry_of_run_id: string | null;
  source_snapshot_id: string | null;
  error_code: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

const COLUMNS = `id, project_id, kind, status, stage, state_version, source_json,
  source_strategy, retry_of_run_id, source_snapshot_id, error_code, config_json,
  created_at, updated_at, started_at, finished_at`;

// Rows are validated against the contract on read: a row that does not form a
// valid Run (manual edit, bug) fails loudly instead of reaching a client.
function toRun(row: RunRow): Run {
  const source: unknown = JSON.parse(row.source_json);
  const config: unknown = JSON.parse(row.config_json);
  const candidate: unknown = {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    status: row.status,
    stage: row.stage,
    stateVersion: row.state_version,
    source,
    sourceStrategy: row.source_strategy,
    retryOfRunId: row.retry_of_run_id,
    sourceSnapshotId: row.source_snapshot_id,
    errorCode: row.error_code,
    config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
  if (!Check(RunSchema, candidate))
    throw new Error('Stored run does not match the run contract.');
  return candidate;
}

export function createRunRepository(db: Database.Database): RunRepository {
  const insert = db.prepare(
    `INSERT INTO runs (id, project_id, kind, status, stage, state_version,
      source_json, source_strategy, retry_of_run_id, source_snapshot_id,
      error_code, config_json, idempotency_key, request_fingerprint,
      created_at, updated_at, started_at, finished_at)
     VALUES (@id, @projectId, @kind, @status, @stage, @stateVersion,
      @sourceJson, @sourceStrategy, @retryOfRunId, @sourceSnapshotId,
      @errorCode, @configJson, @idempotencyKey, @requestFingerprint,
      @createdAt, @updatedAt, @startedAt, @finishedAt)`,
  );
  const findById = db.prepare<[string, string], RunRow>(
    `SELECT ${COLUMNS} FROM runs WHERE id = ? AND project_id = ?`,
  );
  const findAny = db.prepare<[string], RunRow>(
    `SELECT ${COLUMNS} FROM runs WHERE id = ?`,
  );
  const findByKey = db.prepare<
    [string, string],
    RunRow & { request_fingerprint: string }
  >(
    `SELECT ${COLUMNS}, request_fingerprint FROM runs
     WHERE project_id = ? AND idempotency_key = ?`,
  );
  const findActive = db.prepare<[string], RunRow>(
    `SELECT ${COLUMNS} FROM runs WHERE project_id = ?
       AND status IN ('queued', 'running', 'cancelling')`,
  );
  const findLatest = db.prepare<[string], RunRow>(
    `SELECT ${COLUMNS} FROM runs WHERE project_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 1`,
  );
  const listFirst = db.prepare<[string, number], RunRow>(
    `SELECT ${COLUMNS} FROM runs WHERE project_id = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  );
  const listBefore = db.prepare<
    [string, string, string, string, number],
    RunRow
  >(
    `SELECT ${COLUMNS} FROM runs WHERE project_id = ?
       AND (created_at < ? OR (created_at = ? AND id < ?))
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  );
  const findExecuting = db.prepare<[], RunRow>(
    `SELECT ${COLUMNS} FROM runs WHERE status IN ('running', 'cancelling')`,
  );
  const claim = db.prepare<[string, string], RunRow>(
    `UPDATE runs SET status = 'running', stage = 'snapshot', started_at = ?,
       updated_at = ?, state_version = state_version + 1
     WHERE id = (SELECT id FROM runs WHERE status = 'queued'
                 ORDER BY created_at, id LIMIT 1)
       AND status = 'queued'
       AND NOT EXISTS (SELECT 1 FROM runs
                       WHERE status IN ('running', 'cancelling'))
     RETURNING ${COLUMNS}`,
  );
  const transition = db.prepare<
    [
      {
        id: string;
        expectedStatus: string;
        expectedVersion: number;
        status: string;
        stage: string | null;
        errorCode: string | null;
        startedAt: string | null;
        finishedAt: string | null;
        sourceSnapshotId: string | null;
        now: string;
      },
    ],
    RunRow
  >(
    `UPDATE runs SET status = @status, stage = @stage, error_code = @errorCode,
       started_at = @startedAt, finished_at = @finishedAt,
       source_snapshot_id = @sourceSnapshotId, updated_at = @now,
       state_version = state_version + 1
     WHERE id = @id AND status = @expectedStatus
       AND state_version = @expectedVersion
     RETURNING ${COLUMNS}`,
  );
  const progress = db.prepare<
    [string, string | null, string, string, number],
    RunRow
  >(
    `UPDATE runs SET stage = ?, source_snapshot_id = COALESCE(source_snapshot_id, ?),
       updated_at = ?
     WHERE id = ? AND status = 'running' AND state_version = ?
     RETURNING ${COLUMNS}`,
  );
  // A returned row that breaks the contract rolls the change back.
  const checkedUpdate = db.transaction((run: () => RunRow | undefined) => {
    const row = run();
    return row ? toRun(row) : undefined;
  });
  return {
    transaction: (work) => db.transaction(work).immediate(),
    insert({ run, idempotencyKey, requestFingerprint }) {
      insert.run({
        id: run.id,
        projectId: run.projectId,
        kind: run.kind,
        status: run.status,
        stage: run.stage,
        stateVersion: run.stateVersion,
        sourceJson: JSON.stringify(run.source),
        sourceStrategy: run.sourceStrategy,
        retryOfRunId: run.retryOfRunId,
        sourceSnapshotId: run.sourceSnapshotId,
        errorCode: run.errorCode,
        configJson: JSON.stringify(run.config),
        idempotencyKey,
        requestFingerprint,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      });
      return run;
    },
    findById(projectId, runId) {
      const row = findById.get(runId, projectId);
      return row ? toRun(row) : undefined;
    },
    findAny(runId) {
      const row = findAny.get(runId);
      return row ? toRun(row) : undefined;
    },
    findByIdempotencyKey(projectId, key) {
      const row = findByKey.get(projectId, key);
      return row
        ? { run: toRun(row), requestFingerprint: row.request_fingerprint }
        : undefined;
    },
    findActive(projectId) {
      const row = findActive.get(projectId);
      return row ? toRun(row) : undefined;
    },
    findLatest(projectId) {
      const row = findLatest.get(projectId);
      return row ? toRun(row) : undefined;
    },
    listBefore(projectId, position, count) {
      const rows = position
        ? listBefore.all(
            projectId,
            position.createdAt,
            position.createdAt,
            position.id,
            count,
          )
        : listFirst.all(projectId, count);
      return rows.map(toRun);
    },
    findExecuting: () => findExecuting.all().map(toRun),
    claimNextQueued: (now) => checkedUpdate(() => claim.get(now, now)),
    transition: (runId, expected, patch, now) =>
      checkedUpdate(() =>
        transition.get({
          id: runId,
          expectedStatus: expected.status,
          expectedVersion: expected.stateVersion,
          ...patch,
          now,
        }),
      ),
    updateProgress: (runId, stateVersion, update, now) =>
      checkedUpdate(() =>
        progress.get(
          update.stage,
          update.sourceSnapshotId,
          now,
          runId,
          stateVersion,
        ),
      ),
  };
}
