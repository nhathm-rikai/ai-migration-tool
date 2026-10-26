import { useEffect, useState } from 'react';
import type { Project } from '@portal/contracts';
import type { ProjectsApi } from '../../shared/api/projects-api';
import type { RunsApi } from '../../shared/api/runs-api';
import { AnalyzeRunPanel } from '../jobs/analyze-run-panel';
import { projectErrorMessage } from './project-messages';
import { useLocale } from '../../shared/i18n/locale-context';

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; project: Project };
export function ProjectDetail({
  id,
  api,
  runsApi,
  onClose,
}: {
  id: string;
  api: ProjectsApi;
  // Without it the analyze runs panel is not shown (Projects-only tests).
  runsApi?: RunsApi | undefined;
  onClose: () => void;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.projects.detail;
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
            error,
          });
      },
    );
    return () => controller.abort();
  }, [api, id, retry]);
  return (
    <section className="panel detail-panel" aria-labelledby="detail-title">
      <div className="section-heading">
        <h2 id="detail-title">{copy.title}</h2>
        <button className="button small" onClick={onClose}>
          {copy.close}
        </button>
      </div>
      {state.status === 'loading' && <p role="status">{copy.loading}</p>}
      {state.status === 'error' && (
        <div>
          <p role="alert" className="error">
            {projectErrorMessage(state.error, 'get', messages.errors)}
          </p>
          <button
            className="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            {copy.retry}
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <div className="project-title">
            <span className="eyebrow">{messages.projects.overview}</span>
            <h1>{state.project.name}</h1>
            <p className="muted">{copy.description}</p>
          </div>
          <dl className="project-metadata">
            <div>
              <dt>{copy.id}</dt>
              <dd className="mono">{state.project.id}</dd>
            </div>
            <div>
              <dt>{copy.data}</dt>
              <dd>
                {state.project.fixtureId}{' '}
                <span className="badge">{messages.projects.demoBadge}</span>
              </dd>
            </div>
            <div>
              <dt>{copy.createdAt}</dt>
              <dd>{formatDateTime(state.project.createdAt)}</dd>
            </div>
          </dl>
          <div className="notice">
            <strong>{copy.ready}</strong>
            <p>{copy.unavailable}</p>
          </div>
          {runsApi && (
            <AnalyzeRunPanel api={runsApi} projectId={state.project.id} />
          )}
        </>
      )}
    </section>
  );
}
