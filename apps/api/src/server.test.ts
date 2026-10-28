import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { LOCAL_SESSION_PATH, type LocalSession } from '@portal/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireInstanceLock,
  INSTANCE_LOCK_FILE,
} from './platform/instance-lock.js';
import { freeLoopbackPort } from './testing/test-app.js';

it('exits with a safe startup reason on invalid configuration before opening DB', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(new URL('./server.ts', import.meta.url))],
    {
      env: { ...process.env, PORTAL_PORT: 'secret-invalid-port' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  const diagnostic: unknown = JSON.parse(result.stderr);
  expect(diagnostic).toMatchObject({
    code: 'STARTUP_FAILED',
    reason: 'INVALID_CONFIG',
  });
  expect(result.stderr).not.toContain('secret-invalid-port');
});

it.each(['', 'source_vb6', '../source_vb6', '../source_vb6/missing/data'])(
  'rejects startup data directory inside protected roots: %s',
  (child) => {
    const repository = fileURLToPath(new URL('../../../', import.meta.url));
    const dataDir = join(repository, child);
    const databasePath = join(dataDir, 'portal.db');
    const existedBefore = existsSync(databasePath);
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        fileURLToPath(new URL('./server.ts', import.meta.url)),
      ],
      {
        env: {
          ...process.env,
          PORTAL_DATA_DIR: dataDir,
          PORTAL_PORT: '4310',
          PORTAL_MODE: 'fixture',
          PORTAL_RUNNER: 'fake',
          PORTAL_LOG_LEVEL: 'silent',
        },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const diagnostic: unknown = JSON.parse(result.stderr);
    expect(diagnostic).toMatchObject({
      code: 'STARTUP_FAILED',
      reason: 'DATA_DIR_FORBIDDEN',
    });
    expect(existsSync(databasePath)).toBe(existedBefore);
  },
);

const SERVER = fileURLToPath(new URL('./server.ts', import.meta.url));

function serverEnv(dataDir: string, port: number) {
  return {
    ...process.env,
    PORTAL_DATA_DIR: dataDir,
    PORTAL_PORT: String(port),
    PORTAL_MODE: 'fixture',
    PORTAL_RUNNER: 'fake',
    PORTAL_LOG_LEVEL: 'info',
  };
}

// Real backend processes (B02 native smoke); killed in afterEach.
const servers: ChildProcess[] = [];
let lockRoot: string | undefined;

afterEach(async () => {
  for (const child of servers.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  }
  if (lockRoot)
    rmSync(lockRoot, { recursive: true, force: true, maxRetries: 5 });
  lockRoot = undefined;
});

function newLockRoot(): string {
  lockRoot = mkdtempSync(join(tmpdir(), 'portal-server-lock-'));
  return lockRoot;
}

async function startServer(dataDir: string) {
  const port = await freeLoopbackPort();
  const child = spawn(process.execPath, ['--import', 'tsx', SERVER], {
    env: serverEnv(dataDir, port),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  servers.push(child);
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = once(child, 'exit').then(([code]) => code as number | null);
  return {
    child,
    port,
    exited,
    output: () => ({ stdout, stderr }),
    // Resolves once /health answers; rejects if the process exits first.
    async ready(): Promise<void> {
      const deadline = Date.now() + 15_000;
      let done = false;
      void exited.then(() => {
        done = true;
      });
      while (!done && Date.now() < deadline) {
        try {
          const response = await fetch(
            `http://127.0.0.1:${port}/api/v1/health`,
          );
          if (response.ok) return;
        } catch {
          // Not listening yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Server not ready: ${stderr}`);
    },
  };
}

async function stopServer(server: {
  child: ChildProcess;
  exited: Promise<unknown>;
}) {
  // On Windows this terminates without running shutdown: the OS still drops
  // the lock, which is what a crash does too.
  server.child.kill();
  await server.exited;
}

function diagnostic(stderr: string): unknown {
  return JSON.parse(stderr);
}

describe('instance lock (native processes)', () => {
  it('B02-AC01: a second backend on the same data directory exits before opening the DB', async () => {
    const dataDir = join(newLockRoot(), 'data');
    // Held by this test process; the data directory has no portal.db yet.
    const lock = acquireInstanceLock(dataDir, {
      id: 'test-holder',
      pid: process.pid,
      now: () => new Date(),
    });
    try {
      const second = await startServer(dataDir);
      expect(await second.exited).toBe(1);
      expect(diagnostic(second.output().stderr)).toMatchObject({
        code: 'STARTUP_FAILED',
        reason: 'DATA_DIR_LOCKED',
      });
      expect(second.output().stderr).not.toContain(dataDir);
      expect(existsSync(join(dataDir, 'portal.db'))).toBe(false);
    } finally {
      lock.release();
    }
  }, 30_000);

  it('B02-AC01/AC02: two backends lock their own data directory; a stopped owner frees only its own', async () => {
    const root = newLockRoot();
    const first = await startServer(join(root, 'one'));
    await first.ready();
    const sameDir = await startServer(join(root, 'one'));
    expect(await sameDir.exited).toBe(1);
    expect(diagnostic(sameDir.output().stderr)).toMatchObject({
      reason: 'DATA_DIR_LOCKED',
    });
    // The first backend keeps serving.
    expect(
      (await fetch(`http://127.0.0.1:${first.port}/api/v1/health`)).ok,
    ).toBe(true);
    const otherDir = await startServer(join(root, 'two'));
    await otherDir.ready();
    await stopServer(first);
    // The stopped owner's directory is free again; the other is untouched.
    const restarted = await startServer(join(root, 'one'));
    await restarted.ready();
    expect(
      (await fetch(`http://127.0.0.1:${otherDir.port}/api/v1/health`)).ok,
    ).toBe(true);
    const blocked = await startServer(join(root, 'two'));
    expect(await blocked.exited).toBe(1);
  }, 60_000);

  it('B02-AC03: an unknown owner record starts the backend recovery_required and kills nothing', async () => {
    const dataDir = join(newLockRoot(), 'data');
    // A live process whose pid the unreadable record names.
    const bystander = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    servers.push(bystander);
    acquireInstanceLock(dataDir, {
      id: 'previous',
      pid: bystander.pid ?? 0,
      now: () => new Date(),
    }).release();
    const db = new Database(join(dataDir, INSTANCE_LOCK_FILE));
    // Same pid, a record format this version does not know.
    db.pragma('user_version = 2');
    db.close();
    const server = await startServer(dataDir);
    await server.ready();
    expect(server.output().stdout).toContain('INSTANCE_OWNER_UNKNOWN');
    const origin = `http://127.0.0.1:${server.port}`;
    const session = await fetch(`${origin}${LOCAL_SESSION_PATH}`, {
      method: 'POST',
      headers: { origin },
    });
    expect(session.status).toBe(200);
    const { token } = (await session.json()) as LocalSession;
    const status = await fetch(`${origin}/api/v1/runtime/status`, {
      headers: { origin, authorization: `Bearer ${token}` },
    });
    expect(await status.json()).toEqual({
      status: 'recovery_required',
      reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED',
    });
    expect(bystander.exitCode).toBeNull();
    expect(bystander.signalCode).toBeNull();
  }, 30_000);
});
