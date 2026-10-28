import {
  CurrentRunResponseSchema,
  RunListSchema,
  RunSchema,
  type StartRunInput,
} from '@portal/contracts';
import { createApiClient } from './api-client';
import {
  createLocalSession,
  localSession,
  type CredentialSource,
} from './local-session';

// Analyze run endpoints (C01 API 3–5). The idempotency key is chosen by the
// caller: the same key for every HTTP retry of one Start intent.
export function createRunsApi(
  fetcher?: typeof fetch,
  credentials: CredentialSource = fetcher
    ? createLocalSession(fetcher)
    : localSession,
) {
  const request = createApiClient(credentials, fetcher);
  const runs = (projectId: string) =>
    '/projects/' + encodeURIComponent(projectId) + '/runs';
  return {
    start: (
      projectId: string,
      idempotencyKey: string,
      input: StartRunInput,
      signal: AbortSignal,
    ) =>
      request(runs(projectId), RunSchema, signal, {
        method: 'POST',
        body: input,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    current: (projectId: string, signal: AbortSignal) =>
      request(runs(projectId) + '/current', CurrentRunResponseSchema, signal),
    list: (projectId: string, cursor: string | null, signal: AbortSignal) =>
      request(
        runs(projectId) +
          (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        RunListSchema,
        signal,
      ),
    get: (projectId: string, runId: string, signal: AbortSignal) =>
      request(
        runs(projectId) + '/' + encodeURIComponent(runId),
        RunSchema,
        signal,
      ),
    cancel: (
      projectId: string,
      runId: string,
      expectedStateVersion: number,
      signal: AbortSignal,
    ) =>
      request(
        runs(projectId) + '/' + encodeURIComponent(runId) + '/cancel',
        RunSchema,
        signal,
        { method: 'POST', body: { expectedStateVersion } },
      ),
  };
}
export type RunsApi = ReturnType<typeof createRunsApi>;
export const runsApi = createRunsApi();
