import type { ApiErrorCode } from '@portal/contracts';

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

export type AppErrorCode = ApiErrorCode;

export class AppError extends Error {
  readonly statusCode: number;

  constructor(readonly code: AppErrorCode) {
    super(ERROR_DEFINITIONS[code].message);
    this.name = 'AppError';
    this.statusCode = ERROR_DEFINITIONS[code].status;
  }
}
