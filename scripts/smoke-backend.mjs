import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

  // PF05: a real compiled process publishes a local snapshot. A restarted
  // process reuses it even when the registered source no longer exists.
  const sourceRoot = join(owned, 'source');
  const movedRoot = join(owned, 'moved-source');
  mkdirSync(sourceRoot);
  const bytes = Buffer.from('Sub Main()\r\nEnd Sub\r\n');
  writeFileSync(join(sourceRoot, 'MAIN.BAS'), bytes);
  const jsonHeaders = { authorization, 'content-type': 'application/json' };
  const localCreated = await fetch(`${base}/projects`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name: 'Snapshot reopen fixture', mode: 'local' }),
  });
  assert.equal(localCreated.status, 201);
  const local = await localCreated.json();
  const registered = await fetch(`${base}/projects/${local.id}/source`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({
      rootPath: sourceRoot,
      profileId: 'vb6-cp932-v1',
      tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
      expectedSourceRevision: null,
    }),
  });
  assert.equal(registered.status, 200);
  const startRun = async (body) => {
    const accepted = await fetch(`${base}/projects/${local.id}/runs`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify(body),
    });
    assert.equal(accepted.status, 202);
    const { id } = await accepted.json();
    for (let attempt = 0; attempt < 80; attempt++) {
      const loaded = await fetch(`${base}/projects/${local.id}/runs/${id}`, {
        headers: { authorization },
      });
      assert.equal(loaded.status, 200);
      const run = await loaded.json();
      if (!['queued', 'running', 'cancelling'].includes(run.status)) {
        assert.equal(run.status, 'succeeded');
        return run;
      }
      await delay(100);
    }
    throw new Error('Local snapshot run did not finish.');
  };
  // PF07: each local run publishes its inventory; reads verify hash/size.
  const inventoryOf = async (run) => {
    const list = await fetch(
      `${base}/projects/${local.id}/runs/${run.id}/artifacts`,
      { headers: { authorization } },
    );
    assert.equal(list.status, 200);
    const [ref] = (await list.json()).items;
    assert.equal(ref?.mode, 'local');
    const read = await fetch(
      `${base}/projects/${local.id}/artifacts/${ref.id}/versions/${ref.version}`,
      { headers: { authorization } },
    );
    assert.equal(read.status, 200);
    return read.json();
  };
  const first = await startRun({
    kind: 'analyze',
    source: { strategy: 'current-source', expectedSourceRevision: 1 },
    retryOfRunId: null,
  });
  const firstInventory = await inventoryOf(first);
  assert.equal(firstInventory.sourceSnapshotId, first.sourceSnapshotId);
  assert.equal(firstInventory.payload.totals.analyzedCodeFiles, 1);
  const snapshot = join(dataDir, 'snapshots', first.sourceSnapshotId);
  const manifestBefore = readFileSync(join(snapshot, 'manifest.json'));
  assert.deepEqual(readFileSync(join(snapshot, 'raw', 'MAIN.BAS')), bytes);
  assert.deepEqual(readFileSync(join(sourceRoot, 'MAIN.BAS')), bytes);
  await stop();
  // Both paths are immediate children of the temp directory this smoke owns.
  assert.equal(dirname(sourceRoot), owned);
  assert.equal(dirname(movedRoot), owned);
  renameSync(sourceRoot, movedRoot);
  base = await start();
  authorization = await bootstrap(base);
  const sourceRead = await fetch(`${base}/projects/${local.id}/source`, {
    headers: { authorization },
  });
  assert.equal(sourceRead.status, 200);
  assert.equal((await sourceRead.json()).source.status, 'unreadable');
  const reused = await startRun({
    kind: 'analyze',
    source: { strategy: 'reuse-snapshot' },
    retryOfRunId: first.id,
  });
  assert.equal(reused.sourceSnapshotId, first.sourceSnapshotId);
  // After the restart the first version reads back byte-identical, and the
  // reproduction on the same snapshot has the same inventory.
  assert.deepEqual(await inventoryOf(first), firstInventory);
  const reusedInventory = await inventoryOf(reused);
  assert.notEqual(reusedInventory.id, firstInventory.id);
  assert.equal(reusedInventory.sha256, firstInventory.sha256);
  assert.deepEqual(reusedInventory.payload, firstInventory.payload);
  assert.deepEqual(
    readFileSync(join(snapshot, 'manifest.json')),
    manifestBefore,
  );
  assert.deepEqual(readFileSync(join(movedRoot, 'MAIN.BAS')), bytes);
  console.log(
    `PASS: compiled startup, migration, demo reopen/credential rotation, 4 protected paths; local snapshot + inventory/restart/reuse without source (same inventory), original bytes unchanged. ${process.platform}/${process.arch} ${process.version}`,
  );
} finally {
  await stop();
  rmSync(owned, { recursive: true, force: true });
}
