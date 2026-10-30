import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DOCUMENTS_API_OPERATIONS,
  ErrorResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  cancelDocumentRunSuccessStatus,
  documentRunLocation,
} from '@portal/contracts';
import type { DocumentRunService } from './document-run.service.js';

// Document runs (step 3). Paths and schemas come from the contract table;
// handlers only translate HTTP to service calls.
export function registerDocumentRoutes(
  instance: FastifyInstance,
  service: DocumentRunService,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const ops = DOCUMENTS_API_OPERATIONS;

  app.post(
    ops.startDocumentRun.path,
    {
      schema: {
        params: ops.startDocumentRun.params,
        querystring: ops.startDocumentRun.querystring,
        headers: ops.startDocumentRun.headers,
        body: ops.startDocumentRun.body,
        response: {
          202: ops.startDocumentRun.response,
          default: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const run = await service.start(
        request.params.projectId,
        request.headers[IDEMPOTENCY_KEY_HEADER],
        request.body,
      );
      reply
        .code(202)
        .header('Location', documentRunLocation(run.projectId, run.id))
        .send(run);
    },
  );
  app.get(
    ops.getCurrentDocumentRun.path,
    {
      schema: {
        params: ops.getCurrentDocumentRun.params,
        querystring: ops.getCurrentDocumentRun.querystring,
        response: {
          200: ops.getCurrentDocumentRun.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) => service.current(request.params.projectId),
  );
  app.get(
    ops.getDocumentRun.path,
    {
      schema: {
        params: ops.getDocumentRun.params,
        querystring: ops.getDocumentRun.querystring,
        response: {
          200: ops.getDocumentRun.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) => service.get(request.params.projectId, request.params.runId),
  );
  app.post(
    ops.cancelDocumentRun.path,
    {
      schema: {
        params: ops.cancelDocumentRun.params,
        querystring: ops.cancelDocumentRun.querystring,
        body: ops.cancelDocumentRun.body,
        response: {
          200: ops.cancelDocumentRun.response,
          202: ops.cancelDocumentRun.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request, reply) => {
      const run = service.cancel(
        request.params.projectId,
        request.params.runId,
        request.body,
      );
      reply.code(cancelDocumentRunSuccessStatus(run)).send(run);
    },
  );
  app.get(
    ops.getDocumentRunLog.path,
    {
      schema: {
        params: ops.getDocumentRunLog.params,
        querystring: ops.getDocumentRunLog.querystring,
        response: {
          200: ops.getDocumentRunLog.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) =>
      service.log(
        request.params.projectId,
        request.params.runId,
        request.query.after,
      ),
  );
  app.get(
    ops.getPackageFile.path,
    {
      schema: {
        params: ops.getPackageFile.params,
        querystring: ops.getPackageFile.querystring,
        response: {
          200: ops.getPackageFile.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) =>
      service.packageFile(
        request.params.projectId,
        request.params.runId,
        request.params.item,
        request.params.file,
      ),
  );
}
