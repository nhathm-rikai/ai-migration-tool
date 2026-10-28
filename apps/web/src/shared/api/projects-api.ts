import {
  ProjectListSchema,
  ProjectSchema,
  type CreateProjectInput,
} from '@portal/contracts';
import { createApiClient } from './api-client';
import {
  createLocalSession,
  localSession,
  type CredentialSource,
} from './local-session';

// A custom fetcher gets its own session over the same fetcher (tests).
export function createProjectsApi(
  fetcher?: typeof fetch,
  credentials: CredentialSource = fetcher
    ? createLocalSession(fetcher)
    : localSession,
) {
  const request = createApiClient(credentials, fetcher);
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
