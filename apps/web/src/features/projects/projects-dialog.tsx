import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '@portal/contracts';
import type { ProjectsApi } from '../../shared/api/projects-api';
import { useLocale } from '../../shared/i18n/locale-context';
import { Link, stepPath } from '../../app/router';
import { useModalFocus } from '../assessment/graph-frame';
import { projectErrorMessage } from './project-messages';

// "Xem tất cả" (UI04): every project in a dialog, to open one again. Only
// reads; projects are created from step 1. The API pages by ID, so the
// dialog reads every page (bounded) and searches and pages on its side,
// newest first.

export const PROJECTS_PAGE_SIZE = 8;
// More than any local workspace is expected to hold; the rest is not read.
const MAX_PROJECTS = 2000;

type State =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; items: Project[] };

async function readAll(
  api: ProjectsApi,
  signal: AbortSignal,
): Promise<Project[]> {
  const items: Project[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.list(cursor, signal);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && items.length < MAX_PROJECTS);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function ProjectsDialog({
  api,
  openProjectId,
  onClose,
}: {
  api: ProjectsApi;
  openProjectId: string | null;
  onClose: () => void;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.sourceStep.projects;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(true, dialog);

  useEffect(() => {
    const controller = new AbortController();
    void readAll(api, controller.signal).then(
      (items) => {
        if (!controller.signal.aborted) setState({ status: 'ready', items });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', error });
      },
    );
    return () => controller.abort();
  }, [api, reload]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const needle = query.trim().toLocaleLowerCase();
  const found =
    state.status === 'ready'
      ? state.items.filter((project) =>
          project.name.toLocaleLowerCase().includes(needle),
        )
      : [];
  const pages = Math.max(1, Math.ceil(found.length / PROJECTS_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = found.slice(
    current * PROJECTS_PAGE_SIZE,
    (current + 1) * PROJECTS_PAGE_SIZE,
  );

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="dialog projects-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="projects-dialog-title"
      >
        <div className="dialog-heading">
          <h2 id="projects-dialog-title">{copy.title}</h2>
          <button className="button small" onClick={onClose}>
            {copy.close}
          </button>
        </div>
        <label htmlFor="projects-search" className="sr-only">
          {copy.search}
        </label>
        <input
          id="projects-search"
          type="search"
          autoComplete="off"
          placeholder={copy.search}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        {state.status === 'loading' && (
          <p role="status" className="muted">
            {copy.loading}
          </p>
        )}
        {state.status === 'error' && (
          <div>
            <p role="alert" className="error">
              {projectErrorMessage(state.error, 'list', messages.errors)}
            </p>
            <button
              className="button small"
              onClick={() => {
                setState({ status: 'loading' });
                setReload((value) => value + 1);
              }}
            >
              {messages.shell.retry}
            </button>
          </div>
        )}
        {state.status === 'ready' &&
          (shown.length === 0 ? (
            <p className="muted">{needle ? copy.noMatch : copy.empty}</p>
          ) : (
            <ul className="projects-dialog-list">
              {shown.map((project) => (
                <li key={project.id}>
                  <Link
                    to={stepPath(project.id, 'source')}
                    onClick={onClose}
                    aria-current={
                      project.id === openProjectId ? 'page' : undefined
                    }
                  >
                    <span className="projects-dialog-name">
                      {project.name}
                      {project.mode === 'demo' && (
                        <span className="chip demo">
                          {messages.projects.demoBadge}
                        </span>
                      )}
                    </span>
                    <span className="muted">
                      {copy.created(formatDateTime(project.createdAt))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        {state.status === 'ready' && pages > 1 && (
          <nav className="dialog-pager" aria-label={copy.pages}>
            <button
              className="button small"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              {copy.previous}
            </button>
            <span>{copy.page(current + 1, pages)}</span>
            <button
              className="button small"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              {copy.next}
            </button>
          </nav>
        )}
      </div>
    </div>,
    document.body,
  );
}
