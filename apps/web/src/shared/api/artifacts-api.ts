import { Check } from 'typebox/value';
import {
  ArtifactEnvelopeSchema,
  CustomerReportSchema,
  type CustomerReportDocument,
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
export function readBlob(blob: Blob, as: 'bytes'): Promise<ArrayBuffer>;
export function readBlob(blob: Blob, as: 'text'): Promise<string>;
export function readBlob(
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

export type ReportKind = 'technical' | 'customer';
const REPORT_VERSION: Record<ReportKind, string> = {
  technical: 'inventory-report-v1',
  customer: 'customer-assessment-report-v1',
};
const REPORT_PATH: Record<ReportKind, string> = {
  technical: '/report',
  customer: '/customer-report',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// The JSON answer must be the report of the exact artifact and version asked.
function isReportOf(
  value: unknown,
  kind: ReportKind,
  artifactId: string,
  version: number,
) {
  if (!isRecord(value) || value.reportVersion !== REPORT_VERSION[kind])
    return false;
  // The technical report lists programs; the customer one has its scale.
  if (kind === 'technical' && !Array.isArray(value.programs)) return false;
  if (kind === 'customer' && !isRecord(value.scale)) return false;
  const origin = isRecord(value.source) ? value.source.origin : null;
  return (
    isRecord(origin) &&
    origin.artifactId === artifactId &&
    origin.artifactVersion === version
  );
}

function reportExpectation(
  kind: ReportKind,
  format: InventoryReportFormat,
  artifactId: string,
  version: number,
): DownloadExpectation {
  if (format === 'xlsx')
    return {
      mediaType: INVENTORY_REPORT_CONTENT_TYPES.xlsx,
      isValid: async (blob) =>
        isWellFormedXlsx(new Uint8Array(await readBlob(blob, 'bytes'))),
    };
  return {
    mediaType: 'application/json',
    isValid: async (blob) => {
      try {
        const parsed: unknown = JSON.parse(await readBlob(blob, 'text'));
        return isReportOf(parsed, kind, artifactId, version);
      } catch {
        return false;
      }
    },
  };
}

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
      kind: ReportKind = 'technical',
    ) =>
      request.download(
        project(projectId) +
          '/artifacts/' +
          encodeURIComponent(artifactId) +
          '/versions/' +
          String(version) +
          REPORT_PATH[kind] +
          '?format=' +
          format,
        signal,
        reportExpectation(kind, format, artifactId, version),
      ),
    // The customer report (AR02) as data, for the PDF (AR03): the JSON of
    // the exact version, checked against the contract before it is drawn.
    getCustomerReport: async (
      projectId: string,
      artifactId: string,
      version: number,
      signal: AbortSignal,
    ): Promise<CustomerReportDocument> => {
      const file = await request.download(
        project(projectId) +
          '/artifacts/' +
          encodeURIComponent(artifactId) +
          '/versions/' +
          String(version) +
          REPORT_PATH.customer +
          '?format=json',
        signal,
        reportExpectation('customer', 'json', artifactId, version),
      );
      const parsed: unknown = JSON.parse(await readBlob(file.blob, 'text'));
      if (!Check(CustomerReportSchema, parsed))
        throw new Error('The customer report does not match its contract.');
      return parsed;
    },
  };
}
export type ArtifactsApi = ReturnType<typeof createArtifactsApi>;
export type { CustomerReportDocument };
export const artifactsApi = createArtifactsApi();
