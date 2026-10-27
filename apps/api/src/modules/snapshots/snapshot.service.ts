import type { Run } from '@portal/contracts';
import type { ExecutorErrorCode } from '../../ports/run-executor.js';
import type { SourceRootPolicy } from '../../ports/source-root.js';
import type {
  CreateSnapshotRequest,
  SnapshotManifest,
  WorkspaceProvider,
} from '../../ports/workspace-provider.js';
import { findSourceProfile } from '../analysis/source-profiles.js';
import type { SourceRevision } from '../projects/source-registration.repository.js';
import type { SnapshotRepository } from './snapshot.repository.js';

// Takes the snapshot of the source revision a run locked (B06). The root is
// revalidated right before reading; the snapshot becomes public only when
// its directory was published and its row committed.

export type SnapshotOutcome =
  | { status: 'published'; snapshotId: string; manifest: SnapshotManifest }
  | { status: 'failed'; errorCode: ExecutorErrorCode }
  | { status: 'stopped' };

export function createSnapshotService(deps: {
  repository: SnapshotRepository;
  provider: WorkspaceProvider;
  roots: SourceRootPolicy;
  sources: {
    lockedRevision(
      sourceId: string,
      revision: number,
    ): SourceRevision | undefined;
  };
  nextId(): string;
  now(): Date;
}) {
  return {
    async createForRun(
      run: Run,
      signal: AbortSignal,
      afterFileRead?: CreateSnapshotRequest['afterFileRead'],
    ): Promise<SnapshotOutcome> {
      if (run.source.kind !== 'local')
        throw new Error('Only local sources have snapshots.');
      const locked = deps.sources.lockedRevision(
        run.source.sourceId,
        run.source.revision,
      );
      if (!locked) return { status: 'failed', errorCode: 'SOURCE_UNREADABLE' };
      const profile = findSourceProfile(run.config.profileId);
      if (!profile)
        return { status: 'failed', errorCode: 'SOURCE_PROFILE_UNSUPPORTED' };
      // DATA-03: revalidate before reading. A root that now resolves
      // elsewhere (replaced by a link) is not the registered source.
      const resolved = deps.roots.resolve(locked.rootPath);
      if (!resolved.ok)
        return {
          status: 'failed',
          errorCode:
            resolved.code === 'SOURCE_FORBIDDEN'
              ? 'SOURCE_FORBIDDEN'
              : 'SOURCE_UNREADABLE',
        };
      if (resolved.root !== locked.rootPath)
        return { status: 'failed', errorCode: 'SOURCE_CHANGED' };
      const snapshotId = deps.nextId();
      const result = await deps.provider.createSnapshot({
        snapshotId,
        root: locked.rootPath,
        profile,
        limits: run.config.limits,
        signal,
        ...(afterFileRead ? { afterFileRead } : {}),
      });
      if (result.status !== 'published') return result;
      try {
        deps.repository.insert({
          id: snapshotId,
          projectId: run.projectId,
          sourceId: locked.sourceId,
          revision: locked.revision,
          snapshotHash: result.manifest.snapshotHash,
          profileId: profile.id,
          fileCount: result.manifest.fileCount,
          totalBytes: result.manifest.totalBytes,
          createdAt: deps.now().toISOString(),
        });
      } catch (error) {
        // Not recorded, so not public; remove the app-owned directory.
        await deps.provider.discardSnapshot(snapshotId);
        throw error;
      }
      return { status: 'published', snapshotId, manifest: result.manifest };
    },

    // A recorded snapshot of the project, verified against its manifest.
    async open(
      projectId: string,
      snapshotId: string,
    ): Promise<SnapshotManifest | undefined> {
      if (!deps.repository.findById(projectId, snapshotId)) return undefined;
      return deps.provider.openSnapshot(snapshotId);
    },
  };
}

export type SnapshotService = ReturnType<typeof createSnapshotService>;
