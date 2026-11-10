import { useEffect, useRef, useState } from 'react';
import type { DocumentsApi } from '../../shared/api/documents-api';
import { saveBlob } from '../../shared/files/save-blob';
import { useLocale } from '../../shared/i18n/locale-context';

type Download = DocumentsApi['utSpecExcel'];
type Target = {
  projectId: string;
  runId: string;
  item: number;
  save?: (name: string, blob: Blob) => void;
};

// The Excel of exactly this run and program. Disabled while it works; another
// run or program drops the answer in flight; a failure shows a message and
// saves nothing.
function ExcelButton({
  download: request,
  copy,
  testId,
  fallbackName,
  projectId,
  runId,
  item,
  save = saveBlob,
}: Target & {
  download: Download;
  copy: { download: string; busy: string; failed: string };
  testId: string;
  fallbackName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setBusy(false);
    setFailed(false);
    return () => controller.current?.abort();
  }, [projectId, runId, item]);

  async function download() {
    if (busy) return;
    const own = new AbortController();
    controller.current = own;
    setBusy(true);
    setFailed(false);
    try {
      const file = await request(projectId, runId, item, own.signal);
      if (own.signal.aborted) return;
      save(file.fileName ?? fallbackName, file.blob);
    } catch {
      if (!own.signal.aborted) setFailed(true);
    } finally {
      if (!own.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button"
        onClick={() => void download()}
        disabled={busy}
        data-testid={testId}
      >
        {busy ? copy.busy : copy.download}
      </button>
      {failed && (
        <div role="alert" className="error">
          {copy.failed}
        </div>
      )}
    </>
  );
}

// "Tải Excel (単体テスト仕様書)" of the unit test specification (TC01).
export function UtExcelButton({
  api,
  ...target
}: Target & { api: Pick<DocumentsApi, 'utSpecExcel'> }) {
  const { messages } = useLocale();
  return (
    <ExcelButton
      {...target}
      download={api.utSpecExcel}
      copy={messages.app.utExcel}
      testId="ut-excel"
      fallbackName="ut-test-spec.xlsx"
    />
  );
}

// "Tải Excel (結合テスト仕様書)" of the integration test specification (TC02).
export function ItExcelButton({
  api,
  ...target
}: Target & { api: Pick<DocumentsApi, 'itSpecExcel'> }) {
  const { messages } = useLocale();
  return (
    <ExcelButton
      {...target}
      download={api.itSpecExcel}
      copy={messages.app.itExcel}
      testId="it-excel"
      fallbackName="it-test-spec.xlsx"
    />
  );
}

// The Excel button of a package file, for the two documents that have one.
export function SpecExcelButton({
  fileName,
  api,
  ...target
}: Target & {
  fileName: string;
  api: Pick<DocumentsApi, 'utSpecExcel' | 'itSpecExcel'>;
}) {
  if (fileName === 'ut-test-spec.md')
    return <UtExcelButton api={api} {...target} />;
  if (fileName === 'it-test-spec.md')
    return <ItExcelButton api={api} {...target} />;
  return null;
}
