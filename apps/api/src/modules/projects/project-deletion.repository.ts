import type Database from 'better-sqlite3';

// What a deleted project left on disk; the rows are already gone.
export type DeletedProjectFiles = {
  snapshotIds: string[];
  // Inventory payloads: artifacts/<id>-v<version>.
  artifacts: { id: string; version: number }[];
  // Document packages: one stored file per package file, version = index + 1.
  packages: { id: string; fileCount: number }[];
  documentRunIds: string[];
};

export interface ProjectDeletionRepository {
  // A run of the project is queued, executing or being cancelled.
  hasActiveRun(projectId: string): boolean;
  // One transaction: every row the project owns, then the project. Undefined
  // when it does not exist (or a run became active); nothing changes then.
  remove(projectId: string): DeletedProjectFiles | undefined;
}

type PackageItems = { packageId?: unknown; files?: unknown }[];

function packagesOf(itemsJson: string): DeletedProjectFiles['packages'] {
  const items = JSON.parse(itemsJson) as PackageItems;
  return items.flatMap((item) =>
    typeof item.packageId === 'string' && Array.isArray(item.files)
      ? [{ id: item.packageId, fileCount: item.files.length }]
      : [],
  );
}

export function createProjectDeletionRepository(
  db: Database.Database,
): ProjectDeletionRepository {
  const active = db.prepare<[string, string], { found: number }>(
    `SELECT 1 AS found WHERE EXISTS (
       SELECT 1 FROM runs WHERE project_id = ?
         AND status IN ('queued', 'running', 'cancelling'))
       OR EXISTS (
       SELECT 1 FROM document_runs WHERE project_id = ?
         AND status IN ('queued', 'running', 'cancelling'))`,
  );
  const exists = db.prepare<[string], { found: number }>(
    'SELECT 1 AS found FROM projects WHERE id = ?',
  );
  const snapshots = db.prepare<[string], { id: string }>(
    'SELECT id FROM source_snapshots WHERE project_id = ?',
  );
  const artifacts = db.prepare<[string], { id: string; version: number }>(
    'SELECT id, version FROM artifacts WHERE project_id = ?',
  );
  const documentRuns = db.prepare<[string], { id: string; items_json: string }>(
    'SELECT id, items_json FROM document_runs WHERE project_id = ?',
  );
  const statements = [
    `DELETE FROM document_review_events WHERE project_id = ?`,
    `DELETE FROM agent_processes WHERE run_id IN
       (SELECT id FROM document_runs WHERE project_id = ?)`,
    `DELETE FROM document_run_logs WHERE run_id IN
       (SELECT id FROM document_runs WHERE project_id = ?)`,
    `DELETE FROM document_runs WHERE project_id = ?`,
    `DELETE FROM artifacts WHERE project_id = ?`,
    `DELETE FROM runs WHERE project_id = ?`,
    `DELETE FROM source_snapshots WHERE project_id = ?`,
  ].map((sql) => db.prepare<[string]>(sql));
  // Revisions are keyed by source, not project, and the project's link
  // references them: unlink first, then drop what it pointed at.
  const sourceOf = db.prepare<[string], { source_id: string }>(
    'SELECT source_id FROM project_sources WHERE project_id = ?',
  );
  const unlink = db.prepare<[string]>(
    'DELETE FROM project_sources WHERE project_id = ?',
  );
  const removeRevisions = db.prepare<[string]>(
    'DELETE FROM source_revisions WHERE source_id = ?',
  );
  const removeProject = db.prepare<[string]>(
    'DELETE FROM projects WHERE id = ?',
  );
  const transaction = db.transaction(
    (projectId: string): DeletedProjectFiles | undefined => {
      if (!exists.get(projectId) || active.get(projectId, projectId))
        return undefined;
      const runs = documentRuns.all(projectId);
      const files: DeletedProjectFiles = {
        snapshotIds: snapshots.all(projectId).map((row) => row.id),
        artifacts: artifacts.all(projectId),
        packages: runs.flatMap((run) => packagesOf(run.items_json)),
        documentRunIds: runs.map((run) => run.id),
      };
      for (const statement of statements) statement.run(projectId);
      const source = sourceOf.get(projectId);
      unlink.run(projectId);
      if (source) removeRevisions.run(source.source_id);
      removeProject.run(projectId);
      return files;
    },
  );
  return {
    hasActiveRun: (projectId) => active.get(projectId, projectId) !== undefined,
    remove: (projectId) => transaction(projectId),
  };
}
