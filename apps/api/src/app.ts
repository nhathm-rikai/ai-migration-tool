import type { Writable } from 'node:stream';
import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  EmptyQuerySchema,
  ErrorResponseSchema,
  HealthSchema,
} from '@portal/contracts';
import type { AppConfig } from './config.js';
import { createDependencies, type JobOptions } from './composition.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerProjectRoutes } from './modules/projects/project.routes.js';
import { registerJobRoutes } from './modules/jobs/job.routes.js';
import { createLoggerOptions } from './plugins/logger.js';
import {
  createLocalCredential,
  createLocalSecurityPolicy,
  registerLocalSecurity,
} from './plugins/local-security.js';
import { registerLocalSessionRoutes } from './modules/local-session/local-session.routes.js';

// loggerStream lets tests read the structured log; production logs to stdout.
export function buildApp(
  config: AppConfig,
  options: { loggerStream?: Writable; jobs?: JobOptions } = {},
) {
  const app = Fastify({
    bodyLimit: 16 * 1024,
    requestIdHeader: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    logger: {
      ...createLoggerOptions(config.logLevel),
      ...(options.loggerStream ? { stream: options.loggerStream } : {}),
    },
  }).withTypeProvider<TypeBoxTypeProvider>();
  const dependencies = createDependencies(config.dataDir, {
    log: app.log,
    ...(options.jobs ? { jobs: options.jobs } : {}),
  });
  app.addHook('onReady', () => {
    dependencies.start();
  });
  app.addHook('onClose', async () => {
    await dependencies.close();
  });
  registerErrorHandler(app);
  // One credential per process: restarting the API expires every UI session.
  const credential = createLocalCredential();
  registerLocalSecurity(app, createLocalSecurityPolicy(config, credential));
  registerLocalSessionRoutes(app, credential);
  app.get(
    '/api/v1/health',
    {
      config: { access: 'public' },
      schema: {
        querystring: EmptyQuerySchema,
        response: { 200: HealthSchema, default: ErrorResponseSchema },
      },
    },
    () => ({ status: 'ok' as const, mode: config.mode, runner: config.runner }),
  );
  registerProjectRoutes(app, dependencies.projects);
  registerJobRoutes(app, dependencies.jobs);
  return app;
}
