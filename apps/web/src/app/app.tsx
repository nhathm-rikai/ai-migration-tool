import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Project } from '@portal/contracts';
import { branding } from './branding';
import { ProjectsPage } from '../features/projects/projects-page';
import { ProjectDetail } from '../features/projects/project-detail';
import { AssessmentOverview } from '../features/assessment/assessment-overview';
import {
  useProjectList,
  type ProjectListControl,
} from '../features/projects/use-project-list';
import { useProject } from '../features/projects/use-project';
import {
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
import { Icon } from '../shared/ui/icon';
import { SessionStatus } from './session-status';
import {
  Link,
  navigate,
  parseRoute,
  STEP_IDS,
  stepPath,
  usePathname,
  type Route,
  type StepId,
} from './router';

type AppProps = {
  api?: ProjectsApi;
  runsApi?: RunsApi;
  sourcesApi?: SourcesApi;
  artifactsApi?: ArtifactsApi;
  session?: LocalSessionClient;
};

type Apis = {
  api: ProjectsApi;
  runsApi: RunsApi;
  sourcesApi: SourcesApi;
  artifactsApi: ArtifactsApi;
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

// Steps 3–5 have no implementation yet; their pages say why.
const UNAVAILABLE_STEPS: readonly StepId[] = ['documents', 'review', 'quote'];

function AppShell({
  api = projectsApi,
  runsApi = defaultRunsApi,
  sourcesApi = defaultSourcesApi,
  artifactsApi = defaultArtifactsApi,
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
  });

  // "Created" notice: shown on the new project's page until the next
  // navigation away from it.
  const [created, setCreated] = useState<{
    path: string;
    seen: boolean;
  } | null>(null);
  useEffect(() => {
    if (!created) return;
    if (pathname === created.path) {
      if (!created.seen) setCreated({ ...created, seen: true });
    } else if (created.seen) setCreated(null);
  }, [pathname, created]);

  const apis = { api, runsApi, sourcesApi, artifactsApi };
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
          {route.name === 'projects' ? (
            <ProjectsPage
              api={api}
              list={list}
              onCreated={(next) => {
                const path = stepPath(next.id, 'source');
                setCreated({ path, seen: false });
                list.refresh();
                navigate(path);
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
              created={created?.path === pathname}
              apis={apis}
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
  const currentStep = route.name === 'step' ? route.step : null;
  const listed = list.state.status === 'ready' ? list.state.page.items : [];
  // The open project stays selectable even when it is not on the list page.
  const options =
    project && !listed.some((item) => item.id === project.id)
      ? [project, ...listed]
      : listed;
  const stepState = (step: StepId): 'done' | 'todo' | 'unavailable' => {
    if (UNAVAILABLE_STEPS.includes(step)) return 'unavailable';
    if (progress.status !== 'ready') return 'todo';
    if (step === 'source') return progress.sourceSaved ? 'done' : 'todo';
    return progress.analysisRunId ? 'done' : 'todo';
  };
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={branding.logoUrl} alt={branding.logoAlt} />
        <span className="brand-name">{branding.displayName}</span>
        <span className="brand-subtitle">
          {messages.app.subtitle}{' '}
          <span className="chip">{messages.app.demo}</span>
        </span>
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
      <div className="project-picker">
        <label htmlFor="project-picker">{copy.project}</label>
        <div className="picker-row">
          <select
            id="project-picker"
            value={projectId ?? ''}
            onChange={(event) => {
              const id = event.currentTarget.value;
              navigate(
                id === '' ? '/projects' : stepPath(id, currentStep ?? 'source'),
              );
            }}
          >
            <option value="">{copy.allProjects}</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.mode === 'demo'
                  ? ` · ${messages.projects.demoBadge}`
                  : ''}
              </option>
            ))}
          </select>
          {project?.mode === 'demo' && (
            <span className="chip demo">{messages.projects.demoBadge}</span>
          )}
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
                  <span
                    className={
                      state === 'unavailable' ? 'step-state' : 'sr-only'
                    }
                  >
                    <span className="sr-only">, </span>
                    {copy.stepState[state]}
                  </span>
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
      <div className="sidebar-footer">
        <span className="status-dot" /> {messages.projects.localWorkspace}
      </div>
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
  created,
  apis,
}: {
  project: Project;
  step: StepId;
  runId: string | null;
  progress: ProjectProgress;
  onProgress: () => void;
  onRetryProgress: () => void;
  created: boolean;
  apis: Apis;
}) {
  const { messages } = useLocale();
  const copy = messages.shell;
  const index = STEP_IDS.indexOf(step) + 1;
  return (
    <div className="page">
      <header className="page-header">
        <span className="eyebrow">
          {copy.stepEyebrow(index)} · {copy.steps[step]}
        </span>
        <div className="page-title-row">
          <h1 id="page-title">{project.name}</h1>
          {project.mode === 'demo' && (
            <span className="chip demo">{messages.projects.fixture}</span>
          )}
        </div>
      </header>
      {created && (
        <p role="status" className="success">
          {messages.projects.created}
        </p>
      )}
      {step === 'source' ? (
        <ProjectDetail
          id={project.id}
          project={project}
          api={apis.api}
          runsApi={apis.runsApi}
          sourcesApi={apis.sourcesApi}
          artifactsApi={apis.artifactsApi}
          onOpenResults={(id) => navigate(stepPath(project.id, 'analysis', id))}
          onProgress={onProgress}
          onClose={() => navigate('/projects')}
        />
      ) : step === 'analysis' ? (
        <AnalysisStep
          project={project}
          runId={runId}
          progress={progress}
          onRetry={onRetryProgress}
          artifactsApi={apis.artifactsApi}
        />
      ) : (
        <UnavailableStep projectId={project.id} step={step} />
      )}
    </div>
  );
}

function AnalysisStep({
  project,
  runId,
  progress,
  onRetry,
  artifactsApi,
}: {
  project: Project;
  runId: string | null;
  progress: ProjectProgress;
  onRetry: () => void;
  artifactsApi: ArtifactsApi;
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
    <section className="panel results-panel" aria-labelledby="results-title">
      <div className="section-heading">
        <h2 id="results-title">{messages.projects.results}</h2>
      </div>
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
      />
    </section>
  );
}

function UnavailableStep({
  projectId,
  step,
}: {
  projectId: string;
  step: StepId;
}) {
  const { messages } = useLocale();
  const copy = messages.shell.unavailable;
  const reason =
    step === 'documents' || step === 'review' || step === 'quote'
      ? copy.reasons[step]
      : null;
  return (
    <section
      className="panel unavailable-panel"
      aria-labelledby="step-unavailable"
    >
      <h2 id="step-unavailable">{copy.title}</h2>
      {reason && <p className="muted">{reason}</p>}
      <div className="form-actions">
        <Link className="button" to={stepPath(projectId, 'analysis')}>
          {copy.back}
        </Link>
      </div>
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
          <Link className="button primary" to="/projects">
            {messages.shell.notFound.back}
          </Link>
        </div>
      </section>
    </div>
  );
}
