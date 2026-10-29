import { useEffect, useRef, useState } from 'react';
import type { Run } from '@portal/contracts';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import type { RunsApi } from '../../shared/api/runs-api';
import { AssessmentOverview } from '../assessment/assessment-overview';
import { ApiError } from '../../shared/api/api-error';
import { useLocale } from '../../shared/i18n/locale-context';
import { runRequestErrorMessage } from './run-messages';
import {
  isActiveRun,
  useAnalyzeRuns,
  visibleHistory,
  type RunAction,
} from './use-analyze-runs';

// Start/cancel/history of the selected project's analyze runs. Opening the
// panel, reloading or switching locale only reads; nothing starts by itself.
export function AnalyzeRunPanel({
  api,
  artifactsApi,
  projectId,
  demo,
  sourceRevision,
  onOpenResults,
  onRunChange,
}: {
  api: RunsApi;
  // Without it a succeeded run shows no assessment (run-only tests).
  artifactsApi?: ArtifactsApi | undefined;
  // Given: a succeeded run links to its own results page instead of showing
  // the assessment inline.
  onOpenResults?: ((runId: string) => void) | undefined;
  projectId: string;
  // Demo projects run the fixture executor and say so.
  demo: boolean;
  // Revision a new run locks; null blocks Start (no readable source).
  sourceRevision: number | null;
  // Called when the active run changes (a run starts or ends) after the
  // first read, so the shell can follow it.
  onRunChange?: (() => void) | undefined;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.runs;
  const runs = useAnalyzeRuns(api, projectId, sourceRevision);
  // A Start whose outcome is unknown can still be resent as it was.
  const blocked = sourceRevision === null && !runs.uncertainStart;
  // `succeeded` of a demo run is labelled as demo; a local run has its own
  // inventory from the registered source (B08).
  const statusLabel = (run: Run) =>
    run.status === 'succeeded' && !demo
      ? copy.localSucceeded
      : copy.status[run.status];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, action } = runs;
  const pending = action.status === 'pending';
  const current = state.status === 'ready' ? state.current : null;
  const activeRunId =
    current && isActiveRun(current.status) ? current.id : null;
  // Undefined until the first read, so loading the panel reports nothing.
  const lastActive = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (state.status !== 'ready') return;
    if (lastActive.current !== undefined && lastActive.current !== activeRunId)
      onRunChange?.();
    lastActive.current = activeRunId;
  }, [state.status, activeRunId, onRunChange]);

  if (state.status === 'loading')
    return (
      <section className="panel run-panel" aria-labelledby="runs-title">
        <h2 id="runs-title">{copy.title}</h2>
        <p role="status">{copy.loading}</p>
      </section>
    );
  if (state.status === 'error')
    return (
      <section className="panel run-panel" aria-labelledby="runs-title">
        <h2 id="runs-title">{copy.title}</h2>
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
          {demo ? copy.title : copy.titleLocal}{' '}
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
      {blocked && !active && (
        <p className="notice" id="runs-start-blocked">
          {messages.source.startBlocked}
        </p>
      )}
      {runs.connectionLost && (
        <p role="status" className="notice">
          {copy.connectionLost}
        </p>
      )}
      <ActionMessage
        action={action}
        uncertainStart={runs.uncertainStart}
        onResend={() => void runs.start()}
      />
      <div className="form-actions">
        {!active && (
          <button
            className="button primary"
            disabled={pending || blocked}
            aria-describedby={blocked ? 'runs-start-blocked' : undefined}
            onClick={() => void runs.start()}
          >
            {pending && action.kind === 'start' ? copy.starting : copy.start}
          </button>
        )}
        {state.current && active && state.current.status !== 'cancelling' && (
          <CancelButton
            run={state.current}
            pending={pending}
            sending={pending && action.kind === 'cancel'}
            onCancel={(run) => void runs.cancel(run)}
          />
        )}
      </div>
      {shown ? (
        <RunDetail
          run={shown}
          canRetry={!active && !pending && !blocked}
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
      {shown?.status === 'succeeded' &&
        artifactsApi &&
        (onOpenResults ? (
          <div className="form-actions results-link">
            <button
              className="button primary"
              onClick={() => onOpenResults(shown.id)}
            >
              {copy.openResults}
            </button>
          </div>
        ) : (
          <AssessmentOverview
            key={shown.id}
            api={artifactsApi}
            projectId={projectId}
            runId={shown.id}
          />
        ))}
      {history.length > 0 && (
        <>
          <h3>{copy.history}</h3>
          <ul className="run-history">
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

function CancelButton({
  run,
  pending,
  sending,
  onCancel,
}: {
  run: Run;
  pending: boolean;
  sending: boolean;
  onCancel: (run: Run) => void;
}) {
  const { messages } = useLocale();
  return (
    <button className="button" disabled={pending} onClick={() => onCancel(run)}>
      {sending ? messages.runs.cancelSending : messages.runs.cancel}
    </button>
  );
}

function ActionMessage({
  action,
  uncertainStart,
  onResend,
}: {
  action: RunAction;
  uncertainStart: boolean;
  onResend: () => void;
}) {
  const { messages } = useLocale();
  const copy = messages.runs;
  if (action.status !== 'error') return null;
  if (action.kind === 'start' && uncertainStart)
    return (
      <div className="notice" role="alert">
        <p>{copy.startUncertain}</p>
        <button className="button small" onClick={onResend}>
          {copy.resend}
        </button>
      </div>
    );
  if (
    action.kind === 'cancel' &&
    action.error instanceof ApiError &&
    action.error.outcomeUnknown
  )
    return (
      <p role="alert" className="error">
        {copy.cancelUncertain}
      </p>
    );
  return (
    <p role="alert" className="error">
      {runRequestErrorMessage(action.error, messages)}
    </p>
  );
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
            <span className={`run-status status-${run.status}`} role="status">
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
