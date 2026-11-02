import { useEffect, useState } from 'react';
import type { Project, Run } from '@portal/contracts';
import type { RunsApi } from '../../shared/api/runs-api';
import { useLocale } from '../../shared/i18n/locale-context';
import { Link, NEW_PROJECT_PATH, stepPath } from '../../app/router';
import type { ProjectsApi } from '../../shared/api/projects-api';
import { ProjectsDialog } from './projects-dialog';
import { isActiveRun } from '../jobs/use-analyze-runs';
import type { ProjectListControl } from './use-project-list';

// "Dự án gần đây" of the source step: projects of the loaded list page with
// the state of their last run, most recent activity first. Read only; a
// project whose run cannot be read says so instead of looking unanalysed.

export const RECENT_PROJECT_COUNT = 4;

type RecentStatus =
  | 'none'
  | 'active'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'unknown';

type Recent = { project: Project; run: Run | null; status: RecentStatus };

function recentStatus(run: Run | null): RecentStatus {
  if (!run) return 'none';
  if (isActiveRun(run.status)) return 'active';
  return run.status === 'succeeded' ||
    run.status === 'failed' ||
    run.status === 'cancelled' ||
    run.status === 'interrupted'
    ? run.status
    : 'unknown';
}

// Last activity: the run's last change, else the project's creation.
function activity(item: Recent): number {
  return Date.parse(item.run?.updatedAt ?? item.project.createdAt);
}

export function useRecentProjects(
  projects: readonly Project[] | null,
  runsApi: RunsApi,
  // Changes when a run of the open project starts or ends.
  version: string,
) {
  const [state, setState] = useState<Recent[] | null>(null);
  useEffect(() => {
    if (!projects) return;
    const controller = new AbortController();
    void Promise.all(
      projects.map((project) =>
        runsApi.current(project.id, controller.signal).then(
          ({ run }): Recent => ({ project, run, status: recentStatus(run) }),
          (): Recent => ({ project, run: null, status: 'unknown' }),
        ),
      ),
    ).then((items) => {
      if (controller.signal.aborted) return;
      setState(
        [...items]
          .sort((a, b) => activity(b) - activity(a))
          .slice(0, RECENT_PROJECT_COUNT),
      );
    });
    return () => controller.abort();
  }, [projects, runsApi, version]);
  return state;
}

export function RecentProjects({
  list,
  api,
  runsApi,
  openProjectId,
  version,
}: {
  list: ProjectListControl;
  api: ProjectsApi;
  runsApi: RunsApi;
  // null on the step of a new project.
  openProjectId: string | null;
  version: string;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.sourceStep.recent;
  const projects = list.state.status === 'ready' ? list.state.page.items : null;
  const items = useRecentProjects(projects, runsApi, version);
  const [showAll, setShowAll] = useState(false);
  return (
    <aside className="recent-projects" aria-labelledby="recent-title">
      <div className="recent-heading">
        <h2 id="recent-title">{copy.title}</h2>
        <span className="recent-links">
          {openProjectId !== null && (
            <Link to={NEW_PROJECT_PATH}>{copy.new}</Link>
          )}
          <button className="link-button" onClick={() => setShowAll(true)}>
            {copy.all}
          </button>
        </span>
      </div>
      {showAll && (
        <ProjectsDialog
          api={api}
          openProjectId={openProjectId}
          onClose={() => setShowAll(false)}
        />
      )}
      {list.state.status === 'error' ? (
        <p role="alert" className="error">
          {copy.failed}
        </p>
      ) : !items ? (
        <p role="status" className="muted">
          {copy.loading}
        </p>
      ) : items.length === 0 ? (
        <p className="muted">{copy.empty}</p>
      ) : (
        <ul>
          {items.map(({ project, run, status }) => (
            <li key={project.id}>
              <Link
                className={`recent-card lift status-${status}`}
                to={stepPath(project.id, 'source')}
                aria-current={project.id === openProjectId ? 'page' : undefined}
              >
                <span className="recent-row">
                  <span className="recent-avatar" aria-hidden="true">
                    {project.name.trim().slice(0, 2).toUpperCase()}
                  </span>
                  <span className="recent-text">
                    <span className="recent-name">
                      {project.name}
                      {project.mode === 'demo' && (
                        <span className="chip demo">
                          {messages.projects.demoBadge}
                        </span>
                      )}
                    </span>
                    <span className="recent-meta">
                      {copy.updated(
                        formatDateTime(run?.updatedAt ?? project.createdAt),
                      )}
                    </span>
                  </span>
                  <span className="recent-status">{copy.status[status]}</span>
                </span>
                <span className="recent-bar" aria-hidden="true">
                  <span />
                </span>
                {project.id === openProjectId && (
                  <span className="sr-only">, {copy.open}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
