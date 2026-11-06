import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Project } from '@portal/contracts';
import { branding } from './branding';
import { SourceStep } from '../features/source/source-step';
import { NewProjectStep } from '../features/source/new-project-step';
import { RecentProjects } from '../features/projects/recent-projects';
import { AssessmentOverview } from '../features/assessment/assessment-overview';
import {
  useProjectList,
  type ProjectListControl,
} from '../features/projects/use-project-list';
import { useProject } from '../features/projects/use-project';
import {
  isReviewDone,
  useProjectProgress,
  type ProjectProgress,
} from '../features/projects/use-project-progress';
import { projectErrorMessage } from '../features/projects/project-messages';
import { LocaleProvider } from '../shared/i18n/locale-provider';
import { useLocale } from '../shared/i18n/locale-context';
import { LOCALES } from '../shared/i18n/locale';
import { ApiError } from '../shared/api/api-error';
import { projectsApi, type ProjectsApi } from '../shared/api/projects-api';
import {
  runsApi as defaultRunsApi,
  type RunsApi,
} from '../shared/api/runs-api';
import {
  localSession,
  type LocalSessionClient,
} from '../shared/api/local-session';
import {
  sourcesApi as defaultSourcesApi,
  type SourcesApi,
} from '../shared/api/sources-api';
import {
  artifactsApi as defaultArtifactsApi,
  type ArtifactsApi,
} from '../shared/api/artifacts-api';
import {
  documentsApi as defaultDocumentsApi,
  type DocumentsApi,
} from '../shared/api/documents-api';
import { Icon } from '../shared/ui/icon';
import { QuoteStep } from '../features/quote/quote-step';
import { ReviewStep } from '../features/review/review-step';
import { DocumentsStep } from '../features/documents/documents-step';
import { SessionStatus } from './session-status';
import {
  Link,
  navigate,
  parseRoute,
  STEP_IDS,
  NEW_PROJECT_PATH,
  stepPath,
  usePathname,
  useQueryParam,
  type Route,
  type StepId,
} from './router';

type AppProps = {
  api?: ProjectsApi;
  runsApi?: RunsApi;
  sourcesApi?: SourcesApi;
  artifactsApi?: ArtifactsApi;
  documentsApi?: DocumentsApi;
  session?: LocalSessionClient;
};

type Apis = {
  api: ProjectsApi;
  runsApi: RunsApi;
  sourcesApi: SourcesApi;
  artifactsApi: ArtifactsApi;
  documentsApi: DocumentsApi;
};

// `api`, `runsApi`, `sourcesApi` and `artifactsApi` must use `session` as their credential source; tests
// inject them together.
export function App(props: AppProps) {
  return (
    <LocaleProvider>
      <AppShell {...props} />
    </LocaleProvider>
  );
}

// Steps 4–5 have no implementation yet; their pages say why.

function AppShell({
  api = projectsApi,
  runsApi = defaultRunsApi,
  sourcesApi = defaultSourcesApi,
  artifactsApi = defaultArtifactsApi,
  documentsApi = defaultDocumentsApi,
  session = localSession,
}: AppProps) {
  const { messages } = useLocale();
  const pathname = usePathname();
  const { route, redirect } = parseRoute(pathname);
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);
  useEffect(() => {
    const original = document.title;
    document.title = branding.displayName;
    return () => {
      document.title = original;
    };
  }, []);

  // Keyboard and screen reader users land on the new page, not on the link.
  const main = useRef<HTMLElement>(null);
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== firstPath.current) {
      firstPath.current = '';
      main.current?.focus();
    }
  }, [pathname]);

  const list = useProjectList(api);
  const projectId = route.name === 'step' ? route.projectId : null;
  const project = useProject(api, projectId);
  const loaded =
    project.state.status === 'ready' ? project.state.project : null;
  const progress = useProjectProgress(loaded, {
    runsApi,
    sourcesApi,
    artifactsApi,
    documentsApi,
  });

  const apis = { api, runsApi, sourcesApi, artifactsApi, documentsApi };
  return (
    <>
      <a className="skip-link" href="#main-content">
        {messages.app.skipToContent}
      </a>
      <div className="shell">
        <Sidebar
          route={route}
          list={list}
          project={loaded}
          progress={progress.state}
        />
        <main
          id="main-content"
          className="content"
          ref={main}
          tabIndex={-1}
          key={route.name === 'step' ? route.projectId : route.name}
        >
          <SessionStatus session={session} />
          {route.name === 'new' ? (
            <NewProjectPage
              apis={apis}
              onCreated={(next) => {
                list.refresh();
                navigate(stepPath(next.id, 'source'));
              }}
            />
          ) : route.name === 'not-found' ? (
            <NotFoundPage
              title={messages.shell.notFound.title}
              help={messages.shell.notFound.help}
            />
          ) : project.state.status === 'error' ? (
            isMissingProject(project.state.error) ? (
              <NotFoundPage
                title={messages.shell.notFound.projectTitle}
                help={messages.shell.notFound.projectHelp}
              />
            ) : (
              <div className="page">
                <p role="alert" className="error">
                  {projectErrorMessage(
                    project.state.error,
                    'get',
                    messages.errors,
                  )}
                </p>
                <button className="button" onClick={project.retry}>
                  {messages.shell.retry}
                </button>
              </div>
            )
          ) : loaded ? (
            <StepPage
              project={loaded}
              step={route.step}
              runId={route.runId}
              progress={progress.state}
              onProgress={progress.refresh}
              onRetryProgress={progress.refresh}
              apis={apis}
              onProjectChange={(next) => {
                project.replace(next);
                list.retry();
              }}
            />
          ) : (
            <p role="status" className="page">
              {messages.shell.projectLoading}
            </p>
          )}
        </main>
      </div>
    </>
  );
}

// Two-letter badge of the project card, as in demo02.
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')
      : name.trim().slice(0, 2);
  return letters.toUpperCase();
}

// A malformed or unknown project id in the URL.
function isMissingProject(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    (error.code === 'PROJECT_NOT_FOUND' || error.code === 'INVALID_INPUT')
  );
}

function Sidebar({
  route,
  list,
  project,
  progress,
}: {
  route: Route;
  list: ProjectListControl;
  project: Project | null;
  progress: ProjectProgress;
}) {
  const { locale, setLocale, messages } = useLocale();
  const copy = messages.shell;
  const projectId = route.name === 'step' ? route.projectId : null;
  // A new project is on its step 1 before it exists.
  const currentStep =
    route.name === 'step' ? route.step : route.name === 'new' ? 'source' : null;
  const listed = list.state.status === 'ready' ? list.state.page.items : [];
  // The open project stays selectable even when it is not on the list page.
  const options =
    project && !listed.some((item) => item.id === project.id)
      ? [project, ...listed]
      : listed;
  const selectedProgram = useQueryParam('program');
  const stepState = (step: StepId): 'done' | 'todo' => {
    if (progress.status !== 'ready') return 'todo';
    if (step === 'source') return progress.sourceSaved ? 'done' : 'todo';
    if (step === 'documents')
      return progress.documentsWritten ? 'done' : 'todo';
    if (step === 'review')
      return isReviewDone(progress.reviewPrograms, selectedProgram)
        ? 'done'
        : 'todo';
    if (step === 'quote') return 'todo';
    return progress.analysisRunId ? 'done' : 'todo';
  };
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={branding.logoUrl} alt={branding.logoAlt} />
        <span className="brand-name">{branding.displayName}</span>
      </div>
      <fieldset className="language-switch">
        <legend className="sr-only">{messages.app.language}</legend>
        {LOCALES.map((language) => (
          <label key={language.code} lang={language.code}>
            <input
              type="radio"
              name="locale"
              value={language.code}
              checked={locale === language.code}
              onChange={() => setLocale(language.code)}
            />
            <span>{language.label}</span>
          </label>
        ))}
      </fieldset>
      {/* Card of the open project as in demo02; the native select laid over
          it keeps keyboard and screen reader behaviour. */}
      <div className="project-picker">
        <label htmlFor="project-picker" className="sr-only">
          {copy.project}
        </label>
        <div className="picker-card">
          <span className="picker-avatar" aria-hidden="true">
            {initials(project?.name ?? copy.newProject)}
          </span>
          <span className="picker-text" aria-hidden="true">
            <span className="picker-name">
              {project?.name ?? copy.newProject}
            </span>
            <span className="picker-detail">
              {!project
                ? copy.chooseProject
                : project.mode === 'demo'
                  ? copy.projectDetail.demo
                  : progress.status === 'ready' && progress.sourceSaved
                    ? copy.projectDetail.local
                    : copy.projectDetail.noSource}
            </span>
          </span>
          {project?.mode === 'demo' && (
            <span className="chip demo" aria-hidden="true">
              {messages.projects.demoBadge}
            </span>
          )}
          <svg
            className="picker-chevrons"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
          </svg>
          <select
            id="project-picker"
            value={projectId ?? ''}
            onChange={(event) => {
              const id = event.currentTarget.value;
              navigate(
                id === ''
                  ? NEW_PROJECT_PATH
                  : stepPath(id, currentStep ?? 'source'),
              );
            }}
          >
            <option value="">+ {copy.newProject}</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.mode === 'demo'
                  ? ` · ${messages.projects.demoBadge}`
                  : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <nav aria-label={messages.projects.assessmentSteps} className="steps-nav">
        <span className="nav-title" aria-hidden="true">
          {copy.stepsTitle}
        </span>
        <ol className="steps">
          {STEP_IDS.map((step, index) => {
            const state = stepState(step);
            const content = (
              <>
                <span className="step-mark" aria-hidden="true">
                  {state === 'done' ? <Icon name="check" /> : index + 1}
                </span>
                <span className="step-label">
                  {copy.steps[step]}
                  <span className="sr-only">, {copy.stepState[state]}</span>
                </span>
                {currentStep === step && (
                  <span className="step-pulse" aria-hidden="true" />
                )}
              </>
            );
            return (
              <li key={step}>
                {projectId ? (
                  <Link
                    className={`step-link state-${state}`}
                    to={stepPath(projectId, step)}
                    aria-current={currentStep === step ? 'step' : undefined}
                  >
                    {content}
                  </Link>
                ) : (
                  <span
                    className={`step-link state-${state} disabled`}
                    aria-disabled="true"
                  >
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {!projectId && <p className="steps-hint">{copy.selectProjectFirst}</p>}
      </nav>
    </aside>
  );
}

function StepPage({
  project,
  step,
  runId,
  progress,
  onProgress,
  onRetryProgress,
  apis,
  onProjectChange,
}: {
  project: Project;
  step: StepId;
  runId: string | null;
  progress: ProjectProgress;
  onProgress: () => void;
  onRetryProgress: () => void;
  apis: Apis;
  onProjectChange: (project: Project) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.shell;
  const index = STEP_IDS.indexOf(step) + 1;
  // Step 3 works on the program picked on the analysis screen.
  const program = useQueryParam('program');
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [eyebrowSlot, setEyebrowSlot] = useState<HTMLElement | null>(null);
  return (
    <div className="page">
      <header className="page-header">
        <span className="eyebrow">
          {copy.stepEyebrow(index)} · {project.name}
          <span ref={setEyebrowSlot} />
          {project.mode === 'demo' && (
            <>
              {' '}
              <span className="chip demo">{messages.projects.fixture}</span>
            </>
          )}
        </span>
        <div className="page-title-row">
          <h1 id="page-title">
            {step === 'quote'
              ? messages.quote.title(project.name)
              : copy.pageTitles[step]}
          </h1>
          <div ref={setHeaderSlot} />
        </div>
        {step === 'source' && (
          <p className="page-lead">{messages.sourceStep.lead}</p>
        )}
        {step === 'documents' && (
          <p className="page-lead">{messages.documents.lead}</p>
        )}
      </header>
      {step === 'source' ? (
        <SourceStep
          project={project}
          api={apis.api}
          runsApi={apis.runsApi}
          sourcesApi={apis.sourcesApi}
          onProjectChange={onProjectChange}
          onProgress={onProgress}
          onOpenResults={(id) => navigate(stepPath(project.id, 'analysis', id))}
          aside={
            <RecentProjects
              api={apis.api}
              runsApi={apis.runsApi}
              openProjectId={project.id}
              version={progressVersion(progress)}
            />
          }
        />
      ) : step === 'analysis' ? (
        <AnalysisStep
          project={project}
          runId={runId}
          progress={progress}
          onRetry={onRetryProgress}
          artifactsApi={apis.artifactsApi}
          headerSlot={headerSlot}
        />
      ) : step === 'documents' ? (
        <DocumentsStep
          key={project.id}
          projectId={project.id}
          program={program}
          projectMode={project.mode}
          analysis={
            progress.status === 'ready'
              ? { status: 'ready', runId: progress.analysisRunId }
              : { status: progress.status }
          }
          onRetryAnalysis={onRetryProgress}
          documentsWritten={
            progress.status === 'ready' && progress.documentsWritten
          }
          onDocumentsChanged={onProgress}
          api={apis.documentsApi}
          artifactsApi={apis.artifactsApi}
        />
      ) : step === 'review' ? (
        <ReviewStep
          projectId={project.id}
          program={program}
          headerSlot={headerSlot}
          onReviewChanged={onProgress}
          api={apis.documentsApi}
        />
      ) : (
        <QuoteStep
          projectId={project.id}
          projectName={project.name}
          analysisRunId={
            progress.status === 'ready' ? progress.analysisRunId : null
          }
          headerSlot={headerSlot}
          eyebrowSlot={eyebrowSlot}
          artifactsApi={apis.artifactsApi}
        />
      )}
    </div>
  );
}

// Step 1 before the project exists (UI04): created by its first scan.
function NewProjectPage({
  apis,
  onCreated,
}: {
  apis: Apis;
  onCreated: (project: Project) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.shell;
  return (
    <div className="page">
      <header className="page-header">
        <span className="eyebrow">
          {copy.stepEyebrow(1)} · {copy.newProject}
        </span>
        <h1 id="page-title">{copy.pageTitles.source}</h1>
        <p className="page-lead">{messages.sourceStep.lead}</p>
      </header>
      <NewProjectStep
        api={apis.api}
        sourcesApi={apis.sourcesApi}
        runsApi={apis.runsApi}
        onCreated={onCreated}
        aside={
          <RecentProjects
            api={apis.api}
            runsApi={apis.runsApi}
            openProjectId={null}
            version=""
          />
        }
      />
    </div>
  );
}

// Re-read recent projects when a run of the open project starts or ends.
function progressVersion(progress: ProjectProgress): string {
  return progress.status === 'ready'
    ? `${progress.activeRunId ?? ''}/${progress.analysisRunId ?? ''}`
    : progress.status;
}

function AnalysisStep({
  project,
  runId,
  progress,
  onRetry,
  artifactsApi,
  headerSlot,
}: {
  project: Project;
  runId: string | null;
  progress: ProjectProgress;
  onRetry: () => void;
  artifactsApi: ArtifactsApi;
  headerSlot: HTMLElement | null;
}) {
  const { messages } = useLocale();
  const copy = messages.shell.analysis;
  const latest = progress.status === 'ready' ? progress.analysisRunId : null;
  const shown = runId ?? latest;
  if (!shown) {
    if (progress.status === 'loading')
      return <p role="status">{copy.loading}</p>;
    if (progress.status === 'error')
      return (
        <div>
          <p role="alert" className="error">
            {copy.loadFailed}
          </p>
          <button className="button" onClick={onRetry}>
            {messages.shell.retry}
          </button>
        </div>
      );
    return (
      <section className="panel empty-panel" aria-labelledby="analysis-empty">
        <h2 id="analysis-empty">{copy.empty}</h2>
        <p className="muted">{copy.emptyHelp}</p>
        <div className="form-actions">
          <Link className="button primary" to={stepPath(project.id, 'source')}>
            {copy.goSource}
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title" className="sr-only">
        {messages.projects.results}
      </h2>
      {runId && latest && runId !== latest && (
        <p className="notice">
          {copy.olderRun}{' '}
          <Link to={stepPath(project.id, 'analysis')}>{copy.latest}</Link>
        </p>
      )}
      <AssessmentOverview
        key={shown}
        api={artifactsApi}
        projectId={project.id}
        runId={shown}
        headerSlot={headerSlot}
      />
    </section>
  );
}

function NotFoundPage({ title, help }: { title: string; help: ReactNode }) {
  const { messages } = useLocale();
  return (
    <div className="page">
      <section className="panel empty-panel" aria-labelledby="page-title">
        <h1 id="page-title">{title}</h1>
        <p className="muted">{help}</p>
        <div className="form-actions">
          <Link className="button primary" to={NEW_PROJECT_PATH}>
            {messages.shell.notFound.back}
          </Link>
        </div>
      </section>
    </div>
  );
}
