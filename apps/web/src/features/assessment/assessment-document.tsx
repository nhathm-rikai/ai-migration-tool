import {
  tableSchemaState,
  type CustomerReportDocument,
} from '@portal/contracts';
import type { ReactNode } from 'react';
import { branding } from '../../app/branding';
import {
  ALL_IN_EXCEL,
  APPENDIX,
  appendixDefinitions,
  CHARTS,
  COVER,
  DEMO_NOTICE,
  DOC_TITLE,
  KPI,
  LEVELS,
  NOT_ANALYZED,
  NOT_APPLICABLE,
  REPORT_KINDS,
  SECTIONS,
  SECTION_NOTES,
  TABLE,
} from './assessment-document-text';

// The customer assessment report as an A4 document (AR03), drawn into a PDF
// by the shared renderer. It reads only the customer report JSON (AR02), so
// the PDF and the Excel carry the same numbers, and it is always Japanese.
// Pages: the cover, then sections that may share a page; long tables are cut
// into blocks that repeat their header, so no row or card is cut in two.

type Report = CustomerReportDocument;
type Item = Report['items'][number];

// Rows of the screen/report list shown in the PDF (two pages at most); the
// rest is in the Excel.
export const MAX_LIST_ROWS = 40;
const ROWS_PER_BLOCK = 14;
const RISK_ROWS_PER_BLOCK = 5;

const n = (value: number) => value.toLocaleString('ja-JP');

// 2026-11-06T09:00:00.000Z or 2026-11-06 → 2026年11月6日 (the date as written).
export function jaDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

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
  compact = true,
}: {
  head: readonly string[];
  rows: readonly ReactNode[][];
  per?: number;
  title?: string;
  numeric?: readonly number[];
  compact?: boolean;
}) {
  if (rows.length === 0)
    return (
      <div className="qd-block">
        {title && <h3>{title}</h3>}
        <p className="qd-note">{NOT_APPLICABLE}</p>
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
  // Column widths in percent, where the text of a column is short.
  widths?: readonly number[];
}) {
  const {
    rows,
    head,
    per = ROWS_PER_BLOCK,
    numeric = [],
    title,
    widths = [],
  } = props;
  if (rows.length === 0)
    return <Table head={head} rows={[]} {...(title ? { title } : {})} />;
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
}: {
  prefix: string;
  bars: { key: string; label: string; value: number | null }[];
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
              {bar.value === null ? CHARTS.notApplicable : n(bar.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const itemOrder: Record<Item['type'], number> = {
  帳票: 0,
  バッチ: 1,
  画面: 2,
};

export function AssessmentDocument({
  report,
  issuedOn,
}: {
  report: Report;
  // YYYY-MM-DD: the day the PDF is made.
  issuedOn: string;
}) {
  const { scale, source, complexity } = report;
  const schemaState = tableSchemaState(scale);
  const origin = source.origin;
  const sr = scale.screenReport;
  const count = (value: number | undefined) =>
    sr && value !== undefined ? n(value) : NOT_ANALYZED;

  const kinds = sr ? Object.entries(sr.reports.byKind) : [];
  const levels = sr ? Object.entries(sr.reports.byLevel) : [];
  const unrated = (level: string) => LEVELS[level] ?? level;

  const listed = [...report.items]
    .sort((a, b) => itemOrder[a.type] - itemOrder[b.type])
    .slice(0, MAX_LIST_ROWS);
  const moduleTotal = {
    files: report.modules.reduce((sum, row) => sum + row.files, 0),
  };

  return (
    <div className="quote-doc-root assess-doc-root" aria-hidden="true">
      <header className="qd-head" data-doc="cover">
        <img src={branding.logoUrl} alt={branding.logoAlt} />
        <div>
          <h1>{DOC_TITLE}</h1>
          <p>
            {origin?.projectName ?? ''} · {COVER.analysedOn}{' '}
            {origin ? jaDate(origin.createdAt) : '—'} · {COVER.issuedOn}{' '}
            {jaDate(issuedOn)}
          </p>
        </div>
      </header>
      <div className="qd-block ad-cover" data-doc="cover-detail">
        {origin?.mode === 'demo' && <p className="ad-demo">{DEMO_NOTICE}</p>}
        <table className="qd-table qd-compact">
          <tbody>
            <tr>
              <td>{COVER.project}</td>
              <td>{origin?.projectName ?? '—'}</td>
            </tr>
            <tr>
              <td>{COVER.analysedOn}</td>
              <td>{origin ? jaDate(origin.createdAt) : '—'}</td>
            </tr>
            <tr>
              <td>{COVER.issuedOn}</td>
              <td>{jaDate(issuedOn)}</td>
            </tr>
            <tr>
              <td>{COVER.scope}</td>
              <td>{COVER.scopeValue(n(scale.programs), n(scale.codeLines))}</td>
            </tr>
            <tr>
              <td>{COVER.origin}</td>
              <td>
                {origin
                  ? COVER.originValue(
                      origin.artifactId,
                      origin.artifactVersion,
                      source.snapshotHash.slice(0, 12),
                    )
                  : source.snapshotHash.slice(0, 12)}
              </td>
            </tr>
            <tr>
              <td>{COVER.models}</td>
              <td>
                {[
                  report.reportVersion,
                  source.versions.complexityVersion,
                  source.versions.screenReportVersion,
                  source.versions.reportComplexityVersion,
                ]
                  .filter(Boolean)
                  .join(' / ')}
              </td>
            </tr>
          </tbody>
        </table>
        <ol className="qd-notes ad-toc">
          {[
            SECTIONS.scale,
            SECTIONS.complexity,
            SECTIONS.dependencies,
            SECTIONS.database,
            SECTIONS.risks,
            SECTIONS.items,
            SECTIONS.next,
            SECTIONS.appendix,
          ].map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ol>
      </div>

      <div className="ad-section" data-doc="scale" data-page-break>
        <Heading>{SECTIONS.scale}</Heading>
        <Note>{SECTION_NOTES.scale}</Note>
        <div className="qd-kpis ad-kpis">
          <Kpi
            name="screens"
            label={KPI.screens}
            value={count(sr?.screens)}
            sub={sr ? KPI.screensSub(n(sr.sharedScreens)) : null}
            main
          />
          <Kpi
            name="reports"
            label={KPI.reports}
            value={count(sr?.reports.counted)}
            sub={
              sr
                ? KPI.reportsSub(
                    n(sr.suspectedPrograms),
                    n(sr.reports.suspected),
                  )
                : null
            }
          />
          <Kpi
            name="batches"
            label={KPI.batches}
            value={count(sr?.batches)}
            sub={sr ? KPI.batchesSub : null}
          />
        </div>
        <div className="qd-kpis ad-kpis ad-kpis-4">
          <Kpi
            name="programs"
            label={KPI.programs}
            value={n(scale.programs)}
            sub={KPI.programsSub(n(scale.completePrograms))}
          />
          <Kpi
            name="lines"
            label={KPI.lines}
            value={n(scale.codeLines)}
            sub={KPI.linesSub(n(scale.physicalLines))}
          />
          <Kpi
            name="procedures"
            label={KPI.procedures}
            value={n(scale.procedures)}
          />
          <Kpi
            name="tables"
            label={KPI.tables}
            value={scale.tablesView === null ? NOT_ANALYZED : n(scale.tables)}
          />
        </div>
        <Note>{KPI.customerCount}</Note>
        {sr ? (
          <div className="qd-block ad-split">
            <table className="qd-table qd-compact">
              <thead>
                <tr>
                  <th>{TABLE.kind}</th>
                  <th>{TABLE.count}</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map(([kind, value]) => (
                  <tr key={kind} data-kind={kind}>
                    <td>{REPORT_KINDS[kind] ?? kind}</td>
                    <td className="num">{n(value)}</td>
                  </tr>
                ))}
                <tr>
                  <td>{TABLE.total}</td>
                  <td className="num" data-total="kind">
                    {sr.reports.rows}
                  </td>
                </tr>
              </tbody>
            </table>
            <table className="qd-table qd-compact">
              <thead>
                <tr>
                  <th>{TABLE.level}（参考値）</th>
                  <th>{TABLE.count}</th>
                </tr>
              </thead>
              <tbody>
                {levels.map(([level, value]) => (
                  <tr key={level} data-level={level}>
                    <td>{unrated(level)}</td>
                    <td className="num">{n(value)}</td>
                  </tr>
                ))}
                <tr>
                  <td>{TABLE.total}</td>
                  <td className="num" data-total="level">
                    {sr.reports.rows}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="qd-block">
            <p className="qd-note">{NOT_ANALYZED}</p>
          </div>
        )}
        <KeyedTable
          head={[
            TABLE.module,
            TABLE.programs,
            TABLE.screens,
            TABLE.reports,
            TABLE.suspected,
            TABLE.batches,
            TABLE.files,
            TABLE.lines,
          ]}
          numeric={[1, 2, 3, 4, 5, 6, 7]}
          rows={[
            ...report.modules.map((row) => ({
              key: `${row.kind}:${row.module}`,
              attr: 'data-module-row',
              cells: [
                row.module,
                n(row.programs),
                count(row.screens),
                count(row.reports),
                count(row.suspectedReports),
                count(row.batches),
                n(row.files),
                n(row.codeLines),
              ],
            })),
            {
              key: 'total',
              attr: 'data-module-total',
              cells: [
                TABLE.total,
                n(scale.programs),
                count(sr?.screens),
                count(sr?.reports.counted),
                count(sr?.reports.suspected),
                count(sr?.batches),
                n(moduleTotal.files),
                n(scale.codeLines),
              ],
            },
          ]}
        />
      </div>

      <div className="ad-section" data-doc="complexity">
        <Heading>{SECTIONS.complexity}</Heading>
        <Note>{CHARTS.programNote(complexity.version)}</Note>
        <div className="qd-block ad-split">
          <div>
            <h3>{CHARTS.programLevels}</h3>
            <BarChart
              prefix="program"
              bars={[
                ...(['low', 'medium', 'high', 'very-high'] as const).map(
                  (level) => ({
                    key: level,
                    label: LEVELS[level] ?? level,
                    value: complexity.levels[level],
                  }),
                ),
                {
                  key: 'unrated',
                  label: CHARTS.notAnalyzed,
                  value: complexity.notAnalyzed,
                },
              ]}
            />
          </div>
          <div>
            <h3>{CHARTS.reportLevels}</h3>
            {complexity.reportLevels ? (
              <BarChart
                prefix="report"
                bars={(
                  ['low', 'medium', 'high', 'very-high', 'unrated'] as const
                ).map((level) => ({
                  key: level,
                  label: LEVELS[level] ?? level,
                  value: complexity.reportLevels?.[level] ?? 0,
                }))}
              />
            ) : (
              <p className="qd-note">{NOT_ANALYZED}</p>
            )}
          </div>
        </div>
        <Note>{CHARTS.reportNote(complexity.reportModelVersion)}</Note>
        <KeyedTable
          title={CHARTS.top}
          head={[
            TABLE.program,
            TABLE.module,
            TABLE.level,
            TABLE.score,
            TABLE.lines,
            TABLE.screens,
            TABLE.reports,
          ]}
          numeric={[3, 4, 5, 6]}
          rows={complexity.top.map((row) => ({
            key: `${row.module}/${row.program}`,
            attr: 'data-top-row',
            cells: [
              row.program,
              row.module,
              LEVELS[row.level] ?? row.level,
              n(row.score),
              n(row.codeLines),
              row.screens === null ? NOT_ANALYZED : n(row.screens),
              row.reports === null ? NOT_ANALYZED : n(row.reports),
            ],
          }))}
        />
      </div>

      <div className="ad-section" data-doc="dependencies">
        <Heading>{SECTIONS.dependencies}</Heading>
        <Note>{SECTION_NOTES.dependencies}</Note>
        <Table
          title="共通部品（参照プログラム数の多い順）"
          head={[TABLE.file, TABLE.refPrograms, TABLE.procedures, TABLE.lines]}
          numeric={[1, 2, 3]}
          rows={report.dependencies.shared.map((row) => [
            row.file,
            n(row.programs),
            n(row.procedures),
            n(row.codeLines),
          ])}
        />
        <Table
          title="外部コンポーネント（COM / OCX）"
          head={[
            TABLE.identifier,
            TABLE.fileName,
            TABLE.description,
            TABLE.refPrograms,
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
          title="外部ライブラリの関数（Windows API など）"
          head={[TABLE.function, TABLE.library, TABLE.callers]}
          numeric={[2]}
          rows={report.dependencies.apis.map((row) => [
            row.name,
            row.library,
            n(row.programs),
          ])}
        />
      </div>

      <div className="ad-section" data-doc="database">
        <Heading>{SECTIONS.database}</Heading>
        <Note>{SECTION_NOTES.database(schemaState)}</Note>
        <KeyedTable
          title={`${KPI.tables}（上位）`}
          head={[TABLE.dbTable, TABLE.refPrograms, TABLE.operations]}
          numeric={[1]}
          rows={report.database.tables.slice(0, 20).map((row) => ({
            key: row.table,
            attr: 'data-table-row',
            cells: [row.table, n(row.programs), row.operations],
          }))}
        />
        <Table
          title={`動的SQL・文字列連結SQLの箇所数（動的 ${n(report.database.dynamicSql)} / 連結 ${report.database.concatenatedSql === null ? NOT_ANALYZED : n(report.database.concatenatedSql)}）`}
          head={[TABLE.module, TABLE.dynamicSql, TABLE.concatSql]}
          numeric={[1, 2]}
          rows={report.database.sqlByModule.map((row) => [
            row.module,
            n(row.dynamicSql),
            row.concatenatedSql === null
              ? NOT_ANALYZED
              : n(row.concatenatedSql),
          ])}
        />
      </div>

      <div className="ad-section" data-doc="risks">
        <Heading>{SECTIONS.risks}</Heading>
        <Note>{SECTION_NOTES.risks}</Note>
        <KeyedTable
          head={[
            TABLE.category,
            TABLE.severity,
            TABLE.count,
            TABLE.content,
            TABLE.affected,
            TABLE.confirmation,
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
                ? TABLE.wholeSystem
                : risk.programs.join('、') +
                  (risk.otherPrograms > 0
                    ? ` ${TABLE.other(n(risk.otherPrograms))}`
                    : ''),
              risk.confirmation,
            ],
          }))}
        />
      </div>

      <div className="ad-section" data-doc="items">
        <Heading>{SECTIONS.items}</Heading>
        {sr ? (
          <>
            <Note>
              {SECTION_NOTES.items(n(MAX_LIST_ROWS), n(report.items.length))}
            </Note>
            <KeyedTable
              head={[
                TABLE.type,
                TABLE.kind,
                TABLE.program,
                TABLE.name,
                TABLE.location,
                TABLE.confidence,
                TABLE.level,
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
            <Note>{ALL_IN_EXCEL}</Note>
          </>
        ) : (
          <div className="qd-block">
            <p className="qd-note">{NOT_ANALYZED}</p>
          </div>
        )}
      </div>

      <div className="ad-section" data-doc="next">
        <Heading>{SECTIONS.next}</Heading>
        <div className="qd-block">
          <ol className="qd-notes">
            {report.recommendations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="ad-section" data-doc="appendix" data-page-break>
        <Heading>{SECTIONS.appendix}</Heading>
        <div className="qd-block">
          <h3>{APPENDIX.definitionsTitle}</h3>
          <ul className="qd-notes">
            {appendixDefinitions(schemaState).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="qd-block">
          <h3>{APPENDIX.countingTitle}</h3>
          <ul className="qd-notes">
            {APPENDIX.counting.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="qd-block">
          <h3>{APPENDIX.complexityTitle}</h3>
          <ul className="qd-notes">
            {APPENDIX.complexity.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="qd-block">
          <h3>{APPENDIX.modelsTitle}</h3>
          <table className="qd-table qd-compact">
            <tbody>
              <tr>
                <td>customer-assessment-report</td>
                <td>{report.reportVersion}</td>
              </tr>
              <tr>
                <td>complexity（プログラム）</td>
                <td>{source.versions.complexityVersion}</td>
              </tr>
              <tr>
                <td>screen-report</td>
                <td>{source.versions.screenReportVersion ?? NOT_ANALYZED}</td>
              </tr>
              <tr>
                <td>report-complexity</td>
                <td>
                  {source.versions.reportComplexityVersion ?? NOT_ANALYZED}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
