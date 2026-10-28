import type Database from 'better-sqlite3';
import { ArtifactRefSchema, type ArtifactRef } from '@portal/contracts';
import { Check } from 'typebox/value';

// Index of published artifacts (B07). A row is written only after the
// payload directory was renamed into place; the row makes a version public.
// Every query is scoped by project so a foreign artifact is never found.

export interface ArtifactRepository {
  insert(ref: ArtifactRef): void;
  listByRun(projectId: string, runId: string): ArtifactRef[];
  find(
    projectId: string,
    artifactId: string,
    version: number,
  ): ArtifactRef | undefined;
}

type ArtifactRow = {
  id: string;
  version: number;
  project_id: string;
  run_id: string;
  kind: string;
  schema_version: string;
  source_snapshot_id: string;
  source_snapshot_hash: string;
  mode: string;
  sha256: string;
  byte_length: number;
  created_at: string;
};

const COLUMNS = `id, version, project_id, run_id, kind, schema_version,
  source_snapshot_id, source_snapshot_hash, mode, sha256, byte_length,
  created_at`;

// Validated on read: a row that does not form an ArtifactRef fails loudly.
function toRef(row: ArtifactRow): ArtifactRef {
  const candidate: unknown = {
    id: row.id,
    version: row.version,
    kind: row.kind,
    schemaVersion: row.schema_version,
    projectId: row.project_id,
    runId: row.run_id,
    sourceSnapshotId: row.source_snapshot_id,
    sourceSnapshotHash: row.source_snapshot_hash,
    mode: row.mode,
    sha256: row.sha256,
    byteLength: row.byte_length,
    createdAt: row.created_at,
  };
  if (!Check(ArtifactRefSchema, candidate))
    throw new Error('Stored artifact does not match the artifact contract.');
  return candidate;
}

export function createArtifactRepository(
  db: Database.Database,
): ArtifactRepository {
  const insert = db.prepare(
    `INSERT INTO artifacts (${COLUMNS})
     VALUES (@id, @version, @projectId, @runId, @kind, @schemaVersion,
       @sourceSnapshotId, @sourceSnapshotHash, @mode, @sha256, @byteLength,
       @createdAt)`,
  );
  const listByRun = db.prepare<[string, string], ArtifactRow>(
    `SELECT ${COLUMNS} FROM artifacts WHERE project_id = ? AND run_id = ?
     ORDER BY created_at, id, version`,
  );
  const find = db.prepare<[string, string, number], ArtifactRow>(
    `SELECT ${COLUMNS} FROM artifacts
     WHERE project_id = ? AND id = ? AND version = ?`,
  );
  return {
    insert(ref) {
      insert.run(ref);
    },
    listByRun(projectId, runId) {
      return listByRun.all(projectId, runId).map(toRef);
    },
    find(projectId, artifactId, version) {
      const row = find.get(projectId, artifactId, version);
      return row ? toRef(row) : undefined;
    },
  };
}
