import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  DOCUMENT_LANGUAGES,
  RUNNER_MODELS,
  SPEC_DOCUMENT_IDS,
  documentsToGenerate,
  type AgentModel,
  type DocumentLanguage,
  type DocumentLogEntry,
  type DocumentRun,
  type PackageFileContent,
  type SpecDocumentId,
  type StepCount,
} from '@portal/contracts';
import { Link, stepPath } from '../../app/router';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import type { DocumentsApi } from '../../shared/api/documents-api';
import { useLocale } from '../../shared/i18n/locale-context';
import type { Messages } from '../../shared/i18n/vi';
import { useRunAssessment } from '../assessment/use-run-assessment';
import { isActiveRun } from '../jobs/use-analyze-runs';
import { hasErrorCode, runRequestErrorMessage } from '../jobs/run-messages';
import { useDocumentRun } from './use-document-run';
import { downloadMarkdown } from './download-markdown';

// The Markdown renderer is only needed once a document is opened.
const MarkdownView = lazy(() =>
  import('./markdown-view').then((module) => ({
    default: module.MarkdownView,
  })),
);

// Step 3 (docs/specification-design, "Flow nghiệp vụ trên Portal"): the
// program comes from the analysis screen (?program=); pick the documents to
// write and the agent writes that program's package. Layout follows the
// step 3 prototype.

function RerunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Tag of a log line, read from what the line is (prototype agent.log).
type LogTag =
  'INIT' | 'READ' | 'GREP' | 'PLAN' | 'WRITE' | 'WARN' | 'CHECK' | 'DONE';

function logTag(entry: DocumentLogEntry): LogTag {
  if (entry.stream === 'stderr') return 'WARN';
  if (entry.stream === 'agent') return 'PLAN';
  const text = entry.text;
  if (/^(init|start)\b/.test(text)) return 'INIT';
  if (/^Grep\b/.test(text)) return 'GREP';
  if (/^(Read|Glob)\b|^\$ /.test(text)) return 'READ';
  if (/^write\b/.test(text)) return 'WRITE';
  if (/^done\b/.test(text)) return 'DONE';
  if (/lockdown|fail|error|unavailable|not available/i.test(text))
    return 'WARN';
  return 'CHECK';
}

function logTime(at: string): string {
  const date = new Date(at);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function DocIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

function requestError(error: unknown, messages: Messages): string {
  const own = messages.documents.requestErrors;
  if (hasErrorCode(error, 'ANALYSIS_REQUIRED')) return own.ANALYSIS_REQUIRED;
  if (hasErrorCode(error, 'PROJECT_MODE_CONFLICT'))
    return messages.documents.demoNoSource;
  if (hasErrorCode(error, 'DOCUMENT_NOT_FOUND')) return own.DOCUMENT_NOT_FOUND;
  return runRequestErrorMessage(error, messages);
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

// A number that moves smoothly to its target (the progress ring), so a
// poll that jumps by several steps reads as a steady climb.
function useTweened(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      current.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = from + (target - from) * (1 - (1 - t) ** 3);
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

// Elapsed time of the run, ticking while it is active.
function useElapsed(run: DocumentRun | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  const active = run !== null && isActiveRun(run.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  if (!run?.startedAt) return null;
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  return formatElapsed(end - Date.parse(run.startedAt));
}

type Viewing =
  | { status: 'loading'; item: number; file: string }
  | { status: 'ready'; item: number; file: PackageFileContent }
  | { status: 'error'; item: number; file: string; error: unknown };

export function DocumentsStep({
  projectId,
  program,
  projectMode,
  analysis,
  onRetryAnalysis,
  documentsWritten = false,
  onDocumentsChanged,
  api,
  artifactsApi,
}: {
  projectId: string;
  // Program chosen on the analysis screen (?program=); null = none.
  program: string | null;
  // Demo projects have no source files to read.
  projectMode: 'demo' | 'local';
  // Latest succeeded analysis of the project; runId null = none yet.
  analysis:
    { status: 'loading' | 'error' } | { status: 'ready'; runId: string | null };
  onRetryAnalysis: () => void;
  // Stepper mark, and how to read it again once the latest run says otherwise.
  documentsWritten?: boolean;
  onDocumentsChanged?: () => void;
  api: DocumentsApi;
  artifactsApi: ArtifactsApi;
}) {
  if (analysis.status === 'ready' && analysis.runId)
    return (
      <DocumentsWorkspace
        projectId={projectId}
        program={program}
        projectMode={projectMode}
        analysisRunId={analysis.runId}
        documentsWritten={documentsWritten}
        onDocumentsChanged={onDocumentsChanged}
        api={api}
        artifactsApi={artifactsApi}
      />
    );
  return (
    <AnalysisGate
      projectId={projectId}
      status={analysis.status}
      onRetry={onRetryAnalysis}
    />
  );
}

function AnalysisGate({
  projectId,
  status,
  onRetry,
}: {
  projectId: string;
  status: 'loading' | 'error' | 'ready';
  onRetry: () => void;
}) {
  const { messages } = useLocale();
  const copy = messages.documents;
  if (status === 'loading') return <p role="status">{copy.loading}</p>;
  if (status === 'error')
    return (
      <div>
        <p role="alert" className="error">
          {messages.shell.analysis.loadFailed}
        </p>
        <button className="button" onClick={onRetry}>
          {messages.shell.retry}
        </button>
      </div>
    );
  return (
    <section className="panel empty-panel" aria-labelledby="doc-need-analysis">
      <h2 id="doc-need-analysis">{copy.needAnalysis.title}</h2>
      <p className="muted">{copy.needAnalysis.help}</p>
      <div className="form-actions">
        <Link className="button primary" to={stepPath(projectId, 'analysis')}>
          {copy.needAnalysis.action}
        </Link>
      </div>
    </section>
  );
}

function DocumentsWorkspace({
  projectId,
  program: chosenProgram,
  projectMode,
  analysisRunId,
  documentsWritten,
  onDocumentsChanged,
  api,
  artifactsApi,
}: {
  projectId: string;
  program: string | null;
  projectMode: 'demo' | 'local';
  analysisRunId: string;
  documentsWritten: boolean;
  onDocumentsChanged: (() => void) | undefined;
  api: DocumentsApi;
  artifactsApi: ArtifactsApi;
}) {
  const { messages, locale } = useLocale();
  const copy = messages.documents;
  const documents = useDocumentRun(api, projectId);
  const inventory = useRunAssessment(artifactsApi, projectId, analysisRunId);
  const { state, action } = documents;
  const [selectedDocs, setSelectedDocs] = useState<ReadonlySet<SpecDocumentId>>(
    () => new Set<SpecDocumentId>(['business-rules']),
  );
  const [model, setModel] = useState<AgentModel>('sonnet');
  const [language, setLanguage] = useState<DocumentLanguage>(
    locale === 'ja' ? 'ja' : 'vi',
  );
  const [viewing, setViewing] = useState<Viewing | null>(null);

  const latest = state.status === 'ready' ? state.run : null;
  // An ended run that disagrees with the stepper mark: read the mark again.
  const latestEnded =
    latest && !isActiveRun(latest.status) ? latest.status : null;
  useEffect(() => {
    if (latestEnded && (latestEnded === 'succeeded') !== documentsWritten)
      onDocumentsChanged?.();
  }, [latestEnded, documentsWritten, onDocumentsChanged]);
  // Without ?program= the screen shows the program of the latest run.
  const programKey = chosenProgram ?? latest?.config.programs[0] ?? null;
  // The project's latest run belongs to this screen only when it was for the
  // same program; another program's active run still blocks Start.
  const run =
    latest && latest.config.programs[0] === programKey ? latest : null;
  const otherActive =
    latest && !run && isActiveRun(latest.status) ? latest : null;
  // Coming back to the screen shows the choices of this program's latest run;
  // later changes stay until another run appears.
  const restoredConfig = run?.config ?? null;
  const restoredRunId = run?.id ?? null;
  useEffect(() => {
    if (!restoredConfig) return;
    setSelectedDocs(new Set(restoredConfig.selected));
    setModel(restoredConfig.model);
    setLanguage(restoredConfig.outputLanguage);
    // Only a different run restores: polling returns new config objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredRunId]);
  const program = useMemo(() => {
    if (inventory.state.status !== 'ready' || programKey === null)
      return undefined;
    const found = inventory.state.artifact.payload.programs.find(
      (entry) => entry.projectPath === programKey,
    );
    return found
      ? {
          key: found.projectPath,
          name:
            found.name ??
            found.projectPath.split(/[\\/]/).at(-1) ??
            found.projectPath,
          forms: found.members.filter(
            (member) => member.kind === 'form' && !member.shared,
          ).length,
          files: found.members.filter((member) => !member.shared).length,
          shared: found.members.filter((member) => member.shared).length,
        }
      : null;
  }, [inventory.state, programKey]);
  const chosenDocs = SPEC_DOCUMENT_IDS.filter((id) => selectedDocs.has(id));
  const generated = documentsToGenerate(chosenDocs);
  const companions = generated.filter((id) => !selectedDocs.has(id));
  const active = run !== null && isActiveRun(run.status);
  const recovery =
    state.status === 'ready' && state.runtime.status === 'recovery_required';
  const runner = state.status === 'ready' ? state.runner : null;
  const models: readonly AgentModel[] = runner
    ? RUNNER_MODELS[runner]
    : ['default'];
  const effectiveModel = models.includes(model)
    ? model
    : (models[0] ?? 'default');

  const elapsed = useElapsed(run);
  // One program per run: its documents are the rows of the progress card.
  const item = run?.items[0] ?? null;
  // Before the agent starts (queued, or a run from before live progress)
  // the rows come from the run's locked documents, else the selection.
  const rows: {
    name: string;
    status: 'pending' | 'writing' | 'written';
    sections?: StepCount;
  }[] =
    item?.documents ??
    (item && item.files.length > 0
      ? item.files.map((file) => ({
          name: file.name,
          status: 'written' as const,
        }))
      : (run?.config.generated ?? generated).map((id) => ({
          name: `${id}.md`,
          status: 'pending' as const,
        })));
  const published = item?.status === 'succeeded';
  const agentBusy =
    item?.status === 'running' && !rows.some((row) => row.status === 'writing');
  const total = rows.length;
  const done = published
    ? total
    : rows.filter((row) => row.status === 'written').length;
  // Known steps only (FE-02): files the task names that were opened, and
  // template sections written. A succeeded package is 100%.
  const reading = item?.reading;
  const stepTotal =
    (reading?.total ?? 0) +
    rows.reduce((sum, row) => sum + (row.sections?.total ?? 1), 0);
  const stepDone = published
    ? stepTotal
    : (reading?.done ?? 0) +
      rows.reduce(
        (sum, row) =>
          sum +
          (row.status === 'written'
            ? (row.sections?.total ?? 1)
            : (row.sections?.done ?? 0)),
        0,
      );
  const percentTarget =
    run && stepTotal > 0 ? Math.floor((stepDone / stepTotal) * 100) : 0;
  const percent = useTweened(percentTarget);
  // Reading bar of the program: full once the first document is written.
  const readingShare = rows.some((row) => row.status !== 'pending')
    ? 1
    : reading && reading.total > 0
      ? reading.done / reading.total
      : null;
  const filesWritten = run
    ? run.items.reduce((sum, item) => sum + item.files.length, 0)
    : 0;

  function toggleDoc(id: SpecDocumentId) {
    setSelectedDocs((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // A new run of this program with the current choices (also "Chạy lại").
  function startRun() {
    setViewing(null);
    void documents.start({
      analysisRunId,
      programs: program ? [program.key] : [],
      documents: chosenDocs,
      model: effectiveModel,
      outputLanguage: language,
    });
  }

  async function view(item: number, file: string) {
    if (!run) return;
    setViewing({ status: 'loading', item, file });
    try {
      const content = await api.packageFile(
        projectId,
        run.id,
        item,
        file,
        new AbortController().signal,
      );
      setViewing({ status: 'ready', item, file: content });
    } catch (error) {
      setViewing({ status: 'error', item, file, error });
    }
  }

  if (state.status === 'loading') return <p role="status">{copy.loading}</p>;
  if (state.status === 'error')
    return (
      <div>
        <p role="alert" className="error">
          {copy.loadFailed}
        </p>
        <button className="button" onClick={documents.refresh}>
          {messages.shell.retry}
        </button>
      </div>
    );

  const title = !run
    ? copy.readyTitle(program?.name ?? '')
    : copy.runTitles[run.status](done, total);
  // A real agent has no source to read in a demo project.
  const demoBlocked =
    projectMode === 'demo' && runner !== null && runner !== 'fake';
  const canStart =
    !demoBlocked &&
    !active &&
    !otherActive &&
    !recovery &&
    Boolean(program) &&
    chosenDocs.length > 0 &&
    action.status !== 'pending';
  const viewingName =
    viewing === null
      ? ''
      : viewing.status === 'ready'
        ? viewing.file.name
        : viewing.file;
  const viewingProgram =
    viewing && run ? (run.items[viewing.item]?.name ?? '') : '';

  return (
    <div className="documents">
      <section className="documents-config" aria-label={copy.configLabel}>
        <section className="doc-card doc-program" aria-labelledby="doc-program">
          <div className="documents-heading">
            <h2 id="doc-program">{copy.programTitle}</h2>
            <Link to={stepPath(projectId, 'analysis')}>
              {programKey ? copy.changeProgram : copy.chooseProgram}
            </Link>
          </div>
          {programKey === null ? (
            <p className="muted">{copy.noProgram}</p>
          ) : program === undefined ? (
            inventory.state.status === 'loading' ? (
              <p role="status" className="muted">
                {copy.programsLoading}
              </p>
            ) : (
              <p role="alert" className="error">
                {copy.programsFailed}
              </p>
            )
          ) : program === null ? (
            <p role="alert" className="error">
              {copy.programMissing(programKey)}
            </p>
          ) : (
            <div className="program-card">
              <strong>{program.name}</strong>
              <span className="program-path mono">{program.key}</span>
              <span className="program-forms">
                {copy.programFacts(
                  program.files,
                  program.forms,
                  program.shared,
                )}
              </span>
            </div>
          )}
        </section>
        <fieldset className="doc-card doc-templates" disabled={active}>
          <legend className="documents-heading">
            <h2>{copy.documentsTitle}</h2>
            <span>
              {copy.documentsCount(chosenDocs.length, SPEC_DOCUMENT_IDS.length)}
            </span>
          </legend>
          {SPEC_DOCUMENT_IDS.map((id) => {
            const doc = copy.specDocs[id];
            const pulled = companions.includes(id);
            return (
              <label
                key={id}
                className={`template-card lift${selectedDocs.has(id) || pulled ? ' selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedDocs.has(id)}
                  onChange={() => toggleDoc(id)}
                />
                <span className={`template-icon tone-${id}`}>
                  <DocIcon />
                </span>
                <span className="template-text">
                  <strong>{doc.name}</strong>
                  <span>{doc.detail}</span>
                </span>
                <span className="template-format">
                  {pulled ? copy.companion : `${id}.md`}
                </span>
              </label>
            );
          })}
        </fieldset>
        <fieldset className="doc-card" disabled={active}>
          <legend>
            <h2>{copy.agentTitle}</h2>
          </legend>
          <div className="agent-fields">
            <label>
              {copy.model}
              <select
                value={effectiveModel}
                onChange={(event) => setModel(event.target.value as AgentModel)}
              >
                {models.map((value) => (
                  <option key={value} value={value}>
                    {value === 'default' ? copy.defaultModel : value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy.outputLanguage}
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as DocumentLanguage)
                }
              >
                {DOCUMENT_LANGUAGES.map((value) => (
                  <option key={value} value={value}>
                    {copy.languages[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {runner === 'fake' && (
            <p className="generate-note">{copy.fakeRunner}</p>
          )}
          {runner === 'codex-cli' && (
            <p className="generate-note">{copy.codexRunner}</p>
          )}
        </fieldset>
      </section>
      <section className="documents-run" aria-label={copy.runLabel}>
        <div className="doc-card generate-summary">
          <div
            className="generate-ring"
            style={{
              background: `conic-gradient(var(--brand) ${percent * 3.6}deg, #e3eaf2 0deg)`,
              transition: 'none',
            }}
            role="img"
            aria-label={copy.ringLabel(done, total)}
          >
            <div>
              {published ? (
                <strong className="ring-check" aria-hidden="true">
                  ✓
                </strong>
              ) : (
                <strong>{Math.round(percent)}%</strong>
              )}
              <span>{run ? copy.runState[run.status] : copy.ready}</span>
            </div>
          </div>
          <div className="generate-text">
            <h2 id="doc-run">{title}</h2>
            <div className="generate-stats">
              <span>
                {copy.elapsed}{' '}
                <span className="mono">{elapsed ?? '0m 00s'}</span>
              </span>
              <span>
                {copy.tokens}{' '}
                <span className="mono">
                  {run
                    ? (run.inputTokens + run.outputTokens).toLocaleString(
                        locale,
                      )
                    : 0}
                </span>
              </span>
              <span>
                {copy.filesWritten} <span className="mono">{filesWritten}</span>
              </span>
            </div>
            {run?.status === 'failed' && run.errorCode && (
              <p role="alert" className="generate-note">
                {copy.runErrors[run.errorCode]}
              </p>
            )}
            {demoBlocked && (
              <p role="status" className="generate-note">
                {copy.demoNoSource}
              </p>
            )}
            {otherActive && (
              <p role="status" className="generate-note">
                {copy.otherActive(otherActive.items[0]?.name ?? '')}{' '}
                <Link
                  to={`${stepPath(projectId, 'documents')}?program=${encodeURIComponent(otherActive.config.programs[0] ?? '')}`}
                >
                  {copy.openOther}
                </Link>
              </p>
            )}
            {recovery && (
              <p role="alert" className="generate-note">
                {copy.recovery}
              </p>
            )}
            {documents.connectionLost && (
              <p role="status" className="generate-note">
                {copy.connectionLost}
              </p>
            )}
            {action.status === 'error' && (
              <p role="alert" className="generate-note">
                {documents.uncertainStart
                  ? copy.startUnknown
                  : requestError(action.error, messages)}
              </p>
            )}
          </div>
          <div className="generate-actions">
            {active && run ? (
              <button
                type="button"
                className="button generate-start generate-stop"
                disabled={
                  run.status === 'cancelling' || action.status === 'pending'
                }
                onClick={() => void documents.cancel(run)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                {run.status === 'cancelling' ? copy.cancelling : copy.cancel}
              </button>
            ) : run?.status === 'succeeded' && program ? (
              <>
                <Link
                  className="button primary generate-start pop-in"
                  to={`${stepPath(projectId, 'review')}?program=${encodeURIComponent(program.key)}`}
                >
                  {copy.goReview}
                  <ArrowIcon />
                </Link>
                <button
                  type="button"
                  className="button generate-start"
                  disabled={!canStart}
                  onClick={startRun}
                >
                  {action.status === 'pending' && action.kind === 'start'
                    ? copy.starting
                    : copy.rerun}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button primary generate-start"
                disabled={!canStart}
                onClick={startRun}
              >
                {run ? (
                  <RerunIcon />
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M7 4l13 8-13 8z" />
                  </svg>
                )}
                {action.status === 'pending' && action.kind === 'start'
                  ? copy.starting
                  : run
                    ? copy.rerun
                    : copy.start}
              </button>
            )}
          </div>
        </div>
        <div className="doc-card doc-queue" aria-label={copy.queueTitle}>
          {!run && (!program || chosenDocs.length === 0) ? (
            <p className="doc-queue-empty">{copy.noneSelected}</p>
          ) : (
            <>
              {item && (
                <p className="queue-program">
                  <strong>{item.name}</strong>
                  <span>
                    {item.status === 'failed' && item.errorCode
                      ? copy.runErrors[item.errorCode]
                      : agentBusy
                        ? rows.every((row) => row.status === 'pending')
                          ? copy.reading
                          : copy.working
                        : copy.itemStatus[item.status]}
                  </span>
                </p>
              )}
              {/* Reading phase: files the task names that the agent opened.
                  Without counts (older run) the bar is indeterminate. */}
              {item?.status === 'running' && (
                <span
                  className={`program-working${readingShare === null && agentBusy ? ' indeterminate' : ''}`}
                  aria-hidden="true"
                >
                  <span
                    style={
                      readingShare === null
                        ? undefined
                        : { width: `${Math.round(readingShare * 100)}%` }
                    }
                  />
                </span>
              )}
              {item?.status === 'running' && runner === 'codex-cli' && (
                <p className="queue-hint">{copy.codexProgress}</p>
              )}
              <ul>
                {rows.map((row) => {
                  const state = published
                    ? 'done'
                    : row.status !== 'pending'
                      ? row.status
                      : run && !active
                        ? 'notWritten'
                        : 'pending';
                  return (
                    <li key={row.name} className={`queue-${state}`}>
                      <span className="queue-dot" aria-hidden="true">
                        {state === 'done' || state === 'written' ? (
                          <span className="queue-check">✓</span>
                        ) : state === 'writing' ? (
                          <span className="queue-spin" />
                        ) : (
                          <span />
                        )}
                      </span>
                      <span className="queue-body">
                        <span className="queue-line">
                          <strong>
                            {copy.specDocs[
                              row.name.replace(/\.md$/, '') as SpecDocumentId
                            ]?.name ?? row.name}
                          </strong>
                          <span className="queue-state">
                            {copy.docStatus[state]}
                            {state === 'writing' && (
                              <span className="queue-dots" aria-hidden="true">
                                <i />
                                <i />
                                <i />
                              </span>
                            )}
                            {state === 'writing' && row.sections && (
                              <span className="mono">
                                {Math.round(
                                  (row.sections.done /
                                    Math.max(row.sections.total, 1)) *
                                    100,
                                )}
                                %
                              </span>
                            )}
                          </span>
                          {published && run && (
                            <button
                              type="button"
                              className="button small"
                              onClick={() => void view(0, row.name)}
                            >
                              {copy.view}
                            </button>
                          )}
                        </span>
                        <span className="queue-bar" aria-hidden="true">
                          <span
                            className={state === 'writing' ? 'run' : undefined}
                            style={{
                              width: `${
                                state === 'done' || state === 'written'
                                  ? 100
                                  : state === 'writing' && row.sections
                                    ? Math.max(
                                        4,
                                        Math.round(
                                          (row.sections.done /
                                            Math.max(row.sections.total, 1)) *
                                            100,
                                        ),
                                      )
                                    : 0
                              }%`,
                            }}
                          />
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        {viewing && (
          <section
            className="doc-card doc-viewer"
            aria-labelledby="doc-viewer-title"
          >
            <div className="documents-heading">
              <h2 id="doc-viewer-title">
                {viewingProgram} · {viewingName}
              </h2>
              <span className="viewer-actions">
                {viewing.status === 'ready' && (
                  <button
                    type="button"
                    className="button small"
                    onClick={() =>
                      downloadMarkdown(viewing.file.name, viewing.file.content)
                    }
                  >
                    {copy.downloadMd}
                  </button>
                )}
                <button
                  type="button"
                  className="button small"
                  onClick={() => setViewing(null)}
                >
                  {copy.close}
                </button>
              </span>
            </div>
            <p className="generate-note">
              {runner === 'fake' ? copy.fakeRunner : copy.draftNotice}
            </p>
            {viewing.status === 'loading' && (
              <p role="status">{copy.documentLoading}</p>
            )}
            {viewing.status === 'error' && (
              <p role="alert" className="error">
                {requestError(viewing.error, messages)}
              </p>
            )}
            {/* Untrusted AI text: Markdown only, raw HTML dropped (FE-06). */}
            {viewing.status === 'ready' && (
              <Suspense fallback={<p role="status">{copy.documentLoading}</p>}>
                <MarkdownView content={viewing.file.content} />
              </Suspense>
            )}
          </section>
        )}
        <div className="agent-log">
          <div className="agent-log-bar">
            <span className="log-dot" />
            <span className="log-dot" />
            <span className="log-dot" />
            <span className="log-title">agent.log · stream-json</span>
            <span className={`log-state${active ? ' log-state-running' : ''}`}>
              {run ? copy.runState[run.status] : copy.ready}
            </span>
          </div>
          <div className="agent-log-body" role="log" aria-live="polite">
            {documents.log.map((entry) => {
              const tag = logTag(entry);
              return (
                <div
                  key={entry.sequence}
                  className={`log-line log-${entry.stream}`}
                  title={entry.text}
                >
                  <span className="log-time">{logTime(entry.at)}</span>
                  <span className={`log-tag log-tag-${tag.toLowerCase()}`}>
                    {tag}
                  </span>
                  <span className="log-text">{entry.text}</span>
                </div>
              );
            })}
            {(!run || active) && (
              <div className="log-prompt">
                <span>$</span>
                <span className="log-cursor" aria-hidden="true" />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
