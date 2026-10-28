import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  type BigIntStats,
} from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { RuntimeError } from '../shared/runtime-error.js';
import { validateDataDirectory } from './data-directory.js';

// One backend per data directory (BE-08/JOB-05). The lock is an exclusive
// SQLite lock on a small file next to portal.db: SQLite takes it with the OS
// file lock of each platform (LockFileEx on Windows, fcntl on POSIX), and the
// OS drops it when the holding process exits, crash included. A crashed
// owner therefore never leaves a lock that needs deleting by hand.
//
// The file also keeps the owner record (pid, start, clean release). The
// record is diagnostic: nothing is ever killed or deleted because of the pid
// it names. A record this version cannot read means the previous owner and
// whatever it ran are unknown: startup then reports recovery required and
// does not dispatch until an operator confirms the cleanup.

export const INSTANCE_LOCK_FILE = 'instance.lock';
const RECORD_FORMAT = 1;

// What the previous owner left behind, read once the lock is held.
// - none: first start on this data directory, or released after a confirmed recovery.
// - released: the previous owner shut down and released the lock.
// - unreleased: the previous owner exited without releasing (crash, kill).
// - unknown: the record is unreadable; its processes cannot be accounted for.
export type PreviousOwner = 'none' | 'released' | 'unreleased' | 'unknown';

// The caller must keep the handle referenced while it owns the data
// directory: a garbage-collected connection closes and drops the OS lock.
export type InstanceLock = {
  readonly previousOwner: PreviousOwner;
  // Marks the record released, then drops the OS lock. Only this handle can
  // release the lock it holds; calling it again does nothing.
  release(): void;
};

type OwnerRow = {
  owner_id: unknown;
  pid: unknown;
  started_at: unknown;
  released_at: unknown;
};

function isLockBusy(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED';
}

function errorCode(error: unknown): unknown {
  return error instanceof Error
    ? Object.getOwnPropertyDescriptor(error, 'code')?.value
    : undefined;
}

function beginExclusive(db: Database.Database): void {
  try {
    db.exec('BEGIN EXCLUSIVE');
  } catch (error) {
    if (isLockBusy(error)) throw new RuntimeError('DATA_DIR_LOCKED');
    const code = errorCode(error);
    if (code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT')
      throw new RuntimeError('INSTANCE_LOCK_INVALID');
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return errorCode(error) === 'ENOENT';
}

// The lock path must name one regular file with one name. A symlink or a
// hard link could make the path another file (portal.db included) that the
// lock would then write to. `create` makes a missing file with O_EXCL, which
// never follows a link.
function checkLockFile(path: string, create: boolean): BigIntStats {
  if (create) {
    try {
      closeSync(openSync(path, 'wx'));
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
  }
  const stats = lstatSync(path, { bigint: true });
  if (!stats.isFile() || stats.nlink !== 1n)
    throw new RuntimeError('INSTANCE_LOCK_INVALID');
  return stats;
}

// Opens the checked lock file and takes the OS lock, then checks the path
// still names the same single file, so a swap between the check and the open
// is refused before anything is written.
function openLockFile(directory: string, create: boolean): Database.Database {
  const path = join(directory, INSTANCE_LOCK_FILE);
  const checked = checkLockFile(path, create);
  const db = new Database(path, { fileMustExist: true });
  try {
    // Fail at once instead of waiting for the other process to exit.
    db.pragma('busy_timeout = 0');
    // Keep the lock after the first write until the connection closes.
    db.pragma('locking_mode = EXCLUSIVE');
    beginExclusive(db);
    let current: BigIntStats;
    try {
      current = checkLockFile(path, false);
    } catch (error) {
      if (isMissing(error)) throw new RuntimeError('INSTANCE_LOCK_INVALID');
      throw error;
    }
    if (current.dev !== checked.dev || current.ino !== checked.ino)
      throw new RuntimeError('INSTANCE_LOCK_INVALID');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// Only the owner record this module writes; anything else may be another
// file's data and is never changed by recovery.
function holdsOnlyOwnerRecord(db: Database.Database): boolean {
  return db
    .prepare('SELECT tbl_name FROM sqlite_schema')
    .pluck()
    .all()
    .every((name) => name === 'instance_owner');
}

function readPrevious(db: Database.Database): PreviousOwner {
  const format = db.pragma('user_version', { simple: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
    .pluck()
    .all();
  if (format === 0 && tables.length === 0) return 'none';
  if (format !== RECORD_FORMAT || !tables.includes('instance_owner'))
    return 'unknown';
  let rows: OwnerRow[];
  try {
    rows = db
      .prepare(
        'SELECT owner_id, pid, started_at, released_at FROM instance_owner',
      )
      .all() as OwnerRow[];
  } catch {
    // Missing columns: written by something other than this format.
    return 'unknown';
  }
  if (rows.length === 0) return 'none';
  const row = rows[0];
  if (
    rows.length !== 1 ||
    !row ||
    typeof row.owner_id !== 'string' ||
    typeof row.pid !== 'number' ||
    typeof row.started_at !== 'string' ||
    (row.released_at !== null && typeof row.released_at !== 'string')
  )
    return 'unknown';
  return row.released_at === null ? 'unreleased' : 'released';
}

// Takes the lock before anything else touches the data directory. Throws
// DATA_DIR_LOCKED when another process holds it; nothing is opened then.
export function acquireInstanceLock(
  dataDir: string,
  owner: { id: string; pid: number; now(): Date },
): InstanceLock {
  const checkedDirectory = validateDataDirectory(dataDir);
  mkdirSync(checkedDirectory, { recursive: true });
  const readyDirectory = validateDataDirectory(checkedDirectory);
  const db = openLockFile(readyDirectory, true);
  let previousOwner: PreviousOwner;
  try {
    try {
      previousOwner = readPrevious(db);
    } catch (error) {
      if (isLockBusy(error)) throw new RuntimeError('DATA_DIR_LOCKED');
      // Not a database: the lock cannot be trusted to exclude anyone.
      throw new RuntimeError('INSTANCE_LOCK_INVALID');
    }
    // An unknown record stays as it is until an operator confirms recovery,
    // so a second restart cannot hide it.
    if (previousOwner !== 'unknown') {
      db.exec(`CREATE TABLE IF NOT EXISTS instance_owner (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        owner_id TEXT NOT NULL,
        pid INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        released_at TEXT
      )`);
      db.prepare(
        `INSERT OR REPLACE INTO instance_owner
          (id, owner_id, pid, started_at, released_at)
         VALUES (1, ?, ?, ?, NULL)`,
      ).run(owner.id, owner.pid, owner.now().toISOString());
      db.pragma(`user_version = ${RECORD_FORMAT}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.close();
    throw error;
  }

  let released = false;
  return {
    previousOwner,
    release() {
      if (released) return;
      released = true;
      try {
        if (previousOwner !== 'unknown')
          db.prepare(
            `UPDATE instance_owner SET released_at = ?
             WHERE id = 1 AND owner_id = ? AND released_at IS NULL`,
          ).run(owner.now().toISOString(), owner.id);
      } finally {
        // Closing drops the OS lock even if the record could not be written;
        // the next start then sees an unreleased owner.
        db.close();
      }
    },
  };
}

// Operator path after cleanup was checked by hand (runbook in the API
// README): takes the lock, so it fails while a backend runs, and resets the
// owner record. A lock file holding anything else is refused unchanged; it
// is moved aside by hand. It never touches processes, runs or portal.db.
export function confirmInstanceRecovery(dataDir: string): PreviousOwner {
  const checkedDirectory = validateDataDirectory(dataDir);
  const db = openLockFile(checkedDirectory, false);
  try {
    let previous: PreviousOwner;
    try {
      previous = readPrevious(db);
    } catch (error) {
      if (isLockBusy(error)) throw new RuntimeError('DATA_DIR_LOCKED');
      throw new RuntimeError('INSTANCE_LOCK_INVALID');
    }
    if (!holdsOnlyOwnerRecord(db))
      throw new RuntimeError('INSTANCE_LOCK_INVALID');
    db.exec('DROP TABLE IF EXISTS instance_owner');
    db.pragma('user_version = 0');
    db.exec('COMMIT');
    return previous;
  } finally {
    db.close();
  }
}
