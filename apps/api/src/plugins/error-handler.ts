import type { FastifyInstance } from 'fastify';
import { AppError } from '../shared/app-error.js';
import { getErrorReason } from '../shared/error-diagnostics.js';

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (!(error instanceof Error)) return new AppError('INTERNAL_ERROR');
  const code = 'code' in error ? error.code : undefined;
  switch (code) {
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return new AppError('PAYLOAD_TOO_LARGE');
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return new AppError('UNSUPPORTED_MEDIA_TYPE');
    case 'FST_ERR_VALIDATION':
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
      return new AppError('INVALID_INPUT');
    default:
      // An arbitrary dependency's statusCode is not a public business error.
      return new AppError('INTERNAL_ERROR');
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const failure = toAppError(error);
    if (failure.statusCode >= 500) {
      // Never log error.message/stack: driver/adapter errors can contain paths or source.
      request.log.error(
        {
          code: failure.code,
          reason: getErrorReason(error),
          requestId: request.id,
          route: request.routeOptions.url ?? 'unmatched',
        },
        'Request failed',
      );
    }
    return reply.status(failure.statusCode).send({
      error: {
        code: failure.code,
        message: failure.message,
        requestId: request.id,
      },
    });
  });
  app.setNotFoundHandler(() => {
    throw new AppError('ROUTE_NOT_FOUND');
  });
}
