import type Database from 'better-sqlite3';
import {
  PROJECT_DEMO_MODE,
  PROJECT_FIXTURE_ID,
  PROJECT_LOCAL_MODE,
  type Project,
} from '@portal/contracts';

export interface ProjectRepository {
  create(project: Project): Project;
  findById(id: string): Project | undefined;
  listAfter(cursor: string | undefined, count: number): Project[];
}

type ProjectRow = {
  id: string;
  name: string;
  mode: string;
  fixture_id: string | null;
  created_at: string;
};

// The table's CHECKs pair demo with the fixture ID and local with none; a
// row outside them is corruption, not a project.
function toProject(row: ProjectRow): Project {
  const common = { id: row.id, name: row.name, createdAt: row.created_at };
  if (row.mode === PROJECT_DEMO_MODE && row.fixture_id === PROJECT_FIXTURE_ID)
    return { ...common, fixtureId: row.fixture_id, mode: PROJECT_DEMO_MODE };
  if (row.mode === PROJECT_LOCAL_MODE && row.fixture_id === null)
    return { ...common, mode: PROJECT_LOCAL_MODE };
  throw new Error('Stored project row has an unknown mode.');
}

const COLUMNS = 'id, name, mode, fixture_id, created_at';

export function createProjectRepository(
  db: Database.Database,
): ProjectRepository {
  const insert = db.prepare<[string, string, string, string | null, string]>(
    `INSERT INTO projects (${COLUMNS}) VALUES (?, ?, ?, ?, ?)`,
  );
  const find = db.prepare<[string], ProjectRow>(
    `SELECT ${COLUMNS} FROM projects WHERE id = ?`,
  );
  const list = db.prepare<[string, number], ProjectRow>(
    `SELECT ${COLUMNS} FROM projects WHERE id > ? ORDER BY id ASC LIMIT ?`,
  );
  return {
    create(project) {
      insert.run(
        project.id,
        project.name,
        project.mode,
        project.mode === PROJECT_DEMO_MODE ? project.fixtureId : null,
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
