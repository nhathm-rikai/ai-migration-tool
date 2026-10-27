import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database.js';
import {
  acquireInstanceLock,
  confirmInstanceRecovery,
  INSTANCE_LOCK_FILE,
} from './instance-lock.js';

const MODULE_URL = new URL('./instance-lock.ts', import.meta.url).href;
let counter = 0;
const owner = () => ({
  id: `owner-${++counter}`,
  pid: process.pid,
  now: () => new Date('2026-10-27T00:00:00.000Z'),
});

let root: string;
let dataDir: string;
const children: ChildProcess[] = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'portal-lock-test-'));
  dataDir = join(root, 'data');
});

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  }
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

function readRecord() {
  const db = new Database(join(dataDir, INSTANCE_LOCK_FILE), {
    readonly: true,
  });
  try {
    return db
      .prepare('SELECT owner_id, released_at FROM instance_owner')
      .get() as { owner_id: string; released_at: string | null };
  } finally {
    db.close();
  }
}

// A separate Node process holding the lock: the OS lock is per process on
// POSIX, so only another process proves exclusion natively.
async function holdInOtherProcess(dir: string): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `const { acquireInstanceLock } = await import(${JSON.stringify(MODULE_URL)});
       // Kept referenced: a collected connection would drop the lock.
       globalThis.lock = acquireInstanceLock(process.argv[1], { id: 'child', pid: process.pid, now: () => new Date() });
       process.stdout.write('held\\n');
       setInterval(() => {}, 1000);`,
      dir,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true },
  );
  children.push(child);
  let output = '';
  child.stdout?.setEncoding('utf8');
  await new Promise<void>((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`Holder exited ${code}`)));
    child.stdout?.on('data', (chunk: string) => {
      output += chunk;
      if (output.includes('held')) resolve();
    });
  });
  return child;
}

describe('instance lock', () => {
  it('B02-AC01: a second process on the same data directory fails before anything opens', async () => {
    const holder = await holdInOtherProcess(dataDir);
    expect(() => acquireInstanceLock(dataDir, owner())).toThrow(
      expect.objectContaining({ code: 'DATA_DIR_LOCKED' }),
    );
    expect(existsSync(join(dataDir, 'portal.db'))).toBe(false);
    // The holder crashes: the OS drops its lock, no file needs deleting.
    holder.kill();
    await once(holder, 'exit');
    const lock = acquireInstanceLock(dataDir, owner());
    try {
      expect(lock.previousOwner).toBe('unreleased');
    } finally {
      lock.release();
    }
  });

  it('refuses a second handle in the same process', () => {
    const lock = acquireInstanceLock(dataDir, owner());
    try {
      expect(() => acquireInstanceLock(dataDir, owner())).toThrow(
        expect.objectContaining({ code: 'DATA_DIR_LOCKED' }),
      );
    } finally {
      lock.release();
    }
  });

  it('B02-AC02: different data directories lock independently and release only their own', async () => {
    const otherDir = join(root, 'other');
    const holder = await holdInOtherProcess(otherDir);
    const first = owner();
    const lock = acquireInstanceLock(dataDir, first);
    expect(lock.previousOwner).toBe('none');
    lock.release();
    lock.release();
    expect(readRecord()).toEqual({
      owner_id: first.id,
      released_at: '2026-10-27T00:00:00.000Z',
    });
    // Releasing this directory left the other process' lock in place.
    expect(() => acquireInstanceLock(otherDir, owner())).toThrow(
      expect.objectContaining({ code: 'DATA_DIR_LOCKED' }),
    );
    holder.kill();
    await once(holder, 'exit');
    const reopened = acquireInstanceLock(dataDir, owner());
    try {
      expect(reopened.previousOwner).toBe('released');
    } finally {
      reopened.release();
    }
  });

  it('B02-AC03: an unreadable owner record is reported unknown and kept until recovery is confirmed', () => {
    acquireInstanceLock(dataDir, owner()).release();
    const db = new Database(join(dataDir, INSTANCE_LOCK_FILE));
    db.exec("UPDATE instance_owner SET pid = 'not a pid'");
    db.close();
    for (let attempt = 0; attempt < 2; attempt++) {
      const lock = acquireInstanceLock(dataDir, owner());
      expect(lock.previousOwner).toBe('unknown');
      lock.release();
    }
    expect(confirmInstanceRecovery(dataDir)).toBe('unknown');
    const lock = acquireInstanceLock(dataDir, owner());
    try {
      expect(lock.previousOwner).toBe('none');
    } finally {
      lock.release();
    }
  });

  it.each([
    ['another format', 'PRAGMA user_version = 7'],
    ['foreign tables', 'CREATE TABLE something (x)'],
  ])('treats a lock file with %s as unknown ownership', (_label, sql) => {
    acquireInstanceLock(dataDir, owner()).release();
    const db = new Database(join(dataDir, INSTANCE_LOCK_FILE));
    db.exec('DROP TABLE instance_owner; PRAGMA user_version = 0');
    db.exec(sql);
    db.close();
    const lock = acquireInstanceLock(dataDir, owner());
    try {
      expect(lock.previousOwner).toBe('unknown');
    } finally {
      lock.release();
    }
  });

  it('fails startup on a lock file that is not a database, without changing it', () => {
    acquireInstanceLock(dataDir, owner()).release();
    const file = join(dataDir, INSTANCE_LOCK_FILE);
    writeFileSync(file, 'not a database, padded to look like one'.repeat(40));
    expect(() => acquireInstanceLock(dataDir, owner())).toThrow(
      expect.objectContaining({ code: 'INSTANCE_LOCK_INVALID' }),
    );
    expect(() => confirmInstanceRecovery(dataDir)).toThrow(
      expect.objectContaining({ code: 'INSTANCE_LOCK_INVALID' }),
    );
  });

  it('refuses to confirm recovery while a backend holds the lock', async () => {
    acquireInstanceLock(dataDir, owner()).release();
    await holdInOtherProcess(dataDir);
    expect(() => confirmInstanceRecovery(dataDir)).toThrow(
      expect.objectContaining({ code: 'DATA_DIR_LOCKED' }),
    );
  });

  it('applies the data directory guard before creating the lock', () => {
    const repository = fileURLToPath(new URL('../../../../', import.meta.url));
    expect(() =>
      acquireInstanceLock(join(repository, 'lock-data'), owner()),
    ).toThrow(expect.objectContaining({ code: 'DATA_DIR_FORBIDDEN' }));
    expect(existsSync(join(repository, 'lock-data'))).toBe(false);
  });
});

describe('lock file identity', () => {
  // portal.db with a project, closed: what an alias would destroy.
  function seedDatabase(): { path: string; hash: () => string } {
    const db = openDatabase(dataDir);
    db.prepare(
      `INSERT INTO projects (id, name, mode, fixture_id, created_at)
       VALUES ('p1', 'Kept', 'demo', 'sample-vb6', '2026-10-27')`,
    ).run();
    db.close();
    const path = join(dataDir, 'portal.db');
    return {
      path,
      hash: () => createHash('sha256').update(readFileSync(path)).digest('hex'),
    };
  }

  it('refuses a lock file hard-linked to portal.db in acquire and recovery, leaving the DB unchanged', () => {
    const database = seedDatabase();
    const before = database.hash();
    linkSync(database.path, join(dataDir, INSTANCE_LOCK_FILE));
    expect(() => confirmInstanceRecovery(dataDir)).toThrow(
      expect.objectContaining({ code: 'INSTANCE_LOCK_INVALID' }),
    );
    expect(() => acquireInstanceLock(dataDir, owner())).toThrow(
      expect.objectContaining({ code: 'INSTANCE_LOCK_INVALID' }),
    );
    expect(database.hash()).toBe(before);
    const db = new Database(database.path, { readonly: true });
    try {
      expect(db.prepare('SELECT name FROM projects').pluck().all()).toEqual([
        'Kept',
      ]);
    } finally {
      db.close();
    }
  });

  it('refuses a lock file that is a symbolic link, leaving the target unchanged', (context) => {
    const database = seedDatabase();
    const before = database.hash();
    try {
      symlinkSync(database.path, join(dataDir, INSTANCE_LOCK_FILE), 'file');
    } catch (error) {
      // Windows without symlink privilege: the hard-link case still runs.
      if ((error as NodeJS.ErrnoException).code === 'EPERM') context.skip();
      throw error;
    }
    expect(() => confirmInstanceRecovery(dataDir)).toThrow(
      expect.objectContaining({ code: 'INSTANCE_LOCK_INVALID' }),
    );
    expect(() => acquireInstanceLock(dataDir, owner())).toThrow(
      expect.objectContaining({ code: 'INSTANCE_LOCK_INVALID' }),
    );
    expect(database.hash()).toBe(before);
  });

  it('refuses a lock path that is a directory', () => {
    mkdirSync(join(dataDir, INSTANCE_LOCK_FILE), { recursive: true });
    expect(() => acquireInstanceLock(dataDir, owner())).toThrow(
      expect.objectContaining({ code: 'INSTANCE_LOCK_INVALID' }),
    );
  });

  it('recovery refuses a lock file holding anything but the owner record, without changing it', () => {
    acquireInstanceLock(dataDir, owner()).release();
    const path = join(dataDir, INSTANCE_LOCK_FILE);
    const db = new Database(path);
    db.exec(
      "CREATE TABLE projects (id TEXT); INSERT INTO projects VALUES ('p1')",
    );
    db.close();
    const before = readFileSync(path);
    expect(() => confirmInstanceRecovery(dataDir)).toThrow(
      expect.objectContaining({ code: 'INSTANCE_LOCK_INVALID' }),
    );
    expect(readFileSync(path).equals(before)).toBe(true);
  });
});
