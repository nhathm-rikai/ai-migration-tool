import { randomUUID } from 'node:crypto';
import type { Project, ProjectList, ErrorResponse } from '@portal/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import {
  createTestApp,
  createTrustedInject,
  freeLoopbackPort,
} from '../../testing/test-app.js';

describe('Projects HTTP -> service -> real SQLite', () => {
  let context: ReturnType<typeof createTestApp>;
  beforeEach(() => {
    context = createTestApp();
  });
  afterEach(async () => {
    await context.cleanup();
  });

  it('creates, normalizes and reads a demo project', async () => {
    const response = await context.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: '  Sample  ', fixtureId: 'sample-vb6' },
    });
    expect(response.statusCode).toBe(201);
    const project = response.json<Project>();
    expect(project).toMatchObject({
      name: 'Sample',
      fixtureId: 'sample-vb6',
      mode: 'demo',
    });
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(project.createdAt).toISOString()).toBe(project.createdAt);
    expect(response.headers.location).toBe(`/api/v1/projects/${project.id}`);
    const loaded = await context.inject(`/api/v1/projects/${project.id}`);
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json()).toEqual(project);
  });

  it.each([
    {},
    { name: ' ', fixtureId: 'sample-vb6' },
    { name: 12, fixtureId: 'sample-vb6' },
    { name: 'x'.repeat(121), fixtureId: 'sample-vb6' },
    { name: 'Sample', fixtureId: '../../source_vb6' },
    {
      name: 'Sample',
      fixtureId: 'sample-vb6',
      sourcePath: 'C:/private/source',
    },
  ])(
    'rejects invalid or live-source input before persisting: %j',
    async (payload) => {
      const response = await context.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid request input.',
        },
      });
      expect(
        response.json<ErrorResponse>().error.requestId.length,
      ).toBeGreaterThan(0);
      const list = await context.inject('/api/v1/projects');
      expect(list.json()).toEqual({ items: [], nextCursor: null });
    },
  );

  it('counts Unicode code points consistently with the JSON schema and SQLite', async () => {
    const name = '😀'.repeat(120);
    const response = await context.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name, fixtureId: 'sample-vb6' },
    });
    expect(response.statusCode).toBe(201);
    const project = response.json<Project>();
    expect(
      (await context.inject(`/api/v1/projects/${project.id}`)).json<Project>()
        .name,
    ).toBe(name);
  });

  it('returns 404 for an absent ID and 400 for malformed IDs', async () => {
    const missing = await context.inject(`/api/v1/projects/${randomUUID()}`);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      error: { code: 'PROJECT_NOT_FOUND' },
    });
    expect(
      (await context.inject('/api/v1/projects/not-a-uuid')).statusCode,
    ).toBe(400);
  });

  it('paginates without duplicating records and parameterizes SQL input', async () => {
    for (const name of ['First', "Robert'); DROP TABLE projects;--", 'Third']) {
      expect(
        (
          await context.inject({
            method: 'POST',
            url: '/api/v1/projects',
            payload: { name, fixtureId: 'sample-vb6' },
          })
        ).statusCode,
      ).toBe(201);
    }
    const first = (
      await context.inject('/api/v1/projects?limit=2')
    ).json<ProjectList>();
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = (
      await context.inject(
        `/api/v1/projects?limit=2&cursor=${first.nextCursor}`,
      )
    ).json<ProjectList>();
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((project) => project.id))
        .size,
    ).toBe(3);
    expect(
      [...first.items, ...second.items].map((project) => project.name),
    ).toContain("Robert'); DROP TABLE projects;--");
  });

  it.each([
    'limit=0',
    'limit=101',
    'limit=1.5',
    'limit=abc',
    'limit=2&limit=3',
    'cursor=invalid',
    'sourcePath=private',
  ])('rejects invalid query %s', async (query) => {
    expect((await context.inject(`/api/v1/projects?${query}`)).statusCode).toBe(
      400,
    );
  });

  it('uses the default page size of 20 with a continuation cursor', async () => {
    for (let index = 0; index < 21; index++) {
      const response = await context.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: `Sample ${index}`, fixtureId: 'sample-vb6' },
      });
      expect(response.statusCode).toBe(201);
    }
    const page = (await context.inject('/api/v1/projects')).json<ProjectList>();
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
  });

  it('returns 415 for an unsupported content type without persisting data', async () => {
    const response = await context.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { 'content-type': 'application/xml' },
      payload: '<project />',
    });
    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Unsupported content type.',
      },
    });
    expect((await context.inject('/api/v1/projects')).json()).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('reopens persisted data and does not reapply the first migration', async () => {
    const original = (
      await context.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: 'Persistent', fixtureId: 'sample-vb6' },
      })
    ).json<Project>();
    await context.app.close();
    const reopened = buildApp(context.config);
    try {
      const response = await createTrustedInject(
        reopened,
        context.config,
      )(`/api/v1/projects/${original.id}`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(original);
    } finally {
      await reopened.close();
    }
  });

  it('returns bounded errors for malformed JSON, oversized input and unknown routes', async () => {
    const malformed = await context.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { 'content-type': 'application/json' },
      payload: '{broken',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({
      error: { code: 'INVALID_INPUT' },
    });
    const empty = await context.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    const oversized = await context.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'x'.repeat(20_000), fixtureId: 'sample-vb6' },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json()).toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
    expect((await context.inject('/missing')).json()).toMatchObject({
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });

  it('serves the fixture health contract over a real loopback socket', async () => {
    const socket = createTestApp({
      PORTAL_PORT: String(await freeLoopbackPort()),
    });
    try {
      const address = await socket.app.listen({
        host: socket.config.host,
        port: socket.config.port,
      });
      const response = await fetch(`${address}/api/v1/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: 'ok',
        mode: 'fixture',
        runner: 'fake',
      });
    } finally {
      await socket.cleanup();
    }
  });
});
