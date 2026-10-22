import { Type, type Static } from 'typebox';
import { ProjectIdSchema } from './project.schema.js';
import { PROJECT_FIXTURE_ID } from './project-policy.js';
import {
  Nullable,
  PageLimitQuerySchema,
  Strict,
  TimestampSchema,
  VersionLabelSchema,
} from './schema-helpers.js';
import { SOURCE_INVENTORY_SCHEMA_VERSION } from './source-inventory.schema.js';
import {
  FIXTURE_SOURCE_REVISION,
  SourceIdSchema,
  SourceProfileIdSchema,
  SourceRevisionSchema,
  TableNameMappingSchema,
} from './source-registration.schema.js';

// Run contract for the analyze-only checkpoint (C01). Spec:
// docs/engineering/specs/analyze-run-contract.md §3–5. Understand runs and the
// parent link are added by C02; until then only `analyze` is exposed.

export const RUN_PAGE_SIZE_DEFAULT = 20;
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const RUN_EVENT_NAME = 'run';

export const RunIdSchema = Type.String({ format: 'uuid' });
export const SnapshotIdSchema = Type.String({ format: 'uuid' });
export const RunKindSchema = Type.Literal('analyze');

export const RUN_STATUSES = [
  'queued',
  'running',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
] as const;
export const ACTIVE_RUN_STATUSES = ['queued', 'running', 'cancelling'] as const;
export const TERMINAL_RUN_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
] as const;
export const RunStatusSchema = Type.Union([
  Type.Literal('queued'),
  Type.Literal('running'),
  Type.Literal('cancelling'),
  Type.Literal('succeeded'),
  Type.Literal('failed'),
  Type.Literal('cancelled'),
  Type.Literal('interrupted'),
]);

// Coarse stage of an analyze run; shown instead of a made-up percentage.
export const AnalyzeStageSchema = Type.Union([
  Type.Literal('snapshot'),
  Type.Literal('inventory'),
  Type.Literal('publish'),
]);

// Why a run ended `failed`. API request errors use the error envelope instead.
export const RunErrorCodeSchema = Type.Union([
  Type.Literal('SOURCE_UNREADABLE'),
  Type.Literal('SOURCE_FORBIDDEN'),
  Type.Literal('SOURCE_CHANGED'),
  Type.Literal('SOURCE_LIMIT_EXCEEDED'),
  Type.Literal('SOURCE_PROFILE_UNSUPPORTED'),
  Type.Literal('ANALYSIS_OUTPUT_INVALID'),
  Type.Literal('ARTIFACT_WRITE_FAILED'),
  Type.Literal('TIMEOUT'),
  Type.Literal('STOP_UNCONFIRMED'),
  Type.Literal('INTERNAL_ERROR'),
]);

export const RunSourceSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('fixture'),
      fixtureId: Type.Literal(PROJECT_FIXTURE_ID),
      revision: Type.Literal(FIXTURE_SOURCE_REVISION),
    },
    Strict,
  ),
  Type.Object(
    {
      kind: Type.Literal('local'),
      sourceId: SourceIdSchema,
      revision: SourceRevisionSchema,
    },
    Strict,
  ),
]);

const Positive = Type.Integer({ minimum: 1 });

// Everything needed to reproduce the run, locked when the run is queued.
export const AnalyzeRunConfigSchema = Type.Object(
  {
    profileId: SourceProfileIdSchema,
    tableNameMapping: TableNameMappingSchema,
    analyzer: Type.Object(
      {
        inventorySchemaVersion: Type.Literal(SOURCE_INVENTORY_SCHEMA_VERSION),
        metricVersion: VersionLabelSchema,
        decoderVersion: VersionLabelSchema,
        normalizationVersion: VersionLabelSchema,
        sqlAccessVersion: VersionLabelSchema,
        callGraphVersion: VersionLabelSchema,
        complexityVersion: VersionLabelSchema,
        tableNameVersion: VersionLabelSchema,
      },
      Strict,
    ),
    limits: Type.Object(
      {
        maxFiles: Positive,
        maxFileBytes: Positive,
        maxTotalBytes: Positive,
        timeoutMs: Positive,
      },
      Strict,
    ),
  },
  Strict,
);

export const SourceStrategySchema = Type.Union([
  Type.Literal('current-source'),
  Type.Literal('reuse-snapshot'),
]);

const RunBase = {
  id: RunIdSchema,
  projectId: ProjectIdSchema,
  kind: RunKindSchema,
  // +1 on every status transition only; stage changes do not bump it.
  stateVersion: Positive,
  source: RunSourceSchema,
  sourceStrategy: SourceStrategySchema,
  retryOfRunId: Nullable(RunIdSchema),
  // Set from queued for `reuse-snapshot`, during running otherwise.
  sourceSnapshotId: Nullable(SnapshotIdSchema),
  config: AnalyzeRunConfigSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

const NoError = { errorCode: Type.Null() };

export const RunSchema = Type.Union([
  Type.Object(
    {
      ...RunBase,
      ...NoError,
      status: Type.Literal('queued'),
      stage: Type.Null(),
      startedAt: Type.Null(),
      finishedAt: Type.Null(),
    },
    Strict,
  ),
  Type.Object(
    {
      ...RunBase,
      ...NoError,
      status: Type.Literal('running'),
      stage: AnalyzeStageSchema,
      startedAt: TimestampSchema,
      finishedAt: Type.Null(),
    },
    Strict,
  ),
  Type.Object(
    {
      ...RunBase,
      ...NoError,
      status: Type.Literal('cancelling'),
      stage: Nullable(AnalyzeStageSchema),
      startedAt: TimestampSchema,
      finishedAt: Type.Null(),
    },
    Strict,
  ),
  Type.Object(
    {
      ...RunBase,
      ...NoError,
      status: Type.Literal('succeeded'),
      sourceSnapshotId: SnapshotIdSchema,
      stage: Type.Null(),
      startedAt: TimestampSchema,
      finishedAt: TimestampSchema,
    },
    Strict,
  ),
  Type.Object(
    {
      ...RunBase,
      status: Type.Literal('failed'),
      errorCode: RunErrorCodeSchema,
      // Last stage reached before the failure.
      stage: Nullable(AnalyzeStageSchema),
      startedAt: TimestampSchema,
      finishedAt: TimestampSchema,
    },
    Strict,
  ),
  Type.Object(
    {
      ...RunBase,
      ...NoError,
      status: Type.Literal('cancelled'),
      stage: Type.Null(),
      // null when cancelled while still queued.
      startedAt: Nullable(TimestampSchema),
      finishedAt: TimestampSchema,
    },
    Strict,
  ),
  Type.Object(
    {
      ...RunBase,
      ...NoError,
      status: Type.Literal('interrupted'),
      stage: Nullable(AnalyzeStageSchema),
      startedAt: TimestampSchema,
      // Time the startup recovery marked the run.
      finishedAt: TimestampSchema,
    },
    Strict,
  ),
]);

export const RunParamsSchema = Type.Object(
  { projectId: ProjectIdSchema, runId: RunIdSchema },
  Strict,
);

// Header names arrive lower-cased; other headers are allowed.
export const StartRunHeadersSchema = Type.Object({
  [IDEMPOTENCY_KEY_HEADER]: Type.String({ pattern: '^[A-Za-z0-9_-]{16,128}$' }),
});

const CurrentSourceSelection = Type.Object(
  {
    strategy: Type.Literal('current-source'),
    expectedSourceRevision: SourceRevisionSchema,
  },
  Strict,
);
const ReuseSnapshotSelection = Type.Object(
  { strategy: Type.Literal('reuse-snapshot') },
  Strict,
);

// A new run reads the registered source; a retry may instead reuse the
// snapshot of the run it retries. Retry is always a new run.
export const StartRunSchema = Type.Union([
  Type.Object(
    {
      kind: RunKindSchema,
      source: CurrentSourceSelection,
      retryOfRunId: Type.Null(),
    },
    Strict,
  ),
  Type.Object(
    {
      kind: RunKindSchema,
      source: Type.Union([CurrentSourceSelection, ReuseSnapshotSelection]),
      retryOfRunId: RunIdSchema,
    },
    Strict,
  ),
]);

// Newest first (createdAt, then id). The cursor is opaque to callers.
export const RunCursorSchema = Type.String({
  pattern: '^[A-Za-z0-9_-]{1,200}$',
});
export const ListRunsQuerySchema = Type.Object(
  {
    limit: Type.Optional(PageLimitQuerySchema(RUN_PAGE_SIZE_DEFAULT)),
    cursor: Type.Optional(RunCursorSchema),
  },
  Strict,
);
export const RunListSchema = Type.Object(
  { items: Type.Array(RunSchema), nextCursor: Nullable(RunCursorSchema) },
  Strict,
);

// The active run of the project, else its newest run, else null.
export const CurrentRunResponseSchema = Type.Object(
  { run: Nullable(RunSchema) },
  Strict,
);

export const CancelRunSchema = Type.Object(
  { expectedStateVersion: Positive },
  Strict,
);

export const RuntimeStatusSchema = Type.Union([
  Type.Object(
    { status: Type.Literal('ready'), reasonCode: Type.Null() },
    Strict,
  ),
  Type.Object(
    {
      status: Type.Literal('recovery_required'),
      reasonCode: Type.Literal('PROCESS_CLEANUP_UNCONFIRMED'),
    },
    Strict,
  ),
]);

// `data` of an SSE `run` event. A hint only: GET run stays authoritative.
export const RunEventSchema = Type.Object(
  {
    runId: RunIdSchema,
    sequence: Positive,
    stateVersion: Positive,
    status: RunStatusSchema,
    stage: Nullable(AnalyzeStageSchema),
    occurredAt: TimestampSchema,
  },
  Strict,
);

export type RunStatus = Static<typeof RunStatusSchema>;
export type ActiveRunStatus = (typeof ACTIVE_RUN_STATUSES)[number];
export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];
export type AnalyzeStage = Static<typeof AnalyzeStageSchema>;
export type RunErrorCode = Static<typeof RunErrorCodeSchema>;
export type AnalyzeRunConfig = Static<typeof AnalyzeRunConfigSchema>;
export type Run = Static<typeof RunSchema>;
export type StartRunInput = Static<typeof StartRunSchema>;
export type ListRunsQuery = Static<typeof ListRunsQuerySchema>;
export type RunList = Static<typeof RunListSchema>;
export type CurrentRunResponse = Static<typeof CurrentRunResponseSchema>;
export type CancelRunInput = Static<typeof CancelRunSchema>;
export type RuntimeStatus = Static<typeof RuntimeStatusSchema>;
export type RunEvent = Static<typeof RunEventSchema>;
