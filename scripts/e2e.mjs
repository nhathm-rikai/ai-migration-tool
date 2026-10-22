// One-command browser E2E on fixture data (T00). Builds the workspaces,
// starts the compiled API and the Vite preview of the built UI on free
// loopback ports with a temporary SQLite data directory, seeds a demo project,
// runs Playwright headless and always tears everything down.
//
//   npm run e2e               smoke suite; exit code = test result
//   npm run e2e:self-check    proves the harness fails loudly and cleans up
//
// No Claude/AI call, no customer source, no personal data directory.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { connect, createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const webDir = join(repository, 'apps', 'web');
const resultsDir = join(repository, 'test-results', 'e2e');
const require = createRequire(join(webDir, 'package.json'));
const viteBin = join(
  require.resolve('vite/package.json'),
  '..',
  'bin',
  'vite.js',
);
const playwrightCli = join(
  createRequire(join(repository, 'package.json')).resolve(
    '@playwright/test/package.json',
  ),
  '..',
  'cli.js',
);
const STARTUP_ATTEMPTS = 150;
const STOP_TIMEOUT_MS = 10_000;

const selfCheck = process.argv.includes('--self-check');
const skipBuild = process.argv.includes('--skip-build');

function log(message) {
  console.log(`[e2e] ${message}`);
}

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  probe.close();
  await once(probe, 'close');
  return port;
}

function portAccepts(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// Size and mtime of the personal database, to prove the run never touched it.
async function personalDatabaseFingerprint() {
  const { resolveDefaultDataDirectory } = await import(
    new URL('../apps/api/dist/platform/data-directory.js', import.meta.url)
  );
  const directory = resolveDefaultDataDirectory({
    platform: process.platform,
    homeDir: homedir(),
    ...(process.env.LOCALAPPDATA
      ? { localAppData: process.env.LOCALAPPDATA }
      : {}),
    ...(process.env.XDG_DATA_HOME
      ? { xdgDataHome: process.env.XDG_DATA_HOME }
      : {}),
  });
  const files = existsSync(directory) ? readdirSync(directory) : [];
  return JSON.stringify(
    files
      .filter((name) => name.startsWith('portal.db'))
      .sort()
      .map((name) => {
        const stat = statSync(join(directory, name));
        return [name, stat.size, stat.mtimeMs];
      }),
  );
}

function run(command, args, options) {
  const child = spawn(command, args, {
    windowsHide: true,
    stdio: 'inherit',
    ...options,
  });
  return once(child, 'close').then(
    ([code, signal]) => code ?? (signal ? 1 : 0),
  );
}

// A child this harness started and must stop. Output goes to a log file in
// the owned directory so a failed startup can be explained.
function startOwned(name, args, options, owned) {
  const child = spawn(process.execPath, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  let output = '';
  const keep = (chunk) => {
    output = (output + chunk).slice(-8000);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const closed = once(child, 'close');
  owned.children.push({ name, child, closed });
  return { child, output: () => output };
}

async function waitFor(url, { child, output }, name) {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`${name} exited during startup:\n${output()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* Not listening yet. */
    }
    await delay(100);
  }
  throw new Error(`${name} did not start in time:\n${output()}`);
}

async function stopOwned(owned) {
  for (const { name, child, closed } of owned.children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    const stopped = await Promise.race([
      closed.then(() => true),
      delay(STOP_TIMEOUT_MS).then(() => false),
    ]);
    if (!stopped) {
      child.kill('SIGKILL');
      await closed;
      log(`${name} needed a forced stop`);
    }
  }
  owned.children = [];
}

// One full harness run: start, seed, test, teardown, leak checks.
async function harness({ grep, crashApiBeforeTests = false }) {
  const owned = { children: [] };
  const directory = mkdtempSync(join(tmpdir(), 'portal-e2e-'));
  const personalBefore = await personalDatabaseFingerprint();
  const apiPort = await freePort();
  const webPort = await freePort();
  const outputDir = join(resultsDir, 'artifacts');
  const reportDir = join(resultsDir, 'report');
  let testExit = 1;
  let failure;
  const stopOnSignal = () => {
    void stopOwned(owned).finally(() => {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
      process.exit(130);
    });
  };
  process.once('SIGINT', stopOnSignal);
  process.once('SIGTERM', stopOnSignal);
  try {
    const api = startOwned(
      'api',
      [join(repository, 'apps', 'api', 'dist', 'server.js')],
      {
        cwd: directory,
        env: {
          ...process.env,
          PORTAL_PORT: String(apiPort),
          PORTAL_DATA_DIR: join(directory, 'data'),
          PORTAL_MODE: 'fixture',
          PORTAL_RUNNER: 'fake',
          PORTAL_LOG_LEVEL: 'warn',
        },
      },
      owned,
    );
    const apiBase = `http://127.0.0.1:${apiPort}/api/v1`;
    await waitFor(`${apiBase}/health`, api, 'API');

    const seedName = 'E2E seed project';
    const seed = await fetch(`${apiBase}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: seedName, fixtureId: 'sample-vb6' }),
    });
    if (seed.status !== 201) throw new Error(`Seed failed: ${seed.status}`);

    const web = startOwned(
      'web',
      [viteBin, 'preview', '--strictPort'],
      {
        cwd: webDir,
        env: {
          ...process.env,
          PORTAL_PORT: String(apiPort),
          PORTAL_WEB_PORT: String(webPort),
        },
      },
      owned,
    );
    const baseURL = `http://127.0.0.1:${webPort}`;
    await waitFor(`${baseURL}/api/v1/health`, web, 'Web preview');
    log(`API ${apiBase}, UI ${baseURL}, data ${directory}`);

    if (crashApiBeforeTests) {
      api.child.kill('SIGKILL');
      await once(api.child, 'close').catch(() => undefined);
      log('API stopped on purpose before the tests');
    }

    rmSync(outputDir, { recursive: true, force: true });
    testExit = await run(
      process.execPath,
      [
        playwrightCli,
        'test',
        '--config',
        join(repository, 'tests', 'e2e', 'playwright.config.ts'),
        '--grep',
        grep,
      ],
      {
        cwd: repository,
        env: {
          ...process.env,
          E2E_BASE_URL: baseURL,
          E2E_SEED_PROJECT_NAME: seedName,
          E2E_OUTPUT_DIR: outputDir,
          E2E_REPORT_DIR: reportDir,
        },
      },
    );
  } catch (error) {
    failure = error;
  } finally {
    await stopOwned(owned);
    rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
    process.removeListener('SIGINT', stopOnSignal);
    process.removeListener('SIGTERM', stopOnSignal);
  }

  // Leak checks run after every run, passed or failed.
  const leaks = [];
  for (const port of [apiPort, webPort])
    if (await portAccepts(port)) leaks.push(`port ${port} still open`);
  if (existsSync(directory)) leaks.push(`temp directory left: ${directory}`);
  if ((await personalDatabaseFingerprint()) !== personalBefore)
    leaks.push('personal data directory database changed');
  if (failure) {
    for (const leak of leaks) console.error(`[e2e] LEAK: ${leak}`);
    throw failure;
  }
  return { testExit, leaks, outputDir, reportDir };
}

function traces(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('trace.zip'));
}

async function main() {
  if (!skipBuild) {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error('Run through npm: `npm run e2e`.');
    log('building contracts, API and UI');
    const built = await run(process.execPath, [npmCli, 'run', 'build'], {
      cwd: repository,
    });
    if (built !== 0) return built;
  }

  if (!selfCheck) {
    const result = await harness({ grep: '@smoke' });
    for (const leak of result.leaks) console.error(`[e2e] LEAK: ${leak}`);
    log(
      `tests exit ${result.testExit}; report ${result.reportDir}; ` +
        `${process.platform}/${process.arch} ${process.version}`,
    );
    return result.testExit !== 0
      ? result.testExit
      : result.leaks.length
        ? 1
        : 0;
  }

  // Each scenario must fail the test run, leave a trace and leak nothing.
  const scenarios = [
    { name: 'failing assertion', grep: '@self-check' },
    {
      name: 'API stopped before tests',
      grep: '@smoke',
      crashApiBeforeTests: true,
    },
  ];
  const problems = [];
  for (const scenario of scenarios) {
    log(`self-check: ${scenario.name} (a failing test run is expected)`);
    const result = await harness(scenario);
    if (result.testExit === 0)
      problems.push(`${scenario.name}: test run passed but must fail`);
    if (traces(result.outputDir).length === 0)
      problems.push(`${scenario.name}: no trace.zip in ${result.outputDir}`);
    if (!existsSync(join(result.reportDir, 'index.html')))
      problems.push(`${scenario.name}: no HTML report`);
    problems.push(...result.leaks.map((leak) => `${scenario.name}: ${leak}`));
  }
  for (const problem of problems)
    console.error(`[e2e] SELF-CHECK FAIL: ${problem}`);
  log(
    problems.length
      ? 'self-check failed'
      : `self-check passed: failures exit nonzero with trace/report, no leaks; ` +
          `${process.platform}/${process.arch} ${process.version}`,
  );
  return problems.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[e2e] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  },
);
