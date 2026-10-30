import type Database from 'better-sqlite3';
import {
  DocumentRunSchema,
  type DocumentLogEntry,
  type DocumentLogStream,
  type DocumentRun,
  type DocumentRunErrorCode,
  type DocumentRunItem,
  type RunStatus,
} from '@portal/contracts';
import { Check } from 'typebox/value';

// SQLite storage of document runs. Admission invariants live in the schema
// (0005); every status change is a compare-and-set on status + stateVersion.

export type DocumentRunPatch = {
  status: RunStatus;
  errorCode: DocumentRunErrorCode | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type NewDocumentRun = {
  run: DocumentRun;
  idempotencyKey: string;
  requestFingerprint: string;
};

export type NewLogEntry = {
  stream: DocumentLogStream;
  program: string | null;
  text: string;
};

export type AgentProcessRecord = { runId: string; pid: number };

export interface DocumentRunRepository {
  // One IMMEDIATE transaction; never pass work that awaits I/O.
  transaction<T>(work: () => T): T;
  insert(record: NewDocumentRun): DocumentRun;
  findById(projectId: string, runId: string): DocumentRun | undefined;
  findAny(runId: string): DocumentRun | undefined;
  findByIdempotencyKey(
    projectId: string,
    key: string,
  ): { run: DocumentRun; requestFingerprint: string } | undefined;
  findActive(projectId: string): DocumentRun | undefined;
  findLatest(projectId: string): DocumentRun | undefined;
  findExecuting(): DocumentRun[];
  // queued -> running for the oldest queued run, only while nothing executes.
  claimNextQueued(now: string): DocumentRun | undefined;
  transition(
    runId: string,
    expected: { status: RunStatus; stateVersion: number },
    patch: DocumentRunPatch,
    now: string,
  ): DocumentRun | undefined;
  // Items/usage of a running run at `stateVersion`; no version bump.
  updateProgress(
    runId: string,
    stateVersion: number,
    progress: {
      items: DocumentRunItem[];
      inputTokens: number;
      outputTokens: number;
    },
    now: string,
  ): DocumentRun | undefined;
  appendLog(runId: string, entry: NewLogEntry, at: string): number;
  countLog(runId: string): number;
  listLog(runId: string, after: number, limit: number): DocumentLogEntry[];
  // Agent process ledger (JOB-05).
  recordProcess(runId: string, pid: number, at: string): void;
  clearProcess(runId: string): void;
  listProcesses(): AgentProcessRecord[];
  // Closes items of ended runs written before items were closed on end.
  closeEndedItems(): number;
}

type Row = {
  id: string;
  project_id: string;
  status: string;
  state_version: number;
  analysis_run_id: string;
  inventory_artifact_id: string;
  inventory_version: number;
  config_json: string;
  items_json: string;
  input_tokens: number;
  output_tokens: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

const COLUMNS = `id, project_id, status, state_version, analysis_run_id,
  inventory_artifact_id, inventory_version, config_json, items_json,
  input_tokens, output_tokens, error_code, created_at, updated_at, started_at,
  finished_at`;

// Items of a run that ended other than by success: nothing is running any
// more, so a running program is `stopped`, a waiting one `skipped`, and a
// document being written goes back to `pending`. Null when nothing changes.
export function closeItems(items: DocumentRunItem[]): DocumentRunItem[] | null {
  let changed = false;
  const closed = items.map((item) => {
    if (item.status !== 'running' && item.status !== 'pending') return item;
    changed = true;
    return {
      ...item,
      status:
        item.status === 'running' ? ('stopped' as const) : ('skipped' as const),
      ...(item.documents
        ? {
            documents: item.documents.map((document) =>
              document.status === 'writing'
                ? { ...document, status: 'pending' as const }
                : document,
            ),
          }
        : {}),
    };
  });
  return changed ? closed : null;
}

const ENDED = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

function toRun(row: Row): DocumentRun {
  const candidate: unknown = {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    stateVersion: row.state_version,
    analysisRunId: row.analysis_run_id,
    inventory: {
      artifactId: row.inventory_artifact_id,
      version: row.inventory_version,
    },
    config: JSON.parse(row.config_json) as unknown,
    items: JSON.parse(row.items_json) as unknown,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
  if (!Check(DocumentRunSchema, candidate))
    throw new Error('Stored document run does not match the contract.');
  return candidate;
}

export function createDocumentRunRepository(
  db: Database.Database,
): DocumentRunRepository {
  const insert = db.prepare(
    `INSERT INTO document_runs (id, project_id, status, state_version,
      analysis_run_id, inventory_artifact_id, inventory_version, config_json,
      items_json, input_tokens, output_tokens, error_code, idempotency_key,
      request_fingerprint, created_at, updated_at, started_at, finished_at)
     VALUES (@id, @projectId, @status, @stateVersion, @analysisRunId,
      @artifactId, @version, @configJson, @itemsJson, @inputTokens,
      @outputTokens, @errorCode, @idempotencyKey, @requestFingerprint,
      @createdAt, @updatedAt, @startedAt, @finishedAt)`,
  );
  const findById = db.prepare<[string, string], Row>(
    `SELECT ${COLUMNS} FROM document_runs WHERE id = ? AND project_id = ?`,
  );
  const findAny = db.prepare<[string], Row>(
    `SELECT ${COLUMNS} FROM document_runs WHERE id = ?`,
  );
  const findByKey = db.prepare<
    [string, string],
    Row & { request_fingerprint: string }
  >(
    `SELECT ${COLUMNS}, request_fingerprint FROM document_runs
     WHERE project_id = ? AND idempotency_key = ?`,
  );
  const findActive = db.prepare<[string], Row>(
    `SELECT ${COLUMNS} FROM document_runs WHERE project_id = ?
       AND status IN ('queued', 'running', 'cancelling')`,
  );
  const findLatest = db.prepare<[string], Row>(
    `SELECT ${COLUMNS} FROM document_runs WHERE project_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 1`,
  );
  const findExecuting = db.prepare<[], Row>(
    `SELECT ${COLUMNS} FROM document_runs
     WHERE status IN ('running', 'cancelling')`,
  );
  const claim = db.prepare<[string, string], Row>(
    `UPDATE document_runs SET status = 'running', started_at = ?,
       updated_at = ?, state_version = state_version + 1
     WHERE id = (SELECT id FROM document_runs WHERE status = 'queued'
                 ORDER BY created_at, id LIMIT 1)
       AND status = 'queued'
       AND NOT EXISTS (SELECT 1 FROM document_runs
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
        errorCode: string | null;
        startedAt: string | null;
        finishedAt: string | null;
        now: string;
      },
    ],
    Row
  >(
    `UPDATE document_runs SET status = @status, error_code = @errorCode,
       started_at = @startedAt, finished_at = @finishedAt, updated_at = @now,
       state_version = state_version + 1
     WHERE id = @id AND status = @expectedStatus
       AND state_version = @expectedVersion
     RETURNING ${COLUMNS}`,
  );
  const progress = db.prepare<
    [string, number, number, string, string, number],
    Row
  >(
    `UPDATE document_runs SET items_json = ?, input_tokens = ?,
       output_tokens = ?, updated_at = ?
     WHERE id = ? AND status = 'running' AND state_version = ?
     RETURNING ${COLUMNS}`,
  );
  const nextSequence = db.prepare<[string], { next: number }>(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM document_run_logs
     WHERE run_id = ?`,
  );
  const insertLog = db.prepare(
    `INSERT INTO document_run_logs (run_id, sequence, at, stream, program, text)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const countLog = db.prepare<[string], { count: number }>(
    'SELECT COUNT(*) AS count FROM document_run_logs WHERE run_id = ?',
  );
  const listLog = db.prepare<
    [string, number, number],
    {
      sequence: number;
      at: string;
      stream: DocumentLogStream;
      program: string | null;
      text: string;
    }
  >(
    `SELECT sequence, at, stream, program, text FROM document_run_logs
     WHERE run_id = ? AND sequence > ? ORDER BY sequence LIMIT ?`,
  );
  const recordProcess = db.prepare(
    `INSERT OR REPLACE INTO agent_processes (run_id, pid, started_at)
     VALUES (?, ?, ?)`,
  );
  const clearProcess = db.prepare(
    'DELETE FROM agent_processes WHERE run_id = ?',
  );
  const listProcesses = db.prepare<[], { run_id: string; pid: number }>(
    'SELECT run_id, pid FROM agent_processes',
  );
  const checkedUpdate = db.transaction((run: () => Row | undefined) => {
    const row = run();
    return row ? toRun(row) : undefined;
  });
  const setItems = db.prepare<[string, string], Row>(
    `UPDATE document_runs SET items_json = ? WHERE id = ? RETURNING ${COLUMNS}`,
  );
  const endedWithOpenItems = db.prepare<[], Row>(
    `SELECT ${COLUMNS} FROM document_runs
     WHERE status IN ('failed', 'cancelled', 'interrupted')
       AND (items_json LIKE '%"status":"running"%'
            OR items_json LIKE '%"status":"pending"%')`,
  );
  // A transition to an ended status closes the items in the same
  // transaction, so no reader sees an ended run with a running program.
  const transitionAndClose = db.transaction(
    (apply: () => Row | undefined): DocumentRun | undefined => {
      const row = apply();
      if (!row) return undefined;
      const run = toRun(row);
      if (!ENDED.has(run.status)) return run;
      const closed = closeItems(run.items);
      if (!closed) return run;
      const updated = setItems.get(JSON.stringify(closed), run.id);
      return updated ? toRun(updated) : run;
    },
  );
  // Startup: runs a previous build ended without closing their items.
  const closeEndedItems = db.transaction((): number => {
    let count = 0;
    for (const row of endedWithOpenItems.all()) {
      const closed = closeItems(toRun(row).items);
      if (!closed) continue;
      setItems.get(JSON.stringify(closed), row.id);
      count++;
    }
    return count;
  });
  const append = db.transaction(
    (runId: string, entry: NewLogEntry, at: string) => {
      const sequence = nextSequence.get(runId)?.next ?? 1;
      insertLog.run(
        runId,
        sequence,
        at,
        entry.stream,
        entry.program,
        entry.text,
      );
      return sequence;
    },
  );
  return {
    transaction: (work) => db.transaction(work).immediate(),
    insert({ run, idempotencyKey, requestFingerprint }) {
      insert.run({
        id: run.id,
        projectId: run.projectId,
        status: run.status,
        stateVersion: run.stateVersion,
        analysisRunId: run.analysisRunId,
        artifactId: run.inventory.artifactId,
        version: run.inventory.version,
        configJson: JSON.stringify(run.config),
        itemsJson: JSON.stringify(run.items),
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        errorCode: run.errorCode,
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
    findExecuting: () => findExecuting.all().map(toRun),
    claimNextQueued: (now) => checkedUpdate(() => claim.get(now, now)),
    transition: (runId, expected, patch, now) =>
      transitionAndClose(() =>
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
          JSON.stringify(update.items),
          update.inputTokens,
          update.outputTokens,
          now,
          runId,
          stateVersion,
        ),
      ),
    appendLog: (runId, entry, at) => append(runId, entry, at),
    countLog: (runId) => countLog.get(runId)?.count ?? 0,
    listLog: (runId, after, limit) =>
      listLog.all(runId, after, limit).map((row) => ({ ...row })),
    recordProcess(runId, pid, at) {
      recordProcess.run(runId, pid, at);
    },
    clearProcess(runId) {
      clearProcess.run(runId);
    },
    closeEndedItems: () => closeEndedItems(),
    listProcesses: () =>
      listProcesses.all().map((row) => ({ runId: row.run_id, pid: row.pid })),
  };
}
