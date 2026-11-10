import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import {
  DOCUMENTS_API_OPERATIONS,
  ErrorResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  INVENTORY_REPORT_CONTENT_TYPES,
  cancelDocumentRunSuccessStatus,
  documentRunLocation,
} from '@portal/contracts';
import { contentDisposition } from '../inventory-report/report-download.service.js';
import type { DocumentReviewService } from '../reviews/document-review.service.js';
import type { DocumentRunService } from './document-run.service.js';

// Document runs (step 3). Paths and schemas come from the contract table;
// handlers only translate HTTP to service calls.
export function registerDocumentRoutes(
  instance: FastifyInstance,
  service: DocumentRunService,
  reviews: DocumentReviewService,
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
  // TC01: Japanese Excel of the unit test specification of one package.
  app.get(
    ops.exportUtTestSpec.path,
    {
      schema: {
        params: ops.exportUtTestSpec.params,
        querystring: ops.exportUtTestSpec.querystring,
        response: { 200: Type.Unknown(), default: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { projectId, runId, item } = request.params;
      const board = reviews.board(projectId);
      const download = await service.utSpecExcel(
        projectId,
        runId,
        item,
        (file) =>
          board.programs
            .find(
              (program) =>
                program.runId === runId && program.item === Number(item),
            )
            ?.documents.find(
              (document) =>
                document.name === file.name && document.sha256 === file.sha256,
            )?.status === 'approved'
            ? 'approved'
            : 'pending',
      );
      return reply
        .header('content-type', INVENTORY_REPORT_CONTENT_TYPES.xlsx)
        .header('content-disposition', contentDisposition(download.fileName))
        .header('cache-control', 'no-store')
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(download.bytes));
    },
  );
  // TC02: Japanese Excel of the integration test specification of one package.
  app.get(
    ops.exportItTestSpec.path,
    {
      schema: {
        params: ops.exportItTestSpec.params,
        querystring: ops.exportItTestSpec.querystring,
        response: { 200: Type.Unknown(), default: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { projectId, runId, item } = request.params;
      const board = reviews.board(projectId);
      const download = await service.itSpecExcel(
        projectId,
        runId,
        item,
        (file) =>
          board.programs
            .find(
              (program) =>
                program.runId === runId && program.item === Number(item),
            )
            ?.documents.find(
              (document) =>
                document.name === file.name && document.sha256 === file.sha256,
            )?.status === 'approved'
            ? 'approved'
            : 'pending',
      );
      return reply
        .header('content-type', INVENTORY_REPORT_CONTENT_TYPES.xlsx)
        .header('content-disposition', contentDisposition(download.fileName))
        .header('cache-control', 'no-store')
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(download.bytes));
    },
  );
  app.get(
    ops.getReviewBoard.path,
    {
      schema: {
        params: ops.getReviewBoard.params,
        querystring: ops.getReviewBoard.querystring,
        response: {
          200: ops.getReviewBoard.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) => reviews.board(request.params.projectId),
  );
  app.post(
    ops.addReviewEvent.path,
    {
      schema: {
        params: ops.addReviewEvent.params,
        querystring: ops.addReviewEvent.querystring,
        body: ops.addReviewEvent.body,
        response: {
          200: ops.addReviewEvent.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) => reviews.add(request.params.projectId, request.body),
  );
}
