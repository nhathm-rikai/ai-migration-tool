import type { RunExecutor } from '../../ports/run-executor.js';
import type { SnapshotService } from '../../modules/snapshots/snapshot.service.js';

// Executor of analyze runs by source kind. Demo projects keep the fixture
// executor; a local source gets its immutable snapshot (B06). Inventory and
// publish of the artifact come with B08/B07: until then a local run ends
// once its snapshot is recorded and has no artifact.
export function createSourceRunExecutor(deps: {
  fixture: RunExecutor;
  snapshots: SnapshotService;
}): RunExecutor {
  return {
    async execute(request) {
      const { run, signal, report } = request;
      if (run.source.kind === 'fixture') return deps.fixture.execute(request);
      if (signal.aborted) return { status: 'stopped' };
      report({ stage: 'snapshot' });
      if (run.sourceStrategy === 'reuse-snapshot') {
        // Reproduce on the recorded snapshot; never re-read the source.
        const manifest = await deps.snapshots.open(
          run.projectId,
          run.sourceSnapshotId,
        );
        return manifest
          ? { status: 'succeeded', sourceSnapshotId: run.sourceSnapshotId }
          : { status: 'failed', errorCode: 'INTERNAL_ERROR' };
      }
      const outcome = await deps.snapshots.createForRun(run, signal);
      if (outcome.status === 'published') {
        report({ stage: 'snapshot', sourceSnapshotId: outcome.snapshotId });
        return { status: 'succeeded', sourceSnapshotId: outcome.snapshotId };
      }
      return outcome;
    },
  };
}
