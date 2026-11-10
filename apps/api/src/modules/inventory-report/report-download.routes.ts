import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ANALYZE_API_OPERATIONS, ErrorResponseSchema } from '@portal/contracts';
import type { ReportDownloadService } from './report-download.service.js';

// GET .../artifacts/:artifactId/versions/:version/report?format=xlsx|json and
// .../customer-report?format=xlsx|json[&lang=ja|vi].
// Protected like every other API route by the local security hook (see
// app.ts), which runs before this handler reads any artifact.
export function registerReportDownloadRoutes(
  instance: FastifyInstance,
  service: ReportDownloadService,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const send = (
    reply: FastifyReply,
    download: Awaited<ReturnType<ReportDownloadService['build']>>,
  ) =>
    reply
      .header('content-type', download.contentType)
      .header('content-disposition', download.contentDisposition)
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .send(
        typeof download.body === 'string'
          ? download.body
          : Buffer.from(download.body),
      );
  const technical = ANALYZE_API_OPERATIONS.exportInventoryReport;
  app.get(
    technical.path,
    {
      schema: {
        params: technical.params,
        querystring: technical.querystring,
        response: { 200: technical.response, default: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { projectId, artifactId, version } = request.params;
      return send(
        reply,
        await service.build(
          projectId,
          artifactId,
          version,
          request.query.format,
        ),
      );
    },
  );
  const customer = ANALYZE_API_OPERATIONS.exportCustomerReport;
  app.get(
    customer.path,
    {
      schema: {
        params: customer.params,
        querystring: customer.querystring,
        response: { 200: customer.response, default: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { projectId, artifactId, version } = request.params;
      return send(
        reply,
        await service.buildCustomer(
          projectId,
          artifactId,
          version,
          request.query.format,
          request.query.lang ?? 'ja',
        ),
      );
    },
  );
}
