import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/dist/config.js';

const repository = fileURLToPath(new URL('../', import.meta.url));
const entrypoint = join(repository, 'apps/api/dist/server.js');
const owned = mkdtempSync(join(tmpdir(), 'portal-relocation-smoke-'));
const dataDir = join(owned, 'data');
const baseEnv = {
  ...process.env,
  PORTAL_MODE: 'fixture',
  PORTAL_RUNNER: 'fake',
  PORTAL_LOG_LEVEL: 'silent',
};
let child;
let closed;
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null)
    child.kill();
  if (closed) await closed;
  child = undefined;
  closed = undefined;
}
async function start() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  child = spawn(process.execPath, [entrypoint], {
    cwd: owned,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...baseEnv, PORTAL_PORT: String(port), PORTAL_DATA_DIR: dataDir },
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  closed = once(child, 'close');
  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let attempt = 0; attempt < 80; attempt++) {
    assert.equal(child.exitCode, null, `Server exited: ${stderr}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return base;
    } catch {
      /* Wait only for this owned child to listen. */
    }
    await delay(100);
  }
  throw new Error('Server startup timed out.');
}
// Trusted local client: bootstrap from the API origin; the token travels only
// in the Authorization header.
async function bootstrap(base) {
  const session = await fetch(`${base}/session`, {
    method: 'POST',
    headers: { origin: new URL(base).origin },
  });
  assert.equal(session.status, 200);
  const { token } = await session.json();
  return `Bearer ${token}`;
}
try {
  for (const path of [
    repository,
    join(repository, 'apps', 'new-data'),
    resolve(repository, '..', 'source_vb6'),
    resolve(repository, '..', 'source_vb6', 'missing', 'data'),
  ]) {
    const database = join(path, 'portal.db');
    const existed = existsSync(database);
    const result = spawnSync(process.execPath, [entrypoint], {
      cwd: owned,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...baseEnv, PORTAL_PORT: '4310', PORTAL_DATA_DIR: path },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).reason, 'DATA_DIR_FORBIDDEN');
    assert.equal(existsSync(database), existed);
  }
  const parent = resolve(repository, '..');
  // Validation only: never create a DB in the user's personal workspace.
  assert.equal(
    loadConfig({ PORTAL_DATA_DIR: parent }).dataDir,
    realpathSync.native(parent),
  );
  let base = await start();
  let authorization = await bootstrap(base);
  const unauthorized = await fetch(`${base}/projects`);
  assert.equal(unauthorized.status, 401);
  const create = await fetch(`${base}/projects`, {
    method: 'POST',
    headers: {
      origin: new URL(base).origin,
      authorization,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Relocation fixture',
      fixtureId: 'sample-vb6',
    }),
  });
  assert.equal(create.status, 201);
  const project = await create.json();
  assert.ok(existsSync(join(dataDir, 'portal.db')));
  await stop();
  base = await start();
  // A restarted backend issues a new credential; the old one is rejected.
  const stale = await fetch(`${base}/projects/${project.id}`, {
    headers: { authorization },
  });
  assert.equal(stale.status, 401);
  authorization = await bootstrap(base);
  const response = await fetch(`${base}/projects/${project.id}`, {
    headers: { authorization },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), project);
  console.log(
    `PASS: compiled startup from external cwd, migration, create/reopen with local credential, 4 protected paths; parent workspace accepted. ${process.platform}/${process.arch} ${process.version}`,
  );
} finally {
  await stop();
  rmSync(owned, { recursive: true, force: true });
}
