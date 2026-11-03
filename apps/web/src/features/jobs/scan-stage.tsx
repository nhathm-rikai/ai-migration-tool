import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  AnalyzeStage,
  Run,
  RunProgress,
  RunProgressPhase,
} from '@portal/contracts';
import { ApiError } from '../../shared/api/api-error';
import { useLocale } from '../../shared/i18n/locale-context';
import { runRequestErrorMessage } from './run-messages';
import {
  isActiveRun,
  type AnalyzeRunsControl,
  type RunAction,
} from './use-analyze-runs';
import { useFileFeed } from './use-file-feed';

// Scan card of the source step, as the demo02 drop zone without drag and
// drop: choose a folder → folder chosen (Quét source / Đổi thư mục) →
// scanning → done (opens the analysis step after a short pause) or ended
// (failed/cancelled/interrupted, with the reason and a re-run).
// Progress is what the backend reports (PF08 `progress`: one share for the
// whole run, files, bytes, latest relative paths). Without it, or while the
// folder is still being listed (no total yet), the bar runs without a number
// and the steps follow `stage`; nothing advances on a timer, and the share
// shown never goes down within a run.

// The spinning arc in the icon while scanning is hidden for now (user
// request, 03/11/2026): the folder icon stays. Set to true to bring it back.
const SHOW_SCAN_SPINNER = false;

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
  picking = false,
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
  // null: the folder cannot be changed (demo project). Opens the dialog.
  onChangeFolder: (() => void) | null;
  // The folder dialog is open.
  picking?: boolean;
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
  // Per-file progress (PF08), only while the backend reports it; the share
  // shown never goes down within a run.
  const progress = phase === 'scanning' ? (current?.progress ?? null) : null;
  const highest = useRef<{ runId: string; value: number } | null>(null);
  let percent: number | null = null;
  if (progress && current && progress.filesTotal !== null) {
    const value = Math.floor(progressShare(progress) * 100);
    const previous =
      highest.current?.runId === current.id ? highest.current.value : 0;
    percent = Math.max(value, previous);
  }
  useEffect(() => {
    if (current && percent !== null)
      highest.current = { runId: current.id, value: percent };
  });
  const demo = source.status === 'demo';
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
            {SHOW_SCAN_SPINNER && phase === 'scanning' ? (
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
          <h2 id="scan-title">
            {title}
            {percent !== null && (
              <span className="scan-percent"> {percent}%</span>
            )}
          </h2>
          {phase === 'chosen' && folder && <FolderChip name={folder} />}
          {help && <p>{help}</p>}
          {phase === 'done' && folder && (
            <p>
              <span className="mono">{folder}</span>
            </p>
          )}
        </div>
        {phase === 'choose' && chooser}
        {phase === 'scanning' &&
          (percent !== null && progress ? (
            <div className="scan-meter">
              <div
                className="scan-bar determinate"
                role="progressbar"
                aria-label={copy.progressDone}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <div className="scan-counts">
                <span>
                  {copy.files(filesOfPhase(progress), progress.filesTotal ?? 0)}
                </span>
                <span>
                  {copy.megabytes(formatMegabytes(progress.bytesDone))}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="scan-bar indeterminate"
              role="progressbar"
              aria-label={copy.progressLabel}
            >
              <span />
            </div>
          ))}
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
                    {picking
                      ? messages.sourceStep.form.picking
                      : copy.changeFolder}
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
          <ScanSteps stage={current.stage} phase={progress?.phase ?? null} />
          {progress && progress.recentPaths.length > 0 ? (
            <section className="scan-files" aria-labelledby="scan-files-title">
              <h3 id="scan-files-title">
                {copy.readingFiles}
                {demo && (
                  <span className="chip demo">
                    {messages.projects.demoBadge}
                  </span>
                )}
              </h3>
              <FileFeed runId={current.id} paths={progress.recentPaths} />
            </section>
          ) : (
            <section
              className="scan-target"
              aria-labelledby="scan-target-title"
            >
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
              {!progress && (
                <p className="scan-target-note">{copy.noFileCount}</p>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}

// Share of the run done (UI-DEMO02-SCOPE §2b.2), as the backend computes it.
export function progressShare(progress: RunProgress): number {
  if (progress.phase === 'publish') return 1;
  if (!progress.filesTotal) return 0;
  return Math.min(
    1,
    (progress.filesSnapshotted + progress.filesAnalyzed) /
      (2 * progress.filesTotal),
  );
}

// Files done in the current phase, for "n / total file".
function filesOfPhase(progress: RunProgress): number {
  if (progress.phase === 'inventory') return progress.filesAnalyzed;
  if (progress.phase === 'publish') return progress.filesTotal ?? 0;
  return progress.filesSnapshotted;
}

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : 'file';
}

// The latest files read, one line after the other (see use-file-feed.ts).
function FileFeed({
  runId,
  paths,
}: {
  runId: string;
  paths: readonly string[];
}) {
  const lines = useFileFeed(runId, paths);
  return (
    <ul>
      {lines.map(({ key, path }) => (
        <li key={key}>
          <span className={`file-ext ext-${extensionOf(path)}`}>
            {extensionOf(path)}
          </span>
          <span className="file-path">{path}</span>
        </li>
      ))}
    </ul>
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

const PHASE_STEP: Record<RunProgressPhase, number> = {
  listing: 0,
  snapshot: 1,
  inventory: 2,
  publish: 3,
};

// The four steps: by the reported phase when the backend sends progress,
// else by the stage (the first two both follow `snapshot`).
export function stepStates(
  stage: AnalyzeStage | null,
  phase: RunProgressPhase | null = null,
): ('done' | 'active' | 'todo')[] {
  if (phase !== null) {
    const active = PHASE_STEP[phase];
    return [0, 1, 2, 3].map((index) =>
      index < active ? 'done' : index === active ? 'active' : 'todo',
    );
  }
  const reached = stage === null ? -1 : STAGE_ORDER.indexOf(stage);
  return STEP_STAGES.map((step) => {
    const index = STAGE_ORDER.indexOf(step);
    if (index < reached) return 'done';
    return index === reached ? 'active' : 'todo';
  });
}

function ScanSteps({
  stage,
  phase,
}: {
  stage: AnalyzeStage | null;
  phase: RunProgressPhase | null;
}) {
  const { messages } = useLocale();
  const copy = messages.sourceStep.steps;
  const states = stepStates(stage, phase);
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
