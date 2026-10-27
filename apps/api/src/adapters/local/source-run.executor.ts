import type { RunExecutor } from '../../ports/run-executor.js';
import type { ArtifactService } from '../../modules/artifacts/artifact.service.js';
import type { SnapshotService } from '../../modules/snapshots/snapshot.service.js';
import { DEMO_SNAPSHOT_HASH, demoInventory } from '../fake/demo-inventory.js';

// Executor of analyze runs by source kind. Demo projects run the fixture
// executor, then publish the bundled demo inventory as the run's artifact
// (B07). A local source gets its immutable snapshot (B06); its inventory
// comes with B08, so until then a local run ends once its snapshot is
// recorded and has no artifact.
export function createSourceRunExecutor(deps: {
  fixture: RunExecutor;
  snapshots: SnapshotService;
  artifacts: Pick<ArtifactService, 'publishInventory'>;
}): RunExecutor {
  return {
    async execute(request) {
      const { run, signal, report } = request;
      if (run.source.kind === 'fixture') {
        const result = await deps.fixture.execute(request);
        if (result.status !== 'succeeded') return result;
        // Cancel/timeout won while the stages ran: publish nothing.
        if (signal.aborted) return { status: 'stopped' };
        report({ stage: 'publish', sourceSnapshotId: result.sourceSnapshotId });
        const outcome = await deps.artifacts.publishInventory({
          run,
          sourceSnapshotId: result.sourceSnapshotId,
          sourceSnapshotHash: DEMO_SNAPSHOT_HASH,
          payload: demoInventory,
        });
        return outcome.status === 'published' ? result : outcome;
      }
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
