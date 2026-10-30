-- Document generation runs (step 3). Same admission invariants as analyze
-- runs: one active run per project, one executing run in the runtime (the
-- only AI process), one run per idempotency key. JSON columns hold contract
-- objects validated on read.
CREATE TABLE document_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects (id),
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
  state_version INTEGER NOT NULL CHECK (state_version >= 1),
  analysis_run_id TEXT NOT NULL REFERENCES runs (id),
  inventory_artifact_id TEXT NOT NULL,
  inventory_version INTEGER NOT NULL CHECK (inventory_version >= 1),
  config_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  error_code TEXT,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  UNIQUE (project_id, idempotency_key),
  FOREIGN KEY (inventory_artifact_id, inventory_version) REFERENCES artifacts (id, version)
) STRICT;

CREATE UNIQUE INDEX document_runs_one_active_per_project ON document_runs (project_id)
WHERE
  status IN ('queued', 'running', 'cancelling');

CREATE UNIQUE INDEX document_runs_one_executing ON document_runs ((1))
WHERE
  status IN ('running', 'cancelling');

CREATE INDEX document_runs_project_history ON document_runs (project_id, created_at DESC, id DESC);

CREATE INDEX document_runs_queue ON document_runs (created_at, id)
WHERE
  status = 'queued';

-- Agent output lines shown in the log panel; bounded per run by the service.
CREATE TABLE document_run_logs (
  run_id TEXT NOT NULL REFERENCES document_runs (id),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  at TEXT NOT NULL,
  stream TEXT NOT NULL CHECK (stream IN ('system', 'agent', 'stderr')),
  template TEXT,
  text TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence)
) STRICT;

-- Agent processes started and not yet confirmed stopped (JOB-05). A row left
-- by a previous backend means a process may still be alive: document runs are
-- not dispatched until startup sees that PID gone.
CREATE TABLE agent_processes (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES document_runs (id),
  pid INTEGER NOT NULL,
  started_at TEXT NOT NULL
) STRICT;
