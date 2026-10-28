import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ANALYZE_API_OPERATIONS, ErrorResponseSchema } from '@portal/contracts';
import type { ArtifactService } from './artifact.service.js';

// Artifact reads (B07): published versions of a run and one exact version.
// Clients name an artifact by ID + version, never by filesystem path.
export function registerArtifactRoutes(
  instance: FastifyInstance,
  service: ArtifactService,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const ops = ANALYZE_API_OPERATIONS;

  app.get(
    ops.listRunArtifacts.path,
    {
      schema: {
        params: ops.listRunArtifacts.params,
        querystring: ops.listRunArtifacts.querystring,
        response: {
          200: ops.listRunArtifacts.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) =>
      service.listForRun(request.params.projectId, request.params.runId),
  );
  app.get(
    ops.getArtifactVersion.path,
    {
      schema: {
        params: ops.getArtifactVersion.params,
        querystring: ops.getArtifactVersion.querystring,
        response: {
          200: ops.getArtifactVersion.response,
          default: ErrorResponseSchema,
        },
      },
    },
    (request) =>
      service.getVersion(
        request.params.projectId,
        request.params.artifactId,
        request.params.version,
      ),
  );
}
