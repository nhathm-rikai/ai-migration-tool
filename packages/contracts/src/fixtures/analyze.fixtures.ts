import type {
  ArtifactList,
  SourceInventoryArtifact,
} from '../artifact.schema.js';
import type { ErrorResponse } from '../error.schema.js';
import type {
  AnalyzeRunConfig,
  CurrentRunResponse,
  Run,
  RunEvent,
  RunList,
  RuntimeStatus,
  StartRunInput,
} from '../run.schema.js';
import type { SourceInventoryDocument } from '../source-inventory.schema.js';
import type {
  ProjectSourceResponse,
  PutProjectSourceInput,
} from '../source-registration.schema.js';

// Clean, hand-written payloads of the C01 contract for API and UI tests. They
// describe an invented order module, not customer source. Every value must
// stay valid against its schema (checked by contracts tests).

export const FIXTURE_IDS = {
  project: '3f2b8c1e-5a4d-4e7f-9b6a-1c2d3e4f5a6b',
  otherProject: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  source: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  snapshot: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
  artifact: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  partialArtifact: 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c',
  runs: {
    queued: '0a1b2c3d-0001-4000-8000-000000000001',
    running: '0a1b2c3d-0002-4000-8000-000000000002',
    cancelling: '0a1b2c3d-0003-4000-8000-000000000003',
    succeeded: '0a1b2c3d-0004-4000-8000-000000000004',
    failed: '0a1b2c3d-0005-4000-8000-000000000005',
    cancelled: '0a1b2c3d-0006-4000-8000-000000000006',
    interrupted: '0a1b2c3d-0007-4000-8000-000000000007',
    retry: '0a1b2c3d-0008-4000-8000-000000000008',
  },
} as const;

const SNAPSHOT_HASH =
  '5f1e3c9a7b2d4e6f8a0c1b3d5e7f9a2c4b6d8e0f1a3c5e7b9d2f4a6c8e0b1d3f';

// ---- Source registration -------------------------------------------------

export const putProjectSourceFixture = {
  rootPath: 'C:\\work\\order-module',
  profileId: 'vb6-cp932-v1',
  tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
  expectedSourceRevision: null,
} as const satisfies PutProjectSourceInput;

export const localSourceResponseFixture = {
  source: {
    kind: 'local',
    sourceId: FIXTURE_IDS.source,
    displayName: 'order-module',
    profileId: 'vb6-cp932-v1',
    revision: 1,
    tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
    status: 'ready',
    registeredAt: '2026-10-22T01:00:00.000Z',
    updatedAt: '2026-10-22T01:00:00.000Z',
    checkedAt: '2026-10-22T01:00:00.000Z',
  },
} as const satisfies ProjectSourceResponse;

export const fixtureSourceResponseFixture = {
  source: {
    kind: 'fixture',
    fixtureId: 'sample-vb6',
    displayName: 'sample-vb6',
    profileId: 'vb6-cp932-v1',
    revision: 1,
    tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
    status: 'ready',
  },
} as const satisfies ProjectSourceResponse;

export const unregisteredSourceResponseFixture = {
  source: null,
} as const satisfies ProjectSourceResponse;

// ---- Runs ------------------------------------------------------------------

export const startRunFixture = {
  kind: 'analyze',
  source: { strategy: 'current-source', expectedSourceRevision: 1 },
  retryOfRunId: null,
} as const satisfies StartRunInput;

export const retryWithSnapshotFixture = {
  kind: 'analyze',
  source: { strategy: 'reuse-snapshot' },
  retryOfRunId: FIXTURE_IDS.runs.failed,
} as const satisfies StartRunInput;

export const retryWithNewSourceFixture = {
  kind: 'analyze',
  source: { strategy: 'current-source', expectedSourceRevision: 2 },
  retryOfRunId: FIXTURE_IDS.runs.failed,
} as const satisfies StartRunInput;

export const runConfigFixture = {
  profileId: 'vb6-cp932-v1',
  tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
  analyzer: {
    inventorySchemaVersion: 'source-inventory-v1',
    metricVersion: 'vb6-physical-code-v1',
    decoderVersion: 'whatwg-textdecoder-v1',
    normalizationVersion: 'newline-lf-v1',
    sqlAccessVersion: 'sql-access-v4',
    callGraphVersion: 'call-graph-v2',
    complexityVersion: 'complexity-v0-draft',
    tableNameVersion: 'table-name-v1',
  },
  // Placeholder numbers for fixtures only; real limits come from the spike.
  limits: {
    maxFiles: 5000,
    maxFileBytes: 4194304,
    maxTotalBytes: 268435456,
    timeoutMs: 600000,
  },
} as const satisfies AnalyzeRunConfig;

const runBase = {
  projectId: FIXTURE_IDS.project,
  kind: 'analyze',
  source: { kind: 'local', sourceId: FIXTURE_IDS.source, revision: 1 },
  sourceStrategy: 'current-source',
  retryOfRunId: null,
  config: runConfigFixture,
  createdAt: '2026-10-22T02:00:00.000Z',
} as const;

export const queuedRunFixture = {
  ...runBase,
  id: FIXTURE_IDS.runs.queued,
  status: 'queued',
  stateVersion: 1,
  stage: null,
  sourceSnapshotId: null,
  errorCode: null,
  startedAt: null,
  finishedAt: null,
  updatedAt: '2026-10-22T02:00:00.000Z',
} as const satisfies Run;

export const runningRunFixture = {
  ...runBase,
  id: FIXTURE_IDS.runs.running,
  status: 'running',
  stateVersion: 2,
  stage: 'inventory',
  sourceSnapshotId: FIXTURE_IDS.snapshot,
  errorCode: null,
  startedAt: '2026-10-22T02:00:01.000Z',
  finishedAt: null,
  updatedAt: '2026-10-22T02:00:05.000Z',
} as const satisfies Run;

export const cancellingRunFixture = {
  ...runBase,
  id: FIXTURE_IDS.runs.cancelling,
  status: 'cancelling',
  stateVersion: 3,
  stage: 'snapshot',
  sourceSnapshotId: null,
  errorCode: null,
  startedAt: '2026-10-22T02:00:01.000Z',
  finishedAt: null,
  updatedAt: '2026-10-22T02:00:03.000Z',
} as const satisfies Run;

export const succeededRunFixture = {
  ...runBase,
  id: FIXTURE_IDS.runs.succeeded,
  status: 'succeeded',
  stateVersion: 3,
  stage: null,
  sourceSnapshotId: FIXTURE_IDS.snapshot,
  errorCode: null,
  startedAt: '2026-10-22T02:00:01.000Z',
  finishedAt: '2026-10-22T02:00:09.000Z',
  updatedAt: '2026-10-22T02:00:09.000Z',
} as const satisfies Run;

export const failedRunFixture = {
  ...runBase,
  id: FIXTURE_IDS.runs.failed,
  status: 'failed',
  stateVersion: 3,
  stage: 'snapshot',
  sourceSnapshotId: null,
  errorCode: 'SOURCE_CHANGED',
  startedAt: '2026-10-22T02:00:01.000Z',
  finishedAt: '2026-10-22T02:00:04.000Z',
  updatedAt: '2026-10-22T02:00:04.000Z',
} as const satisfies Run;

export const cancelledRunFixture = {
  ...runBase,
  id: FIXTURE_IDS.runs.cancelled,
  status: 'cancelled',
  stateVersion: 2,
  stage: null,
  sourceSnapshotId: null,
  errorCode: null,
  startedAt: null,
  finishedAt: '2026-10-22T02:00:02.000Z',
  updatedAt: '2026-10-22T02:00:02.000Z',
} as const satisfies Run;

export const interruptedRunFixture = {
  ...runBase,
  id: FIXTURE_IDS.runs.interrupted,
  status: 'interrupted',
  stateVersion: 3,
  stage: 'inventory',
  sourceSnapshotId: FIXTURE_IDS.snapshot,
  errorCode: null,
  startedAt: '2026-10-22T02:00:01.000Z',
  finishedAt: '2026-10-22T03:10:00.000Z',
  updatedAt: '2026-10-22T03:10:00.000Z',
} as const satisfies Run;

// Retry of the failed run on a new snapshot of source revision 2.
export const retryRunFixture = {
  ...runBase,
  id: FIXTURE_IDS.runs.retry,
  source: { kind: 'local', sourceId: FIXTURE_IDS.source, revision: 2 },
  retryOfRunId: FIXTURE_IDS.runs.failed,
  status: 'queued',
  stateVersion: 1,
  stage: null,
  sourceSnapshotId: null,
  errorCode: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-10-22T02:05:00.000Z',
  updatedAt: '2026-10-22T02:05:00.000Z',
} as const satisfies Run;

// A demo project analyzes the bundled fixture; the config has no mapping.
export const demoQueuedRunFixture = {
  ...queuedRunFixture,
  source: { kind: 'fixture', fixtureId: 'sample-vb6', revision: 1 },
  config: {
    ...runConfigFixture,
    tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
  },
} as const satisfies Run;

export const RUN_FIXTURES_BY_STATUS = {
  queued: queuedRunFixture,
  running: runningRunFixture,
  cancelling: cancellingRunFixture,
  succeeded: succeededRunFixture,
  failed: failedRunFixture,
  cancelled: cancelledRunFixture,
  interrupted: interruptedRunFixture,
} as const satisfies Record<Run['status'], Run>;

export const runListFixture = {
  items: [retryRunFixture, succeededRunFixture, failedRunFixture],
  nextCursor: 'MjAyNi0xMC0yMlQwMjowMDowMC4wMDBa',
} as const satisfies RunList;

export const currentRunFixture = {
  run: runningRunFixture,
} as const satisfies CurrentRunResponse;

export const noCurrentRunFixture = {
  run: null,
} as const satisfies CurrentRunResponse;

export const runEventFixture = {
  runId: FIXTURE_IDS.runs.running,
  sequence: 4,
  stateVersion: 2,
  status: 'running',
  stage: 'inventory',
  occurredAt: '2026-10-22T02:00:05.000Z',
} as const satisfies RunEvent;

export const runtimeReadyFixture = {
  status: 'ready',
  reasonCode: null,
} as const satisfies RuntimeStatus;

export const runtimeRecoveryRequiredFixture = {
  status: 'recovery_required',
  reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED',
} as const satisfies RuntimeStatus;

// ---- Inventory payloads ------------------------------------------------------

type InventoryFile = SourceInventoryDocument['files'][number];
type InventoryProgram = SourceInventoryDocument['programs'][number];
type ProgramAnalysis = NonNullable<InventoryProgram['analysis']>;

const counters = (code: number, blank: number, metadata: number) => ({
  physicalLines: code + blank + metadata,
  designerLines: 0,
  metadataLines: metadata,
  blankLines: blank,
  commentOnlyLines: 0,
  codeLines: code,
  unclassifiedLines: 0,
});

const inventoryHeader = {
  schemaVersion: 'source-inventory-v1',
  profileId: 'vb6-cp932-v1',
  languageId: 'vb6',
  metricVersion: 'vb6-physical-code-v1',
  decoderVersion: 'whatwg-textdecoder-v1',
  normalizationVersion: 'newline-lf-v1',
  sqlAccessVersion: 'sql-access-v4',
  callGraphVersion: 'call-graph-v2',
  complexityVersion: 'complexity-v0-draft',
  snapshotHash: SNAPSHOT_HASH,
} as const;

const projectFile: InventoryFile = {
  manifest: {
    relativePath: 'programs/Order/Order.vbp',
    role: 'project',
    byteLength: 120,
    rawSha256:
      '1111111111111111111111111111111111111111111111111111111111111111',
    kind: 'text',
    encoding: 'cp932',
    encodingSource: 'profile',
    normalizedSha256:
      '2222222222222222222222222222222222222222222222222222222222222222',
    lineCount: 4,
    newlineStyle: 'crlf',
  },
  analysis: null,
};

const PROCEDURE_ID = 'cmn/OrderRules.bas#Function:LoadOrders';

const codeFile: InventoryFile = {
  manifest: {
    relativePath: 'cmn/OrderRules.bas',
    role: 'code',
    byteLength: 310,
    rawSha256:
      '3333333333333333333333333333333333333333333333333333333333333333',
    kind: 'text',
    encoding: 'cp932',
    encodingSource: 'profile',
    normalizedSha256:
      '4444444444444444444444444444444444444444444444444444444444444444',
    lineCount: 9,
    newlineStyle: 'crlf',
  },
  analysis: {
    status: 'analyzed',
    counters: counters(6, 1, 2),
    procedures: [
      {
        id: PROCEDURE_ID,
        kind: 'Function',
        name: 'LoadOrders',
        visibility: 'public',
        startLine: 4,
        endLine: 9,
        codeLines: 5,
        decisionPoints: 1,
      },
    ],
    fileLevelCodeLines: 1,
    sqlTables: [
      {
        table: 'APP.ORDERS',
        operation: 'R',
        line: 6,
        procedureId: PROCEDURE_ID,
      },
      { table: 'ORDERS', operation: 'U', line: 8, procedureId: PROCEDURE_ID },
    ],
    dynamicSql: [],
    externalDeclarations: [],
    labels: [],
  },
};

const complexity: ProgramAnalysis['complexity'] = {
  version: 'complexity-v0-draft',
  score: 12,
  level: 'low',
  parts: {
    size: 4.2,
    decisions: 2.1,
    tables: 3.5,
    dynamicSql: 0,
    components: 0,
    externalApis: 0,
  },
};

const program: Omit<InventoryProgram, 'analysis'> = {
  projectPath: 'programs/Order/Order.vbp',
  status: 'parsed',
  issue: null,
  name: 'Order',
  members: [
    {
      kind: 'Module',
      name: 'OrderRules',
      declaredPath: '..\\..\\cmn\\OrderRules.bas',
      relativePath: 'cmn/OrderRules.bas',
      resolution: 'resolved',
      fileStatus: 'analyzed',
      shared: false,
    },
  ],
  externalReferences: [],
  counters: counters(6, 1, 2),
  complete: true,
};

const programAnalysis: ProgramAnalysis = {
  calls: [],
  crud: [
    {
      table: 'APP.ORDERS',
      operations: ['R'],
      evidence: { relativePath: 'cmn/OrderRules.bas', line: 6 },
      viaSharedOnly: false,
    },
    {
      table: 'ORDERS',
      operations: ['U'],
      evidence: { relativePath: 'cmn/OrderRules.bas', line: 8 },
      viaSharedOnly: false,
    },
  ],
  externalApis: [],
  metrics: {
    ownFiles: 1,
    ownCodeLines: 6,
    ownProcedures: 1,
    decisionPoints: 1,
    maxProcedureDecisionPoints: 1,
    reachableSharedProcedures: 0,
    tables: 2,
    dynamicSql: 0,
    components: 0,
    externalApis: 0,
  },
  complexity,
};

const totals: SourceInventoryDocument['totals'] = {
  files: 2,
  codeFiles: 1,
  analyzedCodeFiles: 1,
  unsupportedFiles: 0,
  errorFiles: 0,
  uniqueCounters: counters(6, 1, 2),
};

// Complete inventory with the table name mapping (raw + mapped view).
export const mappedInventoryFixture = {
  ...inventoryHeader,
  tableNames: {
    version: 'table-name-v1',
    defaultSchema: 'APP',
    status: 'assumed',
  },
  files: [projectFile, codeFile],
  programs: [
    {
      ...program,
      analysis: {
        ...programAnalysis,
        normalizedCrud: [
          {
            table: 'ORDERS',
            operations: ['R', 'U'],
            evidence: { relativePath: 'cmn/OrderRules.bas', line: 6 },
            viaSharedOnly: false,
            names: ['APP.ORDERS', 'ORDERS'],
          },
        ],
        metrics: { ...programAnalysis.metrics, normalizedTables: 1 },
        normalizedComplexity: { ...complexity, score: 10 },
      },
    },
  ],
  totals,
} as const satisfies SourceInventoryDocument;

// Complete inventory written before table name mapping existed: no
// `tableNames`, `normalizedCrud`, `normalizedTables`, `normalizedComplexity`.
export const unmappedInventoryFixture = {
  ...inventoryHeader,
  files: [projectFile, codeFile],
  programs: [{ ...program, analysis: programAnalysis }],
  totals,
} as const satisfies SourceInventoryDocument;

// Partial inventory: decode error, unsupported code, binary resource, a
// missing project member and skipped files. Every warning must survive.
export const partialInventoryFixture = {
  ...inventoryHeader,
  files: [
    projectFile,
    codeFile,
    {
      manifest: {
        relativePath: 'programs/Order/frmOrder.frm',
        role: 'code',
        byteLength: 2048,
        rawSha256:
          '5555555555555555555555555555555555555555555555555555555555555555',
        kind: 'error',
        errorCode: 'DECODE_FAILED',
        attemptedEncoding: 'cp932',
      },
      analysis: null,
    },
    {
      manifest: {
        relativePath: 'programs/Order/Legacy.cls',
        role: 'code',
        byteLength: 512,
        rawSha256:
          '6666666666666666666666666666666666666666666666666666666666666666',
        kind: 'text',
        encoding: 'ascii',
        encodingSource: 'ascii',
        normalizedSha256:
          '7777777777777777777777777777777777777777777777777777777777777777',
        lineCount: 20,
        newlineStyle: 'mixed',
      },
      analysis: {
        status: 'unsupported',
        reason: 'UNBALANCED_BLOCK',
        line: 12,
      },
    },
    {
      manifest: {
        relativePath: 'programs/Order/frmOrder.frx',
        role: 'resource',
        byteLength: 4096,
        rawSha256:
          '8888888888888888888888888888888888888888888888888888888888888888',
        kind: 'binary',
      },
      analysis: null,
    },
  ],
  programs: [
    {
      ...program,
      members: [
        ...program.members,
        {
          kind: 'Form',
          name: null,
          declaredPath: 'frmOrderEdit.frm',
          relativePath: null,
          resolution: 'missing',
          fileStatus: null,
          shared: false,
        },
      ],
      complete: false,
      analysis: programAnalysis,
    },
  ],
  totals: {
    files: 5,
    codeFiles: 3,
    analyzedCodeFiles: 1,
    unsupportedFiles: 1,
    errorFiles: 1,
    uniqueCounters: counters(6, 1, 2),
  },
  skipped: [
    { relativePath: 'tools/link-to-shared', reason: 'symlink' },
    { relativePath: 'data/huge-dump.bas', reason: 'too-large' },
  ],
} as const satisfies SourceInventoryDocument;

// ---- Artifacts -------------------------------------------------------------

const artifactRef = {
  id: FIXTURE_IDS.artifact,
  version: 1,
  kind: 'source-inventory',
  schemaVersion: 'source-inventory-v1',
  projectId: FIXTURE_IDS.project,
  runId: FIXTURE_IDS.runs.succeeded,
  sourceSnapshotId: FIXTURE_IDS.snapshot,
  sourceSnapshotHash: SNAPSHOT_HASH,
  mode: 'local',
  sha256: '9999999999999999999999999999999999999999999999999999999999999999',
  byteLength: 4210,
  createdAt: '2026-10-22T02:00:08.000Z',
} as const;

export const artifactListFixture = {
  items: [artifactRef],
} as const satisfies ArtifactList;

export const emptyArtifactListFixture = {
  items: [],
} as const satisfies ArtifactList;

export const mappedInventoryArtifactFixture = {
  ...artifactRef,
  payload: mappedInventoryFixture,
} as const satisfies SourceInventoryArtifact;

export const unmappedInventoryArtifactFixture = {
  ...artifactRef,
  payload: unmappedInventoryFixture,
} as const satisfies SourceInventoryArtifact;

export const partialInventoryArtifactFixture = {
  ...artifactRef,
  id: FIXTURE_IDS.partialArtifact,
  payload: partialInventoryFixture,
} as const satisfies SourceInventoryArtifact;

// ---- Errors ------------------------------------------------------------------

export const errorResponseFixture = (code: string): ErrorResponse => ({
  error: {
    code,
    message: 'Fixture error.',
    requestId: 'req-fixture-1',
  },
});
