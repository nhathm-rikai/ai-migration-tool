import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
