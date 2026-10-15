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
