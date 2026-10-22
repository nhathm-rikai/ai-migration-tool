import type { TSchema } from 'typebox';
import {
  ArtifactEnvelopeSchema,
  ArtifactListSchema,
  ArtifactVersionParamsSchema,
} from './artifact.schema.js';
import type { AnalyzeApiErrorCode, ApiErrorCode } from './error.schema.js';
import { EmptyQuerySchema } from './health.schema.js';
import { ProjectParamsSchema } from './project.schema.js';
import {
  CancelRunSchema,
  CurrentRunResponseSchema,
  ListRunsQuerySchema,
  RunEventSchema,
  RunListSchema,
  RunParamsSchema,
  RunSchema,
  RuntimeStatusSchema,
  type Run,
  StartRunHeadersSchema,
  StartRunSchema,
} from './run.schema.js';
import {
  ProjectSourceResponseSchema,
  PutProjectSourceSchema,
} from './source-registration.schema.js';

// One table of the source/run/artifact operations (API 2–7 of C01): route,
// request/response schemas, success status and every public error code the
// operation may answer. Routes, API clients and message catalogs read it
// instead of copying DTOs. Spec: docs/engineering/specs/analyze-run-contract.md.

export type AnalyzeOperationErrorCode = ApiErrorCode | AnalyzeApiErrorCode;

type Operation = {
  method: 'GET' | 'PUT' | 'POST';
  path: string;
  // Every 2xx the operation answers; see cancelRunSuccessStatus.
  successStatuses: readonly (200 | 202)[];
  params?: TSchema;
  querystring?: TSchema;
  headers?: TSchema;
  body?: TSchema;
  // JSON response; for SSE the schema of each event's `data`.
  response: TSchema;
  contentType: 'application/json' | 'text/event-stream';
  errorCodes: readonly AnalyzeOperationErrorCode[];
};

// Framework-level codes any JSON body route may answer.
const BODY_ERRORS = ['PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE'] as const;
const PROJECT_READ_ERRORS = ['INVALID_INPUT', 'PROJECT_NOT_FOUND'] as const;
const RUN_READ_ERRORS = [...PROJECT_READ_ERRORS, 'RUN_NOT_FOUND'] as const;

const ProjectsPath = '/api/v1/projects/:projectId';

export const ANALYZE_API_OPERATIONS = {
  getProjectSource: {
    method: 'GET',
    path: `${ProjectsPath}/source`,
    successStatuses: [200],
    params: ProjectParamsSchema,
    querystring: EmptyQuerySchema,
    response: ProjectSourceResponseSchema,
    contentType: 'application/json',
    errorCodes: PROJECT_READ_ERRORS,
  },
  putProjectSource: {
    method: 'PUT',
    path: `${ProjectsPath}/source`,
    successStatuses: [200],
    params: ProjectParamsSchema,
    querystring: EmptyQuerySchema,
    body: PutProjectSourceSchema,
    response: ProjectSourceResponseSchema,
    contentType: 'application/json',
    errorCodes: [
      ...PROJECT_READ_ERRORS,
      ...BODY_ERRORS,
      'PROJECT_MODE_CONFLICT',
      'SOURCE_REVISION_CONFLICT',
      'SOURCE_FORBIDDEN',
      'SOURCE_UNREADABLE',
      'SOURCE_PROFILE_UNSUPPORTED',
    ],
  },
  startRun: {
    method: 'POST',
    path: `${ProjectsPath}/runs`,
    successStatuses: [202],
    params: ProjectParamsSchema,
    querystring: EmptyQuerySchema,
    headers: StartRunHeadersSchema,
    body: StartRunSchema,
    response: RunSchema,
    contentType: 'application/json',
    errorCodes: [
      ...PROJECT_READ_ERRORS,
      ...BODY_ERRORS,
      'SOURCE_NOT_REGISTERED',
      'SOURCE_REVISION_CONFLICT',
      'SOURCE_PROFILE_UNSUPPORTED',
      'RUN_NOT_FOUND',
      'SNAPSHOT_UNAVAILABLE',
      'RUN_ACTIVE_CONFLICT',
      'IDEMPOTENCY_KEY_CONFLICT',
      'RUNTIME_RECOVERY_REQUIRED',
    ],
  },
  listRuns: {
    method: 'GET',
    path: `${ProjectsPath}/runs`,
    successStatuses: [200],
    params: ProjectParamsSchema,
    querystring: ListRunsQuerySchema,
    response: RunListSchema,
    contentType: 'application/json',
    errorCodes: PROJECT_READ_ERRORS,
  },
  getCurrentRun: {
    method: 'GET',
    path: `${ProjectsPath}/runs/current`,
    successStatuses: [200],
    params: ProjectParamsSchema,
    querystring: EmptyQuerySchema,
    response: CurrentRunResponseSchema,
    contentType: 'application/json',
    errorCodes: PROJECT_READ_ERRORS,
  },
  getRun: {
    method: 'GET',
    path: `${ProjectsPath}/runs/:runId`,
    successStatuses: [200],
    params: RunParamsSchema,
    querystring: EmptyQuerySchema,
    response: RunSchema,
    contentType: 'application/json',
    errorCodes: RUN_READ_ERRORS,
  },
  cancelRun: {
    method: 'POST',
    path: `${ProjectsPath}/runs/:runId/cancel`,
    // 202 while cancelling, 200 once cancelled.
    successStatuses: [202, 200],
    params: RunParamsSchema,
    querystring: EmptyQuerySchema,
    body: CancelRunSchema,
    response: RunSchema,
    contentType: 'application/json',
    errorCodes: [...RUN_READ_ERRORS, ...BODY_ERRORS, 'RUN_STATE_CONFLICT'],
  },
  getRuntimeStatus: {
    method: 'GET',
    path: '/api/v1/runtime/status',
    successStatuses: [200],
    querystring: EmptyQuerySchema,
    response: RuntimeStatusSchema,
    contentType: 'application/json',
    errorCodes: ['INVALID_INPUT'],
  },
  streamRunEvents: {
    method: 'GET',
    path: `${ProjectsPath}/runs/:runId/events`,
    successStatuses: [200],
    params: RunParamsSchema,
    querystring: EmptyQuerySchema,
    response: RunEventSchema,
    contentType: 'text/event-stream',
    errorCodes: RUN_READ_ERRORS,
  },
  listRunArtifacts: {
    method: 'GET',
    path: `${ProjectsPath}/runs/:runId/artifacts`,
    successStatuses: [200],
    params: RunParamsSchema,
    querystring: EmptyQuerySchema,
    response: ArtifactListSchema,
    contentType: 'application/json',
    errorCodes: RUN_READ_ERRORS,
  },
  getArtifactVersion: {
    method: 'GET',
    path: `${ProjectsPath}/artifacts/:artifactId/versions/:version`,
    successStatuses: [200],
    params: ArtifactVersionParamsSchema,
    querystring: EmptyQuerySchema,
    response: ArtifactEnvelopeSchema,
    contentType: 'application/json',
    errorCodes: [...PROJECT_READ_ERRORS, 'ARTIFACT_NOT_FOUND'],
  },
} as const satisfies Record<string, Operation>;

export type AnalyzeOperationId = keyof typeof ANALYZE_API_OPERATIONS;

// `Location` header of startRun: the run detail path.
export const runLocation = (projectId: string, runId: string) =>
  `/api/v1/projects/${projectId}/runs/${runId}`;

// cancelRun answers 202 while the stop is still in progress (`cancelling`)
// and 200 once the run is `cancelled`.
export const cancelRunSuccessStatus = (run: Run): 200 | 202 =>
  run.status === 'cancelling' ? 202 : 200;
