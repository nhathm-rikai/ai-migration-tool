import { randomUUID } from 'node:crypto';
import type {
  ArtifactList,
  ErrorResponse,
  Project,
  Run,
  SourceInventoryDocument,
} from '@portal/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFilesystemArtifactStore } from '../../adapters/local/filesystem-artifact.store.js';
import { demoInventory } from '../../adapters/fake/demo-inventory.js';
import type { ArtifactStore } from '../../ports/artifact-store.js';
import { createControlledExecutor } from '../../testing/controlled-executor.js';
import { createTestApp, trustedHeaders } from '../../testing/test-app.js';
import { unzip } from '../../testing/zip-reader.js';
import { ALL_PROGRAMS, buildInventoryReport } from './inventory-report.js';
import { inventoryReportSheets } from './inventory-report-workbook.js';
import {
  contentDisposition,
  createReportDownloadService,
  reportFileName,
} from './report-download.service.js';

// AR01 API: GET .../versions/:version/report?format=xlsx|json.

const reportUrl = (
  projectId: string,
  id: string,
  version: number | string,
  format: string,
) =>
  `/api/v1/projects/${projectId}/artifacts/${id}/versions/${version}/report?format=${format}`;

describe('Assessment report download (AR01)', { timeout: 20_000 }, () => {
  let context: ReturnType<typeof createTestApp> | undefined;
  const reads: string[] = [];
  afterEach(async () => {
    await context?.cleanup();
    context = undefined;
    reads.length = 0;
  });

  // A project with one succeeded run and its published inventory.
  async function setup(name = 'Demo') {
    const controlled = createControlledExecutor();
    const slot: { inner?: ArtifactStore } = {};
    const store: ArtifactStore = {
      publish: (...args) => slot.inner!.publish(...args),
      read: (id, version) => {
        reads.push(`${id}@${version}`);
        return slot.inner!.read(id, version);
      },
      discard: (...args) => slot.inner!.discard(...args),
      cleanupStaging: () => slot.inner!.cleanupStaging(),
    };
    const ctx = createTestApp(
      {},
      {
        jobs: {
          stopTimeoutMs: 100,
          fixtureExecutor: controlled.executor,
          artifactStore: store,
        },
      },
    );
    context = ctx;
    slot.inner = createFilesystemArtifactStore({
      artifactsDir: `${ctx.config.dataDir}/artifacts`,
    });
    const created = await ctx.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name, fixtureId: 'sample-vb6' },
    });
    const project = created.json<Project>();
    const started = await ctx.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/runs`,
      headers: { 'idempotency-key': `key-${randomUUID()}` },
      payload: {
        kind: 'analyze',
        source: { strategy: 'current-source', expectedSourceRevision: 1 },
        retryOfRunId: null,
      },
    });
    const run = started.json<Run>();
    await vi.waitFor(() => expect(controlled.executions.length).toBe(1), {
      timeout: 8000,
    });
    controlled.executions[0]?.finish({
      status: 'succeeded',
      sourceSnapshotId: randomUUID(),
    });
    const ref = await vi.waitFor(
      async () => {
        const list = (
          await ctx.inject(
            `/api/v1/projects/${project.id}/runs/${run.id}/artifacts`,
          )
        ).json<ArtifactList>();
        expect(list.items).toHaveLength(1);
        return list.items[0]!;
      },
      { timeout: 8000, interval: 10 },
    );
    reads.length = 0;
    return { ctx, project, ref };
  }

  // AR01-AC01
  it('returns the xlsx with every report sheet and the json equal to the core report', async () => {
    const { ctx, project, ref } = await setup('Demo');
    const expected = buildInventoryReport(demoInventory, ALL_PROGRAMS, {
      mode: 'demo',
      projectId: project.id,
      projectName: 'Demo',
      runId: ref.runId,
      artifactId: ref.id,
      artifactVersion: 1,
      createdAt: ref.createdAt,
    });
    const names = inventoryReportSheets(expected).map((s) => s.name);
    // README (index) + the 15 report tables.
    expect(names).toHaveLength(16);
    expect(names[0]).toBe('README');

    const xlsx = await ctx.inject(reportUrl(project.id, ref.id, 1, 'xlsx'));
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(xlsx.headers['content-disposition']).toMatch(
      /^attachment; filename="assessment-Demo-\d{8}\.xlsx"; filename\*=UTF-8''assessment-Demo-\d{8}\.xlsx$/,
    );
    const parts = unzip(xlsx.rawPayload);
    const workbook = parts.get('xl/workbook.xml') ?? '';
    expect(
      [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]),
    ).toEqual(names);

    const json = await ctx.inject(reportUrl(project.id, ref.id, 1, 'json'));
    expect(json.statusCode).toBe(200);
    expect(json.headers['content-type']).toContain('application/json');
    expect(json.headers['content-disposition']).toContain('.json"');
    expect(json.json()).toEqual(JSON.parse(JSON.stringify(expected)));
    // Nothing is written next to the artifacts (no temp or report files).
    expect(json.headers['cache-control']).toBe('no-store');
  });

  // AR01-AC02
  it('rejects a foreign project, unknown artifact and unknown version', async () => {
    const { ctx, project, ref } = await setup();
    const other = (
      await ctx.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: 'Other', fixtureId: 'sample-vb6' },
      })
    ).json<Project>();
    const cases: [string, number, string][] = [
      [reportUrl(other.id, ref.id, 1, 'json'), 404, 'ARTIFACT_NOT_FOUND'],
      [
        reportUrl(project.id, randomUUID(), 1, 'json'),
        404,
        'ARTIFACT_NOT_FOUND',
      ],
      // No fallback to version 1 or to a "latest".
      [reportUrl(project.id, ref.id, 2, 'json'), 404, 'ARTIFACT_NOT_FOUND'],
      [reportUrl(project.id, ref.id, 'latest', 'json'), 400, 'INVALID_INPUT'],
      [reportUrl(randomUUID(), ref.id, 1, 'json'), 404, 'PROJECT_NOT_FOUND'],
    ];
    for (const [url, status, code] of cases) {
      const response = await ctx.inject(url);
      expect(response.statusCode).toBe(status);
      expect(response.json<ErrorResponse>().error.code).toBe(code);
      expect(response.body).not.toContain('reportVersion');
      expect(response.headers['content-disposition']).toBeUndefined();
    }
  });

  // AR01-AC03
  it('blocks a missing credential or foreign origin before reading the artifact', async () => {
    const { ctx, project, ref } = await setup();
    const url = reportUrl(project.id, ref.id, 1, 'xlsx');
    const trusted = trustedHeaders(ctx.config);
    const noCredential = await ctx.app.inject({ url, headers: trusted });
    expect(noCredential.statusCode).toBe(401);
    const foreign = await ctx.inject({
      url,
      headers: { origin: 'http://attacker.example' },
    });
    expect(foreign.statusCode).toBe(403);
    const rebound = await ctx.inject({
      url,
      headers: { host: 'attacker.example:4310' },
    });
    expect(rebound.statusCode).toBe(403);
    expect(reads).toEqual([]);
    // Control: the allowed request does read the stored artifact.
    expect((await ctx.inject(url)).statusCode).toBe(200);
    expect(reads).toEqual([`${ref.id}@1`]);
  });

  it('answers 400 for a missing, unknown or repeated format', async () => {
    const { ctx, project, ref } = await setup();
    const base = `/api/v1/projects/${project.id}/artifacts/${ref.id}/versions/1/report`;
    for (const query of [
      '',
      '?format=pdf',
      '?format=XLSX',
      '?format=',
      '?format=xlsx&format=json',
      '?format=xlsx&x=1',
    ]) {
      const response = await ctx.inject(base + query);
      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorResponse>().error.code).toBe('INVALID_INPUT');
    }
    expect(reads).toEqual([]);
  });
});

// AR01-AC02: the service asks the artifact service for the exact version
// and never substitutes another one.
describe('createReportDownloadService', () => {
  const inventoryOf = (suffix: string): SourceInventoryDocument => ({
    ...demoInventory,
    programs: demoInventory.programs.map((program) => ({
      ...program,
      name: `${program.name ?? 'P'}${suffix}`,
    })),
  });

  it('reads the requested version only and reports its content', async () => {
    const versions: Record<string, SourceInventoryDocument> = {
      '1': inventoryOf('MARKONE'),
      '2': inventoryOf('MARKTWO'),
    };
    const getVersion = vi.fn((_p: string, _a: string, version: string) => {
      const payload = versions[version];
      if (!payload) return Promise.reject(new Error('not found'));
      return Promise.resolve({ payload } as never);
    });
    const service = createReportDownloadService({
      projects: { get: () => ({ name: 'P' }) as Project },
      artifacts: { getVersion },
      now: () => new Date('2026-11-06T10:00:00Z'),
    });
    const v1 = await service.build('p', 'a', '1', 'json');
    const v2 = await service.build('p', 'a', '2', 'json');
    expect(getVersion.mock.calls.map((call) => call[2])).toEqual(['1', '2']);
    expect(String(v1.body)).toContain('MARKONE');
    expect(String(v1.body)).not.toContain('MARKTWO');
    expect(String(v2.body)).toContain('MARKTWO');
    expect(String(v2.body)).not.toContain('MARKONE');
    await expect(service.build('p', 'a', '3', 'json')).rejects.toThrow();
  });
});

describe('report file name', () => {
  const day = new Date('2026-11-06T10:00:00Z');
  it('adds the date and an RFC 5987 name for Japanese and Vietnamese names', () => {
    const name = reportFileName('受注 管理/システム', day, 'xlsx');
    expect(name).toBe('assessment-受注 管理_システム-20261106.xlsx');
    const header = contentDisposition(name);
    expect(header).toContain('filename="assessment-______');
    expect(header).toContain(
      "filename*=UTF-8''assessment-%E5%8F%97%E6%B3%A8%20%E7%AE%A1%E7%90%86_%E3%82%B7",
    );
    // Header-safe: ASCII only.
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    expect(reportFileName('Quản lý "đơn"', day, 'json')).toBe(
      'assessment-Quản lý _đơn_-20261106.json',
    );
  });
  it('never yields an empty or dot-only project part or a header break', () => {
    expect(reportFileName('..', day, 'json')).toBe(
      'assessment-project-20261106.json',
    );
    expect(reportFileName('a\r\nb: c', day, 'json')).toBe(
      'assessment-a_b_ c-20261106.json',
    );
    expect(reportFileName('x'.repeat(200), day, 'json')).toHaveLength(
      'assessment-'.length + 80 + '-20261106.json'.length,
    );
  });
});
