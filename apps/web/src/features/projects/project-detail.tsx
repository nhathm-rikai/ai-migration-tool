import { useEffect, useState } from 'react';
import { FIXTURE_SOURCE_REVISION, type Project } from '@portal/contracts';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import type { ProjectsApi } from '../../shared/api/projects-api';
import type { RunsApi } from '../../shared/api/runs-api';
import type { SourcesApi } from '../../shared/api/sources-api';
import { AnalyzeRunPanel } from '../jobs/analyze-run-panel';
import { SourcePanel } from '../source/source-panel';
import {
  startableRevision,
  useProjectSource,
} from '../source/use-project-source';
import { projectErrorMessage } from './project-messages';
import { useLocale } from '../../shared/i18n/locale-context';

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; project: Project };
export function ProjectDetail({
  id,
  project,
  api,
  runsApi,
  sourcesApi,
  artifactsApi,
  onOpenResults,
  onProgress,
  onClose,
}: {
  id: string;
  // Already loaded by the caller: shown without reading it again.
  project?: Project | undefined;
  api: ProjectsApi;
  // Called after a source save or a finished run, so step marks re-read.
  onProgress?: (() => void) | undefined;
  // Opens a succeeded run's results page; without it they show inline.
  onOpenResults?: ((runId: string) => void) | undefined;
  // Without it the analyze runs panel is not shown (Projects-only tests).
  runsApi?: RunsApi | undefined;
  // Without it a local project shows no source and cannot start runs.
  sourcesApi?: SourcesApi | undefined;
  // Without it succeeded runs show no assessment overview.
  artifactsApi?: ArtifactsApi | undefined;
  onClose: () => void;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.projects.detail;
  const [state, setState] = useState<DetailState>(
    project ? { status: 'ready', project } : { status: 'loading' },
  );
  const [retry, setRetry] = useState(0);
  const preloaded = project !== undefined;
  useEffect(() => {
    if (preloaded) return;
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
  }, [api, id, retry, preloaded]);
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
          {/* The page header names the project; this keeps the summary. */}
          <p className="muted project-title">{copy.description}</p>
          <dl className="project-metadata">
            <div>
              <dt>{copy.data}</dt>
              <dd>
                {state.project.mode === 'demo' ? (
                  <>
                    {state.project.fixtureId}{' '}
                    <span className="badge">{messages.projects.demoBadge}</span>
                  </>
                ) : (
                  <>
                    {messages.projects.localData}{' '}
                    <span className="badge">
                      {messages.projects.localBadge}
                    </span>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>{copy.createdAt}</dt>
              <dd>{formatDateTime(state.project.createdAt)}</dd>
            </div>
          </dl>
          <details className="technical">
            <summary>{copy.technical}</summary>
            <dl className="project-metadata">
              <div>
                <dt>{copy.id}</dt>
                <dd className="mono">{state.project.id}</dd>
              </div>
            </dl>
          </details>
          {state.project.mode === 'demo' && (
            <div className="notice">
              <strong>{copy.ready}</strong>
              <p>{copy.unavailable}</p>
            </div>
          )}
          {state.project.mode === 'demo' ? (
            runsApi && (
              <AnalyzeRunPanel
                api={runsApi}
                artifactsApi={artifactsApi}
                onOpenResults={onOpenResults}
                onRunSettled={onProgress}
                projectId={state.project.id}
                demo
                sourceRevision={FIXTURE_SOURCE_REVISION}
              />
            )
          ) : sourcesApi ? (
            <SourceAndRuns
              projectId={state.project.id}
              runsApi={runsApi}
              sourcesApi={sourcesApi}
              artifactsApi={artifactsApi}
              onOpenResults={onOpenResults}
              onProgress={onProgress}
            />
          ) : (
            runsApi && (
              <AnalyzeRunPanel
                api={runsApi}
                artifactsApi={artifactsApi}
                onOpenResults={onOpenResults}
                onRunSettled={onProgress}
                projectId={state.project.id}
                demo={false}
                sourceRevision={null}
              />
            )
          )}
        </>
      )}
    </section>
  );
}

// Source registration and runs of a local project: a run may start only on a
// registered, readable source and names the revision shown here.
function SourceAndRuns({
  projectId,
  runsApi,
  sourcesApi,
  artifactsApi,
  onOpenResults,
  onProgress,
}: {
  projectId: string;
  runsApi?: RunsApi | undefined;
  sourcesApi: SourcesApi;
  artifactsApi?: ArtifactsApi | undefined;
  onOpenResults?: ((runId: string) => void) | undefined;
  onProgress?: (() => void) | undefined;
}) {
  const source = useProjectSource(sourcesApi, projectId);
  const saved = source.save.status === 'saved';
  useEffect(() => {
    if (saved) onProgress?.();
  }, [saved, onProgress]);
  return (
    <>
      <SourcePanel control={source} />
      {runsApi && (
        <AnalyzeRunPanel
          api={runsApi}
          artifactsApi={artifactsApi}
          onOpenResults={onOpenResults}
          onRunSettled={onProgress}
          projectId={projectId}
          demo={false}
          sourceRevision={startableRevision(source.state)}
        />
      )}
    </>
  );
}
