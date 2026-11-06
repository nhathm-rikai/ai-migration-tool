import {
  INVENTORY_REPORT_CONTENT_TYPES,
  type InventoryReportFormat,
  type Project,
  type SourceInventoryArtifact,
} from '@portal/contracts';
import { ALL_PROGRAMS, buildInventoryReport } from './inventory-report.js';
import { inventoryReportSheets } from './inventory-report-workbook.js';
import { writeXlsx } from './xlsx-writer.js';

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
      const report = buildInventoryReport(artifact.payload, ALL_PROGRAMS);
      const fileName = reportFileName(project.name, deps.now(), format);
      return {
        body:
          format === 'xlsx'
            ? writeXlsx(inventoryReportSheets(report))
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
