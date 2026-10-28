import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { LOCAL_SESSION_PATH, type LocalSession } from '@portal/contracts';
import { buildApp } from '../app.js';
import type { JobOptions } from '../composition.js';
import { loadConfig, type AppConfig } from '../config.js';

type App = ReturnType<typeof buildApp>;

// Headers of the trusted UI: same loopback host/origin as the API.
export function trustedHeaders(config: AppConfig) {
  return {
    host: `127.0.0.1:${config.port}`,
    origin: `http://127.0.0.1:${config.port}`,
  };
}

// Injects like the trusted UI: bootstraps once, then sends the credential in
// the Authorization header. Explicit headers in `options` win.
export function createTrustedInject(app: App, config: AppConfig) {
  let token: string | undefined;
  return async function inject(
    options: string | InjectOptions,
  ): Promise<LightMyRequestResponse> {
    if (token === undefined) {
      const session = await app.inject({
        method: 'POST',
        url: LOCAL_SESSION_PATH,
        headers: trustedHeaders(config),
      });
      if (session.statusCode !== 200)
        throw new Error(`Bootstrap failed: ${session.statusCode}`);
      token = session.json<LocalSession>().token;
    }
    const request = typeof options === 'string' ? { url: options } : options;
    return app.inject({
      ...request,
      headers: {
        ...trustedHeaders(config),
        authorization: `Bearer ${token}`,
        ...request.headers,
      },
    });
  };
}

export function createTestApp(
  env: NodeJS.ProcessEnv = {},
  options: { jobs?: JobOptions } = {},
) {
  const dataDir = mkdtempSync(join(tmpdir(), 'portal-api-test-'));
  const config = loadConfig({
    PORTAL_DATA_DIR: dataDir,
    PORTAL_LOG_LEVEL: 'silent',
    ...env,
  });
  const app = buildApp(config, options);
  return {
    app,
    config,
    inject: createTrustedInject(app, config),
    async cleanup() {
      await app.close();
      // dataDir is the exact directory allocated by this test, never a configured user path.
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// A loopback port free right now; the API checks Host against its own port,
// so socket tests must listen on the configured port, not port 0.
export async function freeLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === 'string')
    throw new Error('No TCP address.');
  return address.port;
}
