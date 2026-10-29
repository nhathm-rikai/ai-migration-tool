import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ArtifactEnvelope } from '@portal/contracts';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import { ApiError } from '../../shared/api/api-error';
import { useLocale } from '../../shared/i18n/locale-context';
import type { Messages } from '../../shared/i18n/vi';
import { Link, stepPath } from '../../app/router';
import { projectErrorMessage } from '../projects/project-messages';
import {
  filterPrograms,
  pageOf,
  programLabel,
  sortPrograms,
  summarizeInventory,
  type AssessmentSummary,
  type AssessmentWarning,
  type ProgramFilter,
  type ProgramRow,
  type ProgramSort,
  type ProgramSortKey,
} from './assessment-summary';
import {
  complexityHistogram,
  crudMatrix,
  dashboardKpis,
  hasMappedCrud,
  locDistribution,
  memberKinds,
} from './analysis-dashboard';
import type { CrudView } from './program-detail-model';
import { ProgramDetail } from './program-detail';
import { ComplexityCell, ProgramStateTag } from './tags';
import { useRunAssessment } from './use-run-assessment';

// Analysis step of one succeeded run (UI02, demo02 layout over F03/F04):
// KPI cards, line split and complexity histogram, the corpus totals apart
// from per-program totals, warnings, then tabs for the program list (detail
// opens inline under its row), the call graph (UI03) and the project-wide
// CRUD matrix. Version/snapshot metadata stays under "technical
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
      <h3 id="assessment-title" className="sr-only">
        {copy.title}
      </h3>
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
      {state.status === 'ready' && (
        <ArtifactView artifact={state.artifact} projectId={projectId} />
      )}
    </section>
  );
}

type Tab = 'programs' | 'graph' | 'tables';
const TABS: Tab[] = ['programs', 'graph', 'tables'];

const EMPTY_FILTER: ProgramFilter = { query: '', state: 'all', level: 'all' };
const DEFAULT_SORT: ProgramSort = { key: 'complexity', direction: 'desc' };
const PAGE_SIZES = [25, 50, 100] as const;
const TABLE_PAGE_SIZE = 50;

function useNumber() {
  const { locale } = useLocale();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale);
    return (value: number) => format.format(value);
  }, [locale]);
}

// Counts up to `value` over the data duration (demo02 motion). Shows the
// final number at once when the browser asks for reduced motion or cannot
// say (tests).
const COUNT_UP_MS = 850;
function useCountUp(value: number): number {
  const [shown, setShown] = useState(() => (animationAllowed() ? 0 : value));
  useEffect(() => {
    if (!animationAllowed()) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

function animationAllowed(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    typeof window.requestAnimationFrame === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function CountUp({ value, testId }: { value: number; testId?: string }) {
  const number = useNumber();
  const shown = useCountUp(value);
  return (
    <span className="mono" data-testid={testId}>
      {number(shown)}
    </span>
  );
}

function ArtifactView({
  artifact,
  projectId,
}: {
  artifact: ArtifactEnvelope;
  projectId: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment;
  const summary = useMemo(
    () => summarizeInventory(artifact.payload),
    [artifact.payload],
  );
  const [tab, setTab] = useState<Tab>('programs');
  const [filter, setFilter] = useState<ProgramFilter>(EMPTY_FILTER);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const baseId = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  const panelId = (value: Tab) => `${baseId}-${value}`;
  const tableCount = useMemo(
    () =>
      crudMatrix(
        artifact.payload,
        hasMappedCrud(artifact.payload) ? 'mapped' : 'raw',
      ).length,
    [artifact.payload],
  );
  const counts: Record<Tab, number | null> = {
    programs: summary.programs.length,
    graph: null,
    tables: tableCount,
  };
  const showPrograms = (next: Partial<ProgramFilter>) => {
    setFilter({ ...EMPTY_FILTER, ...next });
    setTab('programs');
    tabsRef.current?.scrollIntoView?.({ block: 'start' });
  };
  return (
    <div className="dashboard">
      <p className="muted">{copy.draftNotice}</p>
      {summary.partial && (
        <p className="notice" role="note">
          <strong>{copy.partialTitle}</strong> {copy.partialHelp}
        </p>
      )}
      <Kpis artifact={artifact} summary={summary} />
      <div className="dashboard-charts">
        <LocSplit summary={summary} artifact={artifact} />
        <Histogram
          summary={summary}
          artifact={artifact}
          onShowPrograms={showPrograms}
        />
      </div>
      <Totals summary={summary} />
      <Warnings summary={summary} onShowPrograms={showPrograms} />
      <section
        className="panel analysis-tabs"
        aria-label={copy.dashboard.sectionLabel}
      >
        <div
          className="tabs dashboard-tabs"
          role="tablist"
          aria-label={copy.tabsLabel}
          ref={tabsRef}
        >
          {TABS.map((value) => (
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
              {counts[value] !== null && (
                <span className="tab-count">{counts[value]}</span>
              )}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={panelId('programs')}
          aria-labelledby={`${panelId('programs')}-tab`}
          hidden={tab !== 'programs'}
        >
          <ProgramList
            artifact={artifact}
            projectId={projectId}
            rows={summary.programs}
            filter={filter}
            onFilter={setFilter}
            openKey={openKey}
            onToggle={(key) =>
              setOpenKey((current) => (current === key ? null : key))
            }
          />
        </div>
        <div
          role="tabpanel"
          id={panelId('graph')}
          aria-labelledby={`${panelId('graph')}-tab`}
          hidden={tab !== 'graph'}
        >
          <p className="notice">{copy.dashboard.graphSoon}</p>
        </div>
        <div
          role="tabpanel"
          id={panelId('tables')}
          aria-labelledby={`${panelId('tables')}-tab`}
          hidden={tab !== 'tables'}
        >
          {tab === 'tables' && <TableMatrix artifact={artifact} />}
        </div>
      </section>
      <TechnicalInfo artifact={artifact} summary={summary} />
    </div>
  );
}

function Kpis({
  artifact,
  summary,
}: {
  artifact: ArtifactEnvelope;
  summary: AssessmentSummary;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard.kpis;
  const number = useNumber();
  const kpis = useMemo(
    () => dashboardKpis(artifact.payload, summary),
    [artifact.payload, summary],
  );
  const cards: {
    key: string;
    label: string;
    value: number;
    sub: ReactNode;
    tone?: string;
  }[] = [
    {
      key: 'programs',
      label: copy.programs,
      value: kpis.programs,
      sub: copy.programsSub(number(kpis.completePrograms)),
    },
    {
      key: 'physical',
      label: copy.physical,
      value: kpis.physicalLines,
      sub: (
        <>
          {copy.physicalSub}{' '}
          <span data-testid="unique-code-lines">{number(kpis.codeLines)}</span>
        </>
      ),
    },
    {
      key: 'procedures',
      label: copy.procedures,
      value: kpis.procedures,
      sub: copy.proceduresSub(number(kpis.analyzedFiles)),
    },
    {
      key: 'sql',
      label: copy.sql,
      value: kpis.sqlLocations,
      sub:
        kpis.concatenatedSql === null
          ? copy.sqlSubOld
          : copy.sqlSub(number(kpis.concatenatedSql)),
    },
    {
      key: 'tables',
      label: copy.tables,
      value: kpis.tables,
      sub: kpis.tablesMapped ? copy.tablesMapped : copy.tablesRaw,
    },
    {
      key: 'high',
      label: copy.high,
      value: kpis.highPrograms,
      sub: copy.highSub(number(kpis.analyzedPrograms)),
      tone: 'risk',
    },
  ];
  return (
    <ul className="kpi-grid">
      {cards.map((card) => (
        <li
          key={card.key}
          className={`kpi lift${card.tone ? ` kpi-${card.tone}` : ''}`}
          data-kpi={card.key}
        >
          <span className="kpi-label">{card.label}</span>
          <span className="kpi-value">
            <CountUp value={card.value} />
          </span>
          <span className="kpi-sub">{card.sub}</span>
        </li>
      ))}
    </ul>
  );
}

function LocSplit({
  summary,
  artifact,
}: {
  summary: AssessmentSummary;
  artifact: ArtifactEnvelope;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard;
  const number = useNumber();
  const parts = locDistribution(artifact.payload.totals.uniqueCounters);
  const total = summary.unique.physicalLines;
  const percent = (lines: number) =>
    total > 0 ? `${((lines / total) * 100).toFixed(1)}%` : '0%';
  return (
    <section className="panel chart-card loc-split" aria-labelledby="loc-title">
      <div className="chart-heading">
        <h4 id="loc-title">{copy.locTitle}</h4>
        <span className="muted">
          {copy.locTotal} <strong className="mono">{number(total)}</strong>
        </span>
      </div>
      <div className="loc-bar" aria-hidden="true">
        {parts
          .filter((part) => part.lines > 0)
          .map((part) => (
            <i
              key={part.key}
              className={`loc-${part.key}`}
              style={{ width: percent(part.lines) }}
              title={copy.loc[part.key]}
            />
          ))}
      </div>
      <dl className="loc-legend">
        {parts.map((part) => (
          <div key={part.key}>
            <dt>
              <span className={`swatch loc-${part.key}`} aria-hidden="true" />
              {copy.loc[part.key]}
            </dt>
            <dd className="mono" data-testid={`loc-${part.key}`}>
              {number(part.lines)}
            </dd>
            <dd className="muted">{percent(part.lines)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Histogram({
  summary,
  artifact,
  onShowPrograms,
}: {
  summary: AssessmentSummary;
  artifact: ArtifactEnvelope;
  onShowPrograms: (filter: Partial<ProgramFilter>) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard;
  const levels = messages.assessment.programs.level;
  const number = useNumber();
  const { bins, notAnalyzed } = complexityHistogram(summary.programs);
  const max = Math.max(1, ...bins.map((bin) => bin.programs));
  return (
    <section
      className="panel chart-card histogram"
      aria-labelledby="hist-title"
    >
      <div className="chart-heading">
        <h4 id="hist-title">{copy.histogramTitle}</h4>
        <span className="muted">
          {copy.histogramPrograms(number(summary.programs.length))}
        </span>
      </div>
      <ol className="histogram-bars">
        {bins.map((bin) => (
          <li key={bin.level} data-level={bin.level}>
            {/* Opens the program list filtered on the level. */}
            <button
              className="histogram-bar"
              disabled={bin.programs === 0}
              onClick={() => onShowPrograms({ level: bin.level })}
            >
              <span className="mono histogram-count">
                {number(bin.programs)}
              </span>
              <i
                className={`tone-${bin.level}`}
                style={{ height: `${(bin.programs / max) * 100}%` }}
                aria-hidden="true"
              />
              <span className="histogram-label">{levels[bin.level]}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="muted histogram-note">
        {copy.histogramNote(artifact.payload.complexityVersion)}
        {notAnalyzed > 0 && <> · {copy.notAnalyzed(number(notAnalyzed))}</>}
      </p>
    </section>
  );
}

function Totals({ summary }: { summary: AssessmentSummary }) {
  const { messages } = useLocale();
  const copy = messages.assessment.totals;
  const { unique } = summary;
  const number = useNumber();
  return (
    <div className="assessment-totals panel">
      <section aria-labelledby="unique-totals">
        <h4 id="unique-totals">{copy.uniqueTitle}</h4>
        <p className="muted">{copy.uniqueHelp}</p>
        <dl className="stat-grid">
          <div>
            <dt>{copy.codeLines}</dt>
            <dd>{number(unique.codeLines)}</dd>
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
      default:
        return null;
    }
  };
  return (
    <section className="panel warnings-card" aria-labelledby="warnings-title">
      <h4 id="warnings-title">{copy.warningsTitle}</h4>
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
    </section>
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

const COLUMNS = 8;

function ProgramList({
  artifact,
  projectId,
  rows,
  filter,
  onFilter,
  openKey,
  onToggle,
}: {
  artifact: ArtifactEnvelope;
  projectId: string;
  rows: ProgramRow[];
  filter: ProgramFilter;
  onFilter: (filter: ProgramFilter) => void;
  openKey: string | null;
  onToggle: (key: string) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.programs;
  const dashboard = messages.assessment.dashboard;
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
                : {
                    key,
                    direction:
                      key === 'program' || key === 'kind' ? 'asc' : 'desc',
                  },
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
    <section aria-label={copy.title} className="program-list">
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
                  {header('kind', copy.columns.kind)}
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
                  const open = row.key === openKey;
                  const detailId = `program-detail-${row.key}`;
                  return (
                    <Fragment key={row.key}>
                      <tr className={open ? 'selected' : undefined}>
                        <th scope="row">
                          <button
                            className="link-button program-toggle"
                            aria-expanded={open}
                            aria-controls={open ? detailId : undefined}
                            onClick={() => onToggle(row.key)}
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
                          <span className="kind-list">
                            {memberKinds(row)
                              .map(
                                (item) =>
                                  `${item.count} ${dashboard.kinds[item.kind] ?? item.kind}`,
                              )
                              .join(' · ')}
                          </span>
                        </td>
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
                      {open && (
                        <tr className="program-detail-row" id={detailId}>
                          <td colSpan={COLUMNS}>
                            <div className="detail-actions">
                              <Link
                                className="button primary small"
                                to={`${stepPath(projectId, 'documents')}?program=${encodeURIComponent(row.projectPath)}`}
                              >
                                {dashboard.createDocs} →
                              </Link>
                            </div>
                            <ProgramDetail
                              inventory={artifact.payload}
                              projectPath={row.key}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

// Project-wide CRUD matrix, as written or after table name mapping (the
// same toggle as the program detail); falls back to the names as written
// when the inventory has no mapped view.
function TableMatrix({ artifact }: { artifact: ArtifactEnvelope }) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard;
  const detail = messages.assessment.detail;
  const number = useNumber();
  const mappedAvailable = hasMappedCrud(artifact.payload);
  const [view, setView] = useState<CrudView>(
    mappedAvailable ? 'mapped' : 'raw',
  );
  const shown: CrudView = view === 'mapped' && mappedAvailable ? view : 'raw';
  const rows = useMemo(
    () => crudMatrix(artifact.payload, shown),
    [artifact.payload, shown],
  );
  const [page, setPage] = useState(1);
  const current = pageOf(rows, page, TABLE_PAGE_SIZE);
  const id = useId();
  return (
    <section
      aria-label={messages.assessment.tabs.tables}
      className="table-matrix"
    >
      <fieldset className="crud-view">
        <legend>{detail.crudView}</legend>
        {(['raw', 'mapped'] as const).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`${id}-view`}
              value={option}
              checked={view === option}
              onChange={() => {
                setView(option);
                setPage(1);
              }}
            />{' '}
            {detail.crudViews[option]}
          </label>
        ))}
      </fieldset>
      <p className="muted" role="note">
        {shown === 'raw' ? detail.crudRawHelp : detail.crudMappedHelp}{' '}
        {copy.tablesHelp}
      </p>
      {view === 'mapped' && !mappedAvailable && (
        <p className="notice">{detail.mappedAbsent}</p>
      )}
      {rows.length === 0 ? (
        <p className="empty-state">{copy.tablesNone}</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="program-table crud-matrix">
              <thead>
                <tr>
                  <th scope="col">{copy.columns.table}</th>
                  {(['C', 'R', 'U', 'D'] as const).map((operation) => (
                    <th scope="col" key={operation} className="crud-op">
                      {operation}
                    </th>
                  ))}
                  <th scope="col">{copy.columns.programs}</th>
                  <th scope="col">{copy.columns.locations}</th>
                  <th scope="col">{copy.columns.top}</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((row) => (
                  <tr key={row.table}>
                    <th scope="row" className="mono">
                      {row.table}
                    </th>
                    {(['C', 'R', 'U', 'D'] as const).map((operation) => (
                      <td key={operation} className="crud-op">
                        {row.operations[operation] ? (
                          <span className={`crud-mark crud-${operation}`}>
                            {operation}
                          </span>
                        ) : (
                          <span className="muted" aria-label="—">
                            ·
                          </span>
                        )}
                      </td>
                    ))}
                    <td>{number(row.programs)}</td>
                    <td>{number(row.locations)}</td>
                    <td>
                      {row.top ? (
                        <>
                          {row.top.program}{' '}
                          <span className="muted">
                            ({number(row.top.locations)})
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {current.pages > 1 && (
            <nav className="pagination" aria-label={copy.tablesPagination}>
              <button
                className="button small"
                disabled={current.page <= 1}
                onClick={() => setPage(current.page - 1)}
              >
                {messages.assessment.programs.previous}
              </button>
              <span>
                {messages.assessment.programs.page(current.page, current.pages)}
              </span>
              <button
                className="button small"
                disabled={current.page >= current.pages}
                onClick={() => setPage(current.page + 1)}
              >
                {messages.assessment.programs.next}
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
