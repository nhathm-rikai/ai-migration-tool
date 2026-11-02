import {
  FOLDER_PICKER_TIMEOUT_MS,
  FolderPickerResultSchema,
  LOCAL_FOLDER_PICKER_PATH,
  ProjectSourceResponseSchema,
  type PutProjectSourceInput,
} from '@portal/contracts';
import { createApiClient } from './api-client';
import {
  createLocalSession,
  localSession,
  type CredentialSource,
} from './local-session';

// Source registration endpoints (C01 API 2) and the native folder dialog
// (UI05). The root path travels only in the PUT body and the dialog's
// answer: never in a URL, storage or log.
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
    // Waits while the person answers the dialog on the backend machine.
    pickFolder: (signal: AbortSignal) =>
      request(
        LOCAL_FOLDER_PICKER_PATH.replace(/^\/api\/v1/, ''),
        FolderPickerResultSchema,
        signal,
        { method: 'POST', timeoutMs: FOLDER_PICKER_TIMEOUT_MS + 15_000 },
      ),
  };
}
export type SourcesApi = ReturnType<typeof createSourcesApi>;
export const sourcesApi = createSourcesApi();
