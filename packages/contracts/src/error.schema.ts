import { Type, type Static } from 'typebox';

// Known producer codes. The envelope accepts new codes so older clients can fall back safely.
export const ApiErrorCodeSchema = Type.Union([
  Type.Literal('INVALID_INPUT'),
  Type.Literal('PROJECT_NOT_FOUND'),
  Type.Literal('ROUTE_NOT_FOUND'),
  Type.Literal('PAYLOAD_TOO_LARGE'),
  Type.Literal('UNSUPPORTED_MEDIA_TYPE'),
  Type.Literal('INTERNAL_ERROR'),
]);
export type ApiErrorCode = Static<typeof ApiErrorCodeSchema>;

// Codes of the source/run/artifact API (C01), kept apart from the Projects
// catalog until the routes and UI messages that produce them exist.
export const AnalyzeApiErrorCodeSchema = Type.Union([
  Type.Literal('PROJECT_MODE_CONFLICT'),
  Type.Literal('SOURCE_NOT_REGISTERED'),
  Type.Literal('SOURCE_REVISION_CONFLICT'),
  Type.Literal('SOURCE_FORBIDDEN'),
  Type.Literal('SOURCE_UNREADABLE'),
  Type.Literal('SOURCE_PROFILE_UNSUPPORTED'),
  Type.Literal('RUN_NOT_FOUND'),
  Type.Literal('RUN_ACTIVE_CONFLICT'),
  Type.Literal('RUN_STATE_CONFLICT'),
  Type.Literal('IDEMPOTENCY_KEY_CONFLICT'),
  Type.Literal('SNAPSHOT_UNAVAILABLE'),
  Type.Literal('ARTIFACT_NOT_FOUND'),
  Type.Literal('RUNTIME_RECOVERY_REQUIRED'),
]);
export type AnalyzeApiErrorCode = Static<typeof AnalyzeApiErrorCodeSchema>;
// HTTP status of each code; the BE error catalog reuses it.
export const ANALYZE_API_ERROR_HTTP_STATUS = {
  PROJECT_MODE_CONFLICT: 409,
  SOURCE_NOT_REGISTERED: 409,
  SOURCE_REVISION_CONFLICT: 409,
  SOURCE_FORBIDDEN: 422,
  SOURCE_UNREADABLE: 422,
  SOURCE_PROFILE_UNSUPPORTED: 422,
  RUN_NOT_FOUND: 404,
  RUN_ACTIVE_CONFLICT: 409,
  RUN_STATE_CONFLICT: 409,
  IDEMPOTENCY_KEY_CONFLICT: 409,
  SNAPSHOT_UNAVAILABLE: 409,
  ARTIFACT_NOT_FOUND: 404,
  RUNTIME_RECOVERY_REQUIRED: 503,
} as const satisfies Record<AnalyzeApiErrorCode, number>;

export const ErrorResponseSchema = Type.Object(
  {
    error: Type.Object(
      { code: Type.String(), message: Type.String(), requestId: Type.String() },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ErrorResponse = Static<typeof ErrorResponseSchema>;
