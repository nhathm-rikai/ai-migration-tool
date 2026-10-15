CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  fixture_id TEXT NOT NULL CHECK (fixture_id = 'sample-vb6'),
  created_at TEXT NOT NULL
) STRICT;
