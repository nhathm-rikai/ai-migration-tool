import { useEffect, useState } from 'react';
import type { Project } from '@portal/contracts';
import type { ProjectsApi } from '../../shared/api/projects-api';
import { projectErrorMessage } from './project-messages';

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; project: Project };
export function ProjectDetail({
  id,
  api,
  onClose,
}: {
  id: string;
  api: ProjectsApi;
  onClose: () => void;
}) {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void api.get(id, controller.signal).then(
      (project) => {
        if (!controller.signal.aborted) setState({ status: 'ready', project });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            message: projectErrorMessage(error, 'get'),
          });
      },
    );
    return () => controller.abort();
  }, [api, id, retry]);
  return (
    <section className="panel detail-panel" aria-labelledby="detail-title">
      <div className="section-heading">
        <h2 id="detail-title">Chi tiết dự án</h2>
        <button className="button small" onClick={onClose}>
          Đóng chi tiết
        </button>
      </div>
      {state.status === 'loading' && <p role="status">Đang tải chi tiết…</p>}
      {state.status === 'error' && (
        <div>
          <p role="alert" className="error">
            {state.message}
          </p>
          <button
            className="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Thử lại chi tiết
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <div className="project-title">
            <span className="eyebrow">Tổng quan dự án</span>
            <h1>{state.project.name}</h1>
            <p className="muted">
              Thông tin dự án đã lưu trong không gian làm việc local.
            </p>
          </div>
          <dl className="project-metadata">
            <div>
              <dt>Mã dự án</dt>
              <dd className="mono">{state.project.id}</dd>
            </div>
            <div>
              <dt>Dữ liệu</dt>
              <dd>
                {state.project.fixtureId} <span className="badge">DEMO</span>
              </dd>
            </div>
            <div>
              <dt>Ngày tạo</dt>
              <dd>
                {new Date(state.project.createdAt).toLocaleString('vi-VN')}
              </dd>
            </div>
          </dl>
          <div className="notice">
            <strong>Sẵn sàng quản lý dự án</strong>
            <p>
              Phân tích source, review và tạo báo cáo chưa khả dụng trong bản
              này.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
