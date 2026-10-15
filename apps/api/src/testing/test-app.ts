import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';

export function createTestApp() {
  const dataDir = mkdtempSync(join(tmpdir(), 'portal-api-test-'));
  const config = loadConfig({
    PORTAL_DATA_DIR: dataDir,
    PORTAL_LOG_LEVEL: 'silent',
  });
  const app = buildApp(config);
  return {
    app,
    config,
    async cleanup() {
      await app.close();
      // dataDir is the exact directory allocated by this test, never a configured user path.
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
