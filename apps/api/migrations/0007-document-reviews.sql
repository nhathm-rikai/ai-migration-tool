-- Review of generated documents (step 4). Append-only (DATA-07): rows are
-- never updated or deleted; a status is the latest event of its target.
CREATE TABLE document_review_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects (id),
  run_id TEXT NOT NULL REFERENCES document_runs (id),
  item INTEGER NOT NULL CHECK (item >= 0),
  file TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'approve', 'question')),
  question_id TEXT,
  question_status TEXT
    CHECK (question_status IN ('open', 'answered', 'na', 'need')),
  text TEXT,
  reviewer TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX document_review_events_target
  ON document_review_events (project_id, run_id, item, file);
