import { useId, useMemo, useState, type ReactNode } from 'react';
import type { ArtifactEnvelope } from '@portal/contracts';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import { ApiError } from '../../shared/api/api-error';
import { useLocale } from '../../shared/i18n/locale-context';
import type { Messages } from '../../shared/i18n/vi';
import { projectErrorMessage } from '../projects/project-messages';
import {
  countBy,
  filterPrograms,
  pageOf,
  programLabel,
  sortPrograms,
  summarizeInventory,
  type AssessmentSummary,
  type AssessmentWarning,
  type ComplexityLevel,
  type ProgramFilter,
  type ProgramRow,
  type ProgramSort,
  type ProgramSortKey,
  type ProgramState,
} from './assessment-summary';
import { ProgramDetail } from './program-detail';
import { ComplexityCell, ProgramStateTag } from './tags';
import { useRunAssessment } from './use-run-assessment';

// Assessment of one succeeded run (F03/F04): an overview tab (unique corpus
// totals apart from per-program totals, distributions, warnings), the
// program list (filter, sort, pages) and the detail of the program picked
// from it. Version/snapshot metadata stays available under "technical
// information". Parent keys it by run.

function assessmentErrorMessage(error: unknown, messages: Messages): string {
  if (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.code === 'ARTIFACT_NOT_FOUND'
  )
    return messages.assessment.errors.ARTIFACT_NOT_FOUND;
  if (error instanceof ApiError)
    return projectErrorMessage(error, 'runs', messages.errors);
  return messages.assessment.errors.mismatch;
}

export function AssessmentOverview({
  api,
  projectId,
  runId,
}: {
  api: ArtifactsApi;
  projectId: string;
  runId: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment;
  const { state, retry } = useRunAssessment(api, projectId, runId);
  return (
    <section className="assessment" aria-labelledby="assessment-title">
      <h3 id="assessment-title">{copy.title}</h3>
      {state.status === 'loading' && <p role="status">{copy.loading}</p>}
      {state.status === 'error' && (
        <div>
          <p role="alert" className="error">
            {assessmentErrorMessage(state.error, messages)}
          </p>
          <button className="button small" onClick={retry}>
            {copy.retry}
          </button>
        </div>
      )}
      {state.status === 'empty' && <p className="empty-state">{copy.empty}</p>}
      {state.status === 'ready' && <ArtifactView artifact={state.artifact} />}
    </section>
  );
}

type Tab = 'overview' | 'programs' | 'detail';

const EMPTY_FILTER: ProgramFilter = { query: '', state: 'all', level: 'all' };
const DEFAULT_SORT: ProgramSort = { key: 'complexity', direction: 'desc' };
const PAGE_SIZES = [25, 50, 100] as const;

function useNumber() {
  const { locale } = useLocale();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale);
    return (value: number) => format.format(value);
  }, [locale]);
}

function ArtifactView({ artifact }: { artifact: ArtifactEnvelope }) {
  const { messages } = useLocale();
  const copy = messages.assessment;
  const summary = useMemo(
    () => summarizeInventory(artifact.payload),
    [artifact.payload],
  );
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState<ProgramFilter>(EMPTY_FILTER);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const baseId = useId();
  const tabs: Tab[] = selectedKey
    ? ['overview', 'programs', 'detail']
    : ['overview', 'programs'];
  const panelId = (value: Tab) => `${baseId}-${value}`;
  const showPrograms = (next: Partial<ProgramFilter>) => {
    setFilter({ ...EMPTY_FILTER, ...next });
    setTab('programs');
  };
  return (
    <>
      <div className="tabs" role="tablist" aria-label={copy.tabsLabel}>
        {tabs.map((value) => (
          <button
            key={value}
            id={`${panelId(value)}-tab`}
            role="tab"
            className="tab"
            aria-selected={tab === value}
            aria-controls={panelId(value)}
            onClick={() => setTab(value)}
          >
            {copy.tabs[value]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={panelId('overview')}
        aria-labelledby={`${panelId('overview')}-tab`}
        hidden={tab !== 'overview'}
      >
        <Overview
          artifact={artifact}
          summary={summary}
          onShowPrograms={showPrograms}
        />
      </div>
      <div
        role="tabpanel"
        id={panelId('programs')}
        aria-labelledby={`${panelId('programs')}-tab`}
        hidden={tab !== 'programs'}
      >
        <ProgramList
          rows={summary.programs}
          filter={filter}
          onFilter={setFilter}
          selectedKey={selectedKey}
          onSelect={(key) => {
            setSelectedKey(key);
            setTab('detail');
          }}
        />
      </div>
      {selectedKey && (
        <div
          role="tabpanel"
          id={panelId('detail')}
          aria-labelledby={`${panelId('detail')}-tab`}
          hidden={tab !== 'detail'}
        >
          <button
            className="button small back-button"
            onClick={() => setTab('programs')}
          >
            {copy.detail.back}
          </button>
          <ProgramDetail
            key={selectedKey}
            inventory={artifact.payload}
            projectPath={selectedKey}
          />
        </div>
      )}
    </>
  );
}

function Overview({
  artifact,
  summary,
  onShowPrograms,
}: {
  artifact: ArtifactEnvelope;
  summary: AssessmentSummary;
  onShowPrograms: (filter: Partial<ProgramFilter>) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment;
  return (
    <>
      <p className="muted">{copy.draftNotice}</p>
      {summary.partial && (
        <p className="notice" role="note">
          <strong>{copy.partialTitle}</strong> {copy.partialHelp}
        </p>
      )}
      <div className="assessment-charts">
        <Distribution summary={summary} onShowPrograms={onShowPrograms} />
      </div>
      <Totals summary={summary} />
      <Warnings summary={summary} onShowPrograms={onShowPrograms} />
      <TechnicalInfo artifact={artifact} summary={summary} />
    </>
  );
}

const LEVELS: ComplexityLevel[] = ['low', 'medium', 'high', 'very-high'];
const STATES: ProgramState[] = ['complete', 'partial', 'unsupported'];
const STATE_TONE: Record<ProgramState, ComplexityLevel> = {
  complete: 'low',
  partial: 'medium',
  unsupported: 'high',
};

function Distribution({
  summary,
  onShowPrograms,
}: {
  summary: AssessmentSummary;
  onShowPrograms: (filter: Partial<ProgramFilter>) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment;
  const number = useNumber();
  const levels = countBy(
    summary.programs,
    (row) => row.complexity?.level ?? null,
  );
  const states = countBy(summary.programs, (row) => row.state);
  const total = summary.programs.length;
  return (
    <>
      <Bar
        title={copy.distributionTitle}
        total={total}
        parts={LEVELS.map((level) => ({
          key: level,
          tone: level,
          label: copy.programs.level[level],
          count: levels[level] ?? 0,
          onClick: () => onShowPrograms({ level }),
        }))}
        number={number}
      />
      <Bar
        title={copy.stateTitle}
        total={total}
        parts={STATES.map((state) => ({
          key: state,
          tone: STATE_TONE[state],
          label: copy.programs.state[state],
          count: states[state] ?? 0,
          onClick: () => onShowPrograms({ state }),
        }))}
        number={number}
      />
    </>
  );
}

function Bar({
  title,
  total,
  parts,
  number,
}: {
  title: string;
  total: number;
  parts: {
    key: string;
    tone: ComplexityLevel;
    label: string;
    count: number;
    onClick: () => void;
  }[];
  number: (value: number) => string;
}) {
  const shown = parts.filter((part) => part.count > 0);
  return (
    <section className="distribution">
      <h4>{title}</h4>
      <div className="stack" aria-hidden="true">
        {shown.map((part) => (
          <i
            key={part.key}
            className={`tone-${part.tone}`}
            style={{ width: `${total ? (part.count / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <ul className="legend">
        {parts.map((part) => (
          <li key={part.key}>
            <button
              className="link-button"
              disabled={part.count === 0}
              onClick={part.onClick}
            >
              <span className={`tag tag-${part.tone}`}>{part.label}</span>{' '}
              {number(part.count)}
              {total > 0 && (
                <span className="muted">
                  {' '}
                  ({Math.round((part.count / total) * 100)}%)
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Totals({ summary }: { summary: AssessmentSummary }) {
  const { messages } = useLocale();
  const copy = messages.assessment.totals;
  const { unique } = summary;
  const number = useNumber();
  return (
    <div className="assessment-totals">
      <section aria-labelledby="unique-totals">
        <h4 id="unique-totals">{copy.uniqueTitle}</h4>
        <p className="muted">{copy.uniqueHelp}</p>
        <dl className="stat-grid">
          <div>
            <dt>{copy.codeLines}</dt>
            <dd data-testid="unique-code-lines">{number(unique.codeLines)}</dd>
          </div>
          <div>
            <dt>{copy.physicalLines}</dt>
            <dd>{number(unique.physicalLines)}</dd>
          </div>
          <div>
            <dt>{copy.coverage}</dt>
            <dd data-testid="coverage">
              {copy.coverageValue(
                number(unique.analyzedCodeFiles),
                number(unique.codeFiles),
              )}
            </dd>
          </div>
          <div>
            <dt>{copy.files}</dt>
            <dd>{number(unique.files)}</dd>
          </div>
          <div>
            <dt>{copy.sharedFiles}</dt>
            <dd>{number(unique.sharedFiles)}</dd>
          </div>
          <div>
            <dt>{copy.problemFiles}</dt>
            <dd>
              {copy.problemValue(
                number(unique.errorFiles),
                number(unique.unsupportedFiles),
                unique.skippedFiles === null
                  ? copy.unknown
                  : number(unique.skippedFiles),
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="program-totals">
        <h4 id="program-totals">{copy.perProgramTitle}</h4>
        <p className="muted">{copy.perProgramHelp}</p>
        <dl className="stat-grid">
          <div>
            <dt>{copy.programs}</dt>
            <dd>{number(summary.programs.length)}</dd>
          </div>
          <div>
            <dt>{copy.perProgramCodeLines}</dt>
            <dd data-testid="per-program-code-lines">
              {number(summary.perProgramCodeLines)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

const MISSING_SHOWN = 5;

// Warnings that concern programs carry their count and open the list
// filtered on them; the others are corpus-wide notes. Missing member files
// are named, since one shared file usually explains most incomplete
// programs.
function warningTarget(code: AssessmentWarning): Partial<ProgramFilter> | null {
  if (code === 'PROGRAM_INCOMPLETE') return { state: 'partial' };
  if (code === 'PROGRAM_UNSUPPORTED') return { state: 'unsupported' };
  return null;
}

function Warnings({
  summary,
  onShowPrograms,
}: {
  summary: AssessmentSummary;
  onShowPrograms: (filter: Partial<ProgramFilter>) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment;
  const number = useNumber();
  if (summary.warnings.length === 0) return null;
  const affected = (code: AssessmentWarning) => {
    const programs = summary.programs;
    switch (code) {
      case 'PROGRAM_INCOMPLETE':
        return programs.filter((row) => row.state === 'partial').length;
      case 'PROGRAM_UNSUPPORTED':
        return programs.filter((row) => row.state === 'unsupported').length;
      case 'MEMBER_UNRESOLVED':
        return programs.filter((row) => row.unresolvedMembers > 0).length;
      case 'COMPLEXITY_REVIEW':
        return programs.filter((row) => row.complexity?.needsReview).length;
      default:
        return null;
    }
  };
  return (
    <>
      <h4>{copy.warningsTitle}</h4>
      <ul className="assessment-warnings">
        {summary.warnings.map((code) => {
          const count = affected(code);
          const target = warningTarget(code);
          return (
            <li key={code}>
              {copy.warnings[code]}
              {count !== null && (
                <strong> {copy.programCount(number(count))}</strong>
              )}
              {target && (
                <>
                  {' '}
                  <button
                    className="link-button"
                    onClick={() => onShowPrograms(target)}
                  >
                    {copy.showPrograms}
                  </button>
                </>
              )}
              {code === 'MEMBER_UNRESOLVED' &&
                summary.missingMembers.length > 0 && (
                  <ul className="missing-members">
                    {summary.missingMembers
                      .slice(0, MISSING_SHOWN)
                      .map((member) => (
                        <li key={`${member.resolution}|${member.path}`}>
                          <span className="mono">{member.path}</span>{' '}
                          <span className="muted">
                            (
                            {messages.assessment.members.resolution[
                              member.resolution
                            ].toLowerCase()}
                            )
                          </span>{' '}
                          {copy.programCount(number(member.programs))}
                        </li>
                      ))}
                    {summary.missingMembers.length > MISSING_SHOWN && (
                      <li className="muted">
                        {copy.moreMissing(
                          number(summary.missingMembers.length - MISSING_SHOWN),
                        )}
                      </li>
                    )}
                  </ul>
                )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TechnicalInfo({
  artifact,
  summary,
}: {
  artifact: ArtifactEnvelope;
  summary: AssessmentSummary;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.assessment;
  const mapping = summary.tableMapping;
  return (
    <details className="technical">
      <summary>{copy.technical}</summary>
      <dl className="project-metadata assessment-header">
        <div>
          <dt>{copy.fields.mode}</dt>
          <dd>
            <span className="badge">
              {artifact.mode === 'demo'
                ? messages.projects.demoBadge
                : messages.projects.localBadge}
            </span>{' '}
            {artifact.mode === 'demo' ? copy.demoData : copy.localData}
          </dd>
        </div>
        <div>
          <dt>{copy.fields.artifact}</dt>
          <dd className="mono">
            {artifact.id.slice(0, 8)} · v{artifact.version}
          </dd>
        </div>
        <div>
          <dt>{copy.fields.snapshot}</dt>
          <dd className="mono" title={artifact.sourceSnapshotHash}>
            {artifact.sourceSnapshotId.slice(0, 8)} ·{' '}
            {artifact.sourceSnapshotHash.slice(0, 12)}
          </dd>
        </div>
        <div>
          <dt>{copy.fields.createdAt}</dt>
          <dd>{formatDateTime(artifact.createdAt)}</dd>
        </div>
        <div>
          <dt>{copy.fields.versions}</dt>
          <dd className="mono">
            {artifact.schemaVersion} · {artifact.payload.metricVersion}
          </dd>
        </div>
        <div>
          <dt>{copy.fields.tableMapping}</dt>
          <dd>
            {mapping ? copy.mapping[mapping.status] : copy.mapping.absent}
            {mapping?.defaultSchema && (
              <span className="mono"> ({mapping.defaultSchema})</span>
            )}
          </dd>
        </div>
        {summary.warnings.length > 0 && (
          <div>
            <dt>{copy.warningsTitle}</dt>
            <dd className="mono">
              {summary.warnings.map((code) => (
                <span key={code} className="warning-code">
                  {code}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}

function ProgramList({
  rows,
  filter,
  onFilter,
  selectedKey,
  onSelect,
}: {
  rows: ProgramRow[];
  filter: ProgramFilter;
  onFilter: (filter: ProgramFilter) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.programs;
  const [sort, setSort] = useState<ProgramSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const visible = useMemo(
    () => sortPrograms(filterPrograms(rows, filter), sort),
    [rows, filter, sort],
  );
  const current = pageOf(visible, page, pageSize);
  const number = useNumber();
  const metric = (value: number | null) =>
    value === null ? copy.notAnalyzed : number(value);
  const changeFilter = (next: ProgramFilter) => {
    onFilter(next);
    setPage(1);
  };
  const header = (key: ProgramSortKey, label: string): ReactNode => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        aria-sort={
          active
            ? sort.direction === 'asc'
              ? 'ascending'
              : 'descending'
            : undefined
        }
      >
        <button
          className="sort-button"
          aria-label={copy.sortBy(label)}
          onClick={() => {
            setSort(
              active
                ? {
                    key,
                    direction: sort.direction === 'asc' ? 'desc' : 'asc',
                  }
                : { key, direction: key === 'program' ? 'asc' : 'desc' },
            );
            setPage(1);
          }}
        >
          {label}
          <span aria-hidden="true" className="sort-mark">
            {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </th>
    );
  };
  return (
    <section aria-label={copy.title}>
      <div className="program-filters">
        <label>
          <span>{copy.search}</span>
          <input
            type="search"
            value={filter.query}
            onChange={(event) =>
              changeFilter({ ...filter, query: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <span>{copy.stateFilter}</span>
          <select
            value={filter.state}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (
                value === 'all' ||
                value === 'complete' ||
                value === 'partial' ||
                value === 'unsupported'
              )
                changeFilter({ ...filter, state: value });
            }}
          >
            <option value="all">{copy.all}</option>
            <option value="complete">{copy.state.complete}</option>
            <option value="partial">{copy.state.partial}</option>
            <option value="unsupported">{copy.state.unsupported}</option>
          </select>
        </label>
        <label>
          <span>{copy.levelFilter}</span>
          <select
            value={filter.level}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (
                value === 'all' ||
                value === 'low' ||
                value === 'medium' ||
                value === 'high' ||
                value === 'very-high'
              )
                changeFilter({ ...filter, level: value });
            }}
          >
            <option value="all">{copy.all}</option>
            <option value="low">{copy.level.low}</option>
            <option value="medium">{copy.level.medium}</option>
            <option value="high">{copy.level.high}</option>
            <option value="very-high">{copy.level['very-high']}</option>
          </select>
        </label>
      </div>
      <p className="muted" role="status">
        {copy.count(visible.length, rows.length)}
      </p>
      {visible.length === 0 ? (
        <p className="empty-state">{rows.length ? copy.noMatch : copy.none}</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="program-table">
              <thead>
                <tr>
                  {header('program', copy.columns.program)}
                  {header('state', copy.columns.state)}
                  {header('ownCodeLines', copy.columns.ownCodeLines)}
                  {header('codeLines', copy.columns.codeLines)}
                  {header('procedures', copy.columns.procedures)}
                  {header('tables', copy.columns.tables)}
                  {header('complexity', copy.columns.complexity)}
                </tr>
              </thead>
              <tbody>
                {current.items.map((row) => {
                  const label = programLabel(row.projectPath);
                  return (
                    <tr
                      key={row.key}
                      className={
                        row.key === selectedKey ? 'selected' : undefined
                      }
                    >
                      <th scope="row">
                        <button
                          className="link-button"
                          aria-pressed={row.key === selectedKey}
                          onClick={() => onSelect(row.key)}
                        >
                          {label}
                        </button>
                        {row.name && row.name !== label && (
                          <span className="muted declared-name">
                            {copy.declaredName(row.name)}
                          </span>
                        )}
                        <span className="mono muted">{row.projectPath}</span>
                      </th>
                      <td>
                        <ProgramStateTag state={row.state} />
                      </td>
                      <td>{metric(row.ownCodeLines)}</td>
                      <td>{metric(row.codeLines)}</td>
                      <td>{metric(row.procedures)}</td>
                      <td>
                        {metric(row.tables)}
                        {row.mappedTables !== null &&
                          row.mappedTables !== row.tables && (
                            <span className="muted">
                              {' '}
                              {copy.mappedTables(number(row.mappedTables))}
                            </span>
                          )}
                      </td>
                      <td>
                        <ComplexityCell complexity={row.complexity} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label={copy.pagination}>
            <button
              className="button small"
              disabled={current.page <= 1}
              onClick={() => setPage(current.page - 1)}
            >
              {copy.previous}
            </button>
            <span>{copy.page(current.page, current.pages)}</span>
            <button
              className="button small"
              disabled={current.page >= current.pages}
              onClick={() => setPage(current.page + 1)}
            >
              {copy.next}
            </button>
            <label>
              <span>{copy.pageSize}</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.currentTarget.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </nav>
        </>
      )}
    </section>
  );
}
