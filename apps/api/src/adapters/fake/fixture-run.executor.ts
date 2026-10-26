import { setTimeout } from 'node:timers/promises';
import type { AnalyzeStage } from '@portal/contracts';
import type { RunExecutor } from '../../ports/run-executor.js';

const STAGES: readonly AnalyzeStage[] = ['snapshot', 'inventory', 'publish'];

// Fixture executor for the demo runtime (B05): walks the analyze stages with
// a delay and reports a new snapshot ID. It reads no source, starts no process
// and calls no network; real analysis replaces it in B06/B08. A run that
// "succeeds" here has no artifact yet.
export function createFixtureRunExecutor(options: {
  stageDelayMs: number;
  nextId(): string;
}): RunExecutor {
  const { stageDelayMs } = options;
  if (
    !Number.isInteger(stageDelayMs) ||
    stageDelayMs < 0 ||
    stageDelayMs > 60_000
  )
    throw new Error(
      'Fixture stage delay must be an integer from 0 to 60000 milliseconds.',
    );
  return {
    async execute({ run, signal, report }) {
      const sourceSnapshotId = run.sourceSnapshotId ?? options.nextId();
      for (const stage of STAGES) {
        if (signal.aborted) return { status: 'stopped' };
        // The snapshot exists once its stage is done.
        report(stage === 'snapshot' ? { stage } : { stage, sourceSnapshotId });
        try {
          await setTimeout(stageDelayMs, undefined, { signal });
        } catch (error) {
          if (signal.aborted) return { status: 'stopped' };
          throw error;
        }
      }
      return { status: 'succeeded', sourceSnapshotId };
    },
  };
}
