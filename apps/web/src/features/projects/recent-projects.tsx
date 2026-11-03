import { useEffect, useState } from 'react';
import type { Project, Run } from '@portal/contracts';
import type { ProjectsApi } from '../../shared/api/projects-api';
import type { RunsApi } from '../../shared/api/runs-api';
import { useLocale } from '../../shared/i18n/locale-context';
import { Link, NEW_PROJECT_PATH, stepPath } from '../../app/router';
import { isActiveRun } from '../jobs/use-analyze-runs';

// "Dự án gần đây" of step 1 (UI04): every project with the state of its last
// run, most recent activity first, a search by name and its own scroll; the
// place to reopen a project and to start a new one. Read only; a project
// whose run cannot be read says so instead of looking unanalysed.

// More than a local workspace is expected to hold; the rest is not read.
export const MAX_PROJECTS = 500;

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

type RecentState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: Recent[] };

// The API pages by ID: every page is read (bounded), then each project's
// current run.
export function useRecentProjects(
  api: ProjectsApi,
  runsApi: RunsApi,
  // Changes when a run of the open project starts or ends.
  version: string,
): RecentState {
  const [state, setState] = useState<RecentState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      const projects: Project[] = [];
      let cursor: string | null = null;
      do {
        const page = await api.list(cursor, signal);
        projects.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && projects.length < MAX_PROJECTS);
      const items = await Promise.all(
        projects.slice(0, MAX_PROJECTS).map((project) =>
          runsApi.current(project.id, signal).then(
            ({ run }): Recent => ({ project, run, status: recentStatus(run) }),
            (): Recent => ({ project, run: null, status: 'unknown' }),
          ),
        ),
      );
      return items.sort((a, b) => activity(b) - activity(a));
    })().then(
      (items) => {
        if (!signal.aborted) setState({ status: 'ready', items });
      },
      () => {
        if (!signal.aborted) setState({ status: 'error' });
      },
    );
    return () => controller.abort();
  }, [api, runsApi, version]);
  return state;
}

export function RecentProjects({
  api,
  runsApi,
  openProjectId,
  version,
}: {
  api: ProjectsApi;
  runsApi: RunsApi;
  // null on the step of a new project.
  openProjectId: string | null;
  version: string;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.sourceStep.recent;
  const state = useRecentProjects(api, runsApi, version);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const items =
    state.status === 'ready'
      ? state.items.filter(({ project }) =>
          project.name.toLocaleLowerCase().includes(needle),
        )
      : [];
  return (
    <aside className="recent-projects" aria-labelledby="recent-title">
      <div className="recent-heading">
        <h2 id="recent-title">{copy.title}</h2>
        {openProjectId !== null && (
          <Link className="button small primary" to={NEW_PROJECT_PATH}>
            {copy.new}
          </Link>
        )}
      </div>
      <label htmlFor="recent-search" className="sr-only">
        {copy.search}
      </label>
      <input
        id="recent-search"
        type="search"
        className="recent-search"
        autoComplete="off"
        placeholder={copy.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {state.status === 'error' ? (
        <p role="alert" className="error">
          {copy.failed}
        </p>
      ) : state.status === 'loading' ? (
        <p role="status" className="muted">
          {copy.loading}
        </p>
      ) : items.length === 0 ? (
        <p className="muted">{needle ? copy.noMatch : copy.empty}</p>
      ) : (
        <ul className="recent-list">
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
                      <span className="recent-title">{project.name}</span>
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
