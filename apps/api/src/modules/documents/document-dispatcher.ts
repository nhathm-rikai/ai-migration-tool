import type { DocumentRun, DocumentRuntimeStatus } from '@portal/contracts';
import { getErrorReason } from '../../shared/error-diagnostics.js';
import { isProcessGone } from '../../platform/process-tree.js';
import type { DispatcherLog } from '../jobs/job-dispatcher.js';
import type {
  DocumentExecutionResult,
  DocumentExecutor,
} from './document-executor.js';
import type {
  DocumentRunPatch,
  DocumentRunRepository,
  NewLogEntry,
} from './document-run.repository.js';

// Executes queued document runs one at a time, like the analyze dispatcher:
// atomic claim, compare-and-set transitions, timeout and cancel through one
// AbortController, and recovery_required when a stop is not confirmed or a
// previous backend left an agent process that may still be alive (JOB-04/05).

type StopReason = 'cancel' | 'timeout' | 'shutdown';

type Execution = {
  run: DocumentRun;
  controller: AbortController;
  stopReason: StopReason | null;
  stopTimer: NodeJS.Timeout | undefined;
  unconfirmed: boolean;
  done: Promise<void>;
};

// Log lines kept per run; the rest is counted, not stored.
export const MAX_LOG_ENTRIES = 2000;

export interface DocumentJobControl {
  wake(): void;
  requestStop(runId: string): void;
  runtimeStatus(): DocumentRuntimeStatus;
}

function completion(
  current: DocumentRun,
  result: DocumentExecutionResult,
  reason: StopReason | null,
  now: string,
): DocumentRunPatch | null {
  if (current.status !== 'running' && current.status !== 'cancelling')
    return null;
  const base = { startedAt: current.startedAt, finishedAt: now };
  // A committed cancel wins over a late completion (JOB-02).
  if (current.status === 'cancelling' || reason === 'cancel')
    return { ...base, status: 'cancelled', errorCode: null };
  if (reason === 'timeout')
    return { ...base, status: 'failed', errorCode: 'TIMEOUT' };
  if (reason === 'shutdown')
    return { ...base, status: 'interrupted', errorCode: null };
  if (result.status === 'succeeded')
    return { ...base, status: 'succeeded', errorCode: null };
  if (result.status === 'failed')
    return { ...base, status: 'failed', errorCode: result.errorCode };
  return { ...base, status: 'failed', errorCode: 'INTERNAL_ERROR' };
}

export function createDocumentDispatcher(deps: {
  repository: DocumentRunRepository;
  executor: DocumentExecutor;
  stopTimeoutMs: number;
  now(): Date;
  log: DispatcherLog;
  recoveryRequired?: boolean;
  // Test hook for the ledger check.
  isProcessGone?: (pid: number) => boolean;
}) {
  const { repository, log } = deps;
  const processGone = deps.isProcessGone ?? isProcessGone;
  let active: Execution | null = null;
  let scheduled: NodeJS.Immediate | null = null;
  let closed = false;
  let detached = false;
  let recoveryRequired = deps.recoveryRequired ?? false;
  const iso = () => deps.now().toISOString();

  function settle(
    runId: string,
    decide: (current: DocumentRun, now: string) => DocumentRunPatch | null,
  ): void {
    try {
      const current = repository.findAny(runId);
      if (!current) return;
      const patch = decide(current, iso());
      if (!patch) return;
      const updated = repository.transition(
        current.id,
        { status: current.status, stateVersion: current.stateVersion },
        patch,
        iso(),
      );
      if (!updated)
        log.warn(
          { code: 'RUN_TRANSITION_SKIPPED', runId, status: patch.status },
          'Document run changed before the transition was committed.',
        );
    } catch (error) {
      recoveryRequired = true;
      log.error(
        {
          code: 'RUN_STATE_WRITE_FAILED',
          reason: getErrorReason(error),
          runId,
        },
        'Could not record the document run state; runtime needs recovery.',
      );
    }
  }

  function writeLog(execution: Execution, entry: NewLogEntry): void {
    if (detached) return;
    try {
      if (repository.countLog(execution.run.id) >= MAX_LOG_ENTRIES) return;
      repository.appendLog(execution.run.id, entry, iso());
    } catch (error) {
      log.error(
        {
          code: 'RUN_LOG_WRITE_FAILED',
          reason: getErrorReason(error),
          runId: execution.run.id,
        },
        'Could not record a document run log line.',
      );
    }
  }

  function stop(execution: Execution, reason: StopReason): void {
    if (execution.stopReason) return;
    execution.stopReason = reason;
    execution.controller.abort();
    if (reason === 'shutdown') return;
    execution.stopTimer = setTimeout(() => {
      execution.unconfirmed = true;
      recoveryRequired = true;
      log.error(
        { code: 'RUN_STOP_UNCONFIRMED', runId: execution.run.id },
        'Agent process did not confirm its stop; runtime needs recovery.',
      );
      settle(execution.run.id, (current, now) =>
        current.status === 'running' || current.status === 'cancelling'
          ? {
              status: 'failed',
              errorCode: 'STOP_UNCONFIRMED',
              startedAt: current.startedAt,
              finishedAt: now,
            }
          : null,
      );
    }, deps.stopTimeoutMs);
  }

  async function execute(execution: Execution): Promise<void> {
    const { run, controller } = execution;
    const timeout = setTimeout(
      () => stop(execution, 'timeout'),
      run.config.limits.timeoutMs,
    );
    let result: DocumentExecutionResult;
    try {
      result = await deps.executor.execute({
        run,
        signal: controller.signal,
        report(progress) {
          if (controller.signal.aborted || detached) return;
          try {
            repository.updateProgress(
              run.id,
              run.stateVersion,
              progress,
              iso(),
            );
          } catch (error) {
            log.error(
              {
                code: 'RUN_PROGRESS_WRITE_FAILED',
                reason: getErrorReason(error),
                runId: run.id,
              },
              'Could not record document run progress.',
            );
          }
        },
        log: (entry) => writeLog(execution, entry),
        process(event) {
          if (detached) return;
          try {
            if (event.kind === 'started')
              repository.recordProcess(run.id, event.pid, iso());
            else repository.clearProcess(run.id);
          } catch (error) {
            // Without the ledger a crash could leave an untracked process.
            recoveryRequired = true;
            log.error(
              {
                code: 'AGENT_LEDGER_WRITE_FAILED',
                reason: getErrorReason(error),
                runId: run.id,
              },
              'Could not record the agent process; runtime needs recovery.',
            );
          }
        },
      });
    } catch (error) {
      log.error(
        {
          code: 'RUN_EXECUTION_FAILED',
          reason: getErrorReason(error),
          runId: run.id,
        },
        'Document run failed unexpectedly.',
      );
      result = { status: 'failed', errorCode: 'INTERNAL_ERROR' };
    } finally {
      clearTimeout(timeout);
      clearTimeout(execution.stopTimer);
    }
    if (execution.unconfirmed || detached) return;
    settle(run.id, (current, now) =>
      completion(current, result, execution.stopReason, now),
    );
  }

  function dispatch(): void {
    if (closed || active || recoveryRequired) return;
    let run: DocumentRun | undefined;
    try {
      run = repository.claimNextQueued(iso());
    } catch (error) {
      log.error(
        { code: 'RUN_CLAIM_FAILED', reason: getErrorReason(error) },
        'Could not claim a queued document run.',
      );
      return;
    }
    if (!run) return;
    const execution: Execution = {
      run,
      controller: new AbortController(),
      stopReason: null,
      stopTimer: undefined,
      unconfirmed: false,
      done: Promise.resolve(),
    };
    active = execution;
    execution.done = execute(execution).finally(() => {
      if (active === execution) active = null;
      wake();
    });
  }

  function wake(): void {
    if (closed || scheduled) return;
    scheduled = setImmediate(() => {
      scheduled = null;
      dispatch();
    });
  }

  const control: DocumentJobControl = {
    wake,
    requestStop(runId) {
      if (active?.run.id === runId) {
        stop(active, 'cancel');
        return;
      }
      if (detached) return;
      settle(runId, (current, now) =>
        current.status === 'cancelling'
          ? {
              status: 'cancelled',
              errorCode: null,
              startedAt: current.startedAt,
              finishedAt: now,
            }
          : null,
      );
    },
    runtimeStatus: (): DocumentRuntimeStatus =>
      recoveryRequired
        ? {
            status: 'recovery_required',
            reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED',
          }
        : { status: 'ready', reasonCode: null },
  };

  return {
    ...control,
    // Startup: runs left executing end interrupted (never resumed). An agent
    // PID still recorded is cleared only when the OS reports it gone; a live
    // PID (maybe reused, maybe our orphan) keeps dispatch blocked until the
    // operator ends it and restarts.
    recover(): number {
      let count = 0;
      repository.closeEndedItems();
      for (const run of repository.findExecuting()) {
        const updated = repository.transition(
          run.id,
          { status: run.status, stateVersion: run.stateVersion },
          {
            status: 'interrupted',
            errorCode: null,
            startedAt: run.startedAt,
            finishedAt: iso(),
          },
          iso(),
        );
        if (updated) count++;
      }
      for (const record of repository.listProcesses()) {
        if (processGone(record.pid)) repository.clearProcess(record.runId);
        else {
          recoveryRequired = true;
          log.error(
            {
              code: 'AGENT_PROCESS_MAY_BE_ALIVE',
              runId: record.runId,
              pid: record.pid,
            },
            'An agent process of a previous backend may still be running; document runs are blocked until it is gone.',
          );
        }
      }
      return count;
    },
    async close(): Promise<void> {
      closed = true;
      if (scheduled) clearImmediate(scheduled);
      scheduled = null;
      const execution = active;
      if (execution) {
        stop(execution, 'shutdown');
        let deadline: NodeJS.Timeout | undefined;
        const settled = await Promise.race([
          execution.done.then(() => true),
          new Promise<boolean>((resolve) => {
            deadline = setTimeout(() => resolve(false), deps.stopTimeoutMs);
          }),
        ]);
        clearTimeout(deadline);
        if (!settled && !execution.unconfirmed)
          settle(execution.run.id, (current, now) =>
            current.status === 'running' || current.status === 'cancelling'
              ? {
                  status: 'interrupted',
                  errorCode: null,
                  startedAt: current.startedAt,
                  finishedAt: now,
                }
              : null,
          );
      }
      detached = true;
    },
  };
}

export type DocumentDispatcher = ReturnType<typeof createDocumentDispatcher>;
