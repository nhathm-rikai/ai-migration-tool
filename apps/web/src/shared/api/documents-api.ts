import {
  CurrentDocumentRunResponseSchema,
  DocumentLogPageSchema,
  DocumentRunSchema,
  PackageFileContentSchema,
  type StartDocumentRunInput,
} from '@portal/contracts';
import { createApiClient } from './api-client';
import {
  createLocalSession,
  localSession,
  type CredentialSource,
} from './local-session';

// Document run endpoints (step 3). The caller chooses the idempotency key:
// the same key for every HTTP retry of one Start intent.
export function createDocumentsApi(
  fetcher?: typeof fetch,
  credentials: CredentialSource = fetcher
    ? createLocalSession(fetcher)
    : localSession,
) {
  const request = createApiClient(credentials, fetcher);
  const runs = (projectId: string) =>
    '/projects/' + encodeURIComponent(projectId) + '/document-runs';
  const run = (projectId: string, runId: string) =>
    runs(projectId) + '/' + encodeURIComponent(runId);
  return {
    start: (
      projectId: string,
      idempotencyKey: string,
      input: StartDocumentRunInput,
      signal: AbortSignal,
    ) =>
      request(runs(projectId), DocumentRunSchema, signal, {
        method: 'POST',
        body: input,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    current: (projectId: string, signal: AbortSignal) =>
      request(
        runs(projectId) + '/current',
        CurrentDocumentRunResponseSchema,
        signal,
      ),
    get: (projectId: string, runId: string, signal: AbortSignal) =>
      request(run(projectId, runId), DocumentRunSchema, signal),
    cancel: (
      projectId: string,
      runId: string,
      expectedStateVersion: number,
      signal: AbortSignal,
    ) =>
      request(run(projectId, runId) + '/cancel', DocumentRunSchema, signal, {
        method: 'POST',
        body: { expectedStateVersion },
      }),
    log: (
      projectId: string,
      runId: string,
      after: number,
      signal: AbortSignal,
    ) =>
      request(
        run(projectId, runId) + '/log?after=' + String(after),
        DocumentLogPageSchema,
        signal,
      ),
    packageFile: (
      projectId: string,
      runId: string,
      item: number,
      file: string,
      signal: AbortSignal,
    ) =>
      request(
        run(projectId, runId) +
          '/items/' +
          String(item) +
          '/files/' +
          encodeURIComponent(file),
        PackageFileContentSchema,
        signal,
      ),
  };
}
export type DocumentsApi = ReturnType<typeof createDocumentsApi>;
export const documentsApi = createDocumentsApi();
