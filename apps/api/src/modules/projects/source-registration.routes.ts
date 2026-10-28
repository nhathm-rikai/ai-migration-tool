import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ANALYZE_API_OPERATIONS, ErrorResponseSchema } from '@portal/contracts';
import type { SourceRegistrationService } from './source-registration.service.js';

// GET/PUT of a project's source (B03). Paths and schemas come from the
// contract operation table; the root path stays in the request body and is
// never echoed, logged or put in a URL.
export function registerSourceRegistrationRoutes(
  instance: FastifyInstance,
  service: SourceRegistrationService,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const ops = ANALYZE_API_OPERATIONS;
  app.get(
    ops.getProjectSource.path,
    {
      schema: {
        params: ops.getProjectSource.params,
        querystring: ops.getProjectSource.querystring,
        response: {
          200: ops.getProjectSource.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) => service.get(request.params.projectId),
  );
  app.put(
    ops.putProjectSource.path,
    {
      schema: {
        params: ops.putProjectSource.params,
        querystring: ops.putProjectSource.querystring,
        body: ops.putProjectSource.body,
        response: {
          200: ops.putProjectSource.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) => service.put(request.params.projectId, request.body),
  );
}
