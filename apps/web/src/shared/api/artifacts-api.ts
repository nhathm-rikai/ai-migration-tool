import { ArtifactEnvelopeSchema, ArtifactListSchema } from '@portal/contracts';
import { createApiClient } from './api-client';
import {
  createLocalSession,
  localSession,
  type CredentialSource,
} from './local-session';

// Artifact read endpoints (C01 API 7). A version is always named exactly;
// there is no "latest" read.
export function createArtifactsApi(
  fetcher?: typeof fetch,
  credentials: CredentialSource = fetcher
    ? createLocalSession(fetcher)
    : localSession,
) {
  const request = createApiClient(credentials, fetcher);
  const project = (projectId: string) =>
    '/projects/' + encodeURIComponent(projectId);
  return {
    listForRun: (projectId: string, runId: string, signal: AbortSignal) =>
      request(
        project(projectId) +
          '/runs/' +
          encodeURIComponent(runId) +
          '/artifacts',
        ArtifactListSchema,
        signal,
      ),
    getVersion: (
      projectId: string,
      artifactId: string,
      version: number,
      signal: AbortSignal,
    ) =>
      request(
        project(projectId) +
          '/artifacts/' +
          encodeURIComponent(artifactId) +
          '/versions/' +
          String(version),
        ArtifactEnvelopeSchema,
        signal,
      ),
  };
}
export type ArtifactsApi = ReturnType<typeof createArtifactsApi>;
export const artifactsApi = createArtifactsApi();
