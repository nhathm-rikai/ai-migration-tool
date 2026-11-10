import {
  REPORT_COUNTING_BASIS,
  REPORT_COUNTING_BASIS_TITLE,
  deriveReportSummary,
  type DataFileOutput,
  type ReportEntry,
  type ReportOrigin,
  type ReportSummary,
  type SourceInventoryDocument,
} from '@portal/contracts';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useLocale } from '../../shared/i18n/locale-context';
import { pageOf, programLabel } from './assessment-summary';
import {
  REPORT_LEVELS,
  programScreenReport,
  screenReportView,
  type ReportLevel,
} from './screen-report-model';

// Screens (画面), reports (帳票) and batches (バッチ) of the inventory. A
// report is counted once: a Crystal / DataReport template name, a form that
// prints in code, a form that exports CSV or Excel; the counting rules are
// stated as assumptions next to the list. Other file output is listed apart
// and not counted. An inventory without these fields shows "no data, analyze
// again", not 0.

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
  const summary = useMemo(() => deriveReportSummary(inventory), [inventory]);
  const cards: { key: string; label: string; value: string; sub: ReactNode }[] =
    view.available && summary
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
            value: number(summary.counts.total),
            sub: (
              <>
                {copy.reportsSub(
                  number(summary.counts.crystal),
                  number(summary.counts.print),
                  number(summary.counts.export),
                )}
                {summary.counts.missingFile > 0 && (
                  <>
                    <br />
                    {copy.reportsMissing(number(summary.counts.missingFile))}
                  </>
                )}
              </>
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
        aria-label={messages.assessment.screenReport.reports.title}
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

type Factored = {
  factors: { factor: string; value: number; points: number }[];
  reason: string | null;
};

function factorsText(
  row: Factored,
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

function programsText(
  programs: readonly string[],
  more: (count: string) => string,
  number: (value: number) => string,
): ReactNode {
  return (
    <>
      {programs
        .slice(0, 2)
        .map((path) => programLabel(path))
        .join(', ')}
      {programs.length > 2 && (
        <span className="muted"> {more(number(programs.length - 2))}</span>
      )}
    </>
  );
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// Complexity of the reports as columns, the same card as "Phân bổ complexity"
// at the top of the step; a level without a report is a bar of no height.
function ReportDistribution({ summary }: { summary: ReportSummary }) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  const levels = REPORT_LEVELS.filter(
    (level) => level !== 'unrated' || summary.counts.byLevel[level] > 0,
  );
  const max = Math.max(
    1,
    ...levels.map((level) => summary.counts.byLevel[level]),
  );
  const total = summary.counts.total;
  const percent = (count: number) =>
    total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`;
  return (
    <section
      className="panel chart-card histogram report-histogram"
      aria-label={copy.distribution.title}
    >
      <header className="chart-heading">
        <h4>{copy.distribution.title}</h4>
        <span className="muted">
          {copy.distribution.total}{' '}
          <strong className="mono" data-testid="report-rows-by-level">
            {number(total)}
          </strong>
        </span>
      </header>
      <ol className="histogram-bars">
        {levels.map((level) => (
          <li key={level} data-level={level}>
            <div className="histogram-bar">
              <span className="mono histogram-count">
                {number(summary.counts.byLevel[level])}
              </span>
              <i
                className={`tone-${level}`}
                style={{
                  height: `${(summary.counts.byLevel[level] / max) * 100}%`,
                }}
                aria-hidden="true"
              />
              <span className="histogram-label">
                {copy.distribution.level[level]}{' '}
                <span className="muted">
                  {percent(summary.counts.byLevel[level])}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className="muted histogram-note" data-testid="report-reference">
        {copy.distribution.help}
      </p>
    </section>
  );
}

function Pagination({
  title,
  page,
  pages,
  onPage,
}: {
  title: string;
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport.list;
  const number = useNumber();
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={title}>
      <button
        className="button small"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {copy.previous}
      </button>
      <span>{copy.page(number(page), number(pages))}</span>
      <button
        className="button small"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {copy.next}
      </button>
    </nav>
  );
}

const originKey = (
  report: ReportEntry,
): 'crystal' | 'data-report' | 'print' | 'export' =>
  report.origin === 'crystal' ? (report.kind ?? 'crystal') : report.origin;

// One row per report; the whole row opens where it is made (program, file,
// line, procedure) below it, like the program list.
function ReportTable({
  reports,
  testId,
}: {
  reports: readonly ReportEntry[];
  testId: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="table-scroll">
      <table className="program-table report-table" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col">{copy.reports.columns.name}</th>
            <th scope="col">{copy.reports.columns.origin}</th>
            <th scope="col">{copy.reports.columns.status}</th>
            <th scope="col">{copy.reports.columns.programs}</th>
            <th scope="col" className="num">
              {copy.reports.columns.uses}
            </th>
            <th scope="col">{copy.reports.columns.complexity}</th>
            <th scope="col" className="chevron-col">
              <span className="sr-only">{copy.reports.columns.details}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const open = openId === report.id;
            const detailId = `report-detail-${report.id}`;
            return (
              <Fragment key={report.id}>
                <tr
                  className={`program-row${open ? ' selected' : ''}`}
                  data-origin={report.origin}
                  onClick={() => setOpenId(open ? null : report.id)}
                >
                  <th scope="row">
                    <button
                      className="link-button program-toggle"
                      aria-expanded={open}
                      aria-controls={open ? detailId : undefined}
                    >
                      {report.name}
                    </button>
                    {report.file !== null && (
                      <span className="mono muted" title={report.file}>
                        {report.file}
                      </span>
                    )}
                  </th>
                  <td>{copy.reports.origin[originKey(report)]}</td>
                  <td>
                    {report.status === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span
                        className={`tag tag-conf-${report.status === 'design-file' ? 'detected' : 'referenced'}`}
                      >
                        {copy.reports.status[report.status]}
                      </span>
                    )}
                  </td>
                  <td>
                    {programsText(
                      report.programs,
                      copy.list.morePrograms,
                      number,
                    )}
                  </td>
                  <td className="num">{number(report.usages.length)}</td>
                  <td>
                    <LevelTag
                      level={report.complexity.level}
                      score={report.complexity.score}
                      title={factorsText(
                        {
                          factors: report.complexity.factors,
                          reason: report.complexity.reason ?? null,
                        },
                        copy.factors,
                        copy.reasons,
                        copy.list.noFactors,
                      )}
                    />
                  </td>
                  <td className="chevron-col">
                    <Chevron />
                  </td>
                </tr>
                {open && (
                  <tr className="program-detail-row" id={detailId}>
                    <td colSpan={7}>
                      <div className="detail-card">
                        <table className="detail-table">
                          <thead>
                            <tr>
                              <th scope="col">{copy.usage.program}</th>
                              <th scope="col">{copy.usage.file}</th>
                              <th scope="col" className="num">
                                {copy.usage.line}
                              </th>
                              <th scope="col">{copy.usage.procedure}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.usages.map((usage) => (
                              <tr
                                key={`${usage.file}:${usage.line ?? ''}:${usage.procedure ?? ''}`}
                              >
                                <td>
                                  {programsText(
                                    usage.programs,
                                    copy.list.morePrograms,
                                    number,
                                  )}
                                </td>
                                <td className="mono">{usage.file}</td>
                                <td className="num mono">
                                  {usage.line ?? '—'}
                                </td>
                                <td className="mono">
                                  {usage.procedure?.split('#').at(-1) ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
  );
}

// Other file output: not a report, listed for the evidence.
function DataFileTable({
  files,
  testId,
}: {
  files: readonly DataFileOutput[];
  testId: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  return (
    <div className="table-scroll">
      <table
        className="program-table report-table report-data-table"
        data-testid={testId}
      >
        <thead>
          <tr>
            <th scope="col">{copy.dataFiles.columns.program}</th>
            <th scope="col">{copy.dataFiles.columns.kind}</th>
            <th scope="col">{copy.dataFiles.columns.location}</th>
            <th scope="col">{copy.dataFiles.columns.procedure}</th>
          </tr>
        </thead>
        <tbody>
          {files.map((entry) => (
            <tr key={entry.id}>
              <th scope="row">
                {programsText(entry.programs, copy.list.morePrograms, number)}
              </th>
              <td>
                {entry.kinds
                  .map((kind) => copy.dataFiles.kind[kind])
                  .join(' · ')}
              </td>
              <td className="mono">
                {entry.evidence.map((item) => (
                  <span
                    key={`${item.line ?? ''}:${item.kind}`}
                    className="block"
                  >
                    {entry.file}
                    {item.line !== null && `:${item.line}`}
                  </span>
                ))}
              </td>
              <td className="mono">
                {entry.procedure?.split('#').at(-1) ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// "Cơ sở tính": the conventions behind the total, the same text as the Excel
// report and the PDF (contracts REPORT_COUNTING_BASIS).
function CountingBasis() {
  const { locale } = useLocale();
  const lang = locale === 'ja' ? 'ja' : 'vi';
  return (
    <details className="report-basis" data-testid="report-basis">
      <summary>{REPORT_COUNTING_BASIS_TITLE[lang]}</summary>
      <dl>
        {REPORT_COUNTING_BASIS.map((item) => (
          <div key={item.id} data-basis={item.id}>
            <dt>{item[lang].label}</dt>
            <dd>{item[lang].text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

type OriginFilter = 'all' | ReportOrigin;

// "Report" tab: the complexity of the reports, the list of reports (all three
// ways of making one) and, folded away, the file output that is not a report.
export function ReportsTab({ inventory }: { inventory: Inventory }) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  const summary = useMemo(() => deriveReportSummary(inventory), [inventory]);
  const [page, setPage] = useState(1);
  const [dataPage, setDataPage] = useState(1);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const reports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (summary?.reports ?? [])
      .filter(
        (report) =>
          (origin === 'all' || report.origin === origin) &&
          (needle === '' ||
            report.name.toLowerCase().includes(needle) ||
            report.programs.some((path) =>
              programLabel(path).toLowerCase().includes(needle),
            )),
      )
      .sort(
        (a, b) =>
          (b.complexity.score ?? -1) - (a.complexity.score ?? -1) ||
          a.name.localeCompare(b.name),
      );
  }, [summary, query, origin]);
  if (!summary)
    return (
      <p className="empty-state" data-testid="reports-nodata">
        {copy.kpis.noDataHelp}
      </p>
    );
  const pageData = pageOf(reports, page, PAGE_SIZE);
  const dataData = pageOf(summary.dataFiles, dataPage, PAGE_SIZE);
  return (
    <>
      <ReportDistribution summary={summary} />
      <section className="report-list" aria-label={copy.reports.title}>
        <h4>{copy.reports.title}</h4>
        <p className="muted">{copy.reports.help}</p>
        <CountingBasis />
        <div className="program-filters">
          <label>
            <span>{copy.list.search}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <span>{copy.reports.originFilter}</span>
            <select
              value={origin}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setOrigin(
                  value === 'crystal' || value === 'print' || value === 'export'
                    ? value
                    : 'all',
                );
                setPage(1);
              }}
            >
              <option value="all">{copy.list.all}</option>
              <option value="crystal">{copy.reports.origin.crystal}</option>
              <option value="print">{copy.reports.origin.print}</option>
              <option value="export">{copy.reports.origin.export}</option>
            </select>
          </label>
        </div>
        <p className="muted" role="status">
          {copy.list.count(
            number(reports.length),
            number(summary.counts.total),
          )}
        </p>
        {reports.length === 0 ? (
          <p className="empty-state">
            {summary.counts.total > 0 ? copy.list.noMatch : copy.reports.none}
          </p>
        ) : (
          <>
            <ReportTable
              reports={pageData.items}
              testId="report-template-table"
            />
            <Pagination
              title={copy.reports.title}
              page={pageData.page}
              pages={pageData.pages}
              onPage={setPage}
            />
          </>
        )}
      </section>
      <details className="report-list data-files">
        <summary>
          <h4>{copy.dataFiles.title}</h4>
          <span className="muted mono" data-testid="data-file-count">
            {number(summary.counts.dataFiles)}
          </span>
        </summary>
        <p className="muted">{copy.dataFiles.help}</p>
        {summary.counts.excluded > 0 && (
          <p className="muted" data-testid="excluded-functions">
            {copy.dataFiles.excluded(number(summary.counts.excluded))}
          </p>
        )}
        {summary.dataFiles.length === 0 ? (
          <p className="empty-state">{copy.dataFiles.none}</p>
        ) : (
          <>
            <DataFileTable files={dataData.items} testId="data-file-table" />
            <Pagination
              title={copy.dataFiles.title}
              page={dataData.page}
              pages={dataData.pages}
              onPage={setDataPage}
            />
          </>
        )}
      </details>
    </>
  );
}

// "Screens and reports" tab of one program: its screens and the reports it
// makes, with where (file:line) they are made.
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
  const summary = useMemo(() => deriveReportSummary(inventory), [inventory]);
  if (!data || !data.available || !summary)
    return (
      <p className="empty-state" data-testid="program-screen-nodata">
        {copy.kpis.noDataHelp}
      </p>
    );
  const reports = summary.reports.filter((report) =>
    report.programs.includes(projectPath),
  );
  return (
    <>
      <p className="muted">{copy.programTypes[data.programType]}</p>
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
      {reports.length === 0 ? (
        <p className="empty-state">{copy.detail.noReports}</p>
      ) : (
        <ReportTable reports={reports} testId="program-reports" />
      )}
    </>
  );
}
