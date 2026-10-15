import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from './migrate.js';
import { validateDataDirectory } from '../platform/data-directory.js';

export function openDatabase(dataDir: string): Database.Database {
  const checkedDirectory = validateDataDirectory(dataDir);
  mkdirSync(checkedDirectory, { recursive: true });
  // Recheck after creation, immediately before opening SQLite.
  const readyDirectory = validateDataDirectory(checkedDirectory);
  const db = new Database(join(readyDirectory, 'portal.db'));
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
