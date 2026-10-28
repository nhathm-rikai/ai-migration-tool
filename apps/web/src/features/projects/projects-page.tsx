import { useState } from 'react';
import { projectsApi, type ProjectsApi } from '../../shared/api/projects-api';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import type { RunsApi } from '../../shared/api/runs-api';
import type { SourcesApi } from '../../shared/api/sources-api';
import { Icon } from '../../shared/ui/icon';
import { useProjectList } from './use-project-list';
import { CreateProjectForm } from './create-project-form';
import { ProjectDetail } from './project-detail';
import { AssessmentOverview } from '../assessment/assessment-overview';
import { useLocale } from '../../shared/i18n/locale-context';
import { projectErrorMessage } from './project-messages';

// Results page of one run, opened from the project overview. Kept in page
// state (no router yet): selecting a project or "back" leaves it.
type ResultsView = { projectId: string; runId: string };

export function ProjectsPage({
  api = projectsApi,
  runsApi,
  sourcesApi,
  artifactsApi,
}: {
  api?: ProjectsApi;
  runsApi?: RunsApi | undefined;
  sourcesApi?: SourcesApi | undefined;
  artifactsApi?: ArtifactsApi | undefined;
}) {
  const { messages } = useLocale();
  const copy = messages.projects;
  const stages = Object.entries(copy.stages);
  const list = useProjectList(api);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [created, setCreated] = useState(false);
  const [results, setResults] = useState<ResultsView | null>(null);
  const select = (id: string | null) => {
    setSelectedId(id);
    setResults(null);
  };
  const openResults =
    results && results.projectId === selectedId ? results : null;
  const selectedProject =
    list.state.status === 'ready'
      ? (list.state.page.items.find((project) => project.id === selectedId) ??
        null)
      : null;
  return (
    <main id="main-content" className="app-layout">
      <aside className="project-sidebar" aria-labelledby="list-title">
        <div className="sidebar-heading">
          <div>
            <span className="eyebrow">{copy.workspace}</span>
            <h2 id="list-title">{copy.title}</h2>
          </div>
          <button
            className="button icon-button"
            aria-label={copy.refresh}
            disabled={list.state.status === 'loading'}
            onClick={list.refresh}
          >
            <Icon name="refresh" />
          </button>
        </div>
        <button
          className="button primary new-project"
          onClick={() => {
            select(null);
            setCreated(false);
          }}
        >
          <Icon name="plus" /> {copy.createNew}
        </button>
        <nav aria-label={copy.tree} className="project-navigation">
          {list.state.status === 'loading' && (
            <p className="sidebar-state" role="status">
              {copy.loading}
            </p>
          )}
          {list.state.status === 'error' && (
            <div className="sidebar-state">
              <p role="alert" className="error">
                {projectErrorMessage(list.state.error, 'list', messages.errors)}
              </p>
              <button className="button small" onClick={list.retry}>
                {copy.retryList}
              </button>
            </div>
          )}
          {list.state.status === 'ready' && (
            <>
              {list.state.page.items.length === 0 ? (
                <div className="sidebar-state empty-state">
                  <Icon name="folder" />
                  <h3>{list.cursor ? copy.noMore : copy.empty}</h3>
                  <p>{copy.emptyHelp}</p>
                </div>
              ) : (
                <ul className="project-tree">
                  {list.state.page.items.map((project) => (
                    <li key={project.id}>
                      <button
                        className={
                          'project-node' +
                          (selectedId === project.id ? ' selected' : '')
                        }
                        aria-expanded={expandedIds.has(project.id)}
                        aria-controls={`project-${project.id}`}
                        onClick={() => {
                          setExpandedIds((previous) => {
                            const next = new Set(previous);
                            if (
                              selectedId === project.id &&
                              next.has(project.id)
                            )
                              next.delete(project.id);
                            else next.add(project.id);
                            return next;
                          });
                          select(project.id);
                          setCreated(false);
                        }}
                      >
                        <span className="node-chevron">
                          <Icon name="chevron" />
                        </span>
                        <Icon name="folder" />
                        <span className="node-name">{project.name}</span>
                        {project.mode === 'demo' && (
                          <span className="chip demo" aria-hidden="true">
                            {copy.demoBadge}
                          </span>
                        )}
                      </button>
                      <ul
                        id={`project-${project.id}`}
                        className="project-branches"
                        hidden={!expandedIds.has(project.id)}
                      >
                        <li>
                          <button
                            className={
                              'branch' +
                              (selectedId === project.id && !openResults
                                ? ' selected'
                                : '')
                            }
                            aria-current={
                              selectedId === project.id && !openResults
                                ? 'page'
                                : undefined
                            }
                            onClick={() => select(project.id)}
                          >
                            <Icon name="file" /> {copy.overview}
                          </button>
                        </li>
                        {openResults && selectedId === project.id && (
                          <li>
                            <button
                              className="branch selected"
                              aria-current="page"
                            >
                              <Icon name="file" /> {copy.results}
                            </button>
                          </li>
                        )}
                        {/* Static analysis runs from the overview; only the
                            stages still to come are listed as such. */}
                        {stages
                          .filter(([stageId]) => stageId !== 'analysis')
                          .map(([stageId, stage]) => (
                            <li key={stageId}>
                              <button
                                className="branch"
                                disabled
                                title={copy.unavailable}
                              >
                                <Icon name="file" />
                                {stage.title}
                                <span className="soon">
                                  {copy.notAvailableYet}
                                </span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              <div className="list-footer">
                <span>{copy.pageCount(list.state.page.items.length)}</span>
                <div className="actions">
                  {list.cursor && (
                    <button className="button small" onClick={list.refresh}>
                      {copy.firstPage}
                    </button>
                  )}
                  {list.state.page.nextCursor && (
                    <button
                      className="button small"
                      onClick={() => {
                        if (
                          list.state.status === 'ready' &&
                          list.state.page.nextCursor
                        )
                          list.next(list.state.page.nextCursor);
                      }}
                    >
                      {copy.nextPage}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> {copy.localWorkspace}
        </div>
      </aside>
      <div className="project-workspace">
        <div className="workspace-toolbar">
          <span className="breadcrumb">
            {copy.breadcrumb} <span aria-hidden="true">/</span>{' '}
            {selectedProject && (
              <>
                {selectedProject.name} <span aria-hidden="true">/</span>{' '}
              </>
            )}
            <strong>
              {!selectedId
                ? copy.createNew
                : openResults
                  ? copy.results
                  : copy.overview}
            </strong>
          </span>
          {selectedProject?.mode === 'demo' && (
            <span className="chip demo">{copy.fixture}</span>
          )}
        </div>
        <nav aria-label={copy.assessmentSteps}>
          <ol className="stepper">
            {stages.map(([stageId, stage], index) => (
              <li key={stageId}>
                <button className="step" disabled>
                  <span className="step-number">{index + 1}</span>
                  <span>
                    <strong>{stage.title}</strong>
                    <small>{stage.description}</small>
                    <span className="stage-status">{stage.status}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {created && (
          <p role="status" className="success">
            {copy.created}
          </p>
        )}
        {selectedId && openResults && artifactsApi ? (
          <section
            className="panel results-panel"
            aria-labelledby="results-title"
          >
            <div className="section-heading">
              <h2 id="results-title">
                {copy.results}
                {selectedProject && <> · {selectedProject.name}</>}
              </h2>
              <button className="button small" onClick={() => setResults(null)}>
                {messages.assessment.back}
              </button>
            </div>
            <AssessmentOverview
              key={openResults.runId}
              api={artifactsApi}
              projectId={openResults.projectId}
              runId={openResults.runId}
            />
          </section>
        ) : selectedId ? (
          <ProjectDetail
            key={selectedId}
            id={selectedId}
            api={api}
            runsApi={runsApi}
            sourcesApi={sourcesApi}
            artifactsApi={artifactsApi}
            onOpenResults={(runId) =>
              setResults({ projectId: selectedId, runId })
            }
            onClose={() => select(null)}
          />
        ) : (
          <CreateProjectForm
            api={api}
            onCreated={(project) => {
              select(project.id);
              setExpandedIds((previous) => new Set([...previous, project.id]));
              setCreated(true);
              list.refresh();
            }}
          />
        )}
        <footer className="page-footer">{copy.footer}</footer>
      </div>
    </main>
  );
}
