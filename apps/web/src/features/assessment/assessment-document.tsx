import {
  tableSchemaState,
  type CustomerReportDocument,
} from '@portal/contracts';
import type { ReactNode } from 'react';
import { branding } from '../../app/branding';
import {
  appendixCounting,
  appendixDefinitions,
  databaseNote,
  documentText,
  formatDate,
  numberFormat,
  type DocLang,
} from './assessment-document-text';

// The customer assessment report as an A4 document (AR03), drawn into a PDF
// by the shared renderer. It reads only the customer report JSON (AR02), so
// the PDF and the Excel carry the same numbers, and it is written in the
// language of that JSON (report.language: Japanese by default, or
// Vietnamese). No internal id, model version or hash is printed.
// Page 1 is the cover with the summary (KPI cards and the program complexity);
// the sections after it may share a page; long tables are cut into blocks
// that repeat their header, so no row or card is cut in two.

type Report = CustomerReportDocument;
type DocumentText = ReturnType<typeof documentText>;

// Rows of the screen/report list shown in the PDF (two pages at most); the
// rest is in the Excel.
export const MAX_LIST_ROWS = 40;
const ROWS_PER_BLOCK = 14;
const RISK_ROWS_PER_BLOCK = 5;

export { jaDate } from './assessment-document-text';

const LEVEL_COLORS: Record<string, string> = {
  low: '#2E9E5B',
  medium: '#E0A800',
  high: '#E07B00',
  'very-high': '#D13F3F',
  unrated: '#9AA7B5',
};

function chunk<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += size)
    out.push(rows.slice(index, index + size));
  return out;
}

// A table; more rows than fit in a block become several blocks, each with
// its own header row (the header repeats on the next page).
function Table({
  head,
  rows,
  per = ROWS_PER_BLOCK,
  title,
  numeric = [],
  empty,
  compact = true,
}: {
  head: readonly string[];
  rows: readonly ReactNode[][];
  per?: number;
  title?: string;
  numeric?: readonly number[];
  empty: string;
  compact?: boolean;
}) {
  if (rows.length === 0)
    return (
      <div className="qd-block">
        {title && <h3>{title}</h3>}
        <p className="qd-note">{empty}</p>
      </div>
    );
  return (
    <>
      {chunk(rows, per).map((part, index) => (
        <div className="qd-block" key={index}>
          {title && index === 0 && <h3>{title}</h3>}
          <table className={`qd-table${compact ? ' qd-compact' : ''}`}>
            <thead>
              <tr>
                {head.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {part.map((cells, rowIndex) => (
                <tr key={rowIndex}>
                  {cells.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={numeric.includes(cellIndex) ? 'num' : ''}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

// Same as Table, with data attributes on the rows (for the tests and the
// page-cut points) and an optional foot row.
function KeyedTable(props: {
  head: readonly string[];
  rows: { key: string; attr: string; cells: ReactNode[] }[];
  per?: number;
  numeric?: readonly number[];
  title?: string;
  empty: string;
  // Column widths in percent, where the text of a column is short.
  widths?: readonly number[];
}) {
  const {
    rows,
    head,
    per = ROWS_PER_BLOCK,
    numeric = [],
    title,
    empty,
    widths = [],
  } = props;
  if (rows.length === 0)
    return (
      <Table
        head={head}
        rows={[]}
        empty={empty}
        {...(title ? { title } : {})}
      />
    );
  return (
    <>
      {chunk(rows, per).map((part, index) => (
        <div className="qd-block" key={index}>
          {title && index === 0 && <h3>{title}</h3>}
          <table className="qd-table qd-compact">
            <thead>
              <tr>
                {head.map((label, headIndex) => (
                  <th
                    key={label}
                    {...(widths[headIndex]
                      ? { style: { width: `${widths[headIndex]}%` } }
                      : {})}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {part.map((row) => (
                <tr key={row.key} {...{ [row.attr]: row.key }}>
                  {row.cells.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={numeric.includes(cellIndex) ? 'num' : ''}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    // Not a block: a page never ends right after a heading.
    <div className="ad-heading">
      <h2>{children}</h2>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="qd-note ad-note">{children}</p>;
}

function Kpi({
  name,
  label,
  value,
  sub,
  main = false,
}: {
  name: string;
  label: string;
  value: string;
  sub?: string | null;
  main?: boolean;
}) {
  return (
    <div className={`qd-kpi${main ? ' main' : ''}`} data-kpi={name}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function BarChart({
  prefix,
  bars,
  notApplicable,
  n,
}: {
  prefix: string;
  bars: { key: string; label: string; value: number | null }[];
  notApplicable: string;
  n: (value: number) => string;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.value ?? 0));
  const row = 22;
  return (
    <svg
      width="330"
      height={bars.length * row + 4}
      viewBox={`0 0 330 ${bars.length * row + 4}`}
      role="img"
    >
      {bars.map((bar, index) => {
        const y = index * row + 2;
        const width = bar.value === null ? 0 : (bar.value / max) * 170;
        return (
          <g key={bar.key}>
            <text x="0" y={y + 13} fontSize="10" fill="#0f2236">
              {bar.label}
            </text>
            <rect
              x="78"
              y={y + 2}
              width={Math.max(width, bar.value ? 2 : 0)}
              height="13"
              rx="2"
              fill={LEVEL_COLORS[bar.key] ?? '#0077be'}
              data-bar={`${prefix}-${bar.key}`}
              data-count={bar.value === null ? 'na' : String(bar.value)}
            />
            <text x={78 + width + 6} y={y + 13} fontSize="10" fill="#55657a">
              {bar.value === null ? notApplicable : n(bar.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function AssessmentDocument({
  report,
  issuedOn,
}: {
  report: Report;
  // YYYY-MM-DD: the day the PDF is made.
  issuedOn: string;
}) {
  const lang: DocLang = report.language;
  const T: DocumentText = documentText(lang);
  const n = numberFormat(lang);
  const { scale, source, complexity } = report;
  const schemaState = tableSchemaState(scale);
  const origin = source.origin;
  const sr = scale.screenReport;
  const count = (value: number | undefined) =>
    sr && value !== undefined ? n(value) : T.notAnalyzed;

  const levels = sr ? Object.entries(sr.reports.byLevel) : [];
  const levelLabel = (level: string) => T.levels[level] ?? level;

  const listed = [...report.items]
    .sort((a, b) => (T.itemOrder[a.type] ?? 9) - (T.itemOrder[b.type] ?? 9))
    .slice(0, MAX_LIST_ROWS);
  const moduleTotal = {
    files: report.modules.reduce((sum, row) => sum + row.files, 0),
  };
  const breakdown = scale.reportBreakdown;
  const date = (iso: string) => formatDate(lang, iso);

  return (
    <div
      className={`quote-doc-root assess-doc-root ad-lang-${lang}`}
      aria-hidden="true"
    >
      <header className="qd-head" data-doc="cover">
        <img src={branding.logoUrl} alt={branding.logoAlt} />
        <div>
          <h1>{T.title}</h1>
          <p>
            {origin?.projectName ?? ''} · {T.cover.analysedOn}{' '}
            {origin ? date(origin.createdAt) : '—'} · {T.cover.issuedOn}{' '}
            {date(issuedOn)}
          </p>
        </div>
      </header>
      <div className="qd-block ad-cover" data-doc="cover-detail">
        {origin?.mode === 'demo' && <p className="ad-demo">{T.demoNotice}</p>}
        <table className="qd-table qd-compact">
          <tbody>
            <tr>
              <td>{T.cover.project}</td>
              <td>{origin?.projectName ?? '—'}</td>
            </tr>
            <tr>
              <td>{T.cover.analysedOn}</td>
              <td>{origin ? date(origin.createdAt) : '—'}</td>
            </tr>
            <tr>
              <td>{T.cover.issuedOn}</td>
              <td>{date(issuedOn)}</td>
            </tr>
            <tr>
              <td>{T.cover.scope}</td>
              <td>
                {T.cover.scopeValue(n(scale.programs), n(scale.codeLines))}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="ad-toc-line">
          <b>{T.cover.contents}</b>
          {'  '}
          {[
            T.sections.scale,
            T.sections.complexity,
            T.sections.dependencies,
            T.sections.database,
            T.sections.risks,
            T.sections.items,
            T.sections.next,
            T.sections.appendix,
          ].join(' · ')}
        </p>
      </div>

      <div className="ad-summary" data-doc="summary">
        <div className="qd-kpis ad-kpis">
          <Kpi
            name="screens"
            label={T.kpi.screens}
            value={count(sr?.screens)}
            sub={sr ? T.kpi.screensSub(n(sr.sharedScreens)) : null}
            main
          />
          <Kpi
            name="reports"
            label={T.kpi.reports}
            value={count(sr?.reports.counted)}
            sub={
              breakdown
                ? [
                    T.kpi.reportsSub(
                      n(breakdown.crystal),
                      n(breakdown.print),
                      n(breakdown.export),
                    ),
                    breakdown.missingFile > 0
                      ? T.kpi.reportsMissing(n(breakdown.missingFile))
                      : null,
                  ]
                    .filter(Boolean)
                    .join(T.kpi.reportsJoin)
                : null
            }
          />
          <Kpi
            name="batches"
            label={T.kpi.batches}
            value={count(sr?.batches)}
            sub={sr ? T.kpi.batchesSub : null}
          />
        </div>
        <div className="qd-kpis ad-kpis ad-kpis-4">
          <Kpi
            name="programs"
            label={T.kpi.programs}
            value={n(scale.programs)}
            sub={T.kpi.programsSub(n(scale.completePrograms))}
          />
          <Kpi
            name="lines"
            label={T.kpi.lines}
            value={n(scale.codeLines)}
            sub={T.kpi.linesSub(n(scale.physicalLines))}
          />
          <Kpi
            name="procedures"
            label={T.kpi.procedures}
            value={n(scale.procedures)}
          />
          <Kpi
            name="tables"
            label={T.kpi.tables}
            value={scale.tablesView === null ? T.notAnalyzed : n(scale.tables)}
          />
        </div>
        <Note>{T.kpi.customerCount}</Note>
        <div className="qd-block">
          <h3>{T.charts.programLevels}</h3>
          <BarChart
            prefix="program"
            notApplicable={T.charts.notApplicable}
            n={n}
            bars={[
              ...(['low', 'medium', 'high', 'very-high'] as const).map(
                (level) => ({
                  key: level,
                  label: levelLabel(level),
                  value: complexity.levels[level],
                }),
              ),
              {
                key: 'unrated',
                label: T.charts.notAnalyzed,
                value: complexity.notAnalyzed,
              },
            ]}
          />
          <p className="qd-note ad-note">{T.charts.programNote}</p>
        </div>
      </div>

      <div className="ad-section" data-doc="scale">
        <Heading>{T.sections.scale}</Heading>
        <Note>{T.notes.scale}</Note>
        {sr ? (
          <>
            <div className="qd-block ad-split">
              <table className="qd-table qd-compact">
                <thead>
                  <tr>
                    <th>{T.breakdown.title}</th>
                    <th>{T.table.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown
                    ? (
                        [
                          ['crystal', T.breakdown.crystal],
                          ['print', T.breakdown.print],
                          ['export', T.breakdown.export],
                        ] as const
                      ).map(([key, label]) => (
                        <tr key={key} data-kind={key}>
                          <td>{label}</td>
                          <td className="num">{n(breakdown[key])}</td>
                        </tr>
                      ))
                    : null}
                  <tr>
                    <td>{T.table.total}</td>
                    <td className="num" data-total="kind">
                      {n(sr.reports.rows)}
                    </td>
                  </tr>
                  {breakdown ? (
                    <tr data-kind="data-files">
                      <td>
                        {T.breakdown.dataFiles}
                        {breakdown.excluded > 0
                          ? ` · ${T.breakdown.excluded(n(breakdown.excluded))}`
                          : ''}
                      </td>
                      <td className="num">{n(breakdown.dataFiles)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <table className="qd-table qd-compact">
                <thead>
                  <tr>
                    <th>{T.table.level}</th>
                    <th>{T.table.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map(([level, value]) => (
                    <tr key={level} data-level={level}>
                      <td>{levelLabel(level)}</td>
                      <td className="num">{n(value)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>{T.table.total}</td>
                    <td className="num" data-total="level">
                      {n(sr.reports.rows)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="qd-block">
            <p className="qd-note">{T.notAnalyzed}</p>
          </div>
        )}
        <KeyedTable
          empty={T.notApplicable}
          head={[
            T.table.module,
            T.table.programs,
            T.table.screens,
            T.table.reports,
            T.table.batches,
            T.table.files,
            T.table.lines,
          ]}
          numeric={[1, 2, 3, 4, 5, 6]}
          rows={[
            ...report.modules.map((row) => ({
              key: `${row.kind}:${row.module}`,
              attr: 'data-module-row',
              cells: [
                row.module,
                n(row.programs),
                count(row.screens),
                count(row.reports),
                count(row.batches),
                n(row.files),
                n(row.codeLines),
              ],
            })),
            {
              key: 'total',
              attr: 'data-module-total',
              cells: [
                T.table.total,
                n(scale.programs),
                count(sr?.screens),
                count(sr?.reports.counted),
                count(sr?.batches),
                n(moduleTotal.files),
                n(scale.codeLines),
              ],
            },
          ]}
        />
      </div>

      <div className="ad-section" data-doc="complexity">
        <Heading>{T.sections.complexity}</Heading>
        <Note>{T.charts.reportNote}</Note>
        <div className="qd-block">
          <h3>{T.charts.reportLevels}</h3>
          {complexity.reportLevels ? (
            <BarChart
              prefix="report"
              notApplicable={T.charts.notApplicable}
              n={n}
              bars={(
                ['low', 'medium', 'high', 'very-high', 'unrated'] as const
              ).map((level) => ({
                key: level,
                label: levelLabel(level),
                value: complexity.reportLevels?.[level] ?? 0,
              }))}
            />
          ) : (
            <p className="qd-note">{T.notAnalyzed}</p>
          )}
        </div>
        <KeyedTable
          empty={T.notApplicable}
          title={T.charts.top}
          head={[
            T.table.program,
            T.table.module,
            T.table.level,
            T.table.score,
            T.table.lines,
            T.table.screens,
            T.table.reports,
          ]}
          numeric={[3, 4, 5, 6]}
          rows={complexity.top.map((row) => ({
            key: `${row.module}/${row.program}`,
            attr: 'data-top-row',
            cells: [
              row.program,
              row.module,
              levelLabel(row.level),
              n(row.score),
              n(row.codeLines),
              row.screens === null ? T.notAnalyzed : n(row.screens),
              row.reports === null ? T.notAnalyzed : n(row.reports),
            ],
          }))}
        />
      </div>

      <div className="ad-section" data-doc="dependencies">
        <Heading>{T.sections.dependencies}</Heading>
        <Note>{T.notes.dependencies}</Note>
        <Table
          empty={T.notApplicable}
          title={T.deps.shared}
          head={[
            T.table.file,
            T.table.refPrograms,
            T.table.procedures,
            T.table.lines,
          ]}
          numeric={[1, 2, 3]}
          rows={report.dependencies.shared.map((row) => [
            row.file,
            n(row.programs),
            n(row.procedures),
            n(row.codeLines),
          ])}
        />
        <Table
          empty={T.notApplicable}
          title={T.deps.components}
          head={[
            T.table.identifier,
            T.table.fileName,
            T.table.description,
            T.table.refPrograms,
          ]}
          numeric={[3]}
          rows={report.dependencies.components.map((row) => [
            row.identifier,
            row.fileName,
            row.description,
            n(row.programs),
          ])}
        />
        <Table
          empty={T.notApplicable}
          title={T.deps.apis}
          head={[T.table.function, T.table.library, T.table.callers]}
          numeric={[2]}
          rows={report.dependencies.apis.map((row) => [
            row.name,
            row.library,
            n(row.programs),
          ])}
        />
      </div>

      <div className="ad-section" data-doc="database">
        <Heading>{T.sections.database}</Heading>
        <Note>{databaseNote(lang, schemaState)}</Note>
        <KeyedTable
          empty={T.notApplicable}
          title={T.db.tablesTop(T.kpi.tables)}
          head={[T.table.dbTable, T.table.refPrograms, T.table.operations]}
          numeric={[1]}
          rows={report.database.tables.slice(0, 20).map((row) => ({
            key: row.table,
            attr: 'data-table-row',
            cells: [row.table, n(row.programs), row.operations],
          }))}
        />
        <Table
          empty={T.notApplicable}
          title={T.db.sql(
            n(report.database.dynamicSql),
            report.database.concatenatedSql === null
              ? T.notAnalyzed
              : n(report.database.concatenatedSql),
          )}
          head={[T.table.module, T.table.dynamicSql, T.table.concatSql]}
          numeric={[1, 2]}
          rows={report.database.sqlByModule.map((row) => [
            row.module,
            n(row.dynamicSql),
            row.concatenatedSql === null
              ? T.notAnalyzed
              : n(row.concatenatedSql),
          ])}
        />
      </div>

      <div className="ad-section" data-doc="risks">
        <Heading>{T.sections.risks}</Heading>
        <Note>{T.notes.risks}</Note>
        <KeyedTable
          empty={T.notApplicable}
          head={[
            T.table.category,
            T.table.severity,
            T.table.count,
            T.table.content,
            T.table.affected,
            T.table.confirmation,
          ]}
          per={RISK_ROWS_PER_BLOCK}
          numeric={[2]}
          widths={[13, 8, 7, 28, 14, 30]}
          rows={report.risks.map((risk) => ({
            key: risk.code,
            attr: 'data-risk',
            cells: [
              risk.category,
              risk.severity,
              n(risk.count),
              risk.content,
              risk.programs.length === 0
                ? T.table.wholeSystem
                : risk.programs.join(T.table.join) +
                  (risk.otherPrograms > 0
                    ? ` ${T.table.other(n(risk.otherPrograms))}`
                    : ''),
              risk.confirmation,
            ],
          }))}
        />
      </div>

      <div className="ad-section" data-doc="items">
        <Heading>{T.sections.items}</Heading>
        {sr ? (
          <>
            <Note>
              {T.notes.items(
                n(MAX_LIST_ROWS),
                n(report.items.length),
                T.allInExcel,
              )}
            </Note>
            <KeyedTable
              empty={T.notApplicable}
              head={[
                T.table.type,
                T.table.kind,
                T.table.program,
                T.table.name,
                T.table.location,
                T.table.confidence,
                T.table.level,
              ]}
              widths={[7, 17, 12, 14, 22, 14, 14]}
              rows={listed.map((item) => ({
                key: `${item.type}:${item.name || item.file}`,
                attr: 'data-item',
                cells: [
                  item.type,
                  item.kindLabel,
                  item.programs,
                  item.name,
                  item.file + (item.line === null ? '' : `:${item.line}`),
                  item.confidenceLabel,
                  item.levelLabel === null
                    ? ''
                    : item.score === null
                      ? item.levelLabel
                      : `${item.levelLabel} · ${item.score}`,
                ],
              }))}
            />
            <Note>{T.allInExcel}</Note>
          </>
        ) : (
          <div className="qd-block">
            <p className="qd-note">{T.notAnalyzed}</p>
          </div>
        )}
      </div>

      <div className="ad-section" data-doc="next">
        <Heading>{T.sections.next}</Heading>
        <div className="qd-block">
          <ol className="qd-notes">
            {report.recommendations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="ad-section" data-doc="appendix" data-page-break>
        <Heading>{T.sections.appendix}</Heading>
        <div className="qd-block">
          <h3>{T.appendix.definitionsTitle}</h3>
          <ul className="qd-notes">
            {appendixDefinitions(lang, schemaState).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="qd-block">
          <h3>{T.appendix.countingTitle}</h3>
          <ul className="qd-notes">
            {appendixCounting(lang).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="qd-block">
          <h3>{T.appendix.complexityTitle}</h3>
          <ul className="qd-notes">
            {T.appendix.complexity.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
