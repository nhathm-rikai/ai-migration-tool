import {
  deriveReportSummary,
  type OutputFunction,
  type ReportSummary,
  type ReportTemplate,
  type SourceInventoryDocument,
} from '@portal/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocale } from '../../shared/i18n/locale-context';
import { pageOf, programLabel } from './assessment-summary';
import {
  REPORT_LEVELS,
  programScreenReport,
  screenReportView,
  type ReportLevel,
} from './screen-report-model';

// Screens (画面), report templates (帳票) and batches (バッチ) of the
// inventory. Reports are counted by TEMPLATE (a .rpt or DataReport design,
// once however many places name it); signs that code prints or exports data
// are listed apart as "output functions to confirm" and never added to the
// template count. An inventory without these fields shows "no data, analyze
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
            value: number(summary.counts.templates),
            sub: copy.reportsSub(
              number(summary.counts.designFile),
              number(summary.counts.missingFile),
            ),
          },
          {
            key: 'outputs',
            label: copy.outputs,
            value: number(summary.counts.functions),
            sub: copy.outputsSub(
              number(summary.counts.functionPrograms),
              number(summary.counts.excludedFunctions),
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
          { key: 'outputs', label: copy.outputs },
          { key: 'batches', label: copy.batches },
        ].map((card) => ({
          ...card,
          value: '—',
          sub: copy.noData,
        }));
  return (
    <>
      <ul
        className="kpi-grid kpi-grid-4"
        aria-label={messages.assessment.screenReport.templates.title}
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

// Level distribution over the templates only.
function TemplateDistribution({
  summary,
  version,
}: {
  summary: ReportSummary;
  version: string | null;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  const total = summary.counts.templates;
  const percent = (count: number) =>
    total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`;
  return (
    <section
      className="report-distribution"
      aria-label={copy.distribution.title}
    >
      <p className="muted" data-testid="report-reference">
        {copy.reference(version)}. {copy.distribution.help}
      </p>
      <table aria-label={copy.distribution.byLevel}>
        <caption>{copy.distribution.byLevel}</caption>
        <tbody>
          {REPORT_LEVELS.map((level) => (
            <tr key={level} data-level={level}>
              <th scope="row">{copy.distribution.level[level]}</th>
              <td className="num">{number(summary.counts.byLevel[level])}</td>
              <td className="num muted">
                {percent(summary.counts.byLevel[level])}
              </td>
            </tr>
          ))}
          <tr className="total-row">
            <th scope="row">{copy.distribution.total}</th>
            <td className="num" data-testid="report-rows-by-level">
              {number(total)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
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

function TemplateTable({
  templates,
  testId,
}: {
  templates: readonly ReportTemplate[];
  testId: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  return (
    <div className="table-scroll">
      <table className="program-table report-table" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col">{copy.templates.columns.name}</th>
            <th scope="col">{copy.templates.columns.kind}</th>
            <th scope="col">{copy.templates.columns.status}</th>
            <th scope="col">{copy.templates.columns.uses}</th>
            <th scope="col">{copy.templates.columns.programs}</th>
            <th scope="col">{copy.templates.columns.complexity}</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => (
            <tr key={template.id} data-kind={template.kind}>
              <th scope="row">{template.name}</th>
              <td>{copy.templates.kind[template.kind]}</td>
              <td>
                <span
                  className={`tag tag-conf-${template.status === 'design-file' ? 'detected' : 'referenced'}`}
                >
                  {copy.templates.status[template.status]}
                </span>
              </td>
              <td>
                <details>
                  <summary>
                    {copy.templates.usesCount(number(template.usages.length))}
                  </summary>
                  <ul className="usage-list mono">
                    {template.usages.map((usage) => (
                      <li
                        key={`${usage.file}:${usage.line ?? ''}:${usage.procedure ?? ''}`}
                      >
                        {usage.file}
                        {usage.line !== null && `:${usage.line}`}
                      </li>
                    ))}
                  </ul>
                </details>
              </td>
              <td>
                {programsText(
                  template.programs,
                  copy.list.morePrograms,
                  number,
                )}
              </td>
              <td>
                <LevelTag
                  level={template.complexity.level}
                  score={template.complexity.score}
                  title={factorsText(
                    {
                      factors: template.complexity.factors,
                      reason: template.complexity.reason ?? null,
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
  );
}

function FunctionTable({
  functions,
  testId,
}: {
  functions: readonly OutputFunction[];
  testId: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  return (
    <div className="table-scroll">
      <table className="program-table report-table" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col">{copy.functions.columns.program}</th>
            <th scope="col">{copy.functions.columns.kind}</th>
            <th scope="col">{copy.functions.columns.location}</th>
            <th scope="col">{copy.functions.columns.procedure}</th>
          </tr>
        </thead>
        <tbody>
          {functions.map((entry) => (
            <tr key={entry.id} data-kind={entry.kinds[0]}>
              <th scope="row">
                {programsText(entry.programs, copy.list.morePrograms, number)}
              </th>
              <td>
                {entry.kinds
                  .map((kind) => copy.functions.kind[kind])
                  .join(' · ')}
              </td>
              <td className="mono">
                {entry.evidence.map((item) => (
                  <span key={`${item.line ?? ''}:${item.kind}`}>
                    {entry.file}
                    {item.line !== null && `:${item.line}`}
                    <br />
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

// "Report" tab: the templates (counted), then the print and export functions
// that need confirmation (not counted as reports).
export function ReportsTab({ inventory }: { inventory: Inventory }) {
  const { messages } = useLocale();
  const copy = messages.assessment.screenReport;
  const number = useNumber();
  const summary = useMemo(() => deriveReportSummary(inventory), [inventory]);
  const [templatePage, setTemplatePage] = useState(1);
  const [functionPage, setFunctionPage] = useState(1);
  const [query, setQuery] = useState('');
  const templates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (summary?.templates ?? [])
      .filter(
        (template) =>
          needle === '' ||
          template.name.toLowerCase().includes(needle) ||
          template.programs.some((path) =>
            programLabel(path).toLowerCase().includes(needle),
          ),
      )
      .sort(
        (a, b) =>
          (b.complexity.score ?? -1) - (a.complexity.score ?? -1) ||
          a.name.localeCompare(b.name),
      );
  }, [summary, query]);
  const counted = useMemo(
    () => (summary?.functions ?? []).filter((entry) => !entry.excluded),
    [summary],
  );
  if (!summary)
    return (
      <p className="empty-state" data-testid="reports-nodata">
        {copy.kpis.noDataHelp}
      </p>
    );
  const templatePageData = pageOf(templates, templatePage, PAGE_SIZE);
  const functionPageData = pageOf(counted, functionPage, PAGE_SIZE);
  return (
    <>
      <TemplateDistribution
        summary={summary}
        version={
          screenReportView(inventory).available
            ? (inventory.reportComplexityVersion ?? null)
            : null
        }
      />
      <section
        className="program-list report-list"
        aria-label={copy.templates.title}
      >
        <h4>{copy.templates.title}</h4>
        <p className="muted">{copy.templates.help}</p>
        <div className="program-filters">
          <label>
            <span>{copy.list.search}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setTemplatePage(1);
              }}
            />
          </label>
        </div>
        <p className="muted" role="status">
          {copy.list.count(
            number(templates.length),
            number(summary.counts.templates),
          )}
        </p>
        {templates.length === 0 ? (
          <p className="empty-state">
            {summary.counts.templates > 0
              ? copy.list.noMatch
              : copy.templates.none}
          </p>
        ) : (
          <>
            <TemplateTable
              templates={templatePageData.items}
              testId="report-template-table"
            />
            <Pagination
              title={copy.templates.title}
              page={templatePageData.page}
              pages={templatePageData.pages}
              onPage={setTemplatePage}
            />
          </>
        )}
      </section>
      <section
        className="program-list report-list"
        aria-label={copy.functions.title}
      >
        <h4>{copy.functions.title}</h4>
        <p className="muted">{copy.functions.help}</p>
        {summary.counts.excludedFunctions > 0 && (
          <p className="muted" data-testid="excluded-functions">
            {copy.functions.excluded(number(summary.counts.excludedFunctions))}
          </p>
        )}
        {counted.length === 0 ? (
          <p className="empty-state">{copy.functions.none}</p>
        ) : (
          <>
            <FunctionTable
              functions={functionPageData.items}
              testId="output-function-table"
            />
            <Pagination
              title={copy.functions.title}
              page={functionPageData.page}
              pages={functionPageData.pages}
              onPage={setFunctionPage}
            />
          </>
        )}
      </section>
    </>
  );
}

// "Screens and reports" tab of one program: its screens, then the report
// templates it uses and the print / export functions in it, with file:line.
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
  const templates = summary.templates.filter((template) =>
    template.programs.includes(projectPath),
  );
  const functions = summary.functions.filter(
    (entry) => !entry.excluded && entry.programs.includes(projectPath),
  );
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
      <h6>{copy.templates.title}</h6>
      {templates.length === 0 ? (
        <p className="empty-state">{copy.detail.noReports}</p>
      ) : (
        <TemplateTable templates={templates} testId="program-reports" />
      )}
      <h6>{copy.functions.title}</h6>
      {functions.length === 0 ? (
        <p className="empty-state">{copy.functions.none}</p>
      ) : (
        <FunctionTable functions={functions} testId="program-functions" />
      )}
      <p className="muted">{copy.detail.functionsNote}</p>
    </>
  );
}
