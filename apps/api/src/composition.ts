import { randomUUID } from 'node:crypto';
import { openDatabase } from './db/database.js';
import { createProjectRepository } from './modules/projects/project.repository.js';
import { createProjectService } from './modules/projects/project.service.js';

export function createDependencies(dataDir: string) {
  const db = openDatabase(dataDir);
  try {
    const projects = createProjectService({
      repository: createProjectRepository(db),
      nextId: randomUUID,
      now: () => new Date(),
    });
    return { projects, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}
