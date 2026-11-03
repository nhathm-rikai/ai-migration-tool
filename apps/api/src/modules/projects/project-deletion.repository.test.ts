import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database.js';
import { createProjectDeletionRepository } from './project-deletion.repository.js';

const SHA = 'a'.repeat(64);
const T = '2026-10-15T00:00:00.000Z';
const TABLES = [
  'projects',
  'runs',
  'artifacts',
  'source_revisions',
  'project_sources',
  'source_snapshots',
  'document_runs',
  'document_run_logs',
  'agent_processes',
  'document_review_events',
];

describe('project deletion repository', () => {
  let dataDir: string;
  let db: Database.Database;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'portal-delete-test-'));
    db = openDatabase(dataDir);
  });
  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const count = (table: string) =>
    (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

  // One local project that owns a row in every table.
  function seed(id: string, runStatus: string, documentStatus = 'succeeded') {
    db.prepare(
      `INSERT INTO projects (id, name, mode, fixture_id, created_at)
       VALUES (?, ?, 'local', NULL, ?)`,
    ).run(id, `Project ${id}`, T);
    db.prepare(
      `INSERT INTO source_revisions (source_id, revision, root_path,
         display_name, profile_id, default_schema, mapping_status, created_at)
       VALUES (?, 1, '/src', 'src', 'vb6', NULL, 'unconfigured', ?)`,
    ).run(`source-${id}`, T);
    db.prepare(`INSERT INTO project_sources VALUES (?, ?, 1, ?, ?)`).run(
      id,
      `source-${id}`,
      T,
      T,
    );
    db.prepare(
      `INSERT INTO source_snapshots (id, project_id, source_id, revision,
         snapshot_hash, profile_id, file_count, total_bytes, created_at)
       VALUES (?, ?, ?, 1, ?, 'vb6', 0, 0, ?)`,
    ).run(`snap-${id}`, id, `source-${id}`, SHA, T);
    const insertRun = db.prepare(
      `INSERT INTO runs (id, project_id, kind, status, state_version,
         source_json, source_strategy, retry_of_run_id, config_json,
         idempotency_key, request_fingerprint, created_at, updated_at)
       VALUES (?, ?, 'analyze', ?, 1, '{}', 'current-source', ?, '{}', ?, 'f', ?, ?)`,
    );
    insertRun.run(`run-${id}`, id, 'failed', null, 'k1', T, T);
    insertRun.run(`retry-${id}`, id, runStatus, `run-${id}`, 'k2', T, T);
    db.prepare(
      `INSERT INTO artifacts (id, version, project_id, run_id, kind,
         schema_version, source_snapshot_id, source_snapshot_hash, mode,
         sha256, byte_length, created_at)
       VALUES (?, 1, ?, ?, 'source-inventory', 'source-inventory-v1', ?, ?,
         'local', ?, 1, ?)`,
    ).run(`art-${id}`, id, `run-${id}`, `snap-${id}`, SHA, SHA, T);
    const items = JSON.stringify([
      { packageId: `pkg-${id}`, files: [{ name: 'a' }, { name: 'b' }] },
      { packageId: null, files: [] },
    ]);
    db.prepare(
      `INSERT INTO document_runs (id, project_id, status, state_version,
         analysis_run_id, inventory_artifact_id, inventory_version,
         config_json, items_json, idempotency_key, request_fingerprint,
         created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, 1, '{}', ?, 'k', 'f', ?, ?)`,
    ).run(
      `doc-${id}`,
      id,
      documentStatus,
      `run-${id}`,
      `art-${id}`,
      items,
      T,
      T,
    );
    db.prepare(
      `INSERT INTO document_run_logs VALUES (?, 1, ?, 'system', NULL, 'x')`,
    ).run(`doc-${id}`, T);
    db.prepare(`INSERT INTO agent_processes VALUES (?, 1, ?)`).run(
      `doc-${id}`,
      T,
    );
    db.prepare(
      `INSERT INTO document_review_events (id, project_id, run_id, item, file,
         sha256, kind, text, reviewer, at)
       VALUES (?, ?, ?, 0, 'a', ?, 'comment', 'ok', 'me', ?)`,
    ).run(`ev-${id}`, id, `doc-${id}`, SHA, T);
  }

  it('deletes every row of the project, keeps the others and lists the files', () => {
    seed('p1', 'failed');
    seed('p2', 'failed');
    const repository = createProjectDeletionRepository(db);

    const files = repository.remove('p1');

    expect(files).toEqual({
      snapshotIds: ['snap-p1'],
      artifacts: [{ id: 'art-p1', version: 1 }],
      packages: [{ id: 'pkg-p1', fileCount: 2 }],
      documentRunIds: ['doc-p1'],
    });
    for (const table of TABLES)
      expect(count(table)).toBe(table === 'runs' ? 2 : 1);
    expect(db.prepare('SELECT id FROM projects').all()).toEqual([{ id: 'p2' }]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it.each(['queued', 'running', 'cancelling'])(
    'refuses and changes nothing while a run is %s',
    (status) => {
      seed('p1', status);
      const repository = createProjectDeletionRepository(db);

      expect(repository.hasActiveRun('p1')).toBe(true);
      expect(repository.remove('p1')).toBeUndefined();
      for (const table of TABLES)
        expect(count(table)).toBe(table === 'runs' ? 2 : 1);
    },
  );

  it('sees an active document run too', () => {
    seed('p1', 'failed', 'running');
    expect(createProjectDeletionRepository(db).hasActiveRun('p1')).toBe(true);
  });

  it('returns undefined for an unknown project', () => {
    expect(createProjectDeletionRepository(db).remove('nope')).toBeUndefined();
  });
});
