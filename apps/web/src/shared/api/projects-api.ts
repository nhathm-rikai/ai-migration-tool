import {
  ProjectListSchema,
  ProjectSchema,
  type CreateProjectInput,
} from '@portal/contracts';
import { createApiClient } from './api-client';

export function createProjectsApi(fetcher?: typeof fetch) {
  const request = createApiClient(fetcher);
  return {
    list: (cursor: string | null, signal: AbortSignal) =>
      request(
        '/projects' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        ProjectListSchema,
        signal,
      ),
    get: (id: string, signal: AbortSignal) =>
      request('/projects/' + encodeURIComponent(id), ProjectSchema, signal),
    create: (input: CreateProjectInput, signal: AbortSignal) =>
      request('/projects', ProjectSchema, signal, {
        method: 'POST',
        body: input,
      }),
  };
}
export type ProjectsApi = ReturnType<typeof createProjectsApi>;
export const projectsApi = createProjectsApi();
