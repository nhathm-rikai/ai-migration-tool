import {
  REPORT_COUNTING_BASIS,
  tableSchemaState,
  tableSchemaStatement,
} from '@portal/contracts';
import type { CustomerReport } from './customer-report.js';
import { reportText, type ReportText } from './customer-report-text.js';
import type { CellValue, Sheet, SheetColumn } from './xlsx-writer.js';

// Lays the customer report out as the six sheets of scope section 3, in the
// language of the report (report.language). The JSON stays the source of
// truth; every sheet has a title, "how to read" notes and then its tables. A
// table without rows says 該当なし (Không có) instead of staying empty. No
// internal id, model version or hash is written here (they stay in the JSON).

const LEVELS = ['low', 'medium', 'high', 'very-high'] as const;

class SheetBuilder {
  readonly rows: CellValue[][] = [];
  readonly headingRows: number[] = [];
  readonly subHeaderRows: number[] = [];
  constructor(
    private readonly width: number,
    private readonly empty: string,
  ) {}

  private pad(cells: readonly CellValue[]): CellValue[] {
    if (cells.length > this.width) throw new Error('row wider than sheet');
    return [
      ...cells,
      ...Array<CellValue>(this.width - cells.length).fill(null),
    ];
  }
  heading(title: string) {
    this.headingRows.push(this.rows.length);
    this.rows.push(this.pad([title]));
  }
  subHeader(labels: readonly string[]) {
    this.subHeaderRows.push(this.rows.length);
    this.rows.push(this.pad(labels));
  }
  row(...cells: CellValue[]) {
    this.rows.push(this.pad(cells));
  }
  // Rows of a table, or the 該当なし line.
  table(rows: readonly (readonly CellValue[])[]) {
    if (rows.length === 0) this.row(this.empty);
    for (const row of rows) this.row(...row);
  }
}

const col = (header: string, width: number, wrap = false): SheetColumn => ({
  header,
  width,
  ...(wrap ? { wrap } : {}),
});

function sheetOf(
  t: ReportText,
  index: number,
  columns: SheetColumn[],
  built: SheetBuilder | readonly (readonly CellValue[])[],
  extra: Partial<Sheet> = {},
): Sheet {
  const isBuilder = built instanceof SheetBuilder;
  const name = t.sheetNames[index] ?? '';
  return {
    name,
    title: name.replace(/^\d_/, '') + t.sheetTitleSuffix,
    tabColor: 'FF1F3864',
    columns,
    rows: isBuilder ? built.rows : built,
    ...(isBuilder && built.headingRows.length > 0
      ? { headingRows: built.headingRows, filter: false }
      : {}),
    ...(isBuilder && built.subHeaderRows.length > 0
      ? { subHeaderRows: built.subHeaderRows }
      : {}),
    ...extra,
    notes: [...(t.sheetNotes[index] ?? []), ...(extra.notes ?? [])],
  };
}

const percent = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 1000) / 10;

function sheet1(report: CustomerReport, t: ReportText): Sheet {
  const { scale, source } = report;
  const origin = source.origin;
  const w = t.wb;
  const b = new SheetBuilder(8, t.notApplicable);
  b.heading(w.origin);
  if (origin) {
    b.row(w.dataKind, origin.mode === 'demo' ? w.demo : w.real);
    b.row(w.project, origin.projectName);
    b.row(w.analysedOn, origin.createdAt, w.analysisNo(origin.artifactVersion));
  }

  b.heading(w.scale);
  b.row(w.programs, scale.programs, w.ofComplete(scale.completePrograms));
  b.row(w.files, scale.files, w.ofAnalyzed(scale.analyzedFiles));
  b.row(w.codeLines, scale.codeLines, w.sharedOnce);
  b.row(w.commentLines, scale.commentLines);
  b.row(w.blankLines, scale.blankLines);
  b.row(w.physicalLines, scale.physicalLines);
  b.row(w.procedures, scale.procedures);
  b.row(w.dbTables, scale.tablesView === null ? t.notAnalyzed : scale.tables);
  const sr = scale.screenReport;
  b.row(
    w.screens,
    sr ? sr.screens : t.notAnalyzed,
    sr ? w.ofShared(sr.sharedScreens) : null,
  );
  const breakdown = scale.reportBreakdown;
  b.row(
    w.reportTotal,
    sr ? sr.reports.counted : t.notAnalyzed,
    breakdown
      ? w.reportParts(breakdown.crystal, breakdown.print, breakdown.export)
      : null,
  );
  b.row(
    w.crystalRow,
    breakdown ? breakdown.crystal : t.notAnalyzed,
    breakdown
      ? w.designSplit(breakdown.designFile, breakdown.missingFile)
      : null,
  );
  b.row(w.printRow, breakdown ? breakdown.print : t.notAnalyzed);
  b.row(w.exportRow, breakdown ? breakdown.export : t.notAnalyzed);
  b.row(
    w.dataFilesRow,
    breakdown ? breakdown.dataFiles : t.notAnalyzed,
    breakdown ? w.excluded(breakdown.excluded) : null,
  );
  b.row(w.batches, sr ? sr.batches : t.notAnalyzed);
  b.row(w.customerCount, t.customerProvidedCount);

  b.heading(w.breakdownByKind);
  b.subHeader(w.kindHeader);
  b.table(
    sr
      ? (
          Object.keys(t.reportKindLabels) as (keyof typeof sr.reports.byKind)[]
        ).map((kind) => [
          t.reportKindLabels[kind] ?? kind,
          sr.reports.byKind[kind],
        ])
      : [[t.notAnalyzed]],
  );
  b.heading(w.breakdownByLevel);
  b.subHeader(w.levelHeader);
  b.table(
    sr
      ? [...LEVELS, 'unrated' as const].map((level) => [
          t.levelLabels[level] ?? level,
          sr.reports.byLevel[level],
        ])
      : [[t.notAnalyzed]],
  );

  b.heading(w.byModule);
  b.subHeader(w.moduleHeader);
  const count = (value: number) => (sr ? value : t.notAnalyzed);
  b.table([
    ...report.modules.map((m) => [
      m.module,
      m.programs,
      count(m.screens),
      count(m.reports),
      count(m.batches),
      m.files,
      m.codeLines,
    ]),
    ...(report.modules.length > 0
      ? [
          [
            w.total,
            report.modules.reduce((n, m) => n + m.programs, 0),
            sr ? sr.screens : t.notAnalyzed,
            sr ? sr.reports.counted : t.notAnalyzed,
            sr ? sr.batches : t.notAnalyzed,
            report.modules.reduce((n, m) => n + m.files, 0),
            report.modules.reduce((n, m) => n + m.codeLines, 0),
          ],
        ]
      : []),
  ]);

  b.heading(w.basis);
  const lang = report.language;
  for (const item of REPORT_COUNTING_BASIS)
    b.row(
      `${item[lang].label}${lang === 'ja' ? '：' : ': '}${item[lang].text}`,
    );

  b.heading(w.nextSteps);
  for (const line of report.recommendations) b.row(line);

  return sheetOf(
    t,
    0,
    [
      col(w.colItem, 28),
      col(w.colValue, 22),
      col(w.colNote, 24),
      col('', 14),
      col('', 14),
      col('', 12),
      col('', 12),
      col('', 14),
    ],
    b,
    { boldFirstColumn: true },
  );
}

function sheet2(report: CustomerReport, t: ReportText): Sheet {
  const { complexity } = report;
  const w = t.wb;
  const total = report.scale.programs;
  const b = new SheetBuilder(7, t.notApplicable);
  const levelRows: CellValue[][] = LEVELS.map((level) => {
    const value = complexity.levels[level];
    return value === null
      ? [t.levelLabels[level] ?? level, w.notApplicableLevel, null]
      : [t.levelLabels[level] ?? level, value, percent(value, total)];
  });
  levelRows.push([
    w.notAnalyzedLabel,
    complexity.notAnalyzed,
    percent(complexity.notAnalyzed, total),
  ]);
  b.heading(w.programLevels);
  b.subHeader(w.programLevelHeader);
  b.table(total === 0 ? [] : levelRows);

  b.heading(w.reportLevels);
  b.subHeader(w.reportLevelHeader);
  b.table(
    complexity.reportLevels
      ? [...LEVELS, 'unrated' as const].map((level) => [
          t.levelLabels[level] ?? level,
          complexity.reportLevels?.[level] ?? 0,
        ])
      : [[t.notAnalyzed]],
  );

  b.heading(w.topPrograms);
  b.subHeader(w.topHeader);
  b.table(
    complexity.top.map((p) => [
      p.program,
      p.module,
      t.levelLabels[p.level] ?? p.level,
      p.score,
      p.codeLines,
      p.screens ?? t.notAnalyzed,
      p.reports ?? t.notAnalyzed,
    ]),
  );
  return sheetOf(
    t,
    1,
    [
      col(w.colItem, 28),
      col(w.colValue, 26),
      col(w.colNote, 14),
      col('', 10),
      col('', 14),
      col('', 10),
      col('', 10),
    ],
    b,
    { boldFirstColumn: true },
  );
}

function sheet3(report: CustomerReport, t: ReportText): Sheet {
  const { dependencies } = report;
  const w = t.wb;
  const b = new SheetBuilder(4, t.notApplicable);
  b.heading(w.sharedHeading);
  b.subHeader(w.sharedHeader);
  b.table(
    dependencies.shared.map((s) => [
      s.file,
      s.programs,
      s.procedures,
      s.codeLines,
    ]),
  );
  b.heading(w.componentsHeading);
  b.subHeader(w.componentsHeader);
  b.table(
    dependencies.components.map((c) => [
      (c.kind === 'reference' ? w.referenceTag : w.componentTag) + c.identifier,
      c.fileName,
      c.description,
      c.programs,
    ]),
  );
  b.heading(w.apisHeading);
  b.subHeader(w.apisHeader);
  b.table(dependencies.apis.map((a) => [a.name, a.library, a.programs]));
  return sheetOf(
    t,
    2,
    [col(w.colItem, 40), col(w.colValue, 24), col(w.colNote, 30), col('', 18)],
    b,
    { boldFirstColumn: true },
  );
}

function sheet4(report: CustomerReport, t: ReportText): Sheet {
  const { database } = report;
  const w = t.wb;
  const state = tableSchemaState(report.scale);
  const b = new SheetBuilder(3, t.notApplicable);
  b.heading(
    (report.scale.tablesView === 'raw' ? w.tablesRaw : w.tablesNormalized) +
      (state === 'assumed' ? w.schemaAssumed : ''),
  );
  b.subHeader(w.tablesHeader);
  b.table(database.tables.map((x) => [x.table, x.programs, x.operations]));
  b.heading(
    w.sqlHeading(
      database.dynamicSql,
      database.concatenatedSql ?? t.notAnalyzed,
    ),
  );
  b.subHeader(w.sqlHeader);
  b.table(
    database.sqlByModule.map((m) => [
      m.module,
      m.dynamicSql,
      m.concatenatedSql ?? t.notAnalyzed,
    ]),
  );
  return sheetOf(
    t,
    3,
    [col(w.colItem, 36), col(w.colValue, 30), col(w.colNote, 44)],
    b,
    {
      boldFirstColumn: true,
      notes: [tableSchemaStatement(state, report.language).note],
    },
  );
}

function sheet5(report: CustomerReport, t: ReportText): Sheet {
  const w = t.wb;
  const rows: CellValue[][] = report.risks.map((risk) => [
    risk.category,
    risk.severity,
    risk.count,
    risk.content,
    risk.programs.length === 0
      ? w.wholeSystem
      : risk.programs.join(w.joinPrograms) +
        (risk.otherPrograms > 0 ? w.otherPrograms(risk.otherPrograms) : ''),
    risk.confirmation,
  ]);
  if (rows.length === 0)
    rows.push([t.notApplicable, null, null, null, null, null]);
  const [category, severity, number, content, programs, confirmation] =
    w.riskColumns;
  return sheetOf(
    t,
    4,
    [
      col(category, 20),
      col(severity, 11),
      col(number, 10),
      col(content, 50, true),
      col(programs, 36, true),
      col(confirmation, 50, true),
    ],
    rows,
  );
}

function sheet6(report: CustomerReport, t: ReportText): Sheet {
  const widths = [12, 24, 24, 22, 22, 36, 7, 24, 14, 8, 40, 44];
  const columns = t.wb.itemColumns.map((header, index) =>
    col(header, widths[index] ?? 20),
  );
  const rows: CellValue[][] =
    report.scale.screenReport === null
      ? [[t.notAnalyzed, ...Array<CellValue>(columns.length - 1).fill(null)]]
      : report.items.map((item) => [
          item.type,
          item.kindLabel,
          item.programs,
          item.module,
          item.name,
          item.file,
          item.line,
          item.confidenceLabel,
          item.levelLabel,
          item.score,
          item.factors,
          item.note,
        ]);
  if (rows.length === 0)
    rows.push([
      t.notApplicable,
      ...Array<CellValue>(columns.length - 1).fill(null),
    ]);
  return sheetOf(t, 5, columns, rows);
}

export function customerReportSheets(report: CustomerReport): Sheet[] {
  const t = reportText(report.language);
  return [
    sheet1(report, t),
    sheet2(report, t),
    sheet3(report, t),
    sheet4(report, t),
    sheet5(report, t),
    sheet6(report, t),
  ];
}
