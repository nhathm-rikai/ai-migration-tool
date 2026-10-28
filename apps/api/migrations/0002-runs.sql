-- Analyze runs (B04). JSON columns hold contract objects validated on read.
CREATE TABLE runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects (id),
  kind TEXT NOT NULL CHECK (kind = 'analyze'),
  status TEXT NOT NULL CHECK (
    status IN (
      'queued',
      'running',
      'cancelling',
      'succeeded',
      'failed',
      'cancelled',
      'interrupted'
    )
  ),
  stage TEXT CHECK (stage IN ('snapshot', 'inventory', 'publish')),
  state_version INTEGER NOT NULL CHECK (state_version >= 1),
  source_json TEXT NOT NULL,
  source_strategy TEXT NOT NULL CHECK (
    source_strategy IN ('current-source', 'reuse-snapshot')
  ),
  retry_of_run_id TEXT REFERENCES runs (id),
  source_snapshot_id TEXT,
  error_code TEXT,
  config_json TEXT NOT NULL,
  -- Idempotency of POST start: one key names one run of the project forever.
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  UNIQUE (project_id, idempotency_key)
) STRICT;

-- JOB-01: at most one queued/running/cancelling run per project.
CREATE UNIQUE INDEX runs_one_active_per_project ON runs (project_id)
WHERE
  status IN ('queued', 'running', 'cancelling');

-- JOB-01: at most one executing run in the whole runtime.
CREATE UNIQUE INDEX runs_one_executing ON runs ((1))
WHERE
  status IN ('running', 'cancelling');

-- History: newest first within a project.
CREATE INDEX runs_project_history ON runs (project_id, created_at DESC, id DESC);

-- Dispatcher: oldest queued run first.
CREATE INDEX runs_queue ON runs (created_at, id)
WHERE
  status = 'queued';
