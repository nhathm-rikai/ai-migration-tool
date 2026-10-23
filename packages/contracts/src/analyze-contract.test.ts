import type { TSchema } from 'typebox';
import { Check, Errors } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  ANALYZE_API_ERROR_HTTP_STATUS,
  ANALYZE_API_OPERATIONS,
  AnalyzeApiErrorCodeSchema,
  ApiErrorCodeSchema,
  ArtifactListSchema,
  ArtifactVersionParamsSchema,
  CancelRunSchema,
  CreateProjectSchema,
  CurrentRunResponseSchema,
  ErrorResponseSchema,
  ListProjectsQuerySchema,
  ListRunsQuerySchema,
  ProjectListSchema,
  ProjectSchema,
  ProjectSourceResponseSchema,
  PutProjectSourceSchema,
  RUN_STATUSES,
  RunEventSchema,
  RunListSchema,
  RunSchema,
  RuntimeStatusSchema,
  SOURCE_PROFILE_IDS,
  SourceInventoryArtifactSchema,
  SourceInventorySchema,
  StartRunHeadersSchema,
  StartRunSchema,
  cancelRunSuccessStatus,
} from './index.js';
import * as fixtures from './fixtures/index.js';

const expectValid = (schema: TSchema, value: unknown) => {
  expect([...Errors(schema, value)]).toEqual([]);
  expect(Check(schema, value)).toBe(true);
};
const expectInvalid = (schema: TSchema, value: unknown) => {
  expect(Check(schema, value)).toBe(false);
};
const clone = <T>(value: T): T => structuredClone(value);

describe('C01-AC01 run payloads', () => {
  it.each(RUN_STATUSES)('accepts the %s run fixture', (status) => {
    const run = fixtures.RUN_FIXTURES_BY_STATUS[status];
    expect(run.status).toBe(status);
    expectValid(RunSchema, run);
  });

  it('accepts retry, demo, list, current and event payloads', () => {
    expectValid(RunSchema, fixtures.retryRunFixture);
    expectValid(RunSchema, fixtures.reuseSnapshotRunFixture);
    expectValid(RunSchema, fixtures.demoQueuedRunFixture);
    expectValid(RunListSchema, fixtures.runListFixture);
    expectValid(RunListSchema, { items: [], nextCursor: null });
    expectValid(CurrentRunResponseSchema, fixtures.currentRunFixture);
    expectValid(CurrentRunResponseSchema, fixtures.noCurrentRunFixture);
    expectValid(RunEventSchema, fixtures.runEventFixture);
    expectValid(RuntimeStatusSchema, fixtures.runtimeReadyFixture);
    expectValid(RuntimeStatusSchema, fixtures.runtimeRecoveryRequiredFixture);
  });

  it('rejects an unknown status, unknown field and bad IDs', () => {
    expectInvalid(RunSchema, {
      ...fixtures.queuedRunFixture,
      status: 'paused',
    });
    expectInvalid(RunSchema, { ...fixtures.queuedRunFixture, progress: 40 });
    expectInvalid(RunSchema, { ...fixtures.queuedRunFixture, id: 'run-1' });
    expectInvalid(RunSchema, {
      ...fixtures.queuedRunFixture,
      projectId: 'not-a-uuid',
    });
    expectInvalid(RunSchema, {
      ...fixtures.queuedRunFixture,
      kind: 'understand',
    });
    expectInvalid(RunEventSchema, {
      ...fixtures.runEventFixture,
      status: 'done',
    });
  });

  it('rejects fields that contradict the status', () => {
    expectInvalid(RunSchema, {
      ...fixtures.queuedRunFixture,
      startedAt: '2026-10-22T02:00:01.000Z',
    });
    expectInvalid(RunSchema, {
      ...fixtures.queuedRunFixture,
      stage: 'snapshot',
    });
    expectInvalid(RunSchema, { ...fixtures.failedRunFixture, errorCode: null });
    expectInvalid(RunSchema, {
      ...fixtures.failedRunFixture,
      errorCode: 'SOMETHING_ELSE',
    });
    expectInvalid(RunSchema, {
      ...fixtures.succeededRunFixture,
      sourceSnapshotId: null,
    });
    expectInvalid(RunSchema, {
      ...fixtures.succeededRunFixture,
      errorCode: 'TIMEOUT',
    });
    expectInvalid(RunSchema, {
      ...fixtures.runningRunFixture,
      finishedAt: '2026-10-22T02:00:09.000Z',
    });
    expectInvalid(RunSchema, { ...fixtures.queuedRunFixture, stateVersion: 0 });
  });

  it('requires the parent run and snapshot when a snapshot is reused', () => {
    const reuse = fixtures.reuseSnapshotRunFixture;
    expectInvalid(RunSchema, { ...reuse, retryOfRunId: null });
    expectInvalid(RunSchema, { ...reuse, sourceSnapshotId: null });
    expectInvalid(RunSchema, {
      ...reuse,
      retryOfRunId: null,
      sourceSnapshotId: null,
    });
    for (const run of Object.values(fixtures.RUN_FIXTURES_BY_STATUS)) {
      const asReuse = {
        ...run,
        sourceStrategy: 'reuse-snapshot',
        retryOfRunId: fixtures.FIXTURE_IDS.runs.failed,
      };
      expectInvalid(RunSchema, { ...asReuse, sourceSnapshotId: null });
      expectValid(RunSchema, {
        ...asReuse,
        sourceSnapshotId: fixtures.FIXTURE_IDS.snapshot,
      });
    }
    // A run on the current source has no snapshot before it starts.
    expectInvalid(RunSchema, {
      ...fixtures.queuedRunFixture,
      sourceSnapshotId: fixtures.FIXTURE_IDS.snapshot,
    });
  });

  it('pairs the reuse request with a parent that has a snapshot', () => {
    const parentId = fixtures.retryWithSnapshotFixture.retryOfRunId;
    const parent = Object.values(fixtures.RUN_FIXTURES_BY_STATUS).find(
      (run) => run.id === parentId,
    );
    expect(parent?.sourceSnapshotId).toBe(
      fixtures.reuseSnapshotRunFixture.sourceSnapshotId,
    );
    expect(fixtures.reuseSnapshotRunFixture.retryOfRunId).toBe(parentId);
  });

  it('rejects an invalid locked config', () => {
    const extra = clone(fixtures.queuedRunFixture) as Record<string, unknown>;
    (extra.config as Record<string, unknown>).model = 'any';
    expectInvalid(RunSchema, extra);

    const mapping = clone(fixtures.queuedRunFixture);
    expectInvalid(RunSchema, {
      ...mapping,
      config: {
        ...mapping.config,
        tableNameMapping: { defaultSchema: null, status: 'assumed' },
      },
    });
    expectInvalid(RunSchema, {
      ...mapping,
      config: {
        ...mapping.config,
        analyzer: {
          ...mapping.config.analyzer,
          inventorySchemaVersion: 'source-inventory-v2',
        },
      },
    });
    expectInvalid(RunSchema, {
      ...mapping,
      config: {
        ...mapping.config,
        limits: { ...mapping.config.limits, maxFiles: 0 },
      },
    });
  });

  it('accepts new runs and retries on old or new snapshots', () => {
    expectValid(StartRunSchema, fixtures.startRunFixture);
    expectValid(StartRunSchema, fixtures.retryWithSnapshotFixture);
    expectValid(StartRunSchema, fixtures.retryWithNewSourceFixture);
  });

  it('rejects start requests outside the contract', () => {
    // Reusing a snapshot is only meaningful for a retry.
    expectInvalid(StartRunSchema, {
      ...fixtures.retryWithSnapshotFixture,
      retryOfRunId: null,
    });
    expectInvalid(StartRunSchema, {
      ...fixtures.startRunFixture,
      kind: 'understand',
    });
    expectInvalid(StartRunSchema, {
      ...fixtures.startRunFixture,
      config: fixtures.runConfigFixture,
    });
    expectInvalid(StartRunSchema, {
      ...fixtures.startRunFixture,
      source: { strategy: 'current-source' },
    });
    expectInvalid(StartRunSchema, {
      kind: 'analyze',
      source: { strategy: 'current-source', expectedSourceRevision: 1 },
    });
    expectInvalid(StartRunSchema, {
      ...fixtures.retryWithSnapshotFixture,
      retryOfRunId: 'previous',
    });
  });

  it('checks the idempotency key, cancel body and list query', () => {
    expectValid(StartRunHeadersSchema, {
      'idempotency-key': '6c1f7d0e-2b4a-4c8e-9f1d-3a5b7c9e1f20',
      'content-type': 'application/json',
    });
    expectInvalid(StartRunHeadersSchema, {
      'content-type': 'application/json',
    });
    expectInvalid(StartRunHeadersSchema, { 'idempotency-key': 'short' });
    expectInvalid(StartRunHeadersSchema, {
      'idempotency-key': 'has spaces in the key value',
    });

    expectValid(CancelRunSchema, { expectedStateVersion: 2 });
    expectInvalid(CancelRunSchema, {});
    expectInvalid(CancelRunSchema, { expectedStateVersion: '2' });
    expectInvalid(CancelRunSchema, { expectedStateVersion: 2, force: true });

    expectValid(ListRunsQuerySchema, {});
    expectValid(ListRunsQuerySchema, { limit: '50', cursor: 'abc_DEF-1' });
    expectInvalid(ListRunsQuerySchema, { limit: '0' });
    expectInvalid(ListRunsQuerySchema, { limit: '101' });
    expectInvalid(ListRunsQuerySchema, { cursor: 'a/b' });
    expectInvalid(ListRunsQuerySchema, { status: 'queued' });
  });

  it('rejects a runtime status with a reason that does not match', () => {
    expectInvalid(RuntimeStatusSchema, {
      status: 'ready',
      reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED',
    });
    expectInvalid(RuntimeStatusSchema, {
      status: 'recovery_required',
      reasonCode: null,
    });
    expectInvalid(RuntimeStatusSchema, {
      status: 'ready',
      reasonCode: null,
      pid: 1234,
    });
  });
});

describe('C01 source registration payloads', () => {
  it('accepts register, update and read payloads', () => {
    expectValid(PutProjectSourceSchema, fixtures.putProjectSourceFixture);
    expectValid(PutProjectSourceSchema, {
      ...fixtures.putProjectSourceFixture,
      rootPath: '/home/dev/order-module',
      tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
      expectedSourceRevision: 3,
    });
    expectValid(
      ProjectSourceResponseSchema,
      fixtures.localSourceResponseFixture,
    );
    expectValid(
      ProjectSourceResponseSchema,
      fixtures.fixtureSourceResponseFixture,
    );
    expectValid(
      ProjectSourceResponseSchema,
      fixtures.unregisteredSourceResponseFixture,
    );
  });

  it('rejects invalid source requests and leaking responses', () => {
    const put = fixtures.putProjectSourceFixture;
    expectInvalid(PutProjectSourceSchema, { ...put, rootPath: '   ' });
    expectInvalid(PutProjectSourceSchema, {
      ...put,
      rootPath: 'x'.repeat(4097),
    });
    expectInvalid(PutProjectSourceSchema, { ...put, profileId: 'VB6 profile' });
    expectInvalid(PutProjectSourceSchema, {
      ...put,
      expectedSourceRevision: 0,
    });
    expectInvalid(PutProjectSourceSchema, { ...put, fixtureId: 'sample-vb6' });
    expectInvalid(PutProjectSourceSchema, {
      ...put,
      tableNameMapping: { defaultSchema: 'APP', status: 'unconfigured' },
    });
    expectInvalid(PutProjectSourceSchema, {
      ...put,
      tableNameMapping: { defaultSchema: 'APP; DROP', status: 'assumed' },
    });

    const source = fixtures.localSourceResponseFixture.source;
    // The absolute root never leaves the server.
    expectInvalid(ProjectSourceResponseSchema, {
      source: { ...source, rootPath: 'C:\\work\\order-module' },
    });
    expectInvalid(ProjectSourceResponseSchema, {
      source: { ...source, displayName: 'C:\\work\\order-module' },
    });
    expectInvalid(ProjectSourceResponseSchema, {
      source: { ...source, displayName: '/home/dev/order-module' },
    });
    expectInvalid(ProjectSourceResponseSchema, {
      source: { ...source, status: 'scanning' },
    });
    expectInvalid(ProjectSourceResponseSchema, {
      source: { ...fixtures.fixtureSourceResponseFixture.source, revision: 2 },
    });
  });

  it('lists the profile the analyzer ships with', () => {
    expect(SOURCE_PROFILE_IDS).toEqual(['vb6-cp932-v1']);
  });
});

describe('C01-AC02 Projects API stays compatible', () => {
  it('accepts the create/list/detail payloads shipped before C01', () => {
    expectValid(CreateProjectSchema, fixtures.legacyCreateProjectRequest);
    expectValid(ProjectSchema, fixtures.legacyProject);
    expectValid(ProjectListSchema, fixtures.legacyProjectList);
    expectValid(ListProjectsQuerySchema, fixtures.legacyProjectListQuery);
    expectValid(ListProjectsQuerySchema, {});
  });

  it('keeps the old strictness of the Project DTO', () => {
    expectInvalid(ProjectSchema, { ...fixtures.legacyProject, sourceId: null });
    expectInvalid(CreateProjectSchema, {
      ...fixtures.legacyCreateProjectRequest,
      rootPath: '/tmp',
    });
    expectInvalid(ProjectSchema, { ...fixtures.legacyProject, mode: 'local' });
  });

  it('keeps every Projects error code', () => {
    for (const code of [
      'INVALID_INPUT',
      'PROJECT_NOT_FOUND',
      'ROUTE_NOT_FOUND',
      'PAYLOAD_TOO_LARGE',
      'UNSUPPORTED_MEDIA_TYPE',
      'INTERNAL_ERROR',
    ]) {
      expect(Check(ApiErrorCodeSchema, code)).toBe(true);
    }
  });
});

describe('C01-AC03 inventory compatibility', () => {
  it.each([
    ['mapped', fixtures.mappedInventoryFixture],
    ['unmapped (written before mapping)', fixtures.unmappedInventoryFixture],
    ['partial', fixtures.partialInventoryFixture],
  ])('accepts the %s inventory', (_name, inventory) => {
    expectValid(SourceInventorySchema, inventory);
  });

  it.each([
    fixtures.mappedInventoryArtifactFixture,
    fixtures.unmappedInventoryArtifactFixture,
    fixtures.partialInventoryArtifactFixture,
  ])(
    'accepts the artifact envelope of $payload.totals.files files',
    (artifact) => {
      expectValid(SourceInventoryArtifactSchema, artifact);
    },
  );

  // The fixtures above have no procedure breakdown (written before it).
  it('accepts the procedure line breakdown with its version', () => {
    const inventory = structuredClone(fixtures.mappedInventoryFixture) as {
      procedureLinesVersion?: string;
      files: { analysis: { procedures?: Record<string, unknown>[] } | null }[];
    };
    inventory.procedureLinesVersion = 'vb6-procedure-lines-v1';
    const procedure = inventory.files[1]?.analysis?.procedures?.[0];
    if (!procedure) throw new Error('fixture procedure missing');
    Object.assign(procedure, {
      physicalLines: 6,
      commentOnlyLines: 1,
      blankLines: 0,
      metadataLines: 0,
      unclassifiedLines: 0,
      sqlLines: 2,
    });
    expectValid(SourceInventorySchema, inventory);
    procedure.sqlLines = -1;
    expect(Check(SourceInventorySchema, inventory)).toBe(false);
  });

  it('keeps the raw and mapped views apart', () => {
    const analysis = fixtures.mappedInventoryFixture.programs[0].analysis;
    expect(analysis.crud.map((entry) => entry.table)).toEqual([
      'APP.ORDERS',
      'ORDERS',
    ]);
    expect(analysis.metrics.tables).toBe(2);
    expect(analysis.normalizedCrud[0]?.names).toEqual(['APP.ORDERS', 'ORDERS']);
    expect(analysis.metrics.normalizedTables).toBe(1);
  });

  it('keeps partial warnings after validation', () => {
    const artifact = clone(fixtures.partialInventoryArtifactFixture);
    expectValid(SourceInventoryArtifactSchema, artifact);
    const payload = artifact.payload;
    expect(payload.files.map((file) => file.manifest.kind)).toEqual([
      'text',
      'text',
      'error',
      'text',
      'binary',
    ]);
    expect(payload.files[3]?.analysis).toEqual({
      status: 'unsupported',
      reason: 'UNBALANCED_BLOCK',
      line: 12,
    });
    expect(payload.programs[0]?.complete).toBe(false);
    expect(payload.programs[0]?.members[1]?.resolution).toBe('missing');
    expect(payload.totals).toMatchObject({
      unsupportedFiles: 1,
      errorFiles: 1,
    });
    expect(payload.skipped).toHaveLength(2);
  });

  it('rejects envelopes that do not match the contract', () => {
    const artifact = fixtures.mappedInventoryArtifactFixture;
    expectInvalid(SourceInventoryArtifactSchema, {
      ...artifact,
      promptVersion: 'p1',
    });
    expectInvalid(SourceInventoryArtifactSchema, {
      ...artifact,
      schemaVersion: 'source-inventory-v2',
    });
    expectInvalid(SourceInventoryArtifactSchema, { ...artifact, version: 0 });
    expectInvalid(SourceInventoryArtifactSchema, { ...artifact, mode: 'live' });
    expectInvalid(SourceInventoryArtifactSchema, {
      ...artifact,
      filePath: 'C:\\data\\artifacts\\a.json',
    });
    expectInvalid(SourceInventoryArtifactSchema, {
      ...artifact,
      payload: { ...artifact.payload, unknownField: true },
    });
    expectValid(ArtifactListSchema, fixtures.artifactListFixture);
    expectValid(ArtifactListSchema, fixtures.emptyArtifactListFixture);
  });

  it('accepts only an exact version in the path', () => {
    const params = {
      projectId: fixtures.FIXTURE_IDS.project,
      artifactId: fixtures.FIXTURE_IDS.artifact,
      version: '1',
    };
    expectValid(ArtifactVersionParamsSchema, params);
    expectInvalid(ArtifactVersionParamsSchema, {
      ...params,
      version: 'latest',
    });
    expectInvalid(ArtifactVersionParamsSchema, { ...params, version: '0' });
    expectInvalid(ArtifactVersionParamsSchema, { ...params, version: '01' });
  });
});

describe('C01 operation table', () => {
  it('uses only known error codes', () => {
    for (const operation of Object.values(ANALYZE_API_OPERATIONS)) {
      for (const code of operation.errorCodes) {
        expect(
          Check(ApiErrorCodeSchema, code) ||
            Check(AnalyzeApiErrorCodeSchema, code),
        ).toBe(true);
        expect(
          Check(ErrorResponseSchema, fixtures.errorResponseFixture(code)),
        ).toBe(true);
      }
    }
  });

  it('keeps the analyze codes apart from the Projects codes', () => {
    for (const code of Object.keys(ANALYZE_API_ERROR_HTTP_STATUS)) {
      expect(Check(ApiErrorCodeSchema, code)).toBe(false);
    }
  });

  it('has one unique method and path per operation', () => {
    const routes = Object.values(ANALYZE_API_OPERATIONS).map(
      (operation) => `${operation.method} ${operation.path}`,
    );
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('answers 202 for accepted work and 200 for completed queries', () => {
    expect(ANALYZE_API_OPERATIONS.startRun.successStatuses).toEqual([202]);
    expect(ANALYZE_API_OPERATIONS.cancelRun.successStatuses).toEqual([
      202, 200,
    ]);
    expect(
      Object.entries(ANALYZE_API_OPERATIONS)
        .filter(([id]) => id !== 'startRun' && id !== 'cancelRun')
        .every(([, operation]) => operation.successStatuses.join() === '200'),
    ).toBe(true);
  });

  it('answers cancel with 202 while cancelling and 200 once cancelled', () => {
    expect(cancelRunSuccessStatus(fixtures.cancellingRunFixture)).toBe(202);
    expect(cancelRunSuccessStatus(fixtures.cancelledRunFixture)).toBe(200);
  });

  it('validates each fixture against the response schema of its operation', () => {
    const samples = {
      getProjectSource: fixtures.localSourceResponseFixture,
      putProjectSource: fixtures.localSourceResponseFixture,
      startRun: fixtures.queuedRunFixture,
      listRuns: fixtures.runListFixture,
      getCurrentRun: fixtures.currentRunFixture,
      getRun: fixtures.runningRunFixture,
      cancelRun: fixtures.cancellingRunFixture,
      getRuntimeStatus: fixtures.runtimeReadyFixture,
      streamRunEvents: fixtures.runEventFixture,
      listRunArtifacts: fixtures.artifactListFixture,
      getArtifactVersion: fixtures.mappedInventoryArtifactFixture,
    } satisfies Record<keyof typeof ANALYZE_API_OPERATIONS, unknown>;
    for (const [id, sample] of Object.entries(samples)) {
      const operation =
        ANALYZE_API_OPERATIONS[id as keyof typeof ANALYZE_API_OPERATIONS];
      expectValid(operation.response, sample);
    }
  });
});
