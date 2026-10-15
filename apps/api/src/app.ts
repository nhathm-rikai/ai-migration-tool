import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  EmptyQuerySchema,
  ErrorResponseSchema,
  HealthSchema,
} from '@portal/contracts';
import type { AppConfig } from './config.js';
import { createDependencies } from './composition.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerProjectRoutes } from './modules/projects/project.routes.js';
import { createLoggerOptions } from './plugins/logger.js';

export function buildApp(config: AppConfig) {
  const app = Fastify({
    bodyLimit: 16 * 1024,
    requestIdHeader: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    logger: createLoggerOptions(config.logLevel),
  }).withTypeProvider<TypeBoxTypeProvider>();
  const dependencies = createDependencies(config.dataDir);
  app.addHook('onClose', () => {
    dependencies.close();
  });
  registerErrorHandler(app);
  app.get(
    '/api/v1/health',
    {
      schema: {
        querystring: EmptyQuerySchema,
        response: { 200: HealthSchema, default: ErrorResponseSchema },
      },
    },
    () => ({ status: 'ok' as const, mode: config.mode, runner: config.runner }),
  );
  registerProjectRoutes(app, dependencies.projects);
  return app;
}
