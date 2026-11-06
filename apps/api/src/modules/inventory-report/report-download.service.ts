import {
  INVENTORY_REPORT_CONTENT_TYPES,
  type InventoryReportFormat,
  type Project,
  type SourceInventoryArtifact,
} from '@portal/contracts';
import { AppError } from '../../shared/app-error.js';
import {
  ALL_PROGRAMS,
  buildInventoryReport,
  type InventoryReport,
} from './inventory-report.js';
import { inventoryReportSheets } from './inventory-report-workbook.js';
import { SheetLimitError, writeXlsx } from './xlsx-writer.js';

// Builds the downloadable assessment report (AR01) of one exact inventory
// version, in memory only: nothing is written to the data directory. The
// artifact service decides which version is read (project, id and version
// must match; there is no "latest"), this service only formats it.

export type ReportDownload = {
  body: Uint8Array | string;
  contentType: string;
  contentDisposition: string;
};

type ReportDownloadDeps = {
  projects: { get(projectId: string): Project };
  artifacts: {
    getVersion(
      projectId: string,
      artifactId: string,
      version: string,
    ): Promise<SourceInventoryArtifact>;
  };
  now(): Date;
};

// Characters that are unsafe in a file name on Windows/macOS/Linux or in a
// header value.
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f\\/:*?"<>|]+/g;
const MAX_NAME_LENGTH = 80;

function safeProjectName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(UNSAFE_NAME_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
  // A name of dots only would be a relative path segment.
  return /^[.\s_]*$/.test(cut) ? 'project' : cut;
}

// RFC 5987 `filename*` value: UTF-8, percent-encoded, attr-char only.
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function reportFileName(
  projectName: string,
  date: Date,
  format: InventoryReportFormat,
): string {
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `assessment-${safeProjectName(projectName)}-${day}.${format}`;
}

export function contentDisposition(fileName: string): string {
  // ASCII fallback keeps letters/digits/dot/dash; the rest becomes `_`.
  const fallback = fileName.replace(/[^A-Za-z0-9.-]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}

// A table past the Excel worksheet limits is a request the portal can refuse
// (the JSON report has no such limit), not a server fault.
function buildWorkbook(report: InventoryReport): Uint8Array {
  try {
    return writeXlsx(inventoryReportSheets(report));
  } catch (error) {
    if (error instanceof SheetLimitError)
      throw new AppError('REPORT_TOO_LARGE');
    throw error;
  }
}

export function createReportDownloadService(deps: ReportDownloadDeps) {
  return {
    async build(
      projectId: string,
      artifactId: string,
      version: string,
      format: InventoryReportFormat,
    ): Promise<ReportDownload> {
      const project = deps.projects.get(projectId);
      const artifact = await deps.artifacts.getVersion(
        projectId,
        artifactId,
        version,
      );
      const report = buildInventoryReport(artifact.payload, ALL_PROGRAMS, {
        mode: artifact.mode,
        projectId: artifact.projectId,
        projectName: project.name,
        runId: artifact.runId,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        createdAt: artifact.createdAt,
      });
      const fileName = reportFileName(project.name, deps.now(), format);
      return {
        body:
          format === 'xlsx'
            ? buildWorkbook(report)
            : `${JSON.stringify(report, null, 2)}\n`,
        contentType: INVENTORY_REPORT_CONTENT_TYPES[format],
        contentDisposition: contentDisposition(fileName),
      };
    },
  };
}

export type ReportDownloadService = ReturnType<
  typeof createReportDownloadService
>;
