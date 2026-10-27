import {
  ANALYZE_API_ERROR_HTTP_STATUS,
  type AnalyzeApiErrorCode,
  type ApiErrorCode,
} from '@portal/contracts';

const ERROR_DEFINITIONS = {
  INVALID_INPUT: { status: 400, message: 'Invalid request input.' },
  PROJECT_NOT_FOUND: { status: 404, message: 'Project not found.' },
  ROUTE_NOT_FOUND: { status: 404, message: 'Route not found.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body is too large.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Unsupported content type.' },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
  HOST_NOT_ALLOWED: { status: 403, message: 'Request host is not allowed.' },
  ORIGIN_NOT_ALLOWED: {
    status: 403,
    message: 'Request origin is not allowed.',
  },
  CREDENTIAL_INVALID: {
    status: 401,
    message: 'A valid local credential is required.',
  },
} as const satisfies Record<ApiErrorCode, { status: number; message: string }>;

// Analyze codes produced by the source (B03) and run routes (B04), with the
// HTTP status of the contract. Codes of routes that do not exist yet
// (artifacts) join when those routes do.
const S = ANALYZE_API_ERROR_HTTP_STATUS;
const RUN_ERROR_DEFINITIONS = {
  PROJECT_MODE_CONFLICT: {
    status: S.PROJECT_MODE_CONFLICT,
    message: 'A demo project cannot register a local source.',
  },
  SOURCE_NOT_REGISTERED: {
    status: S.SOURCE_NOT_REGISTERED,
    message: 'The project has no registered source.',
  },
  SOURCE_FORBIDDEN: {
    status: S.SOURCE_FORBIDDEN,
    message: 'This folder cannot be registered as a source.',
  },
  SOURCE_UNREADABLE: {
    status: S.SOURCE_UNREADABLE,
    message: 'The source folder does not exist or cannot be read.',
  },
  SOURCE_REVISION_CONFLICT: {
    status: S.SOURCE_REVISION_CONFLICT,
    message: 'The source revision has changed.',
  },
  SOURCE_PROFILE_UNSUPPORTED: {
    status: S.SOURCE_PROFILE_UNSUPPORTED,
    message: 'The source profile is not supported by this build.',
  },
  RUN_NOT_FOUND: { status: S.RUN_NOT_FOUND, message: 'Run not found.' },
  RUN_ACTIVE_CONFLICT: {
    status: S.RUN_ACTIVE_CONFLICT,
    message: 'The project already has an active run.',
  },
  RUN_STATE_CONFLICT: {
    status: S.RUN_STATE_CONFLICT,
    message: 'The run state has changed.',
  },
  IDEMPOTENCY_KEY_CONFLICT: {
    status: S.IDEMPOTENCY_KEY_CONFLICT,
    message: 'The idempotency key was already used for a different request.',
  },
  SNAPSHOT_UNAVAILABLE: {
    status: S.SNAPSHOT_UNAVAILABLE,
    message: 'The run has no source snapshot to reuse.',
  },
  RUNTIME_RECOVERY_REQUIRED: {
    status: S.RUNTIME_RECOVERY_REQUIRED,
    message: 'The runtime needs recovery before it can start runs.',
  },
} as const satisfies Partial<
  Record<AnalyzeApiErrorCode, { status: number; message: string }>
>;

const DEFINITIONS = { ...ERROR_DEFINITIONS, ...RUN_ERROR_DEFINITIONS };

export type RunAppErrorCode = keyof typeof RUN_ERROR_DEFINITIONS;
export type AppErrorCode = ApiErrorCode | RunAppErrorCode;

export class AppError extends Error {
  readonly statusCode: number;

  constructor(readonly code: AppErrorCode) {
    super(DEFINITIONS[code].message);
    this.name = 'AppError';
    this.statusCode = DEFINITIONS[code].status;
  }
}
