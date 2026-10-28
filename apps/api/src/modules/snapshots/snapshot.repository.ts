import type Database from 'better-sqlite3';

// Index of published snapshots (B06). A row is written only after the
// snapshot directory was renamed into place; the row makes it public.

export type SnapshotRecord = {
  id: string;
  projectId: string;
  sourceId: string;
  revision: number;
  snapshotHash: string;
  profileId: string;
  fileCount: number;
  totalBytes: number;
  createdAt: string;
};

export interface SnapshotRepository {
  insert(record: SnapshotRecord): void;
  findById(projectId: string, id: string): SnapshotRecord | undefined;
}

type SnapshotRow = {
  id: string;
  project_id: string;
  source_id: string;
  revision: number;
  snapshot_hash: string;
  profile_id: string;
  file_count: number;
  total_bytes: number;
  created_at: string;
};

export function createSnapshotRepository(
  db: Database.Database,
): SnapshotRepository {
  const insert = db.prepare(
    `INSERT INTO source_snapshots (id, project_id, source_id, revision,
       snapshot_hash, profile_id, file_count, total_bytes, created_at)
     VALUES (@id, @projectId, @sourceId, @revision, @snapshotHash,
       @profileId, @fileCount, @totalBytes, @createdAt)`,
  );
  const find = db.prepare<[string, string], SnapshotRow>(
    `SELECT id, project_id, source_id, revision, snapshot_hash, profile_id,
       file_count, total_bytes, created_at
     FROM source_snapshots WHERE project_id = ? AND id = ?`,
  );
  return {
    insert(record) {
      insert.run(record);
    },
    findById(projectId, id) {
      const row = find.get(projectId, id);
      return row
        ? {
            id: row.id,
            projectId: row.project_id,
            sourceId: row.source_id,
            revision: row.revision,
            snapshotHash: row.snapshot_hash,
            profileId: row.profile_id,
            fileCount: row.file_count,
            totalBytes: row.total_bytes,
            createdAt: row.created_at,
          }
        : undefined;
    },
  };
}
