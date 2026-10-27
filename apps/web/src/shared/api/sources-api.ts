import {
  ProjectSourceResponseSchema,
  type PutProjectSourceInput,
} from '@portal/contracts';
import { createApiClient } from './api-client';
import {
  createLocalSession,
  localSession,
  type CredentialSource,
} from './local-session';

// Source registration endpoints (C01 API 2). The root path travels only in
// the PUT body: never in a URL, storage or log.
export function createSourcesApi(
  fetcher?: typeof fetch,
  credentials: CredentialSource = fetcher
    ? createLocalSession(fetcher)
    : localSession,
) {
  const request = createApiClient(credentials, fetcher);
  const source = (projectId: string) =>
    '/projects/' + encodeURIComponent(projectId) + '/source';
  return {
    get: (projectId: string, signal: AbortSignal) =>
      request(source(projectId), ProjectSourceResponseSchema, signal),
    put: (
      projectId: string,
      input: PutProjectSourceInput,
      signal: AbortSignal,
    ) =>
      request(source(projectId), ProjectSourceResponseSchema, signal, {
        method: 'PUT',
        body: input,
      }),
  };
}
export type SourcesApi = ReturnType<typeof createSourcesApi>;
export const sourcesApi = createSourcesApi();
