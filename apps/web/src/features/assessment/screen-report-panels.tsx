import type { SourceInventoryDocument } from '@portal/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocale } from '../../shared/i18n/locale-context';
import { pageOf } from './assessment-summary';
import {
  EMPTY_REPORT_FILTER,
  REPORT_KINDS,
  REPORT_LEVELS,
  filterReports,
  programScreenReport,
  reportListRows,
  screenReportView,
  sortReports,
  type ReportConfidence,
  type ReportKind,
  type ReportLevel,
  type ReportListFilter,
  type ReportListRow,
  type ReportSort,
  type ReportSortKey,
} from './screen-report-model';

// Screens (画面), reports (帳票) and batches (バッチ) of the inventory (AR04).
// Reports come with a reference complexity per report; "suspected" rows are
// shown apart and never added to the report total. An inventory without
// these fields shows "no data, analyze again", not 0.

const PAGE_SIZE = 25;

function useNumber() {
  const { locale } = useLocale();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale);
    return (value: number) => format.format(value);
  }, [locale]);
}

type Inventory = SourceInventoryDocument;

export function ScreenReportKpis({ inventory }: { inventory: Inventory }) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport.kpis;
  const number = useNumber();
  const view = screenReportView(inventory);
  const cards: { key: string; label: string; value: string; sub: ReactNode }[] =
    view.available
      ? [
          {
            key: 'screens',
            label: copy.screens,
            value: number(view.screens),
            sub: copy.screensSub(number(view.sharedScreens)),
          },
          {
            key: 'reports',
            label: copy.reports,
            value: number(view.counted),
            sub: copy.reportsSub(
              number(view.suspectedPrograms),
              number(view.suspected),
            ),
          },
          {
            key: 'batches',
            label: copy.batches,
            value: number(view.batches),
            sub: copy.batchesSub,
          },
        ]
      : [
          { key: 'screens', label: copy.screens },
          { key: 'reports', label: copy.reports },
          { key: 'batches', label: copy.batches },
        ].map((card) => ({
          ...card,
          value: '—',
          sub: copy.noData,
        }));
  return (
    <>
      <ul
        className="kpi-grid kpi-grid-3"
        aria-label={messages.assessment.screenReport.list.title}
      >
        {cards.map((card) => (
          <li
            key={card.key}
            className="kpi lift"
            data-kpi={card.key}
            data-available={view.available}
          >
            <span className="kpi-label">{card.label}</span>
            <span className="kpi-value">{card.value}</span>
            <span className="kpi-sub">{card.sub}</span>
          </li>
        ))}
      </ul>
      {!view.available && (
        <p className="notice" role="note" data-testid="screen-report-nodata">
          <strong>{copy.noData}.</strong> {copy.noDataHelp}
        </p>
      )}
    </>
  );
}

function factorsText(
  row: Pick<ReportListRow, 'factors' | 'reason'>,
  factorNames: Record<string, string>,
  reasons: Record<string, string>,
  empty: string,
): string {
  const parts = row.factors.map((item) =>
    item.factor === 'design-not-analyzed'
      ? (factorNames[item.factor] ?? item.factor)
      : `${factorNames[item.factor] ?? item.factor}: ${item.value} → +${item.points}`,
  );
  if (row.reason) parts.push(reasons[row.reason] ?? row.reason);
  return parts.length > 0 ? parts.join('\n') : empty;
}

function LevelTag({
  level,
  score,
  title,
}: {
  level: ReportLevel;
  score: number | null;
  title: string;
}) {
  const { messages } = useLocale();
  const label = messages.assessment.screenReport.distribution.level[level];
  return (
    <span className={`tag tag-${level}`} title={title}>
      {label}
      {score !== null && ` · ${score}`}
      <span className="sr-only">{`: ${title.replaceAll('\n', '; ')}`}</span>
    </span>
  );
}

function ConfidenceTag({ value }: { value: ReportConfidence }) {
  const { messages } = useLocale();
  return (
    <span className={`tag tag-conf-${value}`}>
      {messages.assessment.screenReport.confidence[value]}
    </span>
  );
}

export function ReportDistribution({ inventory }: { inventory: Inventory }) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  const view = screenReportView(inventory);
  if (!view.available) return null;
  const percent = (count: number) =>
    view.rows === 0 ? '0%' : `${Math.round((count / view.rows) * 100)}%`;
  return (
    <section
      className="report-distribution"
      aria-label={copy.distribution.title}
    >
      <p className="muted" data-testid="report-reference">
        {copy.reference(view.complexityVersion)}. {copy.distribution.help}
      </p>
      <div className="report-distribution-grid">
        <table aria-label={copy.distribution.byLevel}>
          <caption>{copy.distribution.byLevel}</caption>
          <tbody>
            {REPORT_LEVELS.map((level) => (
              <tr key={level} data-level={level}>
                <th scope="row">{copy.distribution.level[level]}</th>
                <td className="num">{number(view.byLevel[level])}</td>
                <td className="num muted">{percent(view.byLevel[level])}</td>
              </tr>
            ))}
            <tr className="total-row">
              <th scope="row">{copy.distribution.total}</th>
              <td className="num" data-testid="report-rows-by-level">
                {number(view.rows)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
        <table aria-label={copy.distribution.byKind}>
          <caption>{copy.distribution.byKind}</caption>
          <tbody>
            {REPORT_KINDS.map((kind) => (
              <tr key={kind} data-kind={kind}>
                <th scope="row">{copy.distribution.kind[kind]}</th>
                <td className="num">{number(view.byKind[kind])}</td>
                <td className="num muted">{percent(view.byKind[kind])}</td>
              </tr>
            ))}
            <tr className="total-row">
              <th scope="row">{copy.distribution.total}</th>
              <td className="num" data-testid="report-rows-by-kind">
                {number(view.rows)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

const DEFAULT_REPORT_SORT: ReportSort = {
  key: 'complexity',
  direction: 'desc',
};

export function ReportList({ inventory }: { inventory: Inventory }) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  const rows = useMemo(() => reportListRows(inventory), [inventory]);
  const [filter, setFilter] = useState<ReportListFilter>(EMPTY_REPORT_FILTER);
  const [sort, setSort] = useState<ReportSort>(DEFAULT_REPORT_SORT);
  const [page, setPage] = useState(1);
  const visible = useMemo(
    () => sortReports(filterReports(rows ?? [], filter), sort),
    [rows, filter, sort],
  );
  if (rows === null) return null;
  const current = pageOf(visible, page, PAGE_SIZE);
  const change = (next: Partial<ReportListFilter>) => {
    setFilter({ ...filter, ...next });
    setPage(1);
  };
  const header = (key: ReportSortKey, label: string) => {
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
          aria-label={copy.list.sortBy(label)}
          onClick={() => {
            setSort(
              active
                ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
                : {
                    key,
                    direction: key === 'complexity' ? 'desc' : 'asc',
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
    <section className="program-list report-list" aria-label={copy.list.title}>
      <div className="program-filters">
        <label>
          <span>{copy.list.search}</span>
          <input
            type="search"
            value={filter.query}
            onChange={(event) => change({ query: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>{copy.list.levelFilter}</span>
          <select
            value={filter.level}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'all') change({ level: 'all' });
              else {
                const level = REPORT_LEVELS.find((item) => item === value);
                if (level) change({ level });
              }
            }}
          >
            <option value="all">{copy.list.all}</option>
            {REPORT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {copy.distribution.level[level]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.list.kindFilter}</span>
          <select
            value={filter.kind}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'all') change({ kind: 'all' });
              else {
                const kind = REPORT_KINDS.find((item) => item === value);
                if (kind) change({ kind });
              }
            }}
          >
            <option value="all">{copy.list.all}</option>
            {REPORT_KINDS.map((kind: ReportKind) => (
              <option key={kind} value={kind}>
                {copy.distribution.kind[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.list.confidenceFilter}</span>
          <select
            value={filter.confidence}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (
                value === 'all' ||
                value === 'counted' ||
                value === 'suspected'
              )
                change({ confidence: value });
            }}
          >
            <option value="all">{copy.list.all}</option>
            <option value="counted">{copy.list.confidenceCounted}</option>
            <option value="suspected">{copy.confidence.suspected}</option>
          </select>
        </label>
      </div>
      <p className="muted" role="status">
        {copy.list.count(number(visible.length), number(rows.length))}
      </p>
      {visible.length === 0 ? (
        <p className="empty-state">
          {rows.length > 0 ? copy.list.noMatch : copy.list.none}
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="program-table" data-testid="report-table">
              <thead>
                <tr>
                  {header('program', copy.list.columns.program)}
                  {header('module', copy.list.columns.module)}
                  {header('kind', copy.list.columns.kind)}
                  {header('name', copy.list.columns.name)}
                  {header('file', copy.list.columns.location)}
                  {header('confidence', copy.list.columns.confidence)}
                  {header('complexity', copy.list.columns.complexity)}
                </tr>
              </thead>
              <tbody>
                {current.items.map((row) => (
                  <tr key={row.key} data-kind={row.kind}>
                    <th scope="row">
                      {row.programs
                        .slice(0, 2)
                        .map((program) => program.label)
                        .join(', ')}
                      {row.programs.length > 2 && (
                        <span className="muted">
                          {' '}
                          {copy.list.morePrograms(
                            number(row.programs.length - 2),
                          )}
                        </span>
                      )}
                      {row.shared && (
                        <span className="badge">{copy.list.sharedFile}</span>
                      )}
                    </th>
                    <td className="mono">{row.module}</td>
                    <td>{copy.distribution.kind[row.kind]}</td>
                    <td>{row.name}</td>
                    <td className="mono">
                      {row.file}
                      {row.line !== null && `:${row.line}`}
                      {row.warnings.map((code) => (
                        <span key={code} className="error-text">
                          <br />
                          {copy.warnings[code] ?? code}
                        </span>
                      ))}
                    </td>
                    <td>
                      <ConfidenceTag value={row.confidence} />
                    </td>
                    <td>
                      <LevelTag
                        level={row.level}
                        score={row.score}
                        title={factorsText(
                          row,
                          copy.factors,
                          copy.reasons,
                          copy.list.noFactors,
                        )}
                      />
                      <span className="badge">
                        {copy.reference(row.version)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label={copy.list.title}>
            <button
              className="button small"
              disabled={current.page <= 1}
              onClick={() => setPage(current.page - 1)}
            >
              {copy.list.previous}
            </button>
            <span>
              {copy.list.page(number(current.page), number(current.pages))}
            </span>
            <button
              className="button small"
              disabled={current.page >= current.pages}
              onClick={() => setPage(current.page + 1)}
            >
              {copy.list.next}
            </button>
          </nav>
        </>
      )}
    </section>
  );
}

export function ReportsTab({ inventory }: { inventory: Inventory }) {
  const { messages } = useLocale();
  const view = screenReportView(inventory);
  if (!view.available)
    return (
      <p className="empty-state" data-testid="reports-nodata">
        {messages.assessment.screenReport.kpis.noDataHelp}
      </p>
    );
  return (
    <>
      <ReportDistribution inventory={inventory} />
      <ReportList inventory={inventory} />
    </>
  );
}

// "Screens and reports" tab of one program: file:line and the confidence of
// each row, with the same warnings as the project list.
export function ProgramScreensReports({
  inventory,
  projectPath,
}: {
  inventory: Inventory;
  projectPath: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const program = inventory.programs.find(
    (candidate) => candidate.projectPath === projectPath,
  );
  const data = program ? programScreenReport(program) : null;
  if (!data || !data.available)
    return (
      <p className="empty-state" data-testid="program-screen-nodata">
        {copy.kpis.noDataHelp}
      </p>
    );
  const suspected = data.reports.some((row) => row.confidence === 'suspected');
  return (
    <>
      <p className="muted">
        {copy.programTypes[data.programType]} · {copy.reference(null)}
      </p>
      <h6>{copy.detail.screensTitle}</h6>
      {data.screens.length === 0 ? (
        <p className="empty-state">{copy.detail.noScreens}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table" data-testid="program-screens">
            <thead>
              <tr>
                <th scope="col">{copy.detail.columns.screen}</th>
                <th scope="col">{copy.detail.columns.file}</th>
                <th scope="col">{copy.detail.columns.notes}</th>
              </tr>
            </thead>
            <tbody>
              {data.screens.map((screen) => (
                <tr key={screen.file}>
                  <th scope="row">{screen.name ?? '—'}</th>
                  <td className="mono">{screen.file}</td>
                  <td>
                    {screen.shared && (
                      <span className="badge">{copy.detail.sharedScreen}</span>
                    )}
                    {screen.warnings.map((code) => (
                      <span key={code} className="error-text">
                        {copy.warnings[code] ?? code}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h6>{copy.detail.reportsTitle}</h6>
      {data.reports.length === 0 ? (
        <p className="empty-state">{copy.detail.noReports}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table" data-testid="program-reports">
            <thead>
              <tr>
                <th scope="col">{copy.detail.columns.name}</th>
                <th scope="col">{copy.detail.columns.kind}</th>
                <th scope="col">{copy.detail.columns.location}</th>
                <th scope="col">{copy.detail.columns.confidence}</th>
                <th scope="col">{copy.detail.columns.complexity}</th>
              </tr>
            </thead>
            <tbody>
              {data.reports.map((row) => (
                <tr key={`${row.kind}:${row.file}:${row.line}:${row.name}`}>
                  <th scope="row">{row.name}</th>
                  <td>{copy.distribution.kind[row.kind]}</td>
                  <td className="mono">
                    {row.file}
                    {row.line !== null && `:${row.line}`}
                    {row.warnings.map((code) => (
                      <span key={code} className="error-text">
                        <br />
                        {copy.warnings[code] ?? code}
                      </span>
                    ))}
                  </td>
                  <td>
                    <ConfidenceTag value={row.confidence} />
                  </td>
                  <td>
                    <LevelTag
                      level={row.complexity.level}
                      score={row.complexity.score}
                      title={factorsText(
                        {
                          factors: row.complexity.factors,
                          reason: row.complexity.reason ?? null,
                        },
                        copy.factors,
                        copy.reasons,
                        copy.list.noFactors,
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {suspected && <p className="muted">{copy.detail.suspectedNote}</p>}
    </>
  );
}
