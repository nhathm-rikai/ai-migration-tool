import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  EmptyQuerySchema,
  ErrorResponseSchema,
  FolderPickerResultSchema,
  LOCAL_FOLDER_PICKER_PATH,
} from '@portal/contracts';
import type { FolderPickerService } from './folder-picker.service.js';

// Protected route (credential + Host/Origin, checked onRequest before this
// handler runs, so a rejected request never opens a dialog). The answer may
// carry an absolute path: it is not cached and never logged.
export function registerFolderPickerRoutes(
  instance: FastifyInstance,
  service: FolderPickerService,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    LOCAL_FOLDER_PICKER_PATH,
    {
      schema: {
        querystring: EmptyQuerySchema,
        response: {
          200: FolderPickerResultSchema,
          default: ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const result = await service.pick();
      return reply.header('Cache-Control', 'no-store').send(result);
    },
  );
}
