import { setTimeout } from 'node:timers/promises';
import type { AnalyzeStage } from '@portal/contracts';
import type { RunExecutor } from '../../ports/run-executor.js';
import { createRunFileProgress } from '../local/run-file-progress.js';

const STAGES: readonly AnalyzeStage[] = ['snapshot', 'inventory', 'publish'];

// Fixture executor for the demo runtime (B05): walks the analyze stages with
// a delay and reports a new snapshot ID. It reads no source, starts no process
// and calls no network; real analysis replaces it in B06/B08. The source
// run executor publishes the demo inventory after it succeeds (B07).
//
// With `files`, it also reports simulated per-file progress over those paths
// (the demo inventory's files, no real reading), spread over the snapshot
// and inventory stages. Only the demo project runs this executor.
export function createFixtureRunExecutor(options: {
  stageDelayMs: number;
  nextId(): string;
  files?: readonly { relativePath: string; byteLength: number }[];
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
    async execute({ run, signal, report, reportFiles }) {
      const sourceSnapshotId = run.sourceSnapshotId ?? options.nextId();
      const demoFiles = options.files ?? [];
      const progress = createRunFileProgress(reportFiles);
      const total = demoFiles.length;
      const bytesTotal = demoFiles.reduce((sum, f) => sum + f.byteLength, 0);
      const wait = (ms: number) => setTimeout(ms, undefined, { signal });
      try {
        for (const stage of STAGES) {
          if (signal.aborted) return { status: 'stopped' };
          // The snapshot exists once its stage is done.
          report(
            stage === 'snapshot' ? { stage } : { stage, sourceSnapshotId },
          );
          if (stage === 'publish' || total === 0) {
            if (stage === 'publish' && total > 0)
              progress.update({ phase: 'publish' });
            await wait(stageDelayMs);
            continue;
          }
          const step = Math.max(1, Math.floor(stageDelayMs / total));
          let bytes = 0;
          for (const [index, file] of demoFiles.entries()) {
            // No delay configured (tests): report without waiting.
            if (stageDelayMs > 0) await wait(step);
            bytes += file.byteLength;
            progress.update(
              stage === 'snapshot'
                ? {
                    phase: 'snapshot',
                    filesTotal: total,
                    filesSnapshotted: index + 1,
                    bytesDone: bytes,
                    bytesTotal,
                  }
                : { phase: 'inventory', filesAnalyzed: index + 1 },
              file.relativePath,
            );
          }
        }
      } catch (error) {
        if (signal.aborted) return { status: 'stopped' };
        throw error;
      }
      return { status: 'succeeded', sourceSnapshotId };
    },
  };
}
