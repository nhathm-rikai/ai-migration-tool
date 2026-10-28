import {
  ACTIVE_RUN_STATUSES,
  TERMINAL_RUN_STATUSES,
  type ActiveRunStatus,
  type Run,
  type RunStatus,
  type TerminalRunStatus,
} from '@portal/contracts';
import type { RunExecutionResult } from '../../ports/run-executor.js';
import type { RunPatch } from './run.repository.js';

// Run state machine (architecture §6). Every transition is a compare-and-set
// on (status, stateVersion) in the repository; this file only decides the
// target state, so the rules stay readable and unit-testable.

export function isActiveStatus(status: RunStatus): status is ActiveRunStatus {
  return (ACTIVE_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

export function isTerminalStatus(
  status: RunStatus,
): status is TerminalRunStatus {
  return (TERMINAL_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

// Why the dispatcher aborted an execution. A user cancel is already committed
// as `cancelling` before the executor is aborted.
export type StopReason = 'cancel' | 'timeout' | 'shutdown';

// queued -> cancelled, running -> cancelling. Other states are not cancelled
// here (the service answers them idempotently or with a conflict).
export function cancelPatch(run: Run, now: string): RunPatch | null {
  if (run.status === 'queued')
    return {
      status: 'cancelled',
      stage: null,
      errorCode: null,
      startedAt: null,
      finishedAt: now,
      sourceSnapshotId: run.sourceSnapshotId,
    };
  if (run.status === 'running')
    return {
      status: 'cancelling',
      stage: run.stage,
      errorCode: null,
      startedAt: run.startedAt,
      finishedAt: null,
      sourceSnapshotId: run.sourceSnapshotId,
    };
  return null;
}

// Target state once an execution settled. A committed cancellation always
// wins: a late success of a `cancelling` run ends `cancelled`, never
// `succeeded`. Terminal runs never change.
export function completionPatch(
  run: Run,
  result: RunExecutionResult,
  stopReason: StopReason | null,
  now: string,
): RunPatch | null {
  if (run.status === 'cancelling')
    return {
      status: 'cancelled',
      stage: null,
      errorCode: null,
      startedAt: run.startedAt,
      finishedAt: now,
      sourceSnapshotId: run.sourceSnapshotId,
    };
  if (run.status !== 'running') return null;
  const ended = {
    startedAt: run.startedAt,
    finishedAt: now,
    sourceSnapshotId: run.sourceSnapshotId,
  };
  if (stopReason === 'timeout')
    return {
      ...ended,
      status: 'failed',
      stage: run.stage,
      errorCode: 'TIMEOUT',
    };
  if (stopReason === 'shutdown')
    return {
      ...ended,
      status: 'interrupted',
      stage: run.stage,
      errorCode: null,
    };
  switch (result.status) {
    case 'succeeded':
      return {
        ...ended,
        status: 'succeeded',
        stage: null,
        errorCode: null,
        // A reused snapshot stays the one locked at admission.
        sourceSnapshotId: run.sourceSnapshotId ?? result.sourceSnapshotId,
      };
    case 'failed':
      return {
        ...ended,
        status: 'failed',
        stage: run.stage,
        errorCode: result.errorCode,
      };
    case 'stopped':
      // Stopped without being asked to: not a success, not a user cancel.
      return {
        ...ended,
        status: 'failed',
        stage: run.stage,
        errorCode: 'INTERNAL_ERROR',
      };
  }
}

// The stop of an aborted execution was not confirmed in time. The slot stays
// held (runtime recovery required) and the run ends failed.
export function stopUnconfirmedPatch(run: Run, now: string): RunPatch | null {
  if (run.status !== 'running' && run.status !== 'cancelling') return null;
  return {
    status: 'failed',
    stage: run.stage,
    errorCode: 'STOP_UNCONFIRMED',
    startedAt: run.startedAt,
    finishedAt: now,
    sourceSnapshotId: run.sourceSnapshotId,
  };
}

// Shutdown or startup recovery of a run that was executing.
export function interruptedPatch(run: Run, now: string): RunPatch | null {
  if (run.status !== 'running' && run.status !== 'cancelling') return null;
  return {
    status: 'interrupted',
    stage: run.stage,
    errorCode: null,
    startedAt: run.startedAt,
    finishedAt: now,
    sourceSnapshotId: run.sourceSnapshotId,
  };
}
