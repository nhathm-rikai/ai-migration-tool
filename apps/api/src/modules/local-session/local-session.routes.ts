import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  EmptyQuerySchema,
  ErrorResponseSchema,
  LOCAL_SESSION_PATH,
  LocalSessionSchema,
} from '@portal/contracts';

// Trusted bootstrap: a page on a trusted loopback origin reads the
// per-process credential. Host/Origin are checked by local-security first.
export function registerLocalSessionRoutes(
  instance: FastifyInstance,
  credential: string,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    LOCAL_SESSION_PATH,
    {
      config: { access: 'bootstrap' },
      schema: {
        querystring: EmptyQuerySchema,
        response: { 200: LocalSessionSchema, default: ErrorResponseSchema },
      },
    },
    (_request, reply) => {
      reply.header('Cache-Control', 'no-store').send({ token: credential });
    },
  );
}
