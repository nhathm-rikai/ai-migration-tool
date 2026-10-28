-- Published artifacts (B07). A row is written only after the payload file
-- was renamed into place: the row makes the version public. A file without a
-- row is an orphan and is never read. The payload lives in the data
-- directory under artifacts/<id>-v<version>/; the DB keeps its hash/size.
CREATE TABLE artifacts (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  project_id TEXT NOT NULL REFERENCES projects (id),
  run_id TEXT NOT NULL REFERENCES runs (id),
  kind TEXT NOT NULL CHECK (kind = 'source-inventory'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'source-inventory-v1'),
  source_snapshot_id TEXT NOT NULL,
  source_snapshot_hash TEXT NOT NULL CHECK (length(source_snapshot_hash) = 64),
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'local')),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
) STRICT;

-- One inventory per analyze run; a retry is a new run with its own artifact.
CREATE UNIQUE INDEX artifacts_one_kind_per_run ON artifacts (run_id, kind);

CREATE INDEX artifacts_by_project ON artifacts (project_id, id);
