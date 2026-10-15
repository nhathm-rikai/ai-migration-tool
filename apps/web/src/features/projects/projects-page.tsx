import { useState } from 'react';
import { projectsApi, type ProjectsApi } from '../../shared/api/projects-api';
import { Icon } from '../../shared/ui/icon';
import { useProjectList } from './use-project-list';
import { CreateProjectForm } from './create-project-form';
import { ProjectDetail } from './project-detail';

const stages = [
  { title: 'AI phân tích', description: 'Parser + AI Agent' },
  { title: 'Assessment Report', description: 'Kết quả phân tích' },
  { title: 'Review', description: 'SA/PM duyệt · Human Gate' },
  { title: 'Proposal', description: 'Bản nháp đề xuất' },
];

export function ProjectsPage({ api = projectsApi }: { api?: ProjectsApi }) {
  const list = useProjectList(api);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [notice, setNotice] = useState('');
  return (
    <main id="main-content" className="app-layout">
      <aside className="project-sidebar" aria-labelledby="list-title">
        <div className="sidebar-heading">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2 id="list-title">Dự án của bạn</h2>
          </div>
          <button
            className="button icon-button"
            aria-label="Làm mới dự án"
            disabled={list.state.status === 'loading'}
            onClick={list.refresh}
          >
            <Icon name="refresh" />
          </button>
        </div>
        <button
          className="button primary new-project"
          onClick={() => {
            setSelectedId(null);
            setNotice('');
          }}
        >
          <Icon name="plus" /> Tạo dự án mới
        </button>
        <nav aria-label="Cây dự án" className="project-navigation">
          {list.state.status === 'loading' && (
            <p className="sidebar-state" role="status">
              Đang tải dự án…
            </p>
          )}
          {list.state.status === 'error' && (
            <div className="sidebar-state">
              <p role="alert" className="error">
                {list.state.message}
              </p>
              <button className="button small" onClick={list.retry}>
                Thử lại danh sách
              </button>
            </div>
          )}
          {list.state.status === 'ready' && (
            <>
              {list.state.page.items.length === 0 ? (
                <div className="sidebar-state empty-state">
                  <Icon name="folder" />
                  <h3>
                    {list.cursor
                      ? 'Không còn dự án ở trang này'
                      : 'Chưa có dự án'}
                  </h3>
                  <p>Tạo dự án để bắt đầu không gian làm việc.</p>
                </div>
              ) : (
                <ul className="project-tree">
                  {list.state.page.items.map((project) => (
                    <li key={project.id}>
                      <button
                        className={
                          'project-node' +
                          (selectedId === project.id ? ' selected' : '')
                        }
                        aria-expanded={expandedIds.has(project.id)}
                        aria-controls={`project-${project.id}`}
                        onClick={() => {
                          setExpandedIds((previous) => {
                            const next = new Set(previous);
                            if (
                              selectedId === project.id &&
                              next.has(project.id)
                            )
                              next.delete(project.id);
                            else next.add(project.id);
                            return next;
                          });
                          setSelectedId(project.id);
                          setNotice('');
                        }}
                      >
                        <span className="node-chevron">
                          <Icon name="chevron" />
                        </span>
                        <Icon name="folder" />
                        <span className="node-name">{project.name}</span>
                      </button>
                      <ul
                        id={`project-${project.id}`}
                        className="project-branches"
                        hidden={!expandedIds.has(project.id)}
                      >
                        <li>
                          <button
                            className={
                              'branch' +
                              (selectedId === project.id ? ' selected' : '')
                            }
                            aria-current={
                              selectedId === project.id ? 'page' : undefined
                            }
                            onClick={() => setSelectedId(project.id)}
                          >
                            <Icon name="file" /> Tổng quan dự án
                          </button>
                        </li>
                        {stages.map((stage) => (
                          <li key={stage.title}>
                            <button
                              className="branch"
                              disabled
                              title="Chưa khả dụng"
                            >
                              <Icon name="file" />
                              {stage.title}
                              <span className="soon">Chưa có</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              <div className="list-footer">
                <span>{list.state.page.items.length} dự án trong trang</span>
                <div className="actions">
                  {list.cursor && (
                    <button className="button small" onClick={list.refresh}>
                      Về trang đầu
                    </button>
                  )}
                  {list.state.page.nextCursor && (
                    <button
                      className="button small"
                      onClick={() => {
                        if (
                          list.state.status === 'ready' &&
                          list.state.page.nextCursor
                        )
                          list.next(list.state.page.nextCursor);
                      }}
                    >
                      Trang tiếp
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> Local workspace{' '}
          <span className="chip demo">DEMO</span>
        </div>
      </aside>
      <div className="project-workspace">
        <div className="workspace-toolbar">
          <span className="breadcrumb">
            Dự án <span aria-hidden="true">/</span>{' '}
            <strong>{selectedId ? 'Tổng quan dự án' : 'Tạo dự án mới'}</strong>
          </span>
          <span className="chip demo">Dữ liệu mẫu · Fixture</span>
        </div>
        <nav aria-label="Các bước đánh giá">
          <ol className="stepper">
            {stages.map((stage, index) => (
              <li key={stage.title}>
                <button className="step" disabled>
                  <span className="step-number">{index + 1}</span>
                  <span>
                    <strong>{stage.title}</strong>
                    <small>{stage.description}</small>
                    <span className="stage-status">Chưa khả dụng</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {notice && (
          <p role="status" className="success">
            {notice}
          </p>
        )}
        {selectedId ? (
          <ProjectDetail
            key={selectedId}
            id={selectedId}
            api={api}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <CreateProjectForm
            api={api}
            onCreated={(project) => {
              setSelectedId(project.id);
              setExpandedIds((previous) => new Set([...previous, project.id]));
              setNotice('Đã tạo dự án.');
              list.refresh();
            }}
          />
        )}
        <footer className="page-footer">
          Chế độ demo · Quản lý dự án qua API local. Phân tích, review và xuất
          báo cáo chưa khả dụng.
        </footer>
      </div>
    </main>
  );
}
