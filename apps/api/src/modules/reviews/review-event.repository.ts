import type Database from 'better-sqlite3';

export type ReviewEvent = {
  id: string;
  projectId: string;
  runId: string;
  item: number;
  file: string;
  sha256: string;
  kind: 'comment' | 'approve';
  text: string | null;
  reviewer: string;
  at: string;
};

export interface ReviewEventRepository {
  append(event: ReviewEvent): void;
  list(projectId: string): ReviewEvent[];
}

// Insert and read only: there is no update or delete (DATA-07).
export function createReviewEventRepository(
  db: Database.Database,
): ReviewEventRepository {
  const insert = db.prepare(
    `INSERT INTO document_review_events
       (id, project_id, run_id, item, file, sha256, kind, text, reviewer, at)
     VALUES (@id, @projectId, @runId, @item, @file, @sha256, @kind, @text, @reviewer, @at)`,
  );
  const select = db.prepare<[string], ReviewEvent>(
    `SELECT id, project_id AS projectId, run_id AS runId, item, file, sha256,
        kind, text, reviewer, at
     FROM document_review_events WHERE project_id = ? ORDER BY sequence`,
  );
  return {
    append: (event) => void insert.run(event),
    list: (projectId) => select.all(projectId),
  };
}
