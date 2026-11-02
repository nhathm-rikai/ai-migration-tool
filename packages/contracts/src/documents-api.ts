import type { TSchema } from 'typebox';
import { EmptyQuerySchema } from './health.schema.js';
import { ProjectParamsSchema } from './project.schema.js';
import { StartRunHeadersSchema } from './run.schema.js';
import {
  CancelDocumentRunSchema,
  CurrentDocumentRunResponseSchema,
  DocumentLogPageSchema,
  DocumentLogQuerySchema,
  PackageFileContentSchema,
  PackageFileParamsSchema,
  DocumentRunParamsSchema,
  DocumentRunSchema,
  StartDocumentRunSchema,
  type DocumentRun,
} from './documents.schema.js';
import type { AnalyzeOperationErrorCode } from './analyze-api.js';

// Operations of document runs (step 3), in the shape of
// ANALYZE_API_OPERATIONS. Routes and the web client read this table.

type DocumentOperation = {
  method: 'GET' | 'POST';
  path: string;
  params: TSchema;
  querystring: TSchema;
  headers?: TSchema;
  body?: TSchema;
  response: TSchema;
  errorCodes: readonly AnalyzeOperationErrorCode[];
};

const BODY_ERRORS = ['PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE'] as const;
const PROJECT_READ_ERRORS = ['INVALID_INPUT', 'PROJECT_NOT_FOUND'] as const;
const RUN_READ_ERRORS = [...PROJECT_READ_ERRORS, 'RUN_NOT_FOUND'] as const;

const RunsPath = '/api/v1/projects/:projectId/document-runs';

export const DOCUMENTS_API_OPERATIONS = {
  startDocumentRun: {
    method: 'POST',
    path: RunsPath,
    params: ProjectParamsSchema,
    querystring: EmptyQuerySchema,
    headers: StartRunHeadersSchema,
    body: StartDocumentRunSchema,
    response: DocumentRunSchema,
    errorCodes: [
      ...PROJECT_READ_ERRORS,
      ...BODY_ERRORS,
      'ANALYSIS_REQUIRED',
      // Demo project with a real agent runner (no source to read).
      'PROJECT_MODE_CONFLICT',
      'RUN_ACTIVE_CONFLICT',
      'IDEMPOTENCY_KEY_CONFLICT',
      'RUNTIME_RECOVERY_REQUIRED',
    ],
  },
  getCurrentDocumentRun: {
    method: 'GET',
    path: `${RunsPath}/current`,
    params: ProjectParamsSchema,
    querystring: EmptyQuerySchema,
    response: CurrentDocumentRunResponseSchema,
    errorCodes: PROJECT_READ_ERRORS,
  },
  getDocumentRun: {
    method: 'GET',
    path: `${RunsPath}/:runId`,
    params: DocumentRunParamsSchema,
    querystring: EmptyQuerySchema,
    response: DocumentRunSchema,
    errorCodes: RUN_READ_ERRORS,
  },
  cancelDocumentRun: {
    method: 'POST',
    path: `${RunsPath}/:runId/cancel`,
    params: DocumentRunParamsSchema,
    querystring: EmptyQuerySchema,
    body: CancelDocumentRunSchema,
    response: DocumentRunSchema,
    errorCodes: [...RUN_READ_ERRORS, ...BODY_ERRORS, 'RUN_STATE_CONFLICT'],
  },
  getDocumentRunLog: {
    method: 'GET',
    path: `${RunsPath}/:runId/log`,
    params: DocumentRunParamsSchema,
    querystring: DocumentLogQuerySchema,
    response: DocumentLogPageSchema,
    errorCodes: RUN_READ_ERRORS,
  },
  getPackageFile: {
    method: 'GET',
    path: `${RunsPath}/:runId/items/:item/files/:file`,
    params: PackageFileParamsSchema,
    querystring: EmptyQuerySchema,
    response: PackageFileContentSchema,
    errorCodes: [...RUN_READ_ERRORS, 'DOCUMENT_NOT_FOUND'],
  },
} as const satisfies Record<string, DocumentOperation>;

export const documentRunLocation = (projectId: string, runId: string) =>
  `/api/v1/projects/${projectId}/document-runs/${runId}`;

export const cancelDocumentRunSuccessStatus = (run: DocumentRun): 200 | 202 =>
  run.status === 'cancelling' ? 202 : 200;
