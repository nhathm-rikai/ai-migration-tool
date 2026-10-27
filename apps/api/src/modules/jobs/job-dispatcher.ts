import type { Run, RuntimeStatus } from '@portal/contracts';
import type {
  RunExecutionResult,
  RunExecutor,
  RunProgress,
} from '../../ports/run-executor.js';
import { getErrorReason } from '../../shared/error-diagnostics.js';
import {
  completionPatch,
  interruptedPatch,
  stopUnconfirmedPatch,
  type StopReason,
} from './job-state.js';
import type { RunPatch, RunRepository } from './run.repository.js';
import type { JobControl } from './job.service.js';

// Executes queued runs one at a time (B05). Claiming is an atomic UPDATE that
// the DB only allows while nothing else executes; every state change is
// committed by compare-and-set before anything else observes it. Executions
// run outside HTTP requests and DB transactions.

export type DispatcherLog = {
  error(details: Record<string, unknown>, message: string): void;
  warn(details: Record<string, unknown>, message: string): void;
};

type Execution = {
  run: Run;
  controller: AbortController;
  stopReason: StopReason | null;
  stopTimer: NodeJS.Timeout | undefined;
  // The stop deadline passed: the run ended failed/STOP_UNCONFIRMED.
  unconfirmed: boolean;
  done: Promise<void>;
};

const CLAIM_RETRY_MIN_MS = 1000;
const CLAIM_RETRY_MAX_MS = 30_000;

export function createJobDispatcher(deps: {
  repository: RunRepository;
  executor: RunExecutor;
  // How long an aborted execution may take to settle.
  stopTimeoutMs: number;
  now(): Date;
  log: DispatcherLog;
}) {
  const { repository, log } = deps;
  let active: Execution | null = null;
  let scheduled: NodeJS.Immediate | null = null;
  // A failed claim changed nothing (one UPDATE); it is retried with backoff
  // so queued runs do not wait for an unrelated wake.
  let claimRetry: NodeJS.Timeout | undefined;
  let claimDelayMs = CLAIM_RETRY_MIN_MS;
  let closed = false;
  // Set once close() returned: the database may be gone.
  let detached = false;
  // An execution did not confirm its stop; no new run may start until an
  // operator restarts the runtime (JOB-04).
  let recoveryRequired = false;
  const iso = () => deps.now().toISOString();

  function commit(run: Run, patch: RunPatch | null): Run | undefined {
    if (!patch) return undefined;
    const updated = repository.transition(
      run.id,
      { status: run.status, stateVersion: run.stateVersion },
      patch,
      iso(),
    );
    if (!updated)
      log.warn(
        { code: 'RUN_TRANSITION_SKIPPED', runId: run.id, status: patch.status },
        'Run changed before the transition was committed.',
      );
    return updated;
  }

  // Re-reads the run so the decision uses the committed state (a cancel may
  // have landed while the execution was settling). A failed write leaves the
  // run executing in the DB, which blocks every claim: the runtime goes to
  // recovery_required (Start answers 503) instead of reporting ready while
  // the queue is stuck. Restart marks the run interrupted.
  function settle(
    run: { id: string },
    decide: (current: Run, now: string) => RunPatch | null,
  ): void {
    try {
      const current = repository.findAny(run.id);
      if (current) commit(current, decide(current, iso()));
    } catch (error) {
      recoveryRequired = true;
      log.error(
        {
          code: 'RUN_STATE_WRITE_FAILED',
          reason: getErrorReason(error),
          runId: run.id,
        },
        'Could not record the run state; runtime needs recovery.',
      );
    }
  }

  function report(execution: Execution, progress: RunProgress): void {
    if (execution.controller.signal.aborted || detached) return;
    try {
      repository.updateProgress(
        execution.run.id,
        execution.run.stateVersion,
        {
          stage: progress.stage,
          sourceSnapshotId: progress.sourceSnapshotId ?? null,
        },
        iso(),
      );
    } catch (error) {
      log.error(
        {
          code: 'RUN_PROGRESS_WRITE_FAILED',
          reason: getErrorReason(error),
          runId: execution.run.id,
        },
        'Could not record run progress.',
      );
    }
  }

  function stop(execution: Execution, reason: StopReason): void {
    // The first reason wins; a later cancel is still committed as cancelling
    // by the service, which makes the completion end `cancelled`.
    if (execution.stopReason) return;
    execution.stopReason = reason;
    execution.controller.abort();
    // Shutdown has its own deadline in close().
    if (reason === 'shutdown') return;
    execution.stopTimer = setTimeout(() => {
      execution.unconfirmed = true;
      recoveryRequired = true;
      log.error(
        { code: 'RUN_STOP_UNCONFIRMED', runId: execution.run.id },
        'Run did not confirm its stop; runtime needs recovery.',
      );
      settle(execution.run, stopUnconfirmedPatch);
    }, deps.stopTimeoutMs);
  }

  async function execute(execution: Execution): Promise<void> {
    const { run, controller } = execution;
    const timeout = setTimeout(
      () => stop(execution, 'timeout'),
      run.config.limits.timeoutMs,
    );
    let result: RunExecutionResult;
    try {
      result = await deps.executor.execute({
        run,
        signal: controller.signal,
        report: (progress) => report(execution, progress),
      });
    } catch (error) {
      log.error(
        {
          code: 'RUN_EXECUTION_FAILED',
          reason: getErrorReason(error),
          runId: run.id,
        },
        'Run execution failed unexpectedly.',
      );
      result = { status: 'failed', errorCode: 'INTERNAL_ERROR' };
    } finally {
      clearTimeout(timeout);
      clearTimeout(execution.stopTimer);
    }
    // Too late: the run already ended STOP_UNCONFIRMED, or the DB is closed.
    if (execution.unconfirmed || detached) return;
    settle(execution.run, (current, now) =>
      completionPatch(current, result, execution.stopReason, now),
    );
  }

  function dispatch(): void {
    if (closed || active || recoveryRequired) return;
    let run: Run | undefined;
    try {
      run = repository.claimNextQueued(iso());
    } catch (error) {
      log.error(
        { code: 'RUN_CLAIM_FAILED', reason: getErrorReason(error) },
        'Could not claim a queued run; retrying.',
      );
      if (!claimRetry) {
        claimRetry = setTimeout(() => {
          claimRetry = undefined;
          wake();
        }, claimDelayMs);
        claimDelayMs = Math.min(claimDelayMs * 2, CLAIM_RETRY_MAX_MS);
      }
      return;
    }
    claimDelayMs = CLAIM_RETRY_MIN_MS;
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
    // Never execute inside the caller (an HTTP handler or a transaction).
    scheduled = setImmediate(() => {
      scheduled = null;
      dispatch();
    });
  }

  const control: JobControl = {
    wake,
    requestStop(runId) {
      if (active?.run.id === runId) {
        stop(active, 'cancel');
        return;
      }
      // Nothing executes this run here (its execution already ended, e.g. a
      // completion that could not be recorded): the stop is confirmed.
      if (detached) return;
      settle({ id: runId }, (current, now) =>
        current.status === 'cancelling'
          ? completionPatch(current, { status: 'stopped' }, 'cancel', now)
          : null,
      );
    },
    runtimeStatus: (): RuntimeStatus =>
      recoveryRequired
        ? {
            status: 'recovery_required',
            reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED',
          }
        : { status: 'ready', reasonCode: null },
  };

  return {
    ...control,
    // Startup: a run left running/cancelling by a previous process ended
    // `interrupted`. It is never resumed or retried automatically.
    recover(): number {
      let count = 0;
      for (const run of repository.findExecuting()) {
        if (commit(run, interruptedPatch(run, iso()))) count++;
      }
      return count;
    },
    // Shutdown: stop dispatching, stop the execution within the deadline and
    // record it `interrupted` before the database closes.
    async close(): Promise<void> {
      closed = true;
      if (scheduled) clearImmediate(scheduled);
      scheduled = null;
      clearTimeout(claimRetry);
      claimRetry = undefined;
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
        clearTimeout(execution.stopTimer);
        if (!settled && !execution.unconfirmed)
          settle(execution.run, interruptedPatch);
      }
      detached = true;
    },
  };
}

export type JobDispatcher = ReturnType<typeof createJobDispatcher>;
