import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ANALYZE_API_OPERATIONS, ErrorResponseSchema } from '@portal/contracts';
import type { ReportDownloadService } from './report-download.service.js';

// GET .../artifacts/:artifactId/versions/:version/report?format=xlsx|json.
// Protected like every other API route by the local security hook (see
// app.ts), which runs before this handler reads any artifact.
export function registerReportDownloadRoutes(
  instance: FastifyInstance,
  service: ReportDownloadService,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const routes = [
    [ANALYZE_API_OPERATIONS.exportInventoryReport, 'build'],
    [ANALYZE_API_OPERATIONS.exportCustomerReport, 'buildCustomer'],
  ] as const;
  for (const [op, method] of routes)
    app.get(
      op.path,
      {
        schema: {
          params: op.params,
          querystring: op.querystring,
          response: { 200: op.response, default: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        const { projectId, artifactId, version } = request.params;
        const download = await service[method](
          projectId,
          artifactId,
          version,
          request.query.format,
        );
        return reply
          .header('content-type', download.contentType)
          .header('content-disposition', download.contentDisposition)
          .header('cache-control', 'no-store')
          .header('x-content-type-options', 'nosniff')
          .send(
            typeof download.body === 'string'
              ? download.body
              : Buffer.from(download.body),
          );
      },
    );
}
