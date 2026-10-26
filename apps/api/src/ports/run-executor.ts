import type { AnalyzeStage, Run, RunErrorCode } from '@portal/contracts';

// Progress of one execution: the stage reached and, once the snapshot exists,
// its ID. Ignored after the run left `running` (cancel/timeout won).
export type RunProgress = { stage: AnalyzeStage; sourceSnapshotId?: string };

export type RunExecutionRequest = {
  run: Run;
  // Aborted on cancel, timeout and shutdown; the executor must stop and settle.
  signal: AbortSignal;
  report: (progress: RunProgress) => void;
};

// TIMEOUT and STOP_UNCONFIRMED are decided by the dispatcher, not the executor.
export type ExecutorErrorCode = Exclude<
  RunErrorCode,
  'TIMEOUT' | 'STOP_UNCONFIRMED'
>;

export type RunExecutionResult =
  | { status: 'succeeded'; sourceSnapshotId: string }
  | { status: 'failed'; errorCode: ExecutorErrorCode }
  // Settled because the signal was aborted: the work has stopped.
  | { status: 'stopped' };

// Runs one analyze execution outside any HTTP request or DB transaction. The
// dispatcher owns admission, state transitions, timeout and cancellation.
export interface RunExecutor {
  execute(request: RunExecutionRequest): Promise<RunExecutionResult>;
}
