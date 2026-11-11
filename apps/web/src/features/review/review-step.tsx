import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  AddReviewEvent,
  PackageFileContent,
  ReviewBoard,
  ReviewDocument,
  ReviewProgram,
  SpecDocumentId,
} from '@portal/contracts';
import { Link, stepPath } from '../../app/router';
import type { DocumentsApi } from '../../shared/api/documents-api';
import { useLocale } from '../../shared/i18n/locale-context';
import type { Messages } from '../../shared/i18n/vi';
import { hasErrorCode, runRequestErrorMessage } from '../jobs/run-messages';
import { downloadMarkdown } from '../documents/download-markdown';
import { SpecExcelButton } from '../documents/ut-excel-button';
import {
  countUnresolvedPoints,
  isUnresolvedHeading,
} from './unresolved-points';

const MarkdownView = lazy(() =>
  import('../documents/markdown-view').then((module) => ({
    default: module.MarkdownView,
  })),
);

// Step 4 (prototype tpl-Review): documents per program on the left, the
// document in the middle, comments and approval on the
// right. Everything shown is stored data; documents are untrusted AI text.

type Filter = 'all' | 'pending' | 'approved';
type Selected = { program: string; file: string };
type Ref = { program: ReviewProgram; document: ReviewDocument };

function requestError(error: unknown, messages: Messages): string {
  const own = messages.review.errors;
  if (hasErrorCode(error, 'REVIEW_STALE')) return own.REVIEW_STALE;
  return runRequestErrorMessage(error, messages);
}

function formatAt(at: string): string {
  const date = new Date(at);
  const part = (value: number) => String(value).padStart(2, '0');
  return `${part(date.getDate())}/${part(date.getMonth() + 1)} ${part(date.getHours())}:${part(date.getMinutes())}`;
}

export function ReviewStep({
  projectId,
  program: chosenProgram,
  headerSlot = null,
  onReviewChanged,
  api,
}: {
  projectId: string;
  program: string | null;
  // Place in the page header for the action next to the title.
  headerSlot?: HTMLElement | null;
  onReviewChanged?: () => void;
  api: DocumentsApi;
}) {
  const { messages } = useLocale();
  const copy = messages.review;
  const [board, setBoard] = useState<ReviewBoard | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [file, setFile] = useState<PackageFileContent | null>(null);
  const [fileError, setFileError] = useState<unknown>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    api.reviewBoard(projectId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setBoard(result);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error);
      },
    );
    return () => controller.abort();
  }, [api, projectId, reload]);

  // One program at a time, as on step 3: the one picked on the analysis
  // screen (?program=), else the latest one with documents.
  const programs = useMemo(() => {
    const all = board?.programs ?? [];
    const one = chosenProgram
      ? all.find((entry) => entry.program === chosenProgram)
      : all[0];
    return one ? [one] : [];
  }, [board, chosenProgram]);
  // The open document always belongs to the current filter.
  const current: Ref | null = useMemo(() => {
    const program = programs[0];
    if (!program) return null;
    const visible = program.documents.filter(
      (entry) => filter === 'all' || entry.status === filter,
    );
    const document =
      visible.find(
        (entry) =>
          selected?.program === program.program && entry.name === selected.file,
      ) ?? visible[0];
    return document ? { program, document } : null;
  }, [programs, selected, filter]);

  const runId = current?.program.runId;
  const item = current?.program.item;
  const fileName = current?.document.name;
  useEffect(() => {
    if (runId === undefined || item === undefined || fileName === undefined)
      return;
    const controller = new AbortController();
    setFile(null);
    setFileError(null);
    api.packageFile(projectId, runId, item, fileName, controller.signal).then(
      (content) => {
        if (!controller.signal.aborted) setFile(content);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setFileError(error);
      },
    );
    return () => controller.abort();
  }, [api, projectId, runId, item, fileName]);

  const add = useCallback(
    async (
      event: Omit<AddReviewEvent, 'runId' | 'item' | 'file' | 'sha256'>,
    ) => {
      if (!current) return false;
      setBusy(true);
      setActionError(null);
      try {
        const next = await api.addReview(projectId, {
          ...event,
          runId: current.program.runId,
          item: current.program.item,
          file: current.document.name,
          sha256: current.document.sha256,
        } as AddReviewEvent);
        setBoard(next);
        onReviewChanged?.();
        return true;
      } catch (error) {
        setActionError(error);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [api, projectId, current, onReviewChanged],
  );

  if (loadError !== null)
    return (
      <div>
        <p role="alert" className="error">
          {requestError(loadError, messages)}
        </p>
        <button
          className="button"
          onClick={() => setReload((value) => value + 1)}
        >
          {messages.shell.retry}
        </button>
      </div>
    );
  if (!board) return <p role="status">{copy.loading}</p>;
  if (programs.length === 0)
    return (
      <section className="panel empty-panel" aria-labelledby="review-empty">
        <h2 id="review-empty">{copy.emptyTitle}</h2>
        <p className="muted">{copy.emptyHelp}</p>
        <div className="form-actions">
          <Link
            className="button primary"
            to={
              chosenProgram
                ? `${stepPath(projectId, 'documents')}?program=${encodeURIComponent(chosenProgram)}`
                : stepPath(projectId, 'documents')
            }
          >
            {copy.emptyAction}
          </Link>
        </div>
      </section>
    );

  const all = programs.flatMap((program) => program.documents);
  const count = (status: ReviewDocument['status']) =>
    all.filter((document) => document.status === status).length;
  const allApproved = count('pending') === 0;
  const docName = (name: string) =>
    copy.docNames[name.replace(/\.md$/, '') as SpecDocumentId] ?? name;
  const filters: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: copy.filters.all, n: all.length },
    { id: 'pending', label: copy.filters.pending, n: count('pending') },
    { id: 'approved', label: copy.filters.approved, n: count('approved') },
  ];
  const unresolved = file ? countUnresolvedPoints(file.content) : 0;

  // One Markdown file per document of the program's package.
  async function downloadSet(program: ReviewProgram) {
    setDownloading(program.program);
    setActionError(null);
    try {
      for (const document of program.documents) {
        const content = await api.packageFile(
          projectId,
          program.runId,
          program.item,
          document.name,
          new AbortController().signal,
        );
        downloadMarkdown(content.name, content.content);
      }
    } catch (error) {
      setActionError(error);
    } finally {
      setDownloading(null);
    }
  }

  function pick(program: string, name: string) {
    setSelected({ program, file: name });
    setDraft('');
    setActionError(null);
  }

  return (
    <div className="review">
      {headerSlot &&
        createPortal(
          <Link
            className={allApproved ? 'button primary pop-in' : 'button'}
            to={`${stepPath(projectId, 'quote')}?program=${encodeURIComponent(programs[0]?.program ?? '')}`}
          >
            {allApproved ? copy.createQuote : copy.previewQuote}
          </Link>,
          headerSlot,
        )}
      <div className="review-layout">
        <section className="doc-card review-list" aria-label={copy.listLabel}>
          <div className="review-filters" role="group">
            {filters.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={filter === entry.id}
                className={filter === entry.id ? 'selected' : ''}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label} <span>{entry.n}</span>
              </button>
            ))}
          </div>
          {programs.map((program) => {
            const done = program.documents.filter(
              (document) => document.status === 'approved',
            ).length;
            const open = !closed.has(program.program);
            const shown = program.documents.filter(
              (document) => filter === 'all' || document.status === filter,
            );
            if (shown.length === 0)
              return (
                <p key={program.program} className="review-none muted">
                  {copy.noDocuments}
                </p>
              );
            return (
              <div key={program.program} className="review-group">
                <div className="review-group-row">
                  <button
                    type="button"
                    className="review-group-head"
                    aria-expanded={open}
                    onClick={() =>
                      setClosed((value) => {
                        const next = new Set(value);
                        if (next.has(program.program))
                          next.delete(program.program);
                        else next.add(program.program);
                        return next;
                      })
                    }
                  >
                    <svg
                      className={`review-chevron${open ? ' open' : ''}`}
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
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <span>
                      <strong>{program.name}</strong>
                      <small>{copy.setOf(program.documents.length)}</small>
                    </span>
                    <span
                      className={`review-status${done === program.documents.length ? ' approved' : ''}`}
                    >
                      {copy.approvedOf(done, program.documents.length)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="review-download"
                    aria-label={copy.downloadSet(program.name)}
                    title={copy.downloadSet(program.name)}
                    disabled={downloading === program.program}
                    onClick={() => void downloadSet(program)}
                  >
                    {downloading === program.program ? (
                      <span className="review-spin" aria-hidden="true" />
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
                      </svg>
                    )}
                  </button>
                </div>
                {open && (
                  <div className="review-docs">
                    {shown.map((document) => {
                      const active =
                        current?.program.program === program.program &&
                        current.document.name === document.name;
                      const id = document.name.replace(/\.md$/, '');
                      return (
                        <button
                          key={document.name}
                          type="button"
                          className={`review-doc${active ? ' selected' : ''}`}
                          aria-current={active ? 'true' : undefined}
                          onClick={() => pick(program.program, document.name)}
                        >
                          <span className={`review-doc-icon tone-${id}`}>
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
                              <path d="M14 3v6h6" />
                            </svg>
                          </span>
                          <strong>{docName(document.name)}</strong>
                          <span
                            className={`review-status${document.status === 'approved' ? ' approved' : ''}`}
                          >
                            {copy.status[document.status]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
        {!current && (
          <article className="doc-card review-preview">
            <p className="muted">{copy.noDocuments}</p>
          </article>
        )}
        {current && (
          <article
            ref={previewRef}
            className="doc-card review-preview"
            aria-label={copy.preview}
          >
            {current && (
              <>
                <header className="review-preview-head">
                  <span>{current.program.name}</span>
                  <h2>{docName(current.document.name)}</h2>
                  <small className="mono">
                    {current.program.specPack} ·{' '}
                    {current.document.sha256.slice(0, 8)}…
                  </small>
                  <span className="viewer-actions">
                    {file && (
                      <button
                        type="button"
                        className="button small"
                        onClick={() =>
                          downloadMarkdown(file.name, file.content)
                        }
                      >
                        {messages.documents.downloadMd}
                      </button>
                    )}
                    {file && (
                      <SpecExcelButton
                        fileName={file.name}
                        api={api}
                        projectId={projectId}
                        runId={current.program.runId}
                        item={current.program.item}
                      />
                    )}
                  </span>
                </header>
                {fileError !== null && (
                  <p role="alert" className="error">
                    {requestError(fileError, messages)}
                  </p>
                )}
                {!file && fileError === null && (
                  <p role="status">{copy.loading}</p>
                )}
                {unresolved > 0 && (
                  <div role="status" className="review-banner">
                    <span>{copy.unresolved(unresolved)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        for (const title of previewRef.current?.querySelectorAll(
                          'h1, h2, h3, h4, h5, h6',
                        ) ?? [])
                          if (isUnresolvedHeading(title.textContent)) {
                            title.scrollIntoView({ behavior: 'smooth' });
                            break;
                          }
                      }}
                    >
                      {copy.seeUnresolved}
                    </button>
                  </div>
                )}
                {/* Untrusted AI text: Markdown only, raw HTML dropped (FE-06). */}
                {file && (
                  <Suspense fallback={<p role="status">{copy.loading}</p>}>
                    <MarkdownView content={file.content} />
                  </Suspense>
                )}
              </>
            )}
          </article>
        )}
        {current && (
          <aside className="review-aside" aria-label={copy.reviewLabel}>
            <div className="doc-card">
              <h2>
                {copy.comments}{' '}
                <small>· {docName(current.document.name)}</small>
              </h2>
              {current.document.comments.length === 0 && (
                <span className="muted">{copy.noComments}</span>
              )}
              {current.document.comments.map((comment) => (
                <div
                  key={`${comment.at}-${comment.text}`}
                  className="review-comment"
                >
                  <span className="review-avatar" aria-hidden="true">
                    {comment.reviewer.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <small>
                      <strong>{comment.reviewer}</strong> ·{' '}
                      {formatAt(comment.at)}
                    </small>
                    <span>{comment.text}</span>
                  </span>
                </div>
              ))}
              <form
                className="review-send"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = draft.trim();
                  if (!text) return;
                  void add({ kind: 'comment', text } as Omit<
                    AddReviewEvent,
                    'runId' | 'item' | 'file' | 'sha256'
                  >).then((ok) => {
                    if (ok) setDraft('');
                  });
                }}
              >
                <input
                  type="text"
                  aria-label={copy.commentPlaceholder}
                  placeholder={copy.commentPlaceholder}
                  maxLength={2000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  className="button small"
                  disabled={busy || !draft.trim()}
                >
                  {copy.send}
                </button>
              </form>
            </div>
            {actionError !== null && (
              <p role="alert" className="error">
                {requestError(actionError, messages)}
              </p>
            )}
            <button
              type="button"
              className="button primary review-approve"
              disabled={busy || current.document.status === 'approved'}
              onClick={() => void add({ kind: 'approve' })}
            >
              {current.document.status === 'approved'
                ? copy.status.approved
                : copy.approve}
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
