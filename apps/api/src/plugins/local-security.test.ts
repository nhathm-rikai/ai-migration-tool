import { Writable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LOCAL_SESSION_PATH,
  LocalSessionSchema,
  type ErrorResponse,
  type LocalSession,
  type Project,
} from '@portal/contracts';
import Fastify from 'fastify';
import { Check } from 'typebox/value';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import {
  createTestApp,
  freeLoopbackPort,
  trustedHeaders,
} from '../testing/test-app.js';
import { createLoggerOptions } from './logger.js';

const project = { name: 'Protected', fixtureId: 'sample-vb6' };

describe('local HTTP security (B01)', () => {
  let context: ReturnType<typeof createTestApp>;
  let token: string;
  beforeEach(async () => {
    context = createTestApp();
    const session = await context.app.inject({
      method: 'POST',
      url: LOCAL_SESSION_PATH,
      headers: trustedHeaders(context.config),
    });
    expect(session.statusCode).toBe(200);
    expect(session.headers['cache-control']).toBe('no-store');
    const body: unknown = session.json();
    expect(Check(LocalSessionSchema, body)).toBe(true);
    token = session.json<LocalSession>().token;
  });
  afterEach(async () => {
    await context.cleanup();
  });

  async function projectCount(): Promise<number> {
    const list = await context.inject('/api/v1/projects?limit=100');
    return list.json<{ items: unknown[] }>().items.length;
  }

  function post(headers: Record<string, string>) {
    return context.app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers,
      payload: project,
    });
  }

  // B01-AC01: every forged variant is rejected before the database changes.
  it.each([
    {
      name: 'foreign Host (DNS rebinding)',
      headers: () => ({
        ...trustedHeaders(context.config),
        host: 'attacker.example:4310',
        authorization: `Bearer ${token}`,
      }),
      code: 'HOST_NOT_ALLOWED',
      status: 403,
    },
    {
      name: 'loopback Host on another port',
      headers: () => ({
        ...trustedHeaders(context.config),
        host: '127.0.0.1:9999',
        authorization: `Bearer ${token}`,
      }),
      code: 'HOST_NOT_ALLOWED',
      status: 403,
    },
    {
      name: 'foreign Origin with a valid credential',
      headers: () => ({
        ...trustedHeaders(context.config),
        origin: 'http://attacker.example',
        authorization: `Bearer ${token}`,
      }),
      code: 'ORIGIN_NOT_ALLOWED',
      status: 403,
    },
    {
      name: 'opaque Origin "null"',
      headers: () => ({
        ...trustedHeaders(context.config),
        origin: 'null',
        authorization: `Bearer ${token}`,
      }),
      code: 'ORIGIN_NOT_ALLOWED',
      status: 403,
    },
    {
      name: 'https variant of the trusted Origin',
      headers: () => ({
        ...trustedHeaders(context.config),
        origin: `https://127.0.0.1:${context.config.port}`,
        authorization: `Bearer ${token}`,
      }),
      code: 'ORIGIN_NOT_ALLOWED',
      status: 403,
    },
    {
      name: 'missing credential',
      headers: () => trustedHeaders(context.config),
      code: 'CREDENTIAL_INVALID',
      status: 401,
    },
    {
      name: 'wrong credential',
      headers: () => ({
        ...trustedHeaders(context.config),
        authorization: `Bearer ${'x'.repeat(token.length)}`,
      }),
      code: 'CREDENTIAL_INVALID',
      status: 401,
    },
    {
      name: 'credential with another scheme',
      headers: () => ({
        ...trustedHeaders(context.config),
        authorization: `Basic ${token}`,
      }),
      code: 'CREDENTIAL_INVALID',
      status: 401,
    },
    {
      name: 'credential prefix only',
      headers: () => ({
        ...trustedHeaders(context.config),
        authorization: `Bearer ${token.slice(0, 10)}`,
      }),
      code: 'CREDENTIAL_INVALID',
      status: 401,
    },
  ])('rejects POST with $name before mutation', async (scenario) => {
    const response = await post(scenario.headers());
    expect(response.statusCode).toBe(scenario.status);
    const body = response.json<ErrorResponse>();
    expect(body.error.code).toBe(scenario.code);
    expect(body.error.requestId.length).toBeGreaterThan(0);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.body).not.toContain(token);
    expect(await projectCount()).toBe(0);
  });

  it('rejects before body parsing, so a bad body cannot reveal the route', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        ...trustedHeaders(context.config),
        'content-type': 'application/xml',
      },
      payload: '<project />',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorResponse>().error.code).toBe(
      'CREDENTIAL_INVALID',
    );
  });

  it('protects reads and unknown routes, keeps health public but Host-checked', async () => {
    const headers = trustedHeaders(context.config);
    for (const url of ['/api/v1/projects', '/missing']) {
      const response = await context.app.inject({ url, headers });
      expect(response.statusCode).toBe(401);
    }
    const health = await context.app.inject({
      url: '/api/v1/health',
      headers: { host: headers.host },
    });
    expect(health.statusCode).toBe(200);
    const rebound = await context.app.inject({
      url: '/api/v1/health',
      headers: { host: 'attacker.example' },
    });
    expect(rebound.statusCode).toBe(403);
    const foreign = await context.app.inject({
      url: '/api/v1/health',
      headers: { ...headers, origin: 'http://attacker.example' },
    });
    expect(foreign.statusCode).toBe(403);
  });

  it('rejects a CORS preflight from a foreign origin without CORS headers', async () => {
    const response = await context.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/projects',
      headers: {
        host: trustedHeaders(context.config).host,
        origin: 'http://attacker.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  // B01-AC03: the documented policy for a request without Origin.
  describe('requests without Origin', () => {
    it('cannot bootstrap a credential', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: LOCAL_SESSION_PATH,
        headers: { host: trustedHeaders(context.config).host },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json<ErrorResponse>().error.code).toBe(
        'ORIGIN_NOT_ALLOWED',
      );
      expect(response.body).not.toContain(token);
    });

    it('are denied without a credential, for reads and mutations', async () => {
      const host = trustedHeaders(context.config).host;
      const read = await context.app.inject({
        url: '/api/v1/projects',
        headers: { host },
      });
      expect(read.statusCode).toBe(401);
      const write = await post({ host });
      expect(write.statusCode).toBe(401);
      expect(await projectCount()).toBe(0);
    });

    it('are allowed with the credential (same-origin GET, local tools)', async () => {
      const host = trustedHeaders(context.config).host;
      const write = await post({ host, authorization: `Bearer ${token}` });
      expect(write.statusCode).toBe(201);
      const read = await context.app.inject({
        url: '/api/v1/projects',
        headers: { host, authorization: `Bearer ${token}` },
      });
      expect(read.statusCode).toBe(200);
      expect(await projectCount()).toBe(1);
    });
  });

  it('accepts the dev proxy Host/Origin of the configured UI port only', async () => {
    const proxied = createTestApp({ PORTAL_WEB_PORT: '5199' });
    try {
      const ui = { host: '127.0.0.1:5199', origin: 'http://127.0.0.1:5199' };
      const session = await proxied.app.inject({
        method: 'POST',
        url: LOCAL_SESSION_PATH,
        headers: ui,
      });
      expect(session.statusCode).toBe(200);
      const credential = session.json<LocalSession>().token;
      const created = await proxied.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { ...ui, authorization: `Bearer ${credential}` },
        payload: project,
      });
      expect(created.statusCode).toBe(201);
      const defaultDevPort = await proxied.app.inject({
        method: 'POST',
        url: LOCAL_SESSION_PATH,
        headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' },
      });
      expect(defaultDevPort.statusCode).toBe(403);
    } finally {
      await proxied.cleanup();
    }
  });

  it('issues a new credential per process, so a restart expires the old one', async () => {
    const created = await context.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: project,
    });
    const saved = created.json<Project>();
    await context.app.close();
    const restarted = buildApp(context.config);
    try {
      const stale = await restarted.inject({
        url: `/api/v1/projects/${saved.id}`,
        headers: {
          ...trustedHeaders(context.config),
          authorization: `Bearer ${token}`,
        },
      });
      expect(stale.statusCode).toBe(401);
      const session = await restarted.inject({
        method: 'POST',
        url: LOCAL_SESSION_PATH,
        headers: trustedHeaders(context.config),
      });
      expect(session.json<LocalSession>().token).not.toBe(token);
    } finally {
      await restarted.close();
    }
  });
});

// B01-AC02: the trusted bootstrap works over a real socket and the credential
// never reaches the log.
it('bootstraps and creates/lists over a real loopback socket without logging the credential', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'portal-api-test-'));
  let output = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const config = loadConfig({
    PORTAL_DATA_DIR: dataDir,
    PORTAL_PORT: String(await freeLoopbackPort()),
    PORTAL_LOG_LEVEL: 'info',
  });
  const app = buildApp(config, { loggerStream: stream });
  try {
    const base = await app.listen({ host: config.host, port: config.port });
    const origin = `http://127.0.0.1:${config.port}`;
    const session = await fetch(`${base}${LOCAL_SESSION_PATH}`, {
      method: 'POST',
      headers: { origin },
    });
    expect(session.status).toBe(200);
    const body: unknown = await session.json();
    if (!Check(LocalSessionSchema, body)) throw new Error('Invalid session.');
    const token = body.token;
    const authorization = `Bearer ${token}`;
    const created = await fetch(`${base}/api/v1/projects`, {
      method: 'POST',
      headers: { origin, authorization, 'content-type': 'application/json' },
      body: JSON.stringify(project),
    });
    expect(created.status).toBe(201);
    const listed = await fetch(`${base}/api/v1/projects`, {
      headers: { authorization },
    });
    expect(listed.status).toBe(200);
    const foreign = await fetch(`${base}/api/v1/projects`, {
      method: 'POST',
      headers: {
        origin: 'http://attacker.example',
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify(project),
    });
    expect(foreign.status).toBe(403);
    expect(output).toContain('"statusCode":201');
    expect(output).not.toContain(token);
    expect(output).not.toMatch(/authorization/i);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it('keeps the logger free of credential headers even when headers are logged', async () => {
  let output = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const app = Fastify({ logger: { ...createLoggerOptions('info'), stream } });
  app.get('/probe', (request) => {
    request.log.info({ req: request }, 'probe');
    return {};
  });
  try {
    await app.inject({
      url: '/probe',
      headers: { authorization: 'Bearer secret-credential' },
    });
    expect(output).not.toContain('secret-credential');
  } finally {
    await app.close();
  }
});
