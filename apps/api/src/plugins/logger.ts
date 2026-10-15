import type { FastifyRequest, FastifyServerOptions } from 'fastify';
import type { AppConfig } from '../config.js';
import { getErrorReason } from '../shared/error-diagnostics.js';

export function createLoggerOptions(
  level: AppConfig['logLevel'],
): Exclude<FastifyServerOptions['logger'], boolean | undefined> {
  return {
    level,
    serializers: {
      req: (request: FastifyRequest) => ({
        method: request.method,
        route: request.routeOptions?.url ?? 'unmatched',
      }),
      res: (reply: { statusCode: number }) => ({
        statusCode: reply.statusCode,
      }),
      err: (error: unknown) => ({
        type: 'Error',
        message: 'Error details omitted; use the diagnostic reason.',
        stack: '',
        reason: getErrorReason(error),
      }),
    },
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'token',
      'prompt',
      'source',
      'stdout',
    ],
  };
}
