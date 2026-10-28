import type {
  RunExecutionResult,
  RunExecutor,
} from '../../ports/run-executor.js';
import type { InventoryBuilder } from '../../ports/inventory-builder.js';
import type { SnapshotManifest } from '../../ports/workspace-provider.js';
import type { ArtifactService } from '../../modules/artifacts/artifact.service.js';
import type { SnapshotService } from '../../modules/snapshots/snapshot.service.js';
import { DEMO_SNAPSHOT_HASH, demoInventory } from '../fake/demo-inventory.js';

// Executor of analyze runs by source kind. Demo projects run the fixture
// executor, then publish the bundled demo inventory as the run's artifact
// (B07). A local source gets its immutable snapshot (B06), or reopens the
// recorded one for reuse-snapshot; its raw bytes then go through the
// analyzer library in the inventory builder (a worker thread) and the
// inventory is published as the run's artifact (B08). Every step checks the signal first: a cancel/timeout that won
// publishes nothing, and one that lands after the publish leaves the
// artifact isolated (its run never ends succeeded).

export type SourceRunHooks = {
  // Tests: called before the snapshot files are read for the inventory.
  beforeReadFiles?: () => Promise<void> | void;
  // Tests: called right before the publish of a local inventory.
  beforePublish?: () => Promise<void> | void;
};

type Snapshot =
  | { status: 'ready'; snapshotId: string; manifest: SnapshotManifest }
  | Exclude<RunExecutionResult, { status: 'succeeded' }>;

export function createSourceRunExecutor(deps: {
  fixture: RunExecutor;
  snapshots: Pick<SnapshotService, 'createForRun' | 'open' | 'readFiles'>;
  artifacts: Pick<ArtifactService, 'publishInventory' | 'publishPrepared'>;
  inventory: InventoryBuilder;
  hooks?: SourceRunHooks;
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
          payloadSnapshotHash: DEMO_SNAPSHOT_HASH,
          payload: demoInventory,
        });
        return outcome.status === 'published' ? result : outcome;
      }
      if (signal.aborted) return { status: 'stopped' };
      report({ stage: 'snapshot' });
      const snapshot = await stoppable(takeSnapshot);
      if (snapshot.status !== 'ready') return snapshot;
      const { snapshotId, manifest } = snapshot;

      if (signal.aborted) return { status: 'stopped' };
      report({ stage: 'inventory', sourceSnapshotId: snapshotId });
      await deps.hooks?.beforeReadFiles?.();
      const files = await stoppable(async () => {
        const read = await deps.snapshots.readFiles(manifest, signal);
        // The stored bytes no longer match the snapshot just checked.
        return read
          ? { status: 'read' as const, files: read }
          : { status: 'failed' as const, errorCode: 'INTERNAL_ERROR' as const };
      });
      if (files.status !== 'read') return files;
      const built = await deps.inventory.build(
        { run, manifest, files: files.files },
        signal,
      );
      if (built.status !== 'prepared') return built;

      await deps.hooks?.beforePublish?.();
      if (signal.aborted) return { status: 'stopped' };
      report({ stage: 'publish', sourceSnapshotId: snapshotId });
      const outcome = await deps.artifacts.publishPrepared({
        run,
        sourceSnapshotId: snapshotId,
        sourceSnapshotHash: manifest.snapshotHash,
        prepared: built,
      });
      return outcome.status === 'published'
        ? { status: 'succeeded', sourceSnapshotId: snapshotId }
        : outcome;

      async function takeSnapshot(): Promise<Snapshot> {
        if (run.sourceStrategy === 'reuse-snapshot') {
          // Reproduce on the recorded snapshot; never re-read the source.
          const manifest = await deps.snapshots.open(
            run.projectId,
            run.sourceSnapshotId,
            signal,
          );
          return manifest
            ? { status: 'ready', snapshotId: run.sourceSnapshotId, manifest }
            : { status: 'failed', errorCode: 'INTERNAL_ERROR' };
        }
        const outcome = await deps.snapshots.createForRun(run, signal);
        if (outcome.status !== 'published') return outcome;
        report({ stage: 'snapshot', sourceSnapshotId: outcome.snapshotId });
        return {
          status: 'ready',
          snapshotId: outcome.snapshotId,
          manifest: outcome.manifest,
        };
      }

      // Reading/verifying a stored snapshot reads every file: it checks the
      // signal per file and throws once aborted, which settles `stopped`
      // within the stop deadline instead of reading on.
      async function stoppable<T>(
        step: () => Promise<T>,
      ): Promise<T | { status: 'stopped' }> {
        try {
          return await step();
        } catch (error) {
          if (signal.aborted) return { status: 'stopped' };
          throw error;
        }
      }
    },
  };
}
