import { useState } from 'react';
import type { Run } from '@portal/contracts';
import { useLocale } from '../../shared/i18n/locale-context';
import { runRequestErrorMessage } from './run-messages';
import {
  isActiveRun,
  visibleHistory,
  type AnalyzeRunsControl,
} from './use-analyze-runs';

// Run history of the source step (F02): every run of the project, the one
// picked with its details, a retry for a failed one and a link to the results
// of a succeeded one. Start and Cancel live on the scan card; both read the
// same run state, so nothing here starts by itself.
export function RunHistory({
  runs,
  demo,
  // false while no readable source can be locked by a retry.
  canStart,
  onOpenResults,
}: {
  runs: AnalyzeRunsControl;
  demo: boolean;
  canStart: boolean;
  onOpenResults: (runId: string) => void;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.runs;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, action } = runs;
  const pending = action.status === 'pending';
  const statusLabel = (run: Run) => runStatusLabel(run, demo, copy);

  if (state.status === 'loading')
    return (
      <section className="panel run-panel" aria-labelledby="runs-title">
        <h2 id="runs-title">{copy.history}</h2>
        <p role="status">{copy.loading}</p>
      </section>
    );
  if (state.status === 'error')
    return (
      <section className="panel run-panel" aria-labelledby="runs-title">
        <h2 id="runs-title">{copy.history}</h2>
        <p role="alert" className="error">
          {runRequestErrorMessage(state.error, messages)}
        </p>
        <button className="button" onClick={runs.refresh}>
          {copy.reload}
        </button>
      </section>
    );

  const history = visibleHistory(state.current, state.history);
  const shown =
    history.find((run) => run.id === selectedId) ?? state.current ?? null;
  const active = state.current && isActiveRun(state.current.status);
  return (
    <section className="panel run-panel" aria-labelledby="runs-title">
      <div className="section-heading">
        <h2 id="runs-title">
          {copy.history}{' '}
          {demo && <span className="badge">{messages.projects.demoBadge}</span>}
        </h2>
        <button
          className="button small"
          onClick={runs.refresh}
          disabled={pending}
        >
          {copy.reload}
        </button>
      </div>
      <p className="muted">{demo ? copy.demoNotice : copy.localNotice}</p>
      {shown ? (
        <RunDetail
          run={shown}
          canRetry={!active && !pending && canStart}
          statusLabel={statusLabel}
          onRetry={(runId) => {
            setSelectedId(null);
            void runs.retry(runId);
          }}
          formatDateTime={formatDateTime}
        />
      ) : (
        <p className="empty-state">{copy.noRun}</p>
      )}
      {shown?.status === 'succeeded' && (
        <div className="form-actions results-link">
          <button className="button" onClick={() => onOpenResults(shown.id)}>
            {copy.openResults}
          </button>
        </div>
      )}
      {history.length > 0 && (
        <>
          <ul className="run-history" aria-label={copy.history}>
            {history.map((run) => (
              <li key={run.id}>
                <button
                  className={
                    'run-history-item' +
                    (run.id === shown?.id ? ' selected' : '')
                  }
                  aria-current={run.id === shown?.id ? 'true' : undefined}
                  onClick={() => setSelectedId(run.id)}
                >
                  <span className={`run-status status-${run.status}`}>
                    {statusLabel(run)}
                  </span>
                  <span>{formatDateTime(run.createdAt)}</span>
                  <span className="mono">{run.id.slice(0, 8)}</span>
                </button>
              </li>
            ))}
          </ul>
          {state.nextCursor && (
            <button
              className="button small"
              disabled={pending}
              onClick={() => void runs.loadMore()}
            >
              {copy.loadMore}
            </button>
          )}
        </>
      )}
    </section>
  );
}

// `succeeded` of a demo run is labelled as demo; a local run has its own
// inventory from the registered source (B08).
export function runStatusLabel(
  run: Run,
  demo: boolean,
  copy: ReturnType<typeof useLocale>['messages']['runs'],
): string {
  return run.status === 'succeeded' && !demo
    ? copy.localSucceeded
    : copy.status[run.status];
}

function RunDetail({
  run,
  canRetry,
  statusLabel,
  onRetry,
  formatDateTime,
}: {
  run: Run;
  canRetry: boolean;
  statusLabel: (run: Run) => string;
  onRetry: (runId: string) => void;
  formatDateTime: (date: string) => string;
}) {
  const { messages } = useLocale();
  const copy = messages.runs;
  const retryable =
    run.status === 'failed' ||
    run.status === 'cancelled' ||
    run.status === 'interrupted';
  return (
    <div className="run-detail" aria-label={copy.current}>
      <dl className="project-metadata">
        <div>
          <dt>{copy.fields.status}</dt>
          <dd>
            <span className={`run-status status-${run.status}`}>
              {statusLabel(run)}
            </span>
          </dd>
        </div>
        {run.stage && (
          <div>
            <dt>{copy.fields.stage}</dt>
            <dd>{copy.stage[run.stage]}</dd>
          </div>
        )}
        {run.startedAt && (
          <div>
            <dt>{copy.fields.startedAt}</dt>
            <dd>{formatDateTime(run.startedAt)}</dd>
          </div>
        )}
        {run.finishedAt && (
          <div>
            <dt>{copy.fields.finishedAt}</dt>
            <dd>{formatDateTime(run.finishedAt)}</dd>
          </div>
        )}
        {run.errorCode && (
          <div>
            <dt>{copy.fields.error}</dt>
            <dd>
              {copy.runError[run.errorCode]}{' '}
              <span className="mono">{run.errorCode}</span>
            </dd>
          </div>
        )}
      </dl>
      <details className="technical">
        <summary>{copy.technical}</summary>
        <dl className="project-metadata">
          <div>
            <dt>{copy.fields.id}</dt>
            <dd className="mono">{run.id}</dd>
          </div>
          <div>
            <dt>{copy.fields.createdAt}</dt>
            <dd>{formatDateTime(run.createdAt)}</dd>
          </div>
          {run.retryOfRunId && (
            <div>
              <dt>{copy.fields.retryOf}</dt>
              <dd className="mono">{run.retryOfRunId}</dd>
            </div>
          )}
        </dl>
      </details>
      {run.status === 'interrupted' && (
        <p className="muted">{copy.interruptedHelp}</p>
      )}
      {retryable && (
        <button
          className="button"
          disabled={!canRetry}
          onClick={() => onRetry(run.id)}
        >
          {copy.retry}
        </button>
      )}
    </div>
  );
}
