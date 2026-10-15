import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

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
