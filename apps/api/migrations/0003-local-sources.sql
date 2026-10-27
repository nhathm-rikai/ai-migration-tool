-- Local source projects and source registration (B03), source snapshots (B06).
-- Rebuilds `projects` to add the mode column: SQLite cannot change a CHECK in
-- place. The runner applies migrations with foreign keys off and checks them
-- before commit. Existing rows are demo projects and keep their values.
CREATE TABLE projects_next (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'local')),
  fixture_id TEXT CHECK (fixture_id = 'sample-vb6'),
  created_at TEXT NOT NULL,
  CHECK ((mode = 'demo') = (fixture_id IS NOT NULL))
) STRICT;

INSERT INTO
  projects_next (id, name, mode, fixture_id, created_at)
SELECT
  id,
  name,
  'demo',
  fixture_id,
  created_at
FROM
  projects;

DROP TABLE projects;

ALTER TABLE projects_next
RENAME TO projects;

-- Every registration of a source is an immutable revision; a run locks one.
-- root_path is the canonical physical root and never leaves the server.
CREATE TABLE source_revisions (
  source_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  root_path TEXT NOT NULL CHECK (length(root_path) >= 1),
  display_name TEXT NOT NULL CHECK (length(display_name) >= 1),
  profile_id TEXT NOT NULL,
  default_schema TEXT,
  mapping_status TEXT NOT NULL CHECK (
    mapping_status IN ('unconfigured', 'assumed', 'confirmed')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, revision),
  CHECK (
    (mapping_status = 'unconfigured') = (default_schema IS NULL)
  )
) STRICT;

-- The current registration of a local project: one source per project.
CREATE TABLE project_sources (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects (id),
  source_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id, revision) REFERENCES source_revisions (source_id, revision)
) STRICT;

-- Published snapshots only: a row exists once the snapshot directory was
-- renamed into place. The directory is named by the ID.
CREATE TABLE source_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects (id),
  source_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  file_count INTEGER NOT NULL CHECK (file_count >= 0),
  total_bytes INTEGER NOT NULL CHECK (total_bytes >= 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id, revision) REFERENCES source_revisions (source_id, revision)
) STRICT;
