import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ANALYZE_API_OPERATIONS,
  ErrorResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  cancelRunSuccessStatus,
  runLocation,
} from '@portal/contracts';
import type { JobService } from './job.service.js';

// Run admission and reads (B04). Paths and schemas come from the contract
// operation table; handlers only translate HTTP to service calls.
export function registerJobRoutes(
  instance: FastifyInstance,
  service: JobService,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const ops = ANALYZE_API_OPERATIONS;

  app.post(
    ops.startRun.path,
    {
      schema: {
        params: ops.startRun.params,
        querystring: ops.startRun.querystring,
        headers: ops.startRun.headers,
        body: ops.startRun.body,
        response: { 202: ops.startRun.response, default: ErrorResponseSchema },
      },
    },
    (request, reply) => {
      const { run } = service.start(
        request.params.projectId,
        request.headers[IDEMPOTENCY_KEY_HEADER],
        request.body,
      );
      // Same answer for a new run and a replayed key: the run it names.
      reply
        .code(202)
        .header('Location', runLocation(run.projectId, run.id))
        .send(run);
    },
  );
  app.get(
    ops.listRuns.path,
    {
      schema: {
        params: ops.listRuns.params,
        querystring: ops.listRuns.querystring,
        response: { 200: ops.listRuns.response, default: ErrorResponseSchema },
      },
    },
    (request) => service.list(request.params.projectId, request.query),
  );
  app.get(
    ops.getCurrentRun.path,
    {
      schema: {
        params: ops.getCurrentRun.params,
        querystring: ops.getCurrentRun.querystring,
        response: {
          200: ops.getCurrentRun.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) => service.current(request.params.projectId),
  );
  app.get(
    ops.getRun.path,
    {
      schema: {
        params: ops.getRun.params,
        querystring: ops.getRun.querystring,
        response: { 200: ops.getRun.response, default: ErrorResponseSchema },
      },
    },
    (request) => service.get(request.params.projectId, request.params.runId),
  );
  app.post(
    ops.cancelRun.path,
    {
      schema: {
        params: ops.cancelRun.params,
        querystring: ops.cancelRun.querystring,
        body: ops.cancelRun.body,
        response: {
          200: ops.cancelRun.response,
          202: ops.cancelRun.response,
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
      reply.code(cancelRunSuccessStatus(run)).send(run);
    },
  );
  app.get(
    ops.getRuntimeStatus.path,
    {
      schema: {
        querystring: ops.getRuntimeStatus.querystring,
        response: {
          200: ops.getRuntimeStatus.response,
          default: ErrorResponseSchema,
        },
      },
    },
    () => service.runtimeStatus(),
  );
}
