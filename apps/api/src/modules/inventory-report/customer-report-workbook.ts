import {
  REPORT_COUNTING_BASIS,
  tableSchemaState,
  tableSchemaStatement,
} from '@portal/contracts';
import type { CustomerReport } from './customer-report.js';
import { reportText, type ReportText } from './customer-report-text.js';
import type { CellValue, Sheet, SheetColumn } from './xlsx-writer.js';

// Lays the customer report out as the seven sheets of scope section 3, in the
// language of the report (report.language). The JSON stays the source of
// truth. Sheets 1 to 4 hold several tables. Each table is a block of its own:
// a plain bold title (no fill), a thin gap, its own dark header row, its
// rows; one blank row between blocks; and only as many cells wide as the
// table is, so a narrow table is not stretched to the widest one. Sheet 5 is
// one table; sheet 6 is the list (frozen header, filter) with the file
// output that is not a report as a second table below it; sheet 7 holds the
// counting basis as wrapped text. A table without rows says 該当なし
// (Không có). No internal id, model version or hash is written here (they stay
// in the JSON), and nothing asks the customer for anything.

const LEVELS = ['low', 'medium', 'high', 'very-high'] as const;

// Width of a text in Excel column units: a full-width (Japanese) character
// takes two.
const unitsOf = (char: string) => {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x3000 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef)
    ? 2
    : 1;
};

// A long sentence over several lines of at most `limit` units, so a note does
// not run past the table it belongs to. Breaks after a space when there is
// one (the space stays at the end of the line, so the lines join back to the
// text).
export function wrapText(text: string, limit: number): string[] {
  const lines: string[] = [];
  let current = '';
  let width = 0;
  let lastSpace = -1;
  for (const char of text) {
    current += char;
    width += unitsOf(char);
    if (char === ' ') lastSpace = current.length - 1;
    if (width <= limit) continue;
    if (lastSpace > 0) {
      lines.push(current.slice(0, lastSpace + 1));
      current = current.slice(lastSpace + 1);
    } else {
      // No space to break at: the character that did not fit starts the next line.
      lines.push(current.slice(0, current.length - char.length));
      current = char;
    }
    width = Array.from(current).reduce((sum, c) => sum + unitsOf(c), 0);
    lastSpace = current.lastIndexOf(' ');
  }
  if (current !== '') lines.push(current);
  return lines;
}

class SheetBuilder {
  readonly rows: CellValue[][] = [];
  readonly spans: number[] = [];
  readonly sectionRows: number[] = [];
  readonly subHeaderRows: number[] = [];
  constructor(
    private readonly width: number,
    private readonly empty: string,
  ) {}

  private push(cells: readonly CellValue[], span = cells.length) {
    if (cells.length > this.width) throw new Error('row wider than sheet');
    this.spans.push(span);
    this.rows.push([
      ...cells,
      ...Array<CellValue>(this.width - cells.length).fill(null),
    ]);
  }
  // A plain bold title of a block, after a blank row (but the first).
  section(title: string) {
    if (this.rows.length > 0) this.push([], 0);
    this.sectionRows.push(this.rows.length);
    this.push([title]);
  }
  // The header row of a table: a thin gap under the title, then the header.
  subHeader(labels: readonly string[]) {
    this.push([], -1);
    this.subHeaderRows.push(this.rows.length);
    this.push(labels);
  }
  row(...cells: CellValue[]) {
    this.push(cells);
  }
  // A key / value line: always three cells wide (the note may be empty).
  kv(label: string, value: CellValue, note: string | null = null) {
    this.push([label, value, note]);
  }
  // Rows of a table, or the 該当なし line.
  table(rows: readonly (readonly CellValue[])[]) {
    if (rows.length === 0) this.row(this.empty);
    for (const row of rows) this.row(...row);
  }
  // The layout options of the sheet.
  layout(): Partial<Sheet> {
    return {
      noHeader: true,
      rowSpans: this.spans,
      sectionRows: this.sectionRows,
      subHeaderRows: this.subHeaderRows,
    };
  }
}

const col = (header: string, width: number, wrap = false): SheetColumn => ({
  header,
  width,
  ...(wrap ? { wrap } : {}),
});

// Width of a text in Excel column units.
export const textWidth = (text: string) =>
  Array.from(text).reduce((sum, char) => sum + unitsOf(char), 0);

// The widest a column is made to fit its text; a longer text wraps instead.
const FIT_MAX = 60;
const FIT_MIN = 10;

// Column widths from the content: the widest text of the column (a
// full-width character counts two) with a little room, between a minimum and
// a maximum; a column whose text is longer than the maximum wraps. Only the
// cells inside the span of their row count (the cells after it are empty), and
// a one-cell row (a section title, 該当なし) runs on over its empty neighbours.
function fitColumns(
  columns: readonly SheetColumn[],
  rows: readonly (readonly CellValue[])[],
  spans: readonly number[] | undefined,
): SheetColumn[] {
  return columns.map((column, c) => {
    if (column.wrap === true && column.width !== undefined) return column;
    let widest = textWidth(column.header) + 2;
    rows.forEach((row, index) => {
      const span = spans?.[index] ?? columns.length;
      if (c >= span || span === 1) return;
      const cell = row[c];
      if (typeof cell === 'string')
        widest = Math.max(widest, textWidth(cell) + 2);
      else if (typeof cell === 'number')
        widest = Math.max(widest, String(cell).length + 4);
    });
    if (widest > FIT_MAX) return { ...column, width: FIT_MAX, wrap: true };
    return { ...column, width: Math.max(FIT_MIN, widest) };
  });
}

const totalWidth = (columns: readonly SheetColumn[]) =>
  columns.reduce((sum, column) => sum + (column.width ?? 14), 0);

function sheetOf(
  t: ReportText,
  index: number,
  columns: SheetColumn[],
  rows: SheetBuilder | readonly (readonly CellValue[])[],
  extra: Partial<Sheet> = {},
  // Column widths from the content (not for the counting basis, whose
  // column has a fixed width).
  fit = true,
): Sheet {
  const name = t.sheetNames[index] ?? '';
  const table = rows instanceof SheetBuilder ? rows.rows : rows;
  const spans =
    extra.rowSpans ?? (rows instanceof SheetBuilder ? rows.spans : undefined);
  const fitted = fit ? fitColumns(columns, table, spans) : columns;
  // Notes run on over the empty cells beside them: wrap them to the width of
  // the table.
  const limit = Math.floor(totalWidth(fitted) * 0.85);
  const notes = [
    ...(t.sheetNotes[index] ?? []),
    ...(extra.notes ?? []),
  ].flatMap((note) => wrapText(note, limit));
  return {
    name,
    title: name.replace(/^\d_/, '') + t.sheetTitleSuffix,
    tabColor: 'FF1F3864',
    columns: fitted,
    rows: table,
    ...(rows instanceof SheetBuilder ? rows.layout() : {}),
    ...extra,
    notes,
  };
}

const percent = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 1000) / 10;

function sheet1(report: CustomerReport, t: ReportText): Sheet {
  const { scale, source } = report;
  const origin = source.origin;
  const w = t.wb;
  const columns = [
    col('', 30),
    col('', 22),
    col('', 26),
    col('', 14),
    col('', 14),
    col('', 12),
    col('', 16),
  ];
  const b = new SheetBuilder(7, t.notApplicable);
  b.section(w.info);
  b.subHeader(w.kvHeader);
  if (origin) {
    b.kv(w.dataKind, origin.mode === 'demo' ? w.demo : w.real);
    b.kv(w.project, origin.projectName);
    b.kv(
      w.analysedOn,
      w.dateTime(origin.createdAt),
      w.analysisNo(origin.artifactVersion),
    );
  }

  b.section(w.scale);
  b.subHeader(w.kvHeader);
  b.kv(w.programs, scale.programs, w.ofComplete(scale.completePrograms));
  b.kv(w.files, scale.files, w.ofAnalyzed(scale.analyzedFiles));
  b.kv(w.codeLines, scale.codeLines, w.sharedOnce);
  b.kv(w.commentLines, scale.commentLines);
  b.kv(w.blankLines, scale.blankLines);
  b.kv(w.physicalLines, scale.physicalLines);
  b.kv(w.procedures, scale.procedures);
  b.kv(w.dbTables, scale.tablesView === null ? t.notAnalyzed : scale.tables);
  const sr = scale.screenReport;
  b.kv(
    w.screens,
    sr ? sr.screens : t.notAnalyzed,
    sr ? w.ofShared(sr.sharedScreens) : null,
  );
  const breakdown = scale.reportBreakdown;
  b.kv(
    w.reportTotal,
    sr ? sr.reports.counted : t.notAnalyzed,
    breakdown
      ? w.reportParts(breakdown.crystal, breakdown.print, breakdown.export)
      : null,
  );
  b.kv(
    w.crystalRow,
    breakdown ? breakdown.crystal : t.notAnalyzed,
    breakdown
      ? w.designSplit(breakdown.designFile, breakdown.missingFile)
      : null,
  );
  b.kv(w.printRow, breakdown ? breakdown.print : t.notAnalyzed);
  b.kv(w.exportRow, breakdown ? breakdown.export : t.notAnalyzed);
  b.kv(
    w.dataFilesRow,
    breakdown ? breakdown.dataFiles : t.notAnalyzed,
    breakdown ? w.excluded(breakdown.excluded) : null,
  );
  b.kv(w.batches, sr ? sr.batches : t.notAnalyzed);

  b.section(w.breakdownByKind);
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
  b.section(w.breakdownByLevel);
  b.subHeader(w.levelHeader);
  b.table(
    sr
      ? [...LEVELS, 'unrated' as const].map((level) => [
          t.levelLabels[level] ?? level,
          sr.reports.byLevel[level],
        ])
      : [[t.notAnalyzed]],
  );

  b.section(w.byModule);
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

  return sheetOf(t, 0, columns, b, { boldFirstColumn: true });
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
  b.section(w.programLevels);
  b.subHeader(w.programLevelHeader);
  b.table(total === 0 ? [] : levelRows);

  b.section(w.reportLevels);
  b.subHeader(w.reportLevelHeader);
  b.table(
    complexity.reportLevels
      ? [...LEVELS, 'unrated' as const].map((level) => [
          t.levelLabels[level] ?? level,
          complexity.reportLevels?.[level] ?? 0,
        ])
      : [[t.notAnalyzed]],
  );

  b.section(w.topPrograms);
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
      col('', 30),
      col('', 26),
      col('', 14),
      col('', 10),
      col('', 14),
      col('', 10),
      col('', 10),
    ],
    b,
    { boldFirstColumn: true },
  );
}

const GUID = /^\{?[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}?$/;

function sheet3(report: CustomerReport, t: ReportText): Sheet {
  const { dependencies } = report;
  const w = t.wb;
  const b = new SheetBuilder(4, t.notApplicable);
  b.section(w.sharedHeading);
  b.subHeader(w.sharedHeader);
  b.table(
    dependencies.shared.map((s) => [
      s.file,
      s.programs,
      s.procedures,
      s.codeLines,
    ]),
  );
  b.section(w.componentsHeading);
  b.subHeader(w.componentsHeader);
  // The file name (not the GUID of the registry) names the component.
  b.table(
    dependencies.components.map((c) => [
      c.fileName ??
        (GUID.test(c.identifier) ? (c.description ?? '') : c.identifier),
      c.kind === 'reference' ? w.referenceKind : w.ocxKind,
      c.description,
      c.programs,
    ]),
  );
  b.section(w.apisHeading);
  b.subHeader(w.apisHeader);
  b.table(dependencies.apis.map((a) => [a.name, a.library, a.programs]));
  return sheetOf(
    t,
    2,
    [col('', 40), col('', 24), col('', 44), col('', 20)],
    b,
    { boldFirstColumn: true },
  );
}

function sheet4(report: CustomerReport, t: ReportText): Sheet {
  const { database } = report;
  const w = t.wb;
  const state = tableSchemaState(report.scale);
  const b = new SheetBuilder(3, t.notApplicable);
  b.section(
    (report.scale.tablesView === 'raw' ? w.tablesRaw : w.tablesNormalized) +
      (state === 'assumed' ? w.schemaAssumed : ''),
  );
  b.subHeader(w.tablesHeader);
  b.table(database.tables.map((x) => [x.table, x.programs, x.operations]));
  b.section(
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
  return sheetOf(t, 3, [col('', 36), col('', 34), col('', 44)], b, {
    boldFirstColumn: true,
    notes: [tableSchemaStatement(state, report.language).note],
  });
}

function sheet5(report: CustomerReport, t: ReportText): Sheet {
  const w = t.wb;
  // What is missing or needs care, by severity; the sheet states it, it does
  // not ask the customer for anything.
  const rows: CellValue[][] = report.risks.map((risk) => [
    risk.category,
    risk.severity,
    risk.count,
    risk.content,
    risk.programs.length === 0
      ? w.wholeSystem
      : risk.programs.join(w.joinPrograms) +
        (risk.otherPrograms > 0 ? w.otherPrograms(risk.otherPrograms) : ''),
  ]);
  if (rows.length === 0) rows.push([t.notApplicable, null, null, null, null]);
  const [category, severity, number, content, programs] = w.riskColumns;
  return sheetOf(
    t,
    4,
    [
      col(category, 22),
      col(severity, 12),
      col(number, 10),
      col(content, 70, true),
      col(programs, 44, true),
    ],
    rows,
  );
}

// 画面・帳票一覧: one table (header, filter) of screens, batches and reports,
// the file output that is not a report as a second table under it.
function sheet6(report: CustomerReport, t: ReportText): Sheet {
  const w = t.wb;
  const widths = [24, 24, 24, 22, 40, 7, 12, 14, 11, 44];
  const wraps = [
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    true,
  ];
  const columns = w.itemColumns.map((header, index) =>
    col(header, widths[index] ?? 20, wraps[index] ?? false),
  );
  const width = columns.length;
  const listed = report.items.filter((item) => item.confidence !== 'suspected');
  const files = report.items.filter((item) => item.confidence === 'suspected');
  const pad = (cells: CellValue[]): CellValue[] => [
    ...cells,
    ...Array<CellValue>(width - cells.length).fill(null),
  ];
  const rows: CellValue[][] = [];
  const spans: number[] = [];
  const sectionRows: number[] = [];
  const subHeaderRows: number[] = [];
  if (report.scale.screenReport === null) {
    rows.push(pad([t.notAnalyzed]));
    spans.push(width);
  } else if (listed.length === 0) {
    rows.push(pad([t.notApplicable]));
    spans.push(width);
  } else
    for (const item of listed) {
      const design =
        item.confidence === 'design-file'
          ? w.designYes
          : item.confidence === 'missing-file'
            ? w.designNo
            : null;
      rows.push(
        pad([
          item.kindLabel,
          item.name,
          item.programs,
          item.module,
          item.file,
          item.line,
          design,
          item.levelLabel,
          item.usages ?? null,
          item.note,
        ]),
      );
      spans.push(width);
    }
  const filterRows = rows.length;
  if (files.length > 0) {
    rows.push(pad([]));
    spans.push(0);
    sectionRows.push(rows.length);
    rows.push(pad([w.dataFilesHeading]));
    spans.push(1);
    rows.push(pad([]));
    spans.push(-1);
    subHeaderRows.push(rows.length);
    rows.push(pad([...w.dataFilesHeader]));
    spans.push(w.dataFilesHeader.length);
    for (const item of files) {
      rows.push(pad([item.programs, item.file, item.line, item.name]));
      spans.push(4);
    }
  }
  return sheetOf(t, 5, columns, rows, {
    rowSpans: spans,
    sectionRows,
    subHeaderRows,
    filterRows,
  });
}

// 算定基準: the counting basis, one row per item, the text wrapped in a
// column of fixed width.
function sheet7(report: CustomerReport, t: ReportText): Sheet {
  const lang = report.language;
  const [item, content] = t.wb.basisHeader;
  const rows: CellValue[][] = REPORT_COUNTING_BASIS.map((entry) => [
    entry[lang].label,
    entry[lang].text,
  ]);
  return sheetOf(
    t,
    6,
    [col(item, 28), col(content, 100, true)],
    rows,
    { boldFirstColumn: true, filter: false },
    false,
  );
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
    sheet7(report, t),
  ];
}
