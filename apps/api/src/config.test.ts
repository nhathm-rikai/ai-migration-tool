import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('configuration', () => {
  it('defaults to loopback, fixture, fake and an external data directory', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 4310,
      mode: 'fixture',
      runner: 'fake',
    });
    expect(isAbsolute(config.dataDir)).toBe(true);
  });
  it.each([
    { PORTAL_PORT: '0' },
    { PORTAL_PORT: '65536' },
    { PORTAL_PORT: '1.5' },
    { PORTAL_PORT: '' },
    { PORTAL_DATA_DIR: './runtime' },
    { PORTAL_MODE: 'live' },
    { PORTAL_RUNNER: 'claude' },
    { PORTAL_LOG_LEVEL: 'verbose' },
  ])('rejects unsupported configuration %j', (env) => {
    expect(() => loadConfig(env)).toThrow();
  });

  it('honors neutral environment settings and an existing data directory', () => {
    const existingData = tmpdir();
    const config = loadConfig({
      PORTAL_PORT: '4311',
      PORTAL_DATA_DIR: existingData,
      PORTAL_MODE: 'fixture',
      PORTAL_RUNNER: 'fake',
      PORTAL_LOG_LEVEL: 'warn',
    });
    expect(config).toMatchObject({
      port: 4311,
      dataDir: realpathSync.native(existingData),
      mode: 'fixture',
      runner: 'fake',
      logLevel: 'warn',
    });
  });
});
