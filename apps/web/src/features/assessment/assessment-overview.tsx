import {
  Fragment,
  Suspense,
  lazy,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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
  rowsForMappedView,
} from './analysis-dashboard';
import type { CrudView } from './program-detail-model';
import { ProgramDetail } from './program-detail';
import {
  ComplexityCell,
  MappingStatus,
  ProgramStateTag,
  TableNameView,
} from './tags';
import { effectiveMapping, type EffectiveMapping } from './table-mapping';
import { ReportExportButton, type SaveFile } from './report-export';
import {
  CustomerPdfButton,
  type RenderCustomerPdf,
} from './customer-pdf-button';
import { ReportsTab, ScreenReportKpis } from './screen-report-panels';
import { deriveReportSummary } from '@portal/contracts';
import { useRunAssessment } from './use-run-assessment';

// Analysis step of one succeeded run (UI02, demo02 layout over F03/F04):
// KPI cards, line split and complexity histogram, the corpus totals apart
// from per-program totals, warnings, then tabs for the program list (detail
// opens inline under its row), the call graph (UI03, loaded lazily) and the project-wide
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
  headerSlot = null,
  saveFile,
  renderCustomerPdf,
}: {
  api: ArtifactsApi;
  projectId: string;
  runId: string;
  // Header of the step page, where the export button goes.
  headerSlot?: HTMLElement | null;
  saveFile?: SaveFile;
  // Draws the customer PDF; tests replace it (jsdom cannot paint).
  renderCustomerPdf?: RenderCustomerPdf;
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
        <>
          {headerSlot &&
            createPortal(
              <span className="export-group-title">
                {copy.report.groupTitle}
              </span>,
              headerSlot,
            )}
          <ReportExportButton
            api={api}
            artifact={state.artifact}
            slot={headerSlot}
            {...(saveFile ? { save: saveFile } : {})}
          />
          <CustomerPdfButton
            api={api}
            artifact={state.artifact}
            slot={headerSlot}
            {...(saveFile ? { save: saveFile } : {})}
            {...(renderCustomerPdf ? { render: renderCustomerPdf } : {})}
          />
          <ArtifactView artifact={state.artifact} projectId={projectId} />
        </>
      )}
    </section>
  );
}

type Tab = 'programs' | 'reports' | 'graph' | 'tables';
const TABS: Tab[] = ['programs', 'reports', 'graph', 'tables'];

// The call graph and its libraries (React Flow, ELK) load only when the
// tab is first opened.
const DependencyGraphView = lazy(() =>
  import('./dependency-graph-view').then((module) => ({
    default: module.DependencyGraphView,
  })),
);

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
  const listRows = useMemo(
    () => rowsForMappedView(artifact.payload, summary.programs),
    [artifact.payload, summary.programs],
  );
  const [tab, setTab] = useState<Tab>('programs');
  // Kept mounted once opened, so its layout is not computed again.
  const [graphOpened, setGraphOpened] = useState(false);
  if (tab === 'graph' && !graphOpened) setGraphOpened(true);
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
    reports: deriveReportSummary(artifact.payload)?.counts.templates ?? null,
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
      <AnalysedLine artifact={artifact} summary={summary} />
      {summary.partial && (
        <p className="notice" role="note">
          <strong>{copy.partialTitle}</strong> {copy.partialHelp}
        </p>
      )}
      <Kpis artifact={artifact} summary={summary} />
      <ScreenReportKpis inventory={artifact.payload} />
      <div className="dashboard-charts">
        <LocSplit summary={summary} artifact={artifact} />
        <Histogram summary={summary} onShowPrograms={showPrograms} />
      </div>
      <Warnings
        summary={summary}
        mapping={effectiveMapping(artifact.payload)}
        onShowPrograms={showPrograms}
      />
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
          {/* Slides under the selected tab (demo02 tab indicator). */}
          <span
            className="tab-indicator"
            aria-hidden="true"
            style={{ transform: `translateX(${TABS.indexOf(tab) * 100}%)` }}
          />
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
            rows={listRows}
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
          id={panelId('reports')}
          aria-labelledby={`${panelId('reports')}-tab`}
          hidden={tab !== 'reports'}
        >
          {tab === 'reports' && <ReportsTab inventory={artifact.payload} />}
        </div>
        <div
          role="tabpanel"
          id={panelId('graph')}
          aria-labelledby={`${panelId('graph')}-tab`}
          hidden={tab !== 'graph'}
        >
          {graphOpened && (
            <Suspense
              fallback={<p role="status">{copy.dashboard.graph.loading}</p>}
            >
              <DependencyGraphView inventory={artifact.payload} />
            </Suspense>
          )}
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

// "Analysed at … · N files · M shared": the run the numbers come from, as
// in the demo02 header.
function AnalysedLine({
  artifact,
  summary,
}: {
  artifact: ArtifactEnvelope;
  summary: AssessmentSummary;
}) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.assessment.dashboard;
  const number = useNumber();
  return (
    <p className="analysed-line">
      {copy.analysedAt(formatDateTime(artifact.createdAt))} ·{' '}
      {copy.files(number(summary.unique.files))} ·{' '}
      {copy.sharedFiles(number(summary.unique.sharedFiles))}
    </p>
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
  const totals = messages.assessment.totals;
  const number = useNumber();
  const inferred = effectiveMapping(artifact.payload);
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
          <br />
          {copy.perProgram}{' '}
          <span data-testid="per-program-code-lines">
            {number(summary.perProgramCodeLines)}
          </span>
        </>
      ),
    },
    {
      key: 'procedures',
      label: copy.procedures,
      value: kpis.procedures,
      sub: (
        <>
          {copy.proceduresSub}{' '}
          <span data-testid="coverage">
            {totals.coverageValue(
              number(summary.unique.analyzedCodeFiles),
              number(summary.unique.codeFiles),
            )}
          </span>
        </>
      ),
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
      sub: !kpis.tablesMapped
        ? copy.tablesRaw
        : inferred.inferred && inferred.defaultSchema
          ? copy.tablesInferred(inferred.defaultSchema)
          : copy.tablesMapped,
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
  onShowPrograms,
}: {
  summary: AssessmentSummary;
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
      {notAnalyzed > 0 && (
        <p className="muted histogram-note">
          {copy.notAnalyzed(number(notAnalyzed))}
        </p>
      )}
    </section>
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
  mapping,
  onShowPrograms,
}: {
  summary: AssessmentSummary;
  mapping: EffectiveMapping;
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
              {/* Says which schema the table names are merged under,
                  rather than only that the mapping is unconfirmed. */}
              {code === 'TABLE_NAMES_NOT_CONFIRMED'
                ? mapping.defaultSchema !== null
                  ? copy.tableSchema.assumed(
                      mapping.defaultSchema,
                      mapping.inferred,
                    )
                  : copy.tableSchema.none
                : copy.warnings[code]}
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
            <MappingStatus
              mapping={effectiveMapping(artifact.payload)}
              stored={mapping !== null}
            />
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

const COLUMNS = 11;

// List row: the table count shown first is the mapped one when there is a
// mapped view (configured or inferred); the count as written stays beside it.
type ListRow = ProgramRow & { rawTables: number | null };

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
  const listRows = useMemo(
    (): ListRow[] =>
      rows.map((row) => ({
        ...row,
        tables: row.mappedTables ?? row.tables,
        rawTables: row.tables,
      })),
    [rows],
  );
  const visible = useMemo(
    () => sortPrograms(filterPrograms(listRows, filter), sort),
    [listRows, filter, sort],
  );
  const current = pageOf(visible, page, pageSize);
  const number = useNumber();
  const metric = (value: number | null) =>
    value === null ? copy.notAnalyzed : number(value);
  const changeFilter = (next: ProgramFilter) => {
    onFilter(next);
    setPage(1);
  };
  const header = (
    key: ProgramSortKey,
    label: string,
    hint?: string,
  ): ReactNode => {
    const active = sort.key === key;
    return (
      <th
        title={hint}
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
                  {header(
                    'codeLines',
                    copy.columns.codeLines,
                    copy.columnHints.codeLines,
                  )}
                  {header('procedures', copy.columns.procedures)}
                  {header('tables', copy.columns.tables)}
                  {header('screens', copy.columns.screens)}
                  {header('reports', copy.columns.reports)}
                  {header(
                    'complexity',
                    copy.columns.complexity,
                    copy.columnHints.complexity,
                  )}
                  <th scope="col" className="chevron-col">
                    <span className="sr-only">{dashboard.detailColumn}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((row) => {
                  const label = programLabel(row.projectPath);
                  const open = row.key === openKey;
                  const detailId = `program-detail-${row.key}`;
                  const kindText = memberKinds(row)
                    .map(
                      (item) =>
                        `${item.count} ${dashboard.kinds[item.kind] ?? item.kind}`,
                    )
                    .join(' · ');
                  return (
                    <Fragment key={row.key}>
                      {/* The whole row opens the detail; the button keeps it
                          reachable by keyboard (its click bubbles here). */}
                      <tr
                        className={`program-row${open ? ' selected' : ''}`}
                        onClick={() => onToggle(row.key)}
                      >
                        <th scope="row">
                          <button
                            className="link-button program-toggle"
                            aria-expanded={open}
                            aria-controls={open ? detailId : undefined}
                          >
                            {label}
                          </button>
                          {row.name && row.name !== label && (
                            <span className="muted declared-name">
                              {copy.declaredName(row.name)}
                            </span>
                          )}
                          <span className="mono muted" title={row.projectPath}>
                            {row.projectPath}
                          </span>
                        </th>
                        <td>
                          <span className="kind-chip" title={kindText}>
                            <i aria-hidden="true" />
                            {kindText}
                          </span>
                        </td>
                        <td>
                          <ProgramStateTag state={row.state} />
                        </td>
                        <td className="num">{metric(row.ownCodeLines)}</td>
                        <td className="num">{metric(row.codeLines)}</td>
                        <td className="num">{metric(row.procedures)}</td>
                        <td className="num">
                          {metric(row.tables)}
                          {row.rawTables !== null &&
                            row.rawTables !== row.tables && (
                              <span className="muted raw-count">
                                {' '}
                                {copy.rawTables(number(row.rawTables))}
                              </span>
                            )}
                        </td>
                        <td className="num" data-col="screens">
                          {metric(row.screens)}
                        </td>
                        <td className="num" data-col="reports">
                          {metric(row.reports)}
                          {row.suspectedReports !== null &&
                            row.suspectedReports > 0 && (
                              <span className="muted raw-count">
                                {' '}
                                {copy.outputShort(number(row.suspectedReports))}
                              </span>
                            )}
                        </td>
                        <td>
                          <span className="cx-cell">
                            {row.complexity && (
                              <span className="cx-bar" aria-hidden="true">
                                <i
                                  className={`tone-${row.complexity.level}`}
                                  style={{ width: `${row.complexity.score}%` }}
                                />
                              </span>
                            )}
                            <ComplexityCell complexity={row.complexity} />
                          </span>
                        </td>
                        <td className="chevron-col">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </td>
                      </tr>
                      {open && (
                        <tr className="program-detail-row" id={detailId}>
                          <td colSpan={COLUMNS}>
                            <div className="detail-card">
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
                            </div>
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
  return (
    <section
      aria-label={messages.assessment.tabs.tables}
      className="table-matrix"
    >
      <TableNameView
        view={view}
        mappedAvailable={mappedAvailable}
        mapping={effectiveMapping(artifact.payload)}
        stored={artifact.payload.tableNames !== undefined}
        onChange={(next) => {
          setView(next);
          setPage(1);
        }}
      />
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
