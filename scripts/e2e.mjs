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
  readFileSync,
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
async function harness({ grep, crashApiBeforeTests = false, env = {} }) {
  const owned = { children: [] };
  const directory = mkdtempSync(join(tmpdir(), 'portal-e2e-'));
  const personalBefore = await personalDatabaseFingerprint();
  const apiPort = await freePort();
  const webPort = await freePort();
  const outputDir = join(resultsDir, 'artifacts');
  const reportDir = join(resultsDir, 'report');
  const jsonReport = join(resultsDir, 'results.json');
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
          // The API trusts the preview origin only on this port.
          PORTAL_WEB_PORT: String(webPort),
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
    // Seed as a trusted local client: bootstrap the credential from the API
    // origin, then send it in the Authorization header only.
    const origin = `http://127.0.0.1:${apiPort}`;
    const session = await fetch(`${apiBase}/session`, {
      method: 'POST',
      headers: { origin },
    });
    if (session.status !== 200)
      throw new Error(`Bootstrap failed: ${session.status}`);
    const { token } = await session.json();
    const seed = await fetch(`${apiBase}/projects`, {
      method: 'POST',
      headers: {
        origin,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
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
    rmSync(jsonReport, { force: true });
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
          E2E_JSON_REPORT: jsonReport,
          ...env,
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
  return {
    testExit,
    leaks,
    outputDir,
    reportDir,
    tests: readTests(jsonReport),
  };
}

// Flattened test results of the Playwright JSON report; null when the run
// produced no report at all.
function readTests(file) {
  if (!existsSync(file)) return null;
  const tests = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? [])
        tests.push({
          title: spec.title,
          status: test.results.at(-1)?.status ?? 'skipped',
          message: test.results
            .flatMap((result) => result.errors ?? [])
            .map((error) => error.message ?? '')
            .join('\n')
            // Strip ANSI colour codes before matching messages.
            // eslint-disable-next-line no-control-regex
            .replace(/\u001b\[[0-9;]*m/g, ''),
        });
    for (const child of suite.suites ?? []) visit(child);
  };
  const report = JSON.parse(readFileSync(file, 'utf8'));
  for (const suite of report.suites ?? []) visit(suite);
  for (const error of report.errors ?? [])
    tests.push({
      title: '(global)',
      status: 'failed',
      message: error.message ?? '',
    });
  return tests;
}

// Infrastructure failures (no browser, unreachable page) are not the failure
// a scenario is meant to prove.
const INFRASTRUCTURE_ERRORS = [
  'browserType.launch',
  "Executable doesn't exist",
  'net::ERR_CONNECTION_REFUSED',
];

// Problems that keep a run from proving `expect`; empty when it does.
// Leaks are checked separately in scenarioProblems.
function judgeRun(result, expect) {
  const problems = [];
  if (expect.outcome === 'pass' && result.testExit !== 0)
    problems.push(`test run exited ${result.testExit}, expected 0`);
  if (expect.outcome === 'fail' && result.testExit === 0)
    problems.push('test run passed but must fail');
  if (!result.tests) {
    problems.push('no JSON report: Playwright did not run the tests');
    return problems;
  }
  const ran = result.tests.filter((test) => test.status !== 'skipped');
  if (ran.length !== 1 || ran[0].title !== expect.title) {
    problems.push(
      `expected exactly "${expect.title}" to run, got ${JSON.stringify(ran.map((test) => test.title))}`,
    );
    return problems;
  }
  const [test] = ran;
  const excerpt = test.message.slice(0, 300);
  if (expect.outcome === 'pass' && test.status !== 'passed')
    problems.push(`"${test.title}" ${test.status}: ${excerpt}`);
  if (expect.outcome === 'fail') {
    if (test.status !== 'failed')
      problems.push(`"${test.title}" is ${test.status}, expected failed`);
    const infrastructure = INFRASTRUCTURE_ERRORS.find((marker) =>
      test.message.includes(marker),
    );
    if (infrastructure)
      problems.push(
        `failed on infrastructure (${infrastructure}), not on the scenario`,
      );
    for (const marker of expect.messageIncludes)
      if (!test.message.includes(marker))
        problems.push(`failure message lacks "${marker}": ${excerpt}`);
    if (traces(result.outputDir).length === 0)
      problems.push(`no trace.zip in ${result.outputDir}`);
    if (!existsSync(join(result.reportDir, 'index.html')))
      problems.push('no HTML report');
  }
  return problems;
}

function traces(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('trace.zip'));
}

// Every problem of one scenario run. Leaks (port, temp, personal DB) always
// count, also for a scenario whose expected outcome is a rejected run.
function scenarioProblems(scenario, result) {
  const leaks = result.leaks.map((leak) => `leak: ${leak}`);
  const found = judgeRun(result, scenario.expect);
  if (!scenario.rejectedFor) return [...leaks, ...found];
  const rejected = found.some((problem) =>
    problem.startsWith(scenario.rejectedFor),
  );
  return rejected
    ? leaks
    : [...leaks, `judge did not reject the run (${JSON.stringify(found)})`];
}

// Checks scenarioProblems on synthetic results before any browser run, so a
// judging bug cannot turn a leak or a broken run into a passing self-check.
function selfTestJudging() {
  const failed = (message, leaks = []) => ({
    testExit: 1,
    leaks,
    outputDir: '',
    reportDir: '',
    tests: [{ title: 'intentional failure', status: 'failed', message }],
  });
  const rejectScenario = {
    rejectedFor: 'failed on infrastructure',
    expect: {
      outcome: 'fail',
      title: 'intentional failure',
      messageIncludes: ['toBeVisible'],
    },
  };
  const control = { expect: { outcome: 'pass', title: 'intentional failure' } };
  const missingBrowser = "browserType.launch: Executable doesn't exist";
  const cases = [
    {
      name: 'infrastructure rejected without leaks passes',
      problems: scenarioProblems(rejectScenario, failed(missingBrowser)),
      expectProblems: false,
    },
    {
      name: 'infrastructure rejected with a leak fails',
      problems: scenarioProblems(
        rejectScenario,
        failed(missingBrowser, ['port 12345 still open']),
      ),
      expectProblems: true,
    },
    {
      name: 'run that is not rejected fails',
      problems: scenarioProblems(rejectScenario, failed('toBeVisible failed')),
      expectProblems: true,
    },
    {
      name: 'failed control run fails',
      problems: scenarioProblems(control, failed('toBeVisible failed')),
      expectProblems: true,
    },
  ];
  return cases
    .filter((item) => item.problems.length > 0 !== item.expectProblems)
    .map((item) => `${item.name}: got ${JSON.stringify(item.problems)}`);
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

  // A control smoke must pass first, so a broken environment (no browser,
  // no server) fails the self-check instead of passing as an expected
  // failure. Each injected failure is then judged on the JSON report: the
  // right test failed for the injected reason, with trace/report, no leaks.
  const smoke = 'create, list and reopen a project';
  const scenarios = [
    {
      name: 'control smoke',
      grep: '@smoke',
      expect: { outcome: 'pass', title: smoke },
    },
    {
      name: 'failing assertion',
      grep: '@self-check',
      expect: {
        outcome: 'fail',
        title: 'intentional failure',
        messageIncludes: ['toBeVisible', 'not on this page'],
      },
    },
    {
      name: 'API stopped before tests',
      grep: '@smoke',
      crashApiBeforeTests: true,
      expect: {
        outcome: 'fail',
        title: smoke,
        // The seeded project never shows because the list request fails.
        messageIncludes: ['toBeVisible', 'E2E seed project'],
      },
    },
    {
      // Regression: a run that never reaches the assertion (no browser) must
      // be rejected by the judge, not counted as the expected failure.
      name: 'missing browser is rejected',
      grep: '@self-check',
      missingBrowser: true,
      rejectedFor: 'failed on infrastructure',
      expect: {
        outcome: 'fail',
        title: 'intentional failure',
        messageIncludes: ['toBeVisible', 'not on this page'],
      },
    },
  ];
  const problems = selfTestJudging().map(
    (problem) => `judge self-test: ${problem}`,
  );
  for (const scenario of scenarios) {
    if (problems.length) break;
    log(`self-check: ${scenario.name}`);
    const emptyBrowsers = scenario.missingBrowser
      ? mkdtempSync(join(tmpdir(), 'portal-e2e-no-browser-'))
      : undefined;
    let found;
    try {
      found = scenarioProblems(
        scenario,
        await harness({
          ...scenario,
          env: emptyBrowsers ? { PLAYWRIGHT_BROWSERS_PATH: emptyBrowsers } : {},
        }),
      );
    } finally {
      if (emptyBrowsers)
        rmSync(emptyBrowsers, { recursive: true, force: true });
    }
    problems.push(...found.map((problem) => `${scenario.name}: ${problem}`));
    // Without a working control run the other scenarios prove nothing.
    if (scenario.expect.outcome === 'pass' && found.length) break;
  }
  for (const problem of problems)
    console.error(`[e2e] SELF-CHECK FAIL: ${problem}`);
  log(
    problems.length
      ? 'self-check failed'
      : `self-check passed: control smoke passed; each injected failure failed for its own reason with trace/report; no leaks; ` +
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
