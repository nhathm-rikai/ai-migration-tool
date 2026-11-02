import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AnalyzeStage, Run } from '@portal/contracts';
import { ApiError } from '../../shared/api/api-error';
import { useLocale } from '../../shared/i18n/locale-context';
import { runRequestErrorMessage } from './run-messages';
import {
  isActiveRun,
  type AnalyzeRunsControl,
  type RunAction,
} from './use-analyze-runs';

// Scan card of the source step, as the demo02 drop zone without drag and
// drop: choose a folder → folder chosen (Quét source / Đổi thư mục) →
// scanning → done (opens the analysis step after a short pause) or ended
// (failed/cancelled/interrupted, with the reason and a re-run).
// Progress follows the run's real `stage` only: until the backend reports
// file counts (PF08) there is no percentage, no file count and no file list,
// and nothing advances on a timer.

// Pause on "scan done" before the analysis step opens by itself.
export const AUTO_OPEN_DELAY_MS = 1500;

export type ScanSource =
  | { status: 'loading' }
  | { status: 'demo'; folder: string }
  | { status: 'none' }
  | { status: 'ready' | 'unreadable'; folder: string };

type Phase = 'choose' | 'chosen' | 'scanning' | 'done' | 'ended';
type EndedStatus = 'failed' | 'cancelled' | 'interrupted';

function isEnded(status: Run['status']): status is EndedStatus {
  return (
    status === 'failed' || status === 'cancelled' || status === 'interrupted'
  );
}

export function ScanStage({
  runs,
  source,
  chooser,
  starting,
  onStart,
  onChangeFolder,
  onOpenResults,
}: {
  runs: AnalyzeRunsControl;
  source: ScanSource;
  // The folder form, shown instead of the chosen folder while there is no
  // readable source or the user changes it; null keeps the chosen folder.
  chooser: ReactNode;
  // A save or Start of this page is in flight.
  starting: boolean;
  // A new run, or a re-run of the ended run named.
  onStart: (retryOfRunId: string | null) => void;
  // null: the folder cannot be changed (demo project).
  onChangeFolder: (() => void) | null;
  onOpenResults: (runId: string) => void;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.sourceStep.hero;
  const runCopy = messages.runs;
  const { state, action } = runs;
  const current = state.status === 'ready' ? state.current : null;
  const activeId = current && isActiveRun(current.status) ? current.id : null;

  // Only a run seen active on this page opens the results by itself; a run
  // that had already finished before a reload never does.
  const [watched, setWatched] = useState<string | null>(null);
  useEffect(() => {
    if (activeId) setWatched(activeId);
  }, [activeId]);
  const doneId =
    current?.status === 'succeeded' && current.id === watched
      ? current.id
      : null;
  const open = useRef(onOpenResults);
  useEffect(() => {
    open.current = onOpenResults;
  }, [onOpenResults]);
  useEffect(() => {
    if (!doneId) return;
    const timer = setTimeout(() => open.current(doneId), AUTO_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doneId]);

  const phase: Phase = activeId
    ? 'scanning'
    : doneId
      ? 'done'
      : chooser
        ? 'choose'
        : current && isEnded(current.status)
          ? 'ended'
          : 'chosen';
  const pending = action.status === 'pending';
  const busy = pending || starting;
  const folder =
    source.status === 'demo' ||
    source.status === 'ready' ||
    source.status === 'unreadable'
      ? source.folder
      : null;

  let title: string;
  let help: string | null = null;
  if (phase === 'scanning' && current) {
    title =
      current.status === 'queued'
        ? copy.queuedTitle
        : current.status === 'cancelling'
          ? copy.cancellingTitle
          : copy.scanningTitle;
    help = current.stage ? copy.stage(runCopy.stage[current.stage]) : null;
  } else if (phase === 'done') {
    title = copy.doneTitle;
  } else if (phase === 'ended' && current && isEnded(current.status)) {
    title = copy.endedTitle[current.status];
    help = current.errorCode
      ? runCopy.runError[current.errorCode]
      : current.status === 'interrupted'
        ? runCopy.interruptedHelp
        : copy.cancelledHelp;
  } else if (phase === 'choose') {
    title = copy.chooseTitle;
    help = source.status === 'unreadable' ? copy.unreadableHelp : null;
  } else if (source.status === 'loading') {
    title = messages.source.loading;
  } else {
    title = copy.chosenTitle;
    help = source.status === 'demo' ? copy.demoHelp : copy.chosenHelp;
  }

  const lastSucceeded =
    phase === 'chosen' && current?.status === 'succeeded' ? current : null;

  return (
    <>
      <section
        className={`scan-card phase-${phase}`}
        aria-labelledby="scan-title"
        aria-busy={phase === 'scanning'}
      >
        {phase === 'scanning' && (
          <span className="scan-line" aria-hidden="true" />
        )}
        <div className="scan-icon" aria-hidden="true">
          <span className="scan-ring" />
          <span className="scan-ring late" />
          <span className="scan-box">
            {phase === 'scanning' ? (
              <svg viewBox="0 0 24 24" className="scan-spinner">
                <path d="M12 3a9 9 0 109 9" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <path d="M12 11v5" />
                <path d="M9.5 13.5L12 11l2.5 2.5" />
              </svg>
            )}
          </span>
        </div>
        <div className="scan-text" role="status">
          <h2 id="scan-title">{title}</h2>
          {phase === 'chosen' && folder && <FolderChip name={folder} />}
          {help && <p>{help}</p>}
          {phase === 'done' && folder && (
            <p>
              <span className="mono">{folder}</span>
            </p>
          )}
        </div>
        {phase === 'choose' && chooser}
        {phase === 'scanning' && (
          <div
            className="scan-bar indeterminate"
            role="progressbar"
            aria-label={copy.progressLabel}
          >
            <span />
          </div>
        )}
        {phase === 'done' && (
          <div className="scan-bar done" aria-hidden="true">
            <span />
          </div>
        )}
        {phase !== 'choose' && (
          <div className="scan-actions">
            {phase === 'scanning' && current ? (
              current.status !== 'cancelling' && (
                <button
                  className="button large"
                  disabled={pending}
                  onClick={() => void runs.cancel(current)}
                >
                  {pending && action.kind === 'cancel'
                    ? runCopy.cancelSending
                    : runCopy.cancel}
                </button>
              )
            ) : phase === 'done' && doneId ? (
              <button
                className="button primary large"
                onClick={() => onOpenResults(doneId)}
              >
                {copy.goNow}
              </button>
            ) : (
              <>
                <button
                  className="button primary large"
                  disabled={busy || source.status === 'loading'}
                  onClick={() =>
                    onStart(phase === 'ended' && current ? current.id : null)
                  }
                >
                  <SearchIcon />
                  {busy
                    ? runCopy.starting
                    : phase === 'ended'
                      ? runCopy.retry
                      : copy.scan}
                </button>
                {onChangeFolder && (
                  <button
                    className="button large"
                    disabled={busy}
                    onClick={onChangeFolder}
                  >
                    {copy.changeFolder}
                  </button>
                )}
                {lastSucceeded && (
                  <button
                    className="button large"
                    onClick={() => onOpenResults(lastSucceeded.id)}
                  >
                    {copy.lastResult}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {runs.connectionLost && (
          <p role="status" className="notice">
            {runCopy.connectionLost}
          </p>
        )}
        <ActionMessage
          action={action}
          uncertainStart={runs.uncertainStart}
          onResend={() => void runs.start()}
        />
      </section>
      {phase === 'scanning' && current && (
        <div className="scan-panels">
          <ScanSteps stage={current.stage} />
          <section className="scan-target" aria-labelledby="scan-target-title">
            <h3 id="scan-target-title">{copy.target}</h3>
            <dl>
              {folder && (
                <div>
                  <dt>{copy.targetFolder}</dt>
                  <dd className="mono">{folder}</dd>
                </div>
              )}
              <div>
                <dt>{copy.targetLanguage}</dt>
                <dd>VB6 · CP932</dd>
              </div>
              {current.startedAt && (
                <div>
                  <dt>{runCopy.fields.startedAt}</dt>
                  <dd>{formatDateTime(current.startedAt)}</dd>
                </div>
              )}
              <div>
                <dt>{runCopy.fields.stage}</dt>
                <dd>
                  {current.stage
                    ? runCopy.stage[current.stage]
                    : runCopy.status[current.status]}
                </dd>
              </div>
            </dl>
            <p className="scan-target-note">{copy.noFileCount}</p>
          </section>
        </div>
      )}
    </>
  );
}

function FolderChip({ name }: { name: string }) {
  return (
    <span className="folder-chip">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      </svg>
      <span className="mono">{name}</span>
    </span>
  );
}

function SearchIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

// Four steps of demo02 on the real stages: until PF08 the first two both map
// to `snapshot` (listing and copying are not reported apart).
const STEP_STAGES: readonly AnalyzeStage[] = [
  'snapshot',
  'snapshot',
  'inventory',
  'publish',
];
const STAGE_ORDER: readonly AnalyzeStage[] = [
  'snapshot',
  'inventory',
  'publish',
];

export function stepStates(
  stage: AnalyzeStage | null,
): ('done' | 'active' | 'todo')[] {
  const reached = stage === null ? -1 : STAGE_ORDER.indexOf(stage);
  return STEP_STAGES.map((step) => {
    const index = STAGE_ORDER.indexOf(step);
    if (index < reached) return 'done';
    return index === reached ? 'active' : 'todo';
  });
}

function ScanSteps({ stage }: { stage: AnalyzeStage | null }) {
  const { messages } = useLocale();
  const copy = messages.sourceStep.steps;
  const states = stepStates(stage);
  return (
    <section className="scan-steps" aria-labelledby="scan-steps-title">
      <h3 id="scan-steps-title">{copy.title}</h3>
      <ol>
        {copy.items.map((label, index) => {
          const state = states[index] ?? 'todo';
          return (
            <li key={label} className={`scan-step ${state}`}>
              <span className="scan-step-mark" aria-hidden="true">
                {state === 'done' && (
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                )}
                {state === 'active' && <span className="scan-step-spin" />}
              </span>
              {label}
              <span className="sr-only">, {copy.state[state]}</span>
            </li>
          );
        })}
      </ol>
    </section>
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
