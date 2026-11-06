import type {
  ArtifactEnvelope,
  CustomerReportDocument,
} from '@portal/contracts';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import { ApiError } from '../../shared/api/api-error';
import { saveBlob } from '../../shared/files/save-blob';
import { useLocale } from '../../shared/i18n/locale-context';
import { renderAssessmentPdf } from './assessment-pdf';

// "Báo cáo cho khách (PDF)" of step 2 (AR03): reads the customer report JSON
// of the exact inventory version on screen, draws the Japanese PDF from it
// and saves it. Same rules as the Excel buttons: disabled while it works, a
// new artifact or project drops the answer in flight, a failure shows a
// message and saves nothing.

export type RenderCustomerPdf = (
  report: CustomerReportDocument,
  issuedOn: string,
) => Promise<Uint8Array>;
type SaveFile = (name: string, blob: Blob) => void;

// A file name cannot hold backslash, / : * ? " < > | or control characters.
const UNSAFE_NAME = /[\\/:*?"<>|\s]+/g;
const withoutControls = (text: string) =>
  Array.from(text)
    .filter((char) => char.charCodeAt(0) > 0x1f && char.charCodeAt(0) !== 0x7f)
    .join('');

// アセスメント報告書_<project>_<YYYYMMDD>.pdf
export function customerPdfFileName(projectName: string, date: Date): string {
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  const cleaned = withoutControls(projectName.normalize('NFC'))
    .replace(UNSAFE_NAME, '_')
    .replace(/^[._]+|[._]+$/g, '');
  return `アセスメント報告書_${cleaned === '' ? 'project' : cleaned}_${day}.pdf`;
}

export function CustomerPdfButton({
  api,
  artifact,
  slot = null,
  save = saveBlob,
  render = renderAssessmentPdf,
}: {
  api: ArtifactsApi;
  artifact: ArtifactEnvelope;
  slot?: HTMLElement | null;
  save?: SaveFile;
  render?: RenderCustomerPdf;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.report;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const controller = useRef<AbortController | null>(null);
  const { projectId, id, version } = artifact;
  useEffect(() => {
    setBusy(false);
    setFailed(null);
    return () => controller.current?.abort();
  }, [projectId, id, version]);

  async function download() {
    if (busy) return;
    const own = new AbortController();
    controller.current = own;
    setBusy(true);
    setFailed(null);
    try {
      const report = await api.getCustomerReport(
        projectId,
        id,
        version,
        own.signal,
      );
      if (own.signal.aborted) return;
      const now = new Date();
      const bytes = await render(report, now.toISOString().slice(0, 10));
      if (own.signal.aborted) return;
      save(
        customerPdfFileName(report.source.origin?.projectName ?? '', now),
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      );
    } catch (error) {
      if (!own.signal.aborted) setFailed(error);
    } finally {
      if (!own.signal.aborted) setBusy(false);
    }
  }

  const button = (
    <button
      type="button"
      className="button"
      onClick={() => void download()}
      disabled={busy}
      data-report-kind="customer-pdf"
    >
      {busy ? copy.exporting : copy.exportCustomerPdf}
    </button>
  );
  return (
    <>
      {slot ? createPortal(button, slot) : button}
      {failed !== null && (
        <div role="alert" className="error">
          {failed instanceof ApiError &&
          failed.kind === 'http' &&
          failed.code === 'ARTIFACT_NOT_FOUND'
            ? messages.assessment.errors.ARTIFACT_NOT_FOUND
            : copy.pdfFailed}
        </div>
      )}
    </>
  );
}
