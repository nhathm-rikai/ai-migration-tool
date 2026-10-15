import type Database from 'better-sqlite3';
import { PROJECT_DEMO_MODE, type Project } from '@portal/contracts';

export interface ProjectRepository {
  create(project: Project): Project;
  findById(id: string): Project | undefined;
  listAfter(cursor: string | undefined, count: number): Project[];
}

type ProjectRow = {
  id: string;
  name: string;
  fixture_id: 'sample-vb6';
  created_at: string;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    fixtureId: row.fixture_id,
    createdAt: row.created_at,
    mode: PROJECT_DEMO_MODE,
  };
}

export function createProjectRepository(
  db: Database.Database,
): ProjectRepository {
  const insert = db.prepare<[string, string, string, string]>(
    'INSERT INTO projects (id, name, fixture_id, created_at) VALUES (?, ?, ?, ?)',
  );
  const find = db.prepare<[string], ProjectRow>(
    'SELECT id, name, fixture_id, created_at FROM projects WHERE id = ?',
  );
  const list = db.prepare<[string, number], ProjectRow>(
    'SELECT id, name, fixture_id, created_at FROM projects WHERE id > ? ORDER BY id ASC LIMIT ?',
  );
  return {
    create(project) {
      insert.run(
        project.id,
        project.name,
        project.fixtureId,
        project.createdAt,
      );
      return project;
    },
    findById(id) {
      const row = find.get(id);
      return row ? toProject(row) : undefined;
    },
    listAfter(cursor, count) {
      return list.all(cursor ?? '', count).map(toProject);
    },
  };
}
