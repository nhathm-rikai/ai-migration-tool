import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
