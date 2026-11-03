import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ErrorResponse, Project, Run } from '@portal/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createControlledExecutor } from '../../testing/controlled-executor.js';
import { createTestApp } from '../../testing/test-app.js';
import type { JobOptions } from '../../composition.js';

type Context = ReturnType<typeof createTestApp>;

describe('DELETE /api/v1/projects/:projectId', () => {
  let context: Context | undefined;
  afterEach(async () => {
    await context?.cleanup();
    context = undefined;
  });

  function setup(jobs: JobOptions = {}): Context {
    context = createTestApp({}, { jobs: { stopTimeoutMs: 100, ...jobs } });
    return context;
  }

  async function createProject(ctx: Context, name: string): Promise<Project> {
    const response = await ctx.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name, fixtureId: 'sample-vb6' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Project>();
  }

  async function startRun(ctx: Context, projectId: string): Promise<Run> {
    const response = await ctx.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/runs`,
      headers: { 'idempotency-key': `key-${randomUUID()}` },
      payload: {
        kind: 'analyze',
        source: { strategy: 'current-source', expectedSourceRevision: 1 },
        retryOfRunId: null,
      },
    });
    expect(response.statusCode).toBe(202);
    return response.json<Run>();
  }

  function waitForStatus(ctx: Context, run: Run, status: Run['status']) {
    return vi.waitFor(
      async () => {
        const current = (
          await ctx.inject(`/api/v1/projects/${run.projectId}/runs/${run.id}`)
        ).json<Run>();
        expect(current.status).toBe(status);
      },
      { timeout: 8000, interval: 10 },
    );
  }

  // Runs one analysis to success; the controlled executor serves one at a time.
  async function succeed(
    ctx: Context,
    controlled: ReturnType<typeof createControlledExecutor>,
    projectId: string,
  ): Promise<Run> {
    const run = await startRun(ctx, projectId);
    await waitForStatus(ctx, run, 'running');
    controlled.executions.at(-1)?.finish({
      status: 'succeeded',
      sourceSnapshotId: randomUUID(),
    });
    await waitForStatus(ctx, run, 'succeeded');
    return run;
  }

  const artifactEntries = (ctx: Context) => {
    const directory = join(ctx.config.dataDir, 'artifacts');
    return existsSync(directory)
      ? readdirSync(directory).filter((name) => !name.startsWith('.'))
      : [];
  };

  it('removes the project, its runs and its artifact files', async () => {
    const controlled = createControlledExecutor();
    const ctx = setup({ fixtureExecutor: controlled.executor });
    const project = await createProject(ctx, 'Old project');
    const other = await createProject(ctx, 'Kept project');
    const run = await succeed(ctx, controlled, project.id);
    expect(artifactEntries(ctx)).toHaveLength(1);

    const response = await ctx.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: project.id });
    for (const url of [
      `/api/v1/projects/${project.id}`,
      `/api/v1/projects/${project.id}/runs/${run.id}`,
    ])
      expect((await ctx.inject(url)).statusCode).toBe(404);
    expect(artifactEntries(ctx)).toEqual([]);
    const list = await ctx.inject('/api/v1/projects');
    expect(list.json<{ items: Project[] }>().items.map((p) => p.id)).toEqual([
      other.id,
    ]);
  });

  it('keeps another project and its artifacts', async () => {
    const controlled = createControlledExecutor();
    const ctx = setup({ fixtureExecutor: controlled.executor });
    const first = await createProject(ctx, 'First');
    const second = await createProject(ctx, 'Second');
    await succeed(ctx, controlled, first.id);
    const kept = await succeed(ctx, controlled, second.id);

    await ctx.inject({ method: 'DELETE', url: `/api/v1/projects/${first.id}` });

    expect(artifactEntries(ctx)).toHaveLength(1);
    expect(
      (await ctx.inject(`/api/v1/projects/${second.id}/runs/${kept.id}`))
        .statusCode,
    ).toBe(200);
  });

  it('answers 404 for a project that does not exist', async () => {
    const ctx = setup();
    const response = await ctx.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${randomUUID()}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorResponse>().error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('answers 400 for an ID that is not a UUID', async () => {
    const ctx = setup();
    const response = await ctx.inject({
      method: 'DELETE',
      url: '/api/v1/projects/not-a-uuid',
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses while a run is active and deletes nothing', async () => {
    const controlled = createControlledExecutor();
    const ctx = setup({ fixtureExecutor: controlled.executor });
    const project = await createProject(ctx, 'Busy project');
    const run = await startRun(ctx, project.id);
    await waitForStatus(ctx, run, 'running');

    const response = await ctx.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorResponse>().error.code).toBe('PROJECT_BUSY');
    expect(
      (await ctx.inject(`/api/v1/projects/${project.id}`)).statusCode,
    ).toBe(200);
  });
});
