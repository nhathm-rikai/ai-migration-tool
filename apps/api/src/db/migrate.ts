import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { RuntimeError } from '../shared/runtime-error.js';

export function migrate(db: Database.Database): void {
  const directory = new URL('../../migrations/', import.meta.url);
  const migrations = readdirSync(directory)
    .filter((name) => /^\d{4}-.+\.sql$/.test(name))
    .sort();
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL
    ) STRICT`);
    const applied = db
      .prepare<[], { name: string; checksum: string }>(
        'SELECT name, checksum FROM schema_migrations',
      )
      .all();
    if (applied.some((row) => !migrations.includes(row.name))) {
      throw new RuntimeError('SCHEMA_TOO_NEW');
    }
    for (const name of migrations) {
      const sql = readFileSync(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = applied.find((row) => row.name === name);
      if (existing) {
        if (existing.checksum !== checksum)
          throw new RuntimeError('MIGRATION_MODIFIED');
        continue;
      }
      db.exec(sql);
      db.prepare(
        'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
      ).run(name, checksum);
    }
  }).immediate();
}
