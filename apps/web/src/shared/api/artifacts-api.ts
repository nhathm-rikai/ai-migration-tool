import {
  ArtifactEnvelopeSchema,
  ArtifactListSchema,
  INVENTORY_REPORT_CONTENT_TYPES,
  type InventoryReportFormat,
} from '@portal/contracts';
import { isWellFormedXlsx } from '../files/xlsx-structure';
import { createApiClient, type DownloadExpectation } from './api-client';
import {
  createLocalSession,
  localSession,
  type CredentialSource,
} from './local-session';

// A report answer is accepted only as the media type it was asked for, and
// an xlsx only if its ZIP structure holds a workbook; JSON only if it parses.
// FileReader exists in every browser; Blob.arrayBuffer() is not in all test
// environments.
function readBlob(blob: Blob, as: 'bytes'): Promise<ArrayBuffer>;
function readBlob(blob: Blob, as: 'text'): Promise<string>;
function readBlob(
  blob: Blob,
  as: 'bytes' | 'text',
): Promise<ArrayBuffer | string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer | string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    if (as === 'bytes') reader.readAsArrayBuffer(blob);
    else reader.readAsText(blob);
  });
}

const REPORT_EXPECTATIONS = {
  xlsx: {
    mediaType: INVENTORY_REPORT_CONTENT_TYPES.xlsx,
    isValid: async (blob: Blob) =>
      isWellFormedXlsx(new Uint8Array(await readBlob(blob, 'bytes'))),
  },
  json: {
    mediaType: 'application/json',
    isValid: async (blob: Blob) => {
      try {
        JSON.parse(await readBlob(blob, 'text'));
        return true;
      } catch {
        return false;
      }
    },
  },
} as const satisfies Record<InventoryReportFormat, DownloadExpectation>;

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
    // Assessment report (AR01) of one exact inventory version: the file
    // bytes and the name the server chose. Saving is the caller's job.
    exportReport: (
      projectId: string,
      artifactId: string,
      version: number,
      format: InventoryReportFormat,
      signal: AbortSignal,
    ) =>
      request.download(
        project(projectId) +
          '/artifacts/' +
          encodeURIComponent(artifactId) +
          '/versions/' +
          String(version) +
          '/report?format=' +
          format,
        signal,
        REPORT_EXPECTATIONS[format],
      ),
  };
}
export type ArtifactsApi = ReturnType<typeof createArtifactsApi>;
export const artifactsApi = createArtifactsApi();
