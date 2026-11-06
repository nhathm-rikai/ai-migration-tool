import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  ArtifactEnvelope,
  InventoryReportFormat,
} from '@portal/contracts';
import type { ArtifactsApi, ReportKind } from '../../shared/api/artifacts-api';
import { ApiError } from '../../shared/api/api-error';
import { saveBlob } from '../../shared/files/save-blob';
import { useLocale } from '../../shared/i18n/locale-context';

// 'Dữ liệu kỹ thuật (Excel, nội bộ)' of step 2 (AR01): downloads the assessment report of the
// exact inventory version on screen. A new project or version aborts the
// request in flight and drops its answer; a failure shows a message and
// saves nothing.

export type SaveFile = (name: string, blob: Blob) => void;

export function ReportExportButton({
  api,
  artifact,
  slot = null,
  save = saveBlob,
  kind = 'technical',
}: {
  api: ArtifactsApi;
  artifact: ArtifactEnvelope;
  // customer = the six-sheet Japanese report (AR02, the main button);
  // technical = the 16-sheet data workbook (AR01, internal).
  kind?: ReportKind;
  // Header of the step page; the button renders in place when absent.
  slot?: HTMLElement | null;
  save?: SaveFile;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.report;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const controller = useRef<AbortController | null>(null);
  const { projectId, id, version } = artifact;
  useEffect(() => {
    // The artifact on screen changed (or the step closed).
    setBusy(false);
    setFailed(null);
    return () => controller.current?.abort();
  }, [projectId, id, version]);

  async function download(format: InventoryReportFormat) {
    if (busy) return;
    const own = new AbortController();
    controller.current = own;
    setBusy(true);
    setFailed(null);
    try {
      const file = await api.exportReport(
        projectId,
        id,
        version,
        format,
        own.signal,
        kind,
      );
      if (own.signal.aborted) return;
      save(file.fileName ?? 'assessment.' + format, file.blob);
      setFailed(null);
    } catch (error) {
      if (!own.signal.aborted) setFailed(error);
    } finally {
      if (!own.signal.aborted) setBusy(false);
    }
  }

  const button = (
    <button
      type="button"
      className={kind === 'customer' ? 'button primary' : 'button'}
      onClick={() => void download('xlsx')}
      disabled={busy}
      data-report-kind={kind}
    >
      {busy
        ? copy.exporting
        : kind === 'customer'
          ? copy.exportCustomer
          : copy.export}
    </button>
  );
  const tooLarge =
    failed instanceof ApiError &&
    failed.kind === 'http' &&
    failed.code === 'REPORT_TOO_LARGE';
  return (
    <>
      {slot ? createPortal(button, slot) : button}
      {failed !== null && (
        <div role="alert" className="error">
          {failed instanceof ApiError &&
          failed.kind === 'http' &&
          failed.code === 'ARTIFACT_NOT_FOUND'
            ? messages.assessment.errors.ARTIFACT_NOT_FOUND
            : tooLarge
              ? copy.tooLarge
              : copy.failed}
          {tooLarge && (
            <>
              {' '}
              <button
                type="button"
                className="button"
                onClick={() => void download('json')}
                disabled={busy}
              >
                {copy.downloadJson}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
