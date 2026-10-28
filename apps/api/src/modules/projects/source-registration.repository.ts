import type Database from 'better-sqlite3';
import {
  TableNameMappingSchema,
  type TableNameMapping,
} from '@portal/contracts';
import { Check } from 'typebox/value';

// SQLite storage of source registrations (B03). A registration points at
// the current immutable revision; runs keep the revision they locked, so an
// update never changes what a queued run reads.

export type SourceRevision = {
  sourceId: string;
  revision: number;
  // Canonical physical root; server-internal.
  rootPath: string;
  displayName: string;
  profileId: string;
  tableNameMapping: TableNameMapping;
  createdAt: string;
};

export type SourceRegistration = {
  projectId: string;
  registeredAt: string;
  updatedAt: string;
  current: SourceRevision;
};

export interface SourceRegistrationRepository {
  // One IMMEDIATE transaction; never pass work that awaits I/O.
  transaction<T>(work: () => T): T;
  findCurrent(projectId: string): SourceRegistration | undefined;
  findRevision(sourceId: string, revision: number): SourceRevision | undefined;
  // First registration of the project.
  insert(projectId: string, revision: SourceRevision): void;
  // Points the project at a new revision if it still is at `expected`;
  // false when another update won.
  advance(
    projectId: string,
    expected: number,
    revision: SourceRevision,
  ): boolean;
}

type RevisionRow = {
  source_id: string;
  revision: number;
  root_path: string;
  display_name: string;
  profile_id: string;
  default_schema: string | null;
  mapping_status: string;
  created_at: string;
};

type RegistrationRow = RevisionRow & {
  project_id: string;
  registered_at: string;
  updated_at: string;
};

function toRevision(row: RevisionRow): SourceRevision {
  const tableNameMapping: unknown = {
    defaultSchema: row.default_schema,
    status: row.mapping_status,
  };
  if (!Check(TableNameMappingSchema, tableNameMapping))
    throw new Error('Stored source revision has an invalid mapping.');
  return {
    sourceId: row.source_id,
    revision: row.revision,
    rootPath: row.root_path,
    displayName: row.display_name,
    profileId: row.profile_id,
    tableNameMapping,
    createdAt: row.created_at,
  };
}

const REVISION_COLUMNS = `r.source_id, r.revision, r.root_path, r.display_name,
  r.profile_id, r.default_schema, r.mapping_status, r.created_at`;

export function createSourceRegistrationRepository(
  db: Database.Database,
): SourceRegistrationRepository {
  const findCurrent = db.prepare<[string], RegistrationRow>(
    `SELECT p.project_id, p.registered_at, p.updated_at, ${REVISION_COLUMNS}
     FROM project_sources p
     JOIN source_revisions r
       ON r.source_id = p.source_id AND r.revision = p.revision
     WHERE p.project_id = ?`,
  );
  const findRevision = db.prepare<[string, number], RevisionRow>(
    `SELECT ${REVISION_COLUMNS} FROM source_revisions r
     WHERE r.source_id = ? AND r.revision = ?`,
  );
  const insertRevision = db.prepare(
    `INSERT INTO source_revisions (source_id, revision, root_path,
       display_name, profile_id, default_schema, mapping_status, created_at)
     VALUES (@sourceId, @revision, @rootPath, @displayName, @profileId,
       @defaultSchema, @mappingStatus, @createdAt)`,
  );
  const insertRegistration = db.prepare<
    [string, string, number, string, string]
  >(
    `INSERT INTO project_sources (project_id, source_id, revision,
       registered_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const advance = db.prepare<[number, string, string, string, number]>(
    `UPDATE project_sources SET revision = ?, updated_at = ?
     WHERE project_id = ? AND source_id = ? AND revision = ?`,
  );
  const writeRevision = (revision: SourceRevision) =>
    insertRevision.run({
      sourceId: revision.sourceId,
      revision: revision.revision,
      rootPath: revision.rootPath,
      displayName: revision.displayName,
      profileId: revision.profileId,
      defaultSchema: revision.tableNameMapping.defaultSchema,
      mappingStatus: revision.tableNameMapping.status,
      createdAt: revision.createdAt,
    });
  return {
    transaction: (work) => db.transaction(work).immediate(),
    findCurrent(projectId) {
      const row = findCurrent.get(projectId);
      return row
        ? {
            projectId: row.project_id,
            registeredAt: row.registered_at,
            updatedAt: row.updated_at,
            current: toRevision(row),
          }
        : undefined;
    },
    findRevision(sourceId, revision) {
      const row = findRevision.get(sourceId, revision);
      return row ? toRevision(row) : undefined;
    },
    insert(projectId, revision) {
      writeRevision(revision);
      insertRegistration.run(
        projectId,
        revision.sourceId,
        revision.revision,
        revision.createdAt,
        revision.createdAt,
      );
    },
    advance(projectId, expected, revision) {
      writeRevision(revision);
      return (
        advance.run(
          revision.revision,
          revision.createdAt,
          projectId,
          revision.sourceId,
          expected,
        ).changes === 1
      );
    },
  };
}
