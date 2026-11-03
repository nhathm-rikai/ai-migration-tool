-- Legacy source documents have no questions to answer: the review keeps only
-- comments and approvals. Comments and approvals are carried over as they are.
CREATE TABLE document_review_events_next (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects (id),
  run_id TEXT NOT NULL REFERENCES document_runs (id),
  item INTEGER NOT NULL CHECK (item >= 0),
  file TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'approve')),
  text TEXT,
  reviewer TEXT NOT NULL,
  at TEXT NOT NULL
);
INSERT INTO document_review_events_next
  (sequence, id, project_id, run_id, item, file, sha256, kind, text, reviewer, at)
SELECT sequence, id, project_id, run_id, item, file, sha256, kind, text, reviewer, at
FROM document_review_events WHERE kind <> 'question';
DROP TABLE document_review_events;
ALTER TABLE document_review_events_next RENAME TO document_review_events;
CREATE INDEX document_review_events_target
  ON document_review_events (project_id, run_id, item, file);
