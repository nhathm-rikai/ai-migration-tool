import { AppError } from '../../shared/app-error.js';
import type { ProjectDeletionRepository } from './project-deletion.repository.js';

// What the service removes from disk once the rows are gone. Each is an
// app-owned location; a failure leaves an orphan nothing reads (the rows that
// made it public are deleted), so it is logged, not surfaced.
export type ProjectFileCleanup = {
  discardSnapshot(snapshotId: string): Promise<void>;
  discardArtifact(id: string, version: number): Promise<void>;
  discardPackageFile(id: string, version: number): Promise<void>;
  removeDocumentWorkspace(runId: string): Promise<void>;
};

export function createProjectDeletionService(deps: {
  repository: ProjectDeletionRepository;
  cleanup: ProjectFileCleanup;
  log: { warn(details: Record<string, unknown>, message: string): void };
}) {
  async function bestEffort(task: () => Promise<void>, what: string) {
    try {
      await task();
    } catch (error) {
      deps.log.warn(
        { what, error: error instanceof Error ? error.message : 'unknown' },
        'Project file cleanup failed; the orphan is never read.',
      );
    }
  }
  return {
    // Database first (atomic, the source of truth), files after. A run still
    // queued or executing blocks the delete: stop it first.
    async delete(projectId: string): Promise<{ id: string }> {
      if (deps.repository.hasActiveRun(projectId))
        throw new AppError('PROJECT_BUSY');
      const files = deps.repository.remove(projectId);
      if (!files) throw new AppError('PROJECT_NOT_FOUND');
      const { cleanup } = deps;
      await Promise.all([
        ...files.snapshotIds.map((id) =>
          bestEffort(() => cleanup.discardSnapshot(id), 'snapshot'),
        ),
        ...files.artifacts.map(({ id, version }) =>
          bestEffort(() => cleanup.discardArtifact(id, version), 'artifact'),
        ),
        ...files.packages.flatMap(({ id, fileCount }) =>
          Array.from({ length: fileCount }, (_, index) =>
            bestEffort(
              () => cleanup.discardPackageFile(id, index + 1),
              'package',
            ),
          ),
        ),
        ...files.documentRunIds.map((id) =>
          bestEffort(() => cleanup.removeDocumentWorkspace(id), 'workspace'),
        ),
      ]);
      return { id: projectId };
    },
  };
}

export type ProjectDeletionService = ReturnType<
  typeof createProjectDeletionService
>;
