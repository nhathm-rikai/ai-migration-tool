import type { Project } from '@portal/contracts';
import type { ProjectsApi } from '../../shared/api/projects-api';
import { Icon } from '../../shared/ui/icon';
import { Link, stepPath } from '../../app/router';
import type { ProjectListControl } from './use-project-list';
import { CreateProjectForm } from './create-project-form';
import { useLocale } from '../../shared/i18n/locale-context';
import { projectErrorMessage } from './project-messages';

// `/projects`: the project list and the create form. The list is owned by
// the app shell, which also shows it in the sidebar project picker.
export function ProjectsPage({
  api,
  list,
  onCreated,
}: {
  api: ProjectsApi;
  list: ProjectListControl;
  onCreated: (project: Project) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.projects;
  return (
    <div className="page projects-page">
      <header className="page-header">
        <span className="eyebrow">{copy.workspace}</span>
        <h1 id="page-title" tabIndex={-1}>
          {copy.title}
        </h1>
      </header>
      <div className="projects-grid">
        <section
          className="panel project-list-panel"
          aria-labelledby="list-title"
        >
          <div className="section-heading">
            <h2 id="list-title">{copy.listTitle}</h2>
            <button
              className="button icon-button"
              aria-label={copy.refresh}
              disabled={list.state.status === 'loading'}
              onClick={list.refresh}
            >
              <Icon name="refresh" />
            </button>
          </div>
          <nav aria-label={copy.listTitle} className="project-navigation">
            {list.state.status === 'loading' && (
              <p className="list-state" role="status">
                {copy.loading}
              </p>
            )}
            {list.state.status === 'error' && (
              <div className="list-state">
                <p role="alert" className="error">
                  {projectErrorMessage(
                    list.state.error,
                    'list',
                    messages.errors,
                  )}
                </p>
                <button className="button small" onClick={list.retry}>
                  {copy.retryList}
                </button>
              </div>
            )}
            {list.state.status === 'ready' && (
              <>
                {list.state.page.items.length === 0 ? (
                  <div className="list-state empty-state">
                    <Icon name="folder" />
                    <h3>{list.cursor ? copy.noMore : copy.empty}</h3>
                    <p>{copy.emptyHelp}</p>
                  </div>
                ) : (
                  <ul className="project-cards">
                    {list.state.page.items.map((project) => (
                      <li key={project.id}>
                        <Link
                          className="project-card lift"
                          to={stepPath(project.id, 'source')}
                        >
                          <Icon name="folder" />
                          <span className="node-name">{project.name}</span>
                          {project.mode === 'demo' ? (
                            <span className="chip demo" aria-hidden="true">
                              {copy.demoBadge}
                            </span>
                          ) : (
                            <span className="badge" aria-hidden="true">
                              {copy.localBadge}
                            </span>
                          )}
                          <Icon name="chevron" />
                        </Link>
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
        </section>
        <CreateProjectForm api={api} onCreated={onCreated} />
      </div>
      <footer className="page-footer">{copy.footer}</footer>
    </div>
  );
}
