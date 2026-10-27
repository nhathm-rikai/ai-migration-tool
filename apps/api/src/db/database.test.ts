import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';

describe('SQLite migration guard', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'portal-migration-test-'));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('enables foreign keys and refuses an altered applied migration', () => {
    const db = openDatabase(dataDir);
    try {
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      db.prepare('UPDATE schema_migrations SET checksum = ?').run('changed');
    } finally {
      db.close();
    }
    expect(() => openDatabase(dataDir)).toThrow(
      'An applied migration was modified.',
    );
  });

  it('refuses a newer database rather than silently opening it', () => {
    const db = openDatabase(dataDir);
    try {
      db.prepare(
        'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
      ).run('9999-future.sql', 'future');
    } finally {
      db.close();
    }
    expect(() => openDatabase(dataDir)).toThrow(
      'Database schema is newer than this application.',
    );
  });

  // B03-AC03: 0003 rebuilds `projects`, which runs reference. Runs must keep
  // their project and retry links, and foreign keys must stay enforced.
  it('upgrades a 0001/0002 database with runs to 0003 without losing a row', () => {
    const seed = new Database(join(dataDir, 'portal.db'));
    seed.exec(
      'CREATE TABLE schema_migrations (name TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL) STRICT',
    );
    for (const name of ['0001-initial.sql', '0002-runs.sql']) {
      const sql = readFileSync(
        new URL(`../../migrations/${name}`, import.meta.url),
        'utf8',
      );
      seed.exec(sql);
      seed
        .prepare('INSERT INTO schema_migrations VALUES (?, ?)')
        .run(name, createHash('sha256').update(sql).digest('hex'));
    }
    seed
      .prepare('INSERT INTO projects VALUES (?, ?, ?, ?)')
      .run('p1', 'Demo', 'sample-vb6', '2026-10-15T00:00:00.000Z');
    const insertRun = seed.prepare(
      `INSERT INTO runs (id, project_id, kind, status, state_version,
         source_json, source_strategy, retry_of_run_id, config_json,
         idempotency_key, request_fingerprint, created_at, updated_at)
       VALUES (?, 'p1', 'analyze', ?, 1, '{}', 'current-source', ?, '{}', ?, 'f', ?, ?)`,
    );
    insertRun.run('r1', 'failed', null, 'k1', 't1', 't1');
    insertRun.run('r2', 'queued', 'r1', 'k2', 't2', 't2');
    seed.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare('SELECT * FROM projects').all()).toEqual([
        {
          id: 'p1',
          name: 'Demo',
          mode: 'demo',
          fixture_id: 'sample-vb6',
          created_at: '2026-10-15T00:00:00.000Z',
        },
      ]);
      expect(
        db
          .prepare(
            'SELECT id, project_id, status, retry_of_run_id FROM runs ORDER BY id',
          )
          .all(),
      ).toEqual([
        { id: 'r1', project_id: 'p1', status: 'failed', retry_of_run_id: null },
        { id: 'r2', project_id: 'p1', status: 'queued', retry_of_run_id: 'r1' },
      ]);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      // The active-run invariant of 0002 survives the rebuild.
      expect(() => insertActive(db, 'r3', 'k3')).toThrow(/UNIQUE/);
      // References to the rebuilt table are still enforced.
      expect(() =>
        db
          .prepare(
            `INSERT INTO runs (id, project_id, kind, status, state_version,
               source_json, source_strategy, config_json, idempotency_key,
               request_fingerprint, created_at, updated_at)
             VALUES ('r4', 'missing', 'analyze', 'failed', 1, '{}',
               'current-source', '{}', 'k4', 'f', 't', 't')`,
          )
          .run(),
      ).toThrow(/FOREIGN KEY/);
    } finally {
      db.close();
    }
  });
});

function insertActive(db: Database.Database, id: string, key: string) {
  db.prepare(
    `INSERT INTO runs (id, project_id, kind, status, state_version,
       source_json, source_strategy, config_json, idempotency_key,
       request_fingerprint, created_at, updated_at)
     VALUES (?, 'p1', 'analyze', 'queued', 1, '{}', 'current-source', '{}',
       ?, 'f', 't', 't')`,
  ).run(id, key);
}
