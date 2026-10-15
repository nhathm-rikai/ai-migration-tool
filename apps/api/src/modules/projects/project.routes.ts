import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  CreateProjectSchema,
  ProjectSchema,
  ProjectParamsSchema,
  ListProjectsQuerySchema,
  ProjectListSchema,
  ErrorResponseSchema,
  EmptyQuerySchema,
} from '@portal/contracts';
import type { ProjectService } from './project.service.js';

export function registerProjectRoutes(
  instance: FastifyInstance,
  service: ProjectService,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    '/api/v1/projects',
    {
      schema: {
        body: CreateProjectSchema,
        querystring: EmptyQuerySchema,
        response: { 201: ProjectSchema, default: ErrorResponseSchema },
      },
    },
    (request, reply) => {
      const project = service.create(request.body);
      reply
        .code(201)
        .header('Location', `/api/v1/projects/${project.id}`)
        .send(project);
    },
  );
  app.get(
    '/api/v1/projects',
    {
      schema: {
        querystring: ListProjectsQuerySchema,
        response: { 200: ProjectListSchema, default: ErrorResponseSchema },
      },
    },
    (request) => service.list(request.query),
  );
  app.get(
    '/api/v1/projects/:projectId',
    {
      schema: {
        params: ProjectParamsSchema,
        querystring: EmptyQuerySchema,
        response: { 200: ProjectSchema, default: ErrorResponseSchema },
      },
    },
    (request) => service.get(request.params.projectId),
  );
}
