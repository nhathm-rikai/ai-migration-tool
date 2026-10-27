import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  acquireInstanceLock,
  INSTANCE_LOCK_FILE,
} from '../platform/instance-lock.js';
import { main } from './confirm-recovery-command.js';

let root: string;
let dataDir: string;
let output: Record<'log' | 'error', string[]>;
const owner = () => ({ id: 'owner', pid: process.pid, now: () => new Date() });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'portal-confirm-test-'));
  dataDir = join(root, 'data');
  output = { log: [], error: [] };
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    output.log.push(line);
  });
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    output.error.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

function lastOutput(stream: 'log' | 'error'): unknown {
  return JSON.parse(output[stream].at(-1) ?? 'null');
}

it('requires an explicit --confirm', () => {
  expect(main([], { PORTAL_DATA_DIR: dataDir })).toBe(2);
  expect(main(['--yes'], { PORTAL_DATA_DIR: dataDir })).toBe(2);
  expect(lastOutput('error')).toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
});

it('resets an unknown owner record so the next start dispatches', () => {
  acquireInstanceLock(dataDir, owner()).release();
  const db = new Database(join(dataDir, INSTANCE_LOCK_FILE));
  db.pragma('user_version = 9');
  db.close();
  expect(main(['--confirm'], { PORTAL_DATA_DIR: dataDir })).toBe(0);
  expect(lastOutput('log')).toEqual({
    code: 'RECOVERY_CONFIRMED',
    previousOwner: 'unknown',
  });
  const lock = acquireInstanceLock(dataDir, owner());
  try {
    expect(lock.previousOwner).toBe('none');
  } finally {
    lock.release();
  }
});

it('refuses while a backend holds the data directory, without a path in the output', () => {
  const lock = acquireInstanceLock(dataDir, owner());
  try {
    expect(main(['--confirm'], { PORTAL_DATA_DIR: dataDir })).toBe(1);
    expect(lastOutput('error')).toEqual({
      code: 'RECOVERY_CONFIRM_FAILED',
      reason: 'DATA_DIR_LOCKED',
    });
  } finally {
    lock.release();
  }
});

it('fails on a data directory that was never started', () => {
  expect(main(['--confirm'], { PORTAL_DATA_DIR: dataDir })).toBe(1);
  expect(lastOutput('error')).toMatchObject({
    code: 'RECOVERY_CONFIRM_FAILED',
  });
});
