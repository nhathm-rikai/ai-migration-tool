import { useEffect, useRef, useState } from 'react';
import type { DocumentsApi } from '../../shared/api/documents-api';
import { saveBlob } from '../../shared/files/save-blob';
import { useLocale } from '../../shared/i18n/locale-context';

// "Tải Excel (単体テスト仕様書)" of the unit test specification (TC01): the
// Excel of exactly this run and program. Disabled while it works; another run
// or program drops the answer in flight; a failure shows a message and saves
// nothing.
export function UtExcelButton({
  api,
  projectId,
  runId,
  item,
  save = saveBlob,
}: {
  api: Pick<DocumentsApi, 'utSpecExcel'>;
  projectId: string;
  runId: string;
  item: number;
  save?: (name: string, blob: Blob) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.app.utExcel;
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
      const file = await api.utSpecExcel(projectId, runId, item, own.signal);
      if (own.signal.aborted) return;
      save(file.fileName ?? 'ut-test-spec.xlsx', file.blob);
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
        data-testid="ut-excel"
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
