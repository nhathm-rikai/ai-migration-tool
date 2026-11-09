import type { SourceInventoryDocument } from '@portal/contracts';
import { programLabel } from './assessment-summary';

// View model of the screen (画面), report (帳票) and batch counts (AR04). It
// only selects what the inventory states: counts come from
// `totals.screenReport`, rows from each program. An inventory written before
// AR04 has none of these fields: that is "no data, analyze again", never 0.

type Inventory = SourceInventoryDocument;
type Program = Inventory['programs'][number];
type Totals = NonNullable<Inventory['totals']['screenReport']>;
type ProgramReport = NonNullable<Program['reports']>[number];

export const REPORT_LEVELS = [
  'low',
  'medium',
  'high',
  'very-high',
  'unrated',
] as const;
export type ReportLevel = (typeof REPORT_LEVELS)[number];
export const REPORT_KINDS = [
  'data-report',
  'crystal',
  'excel',
  'print',
  'file-output',
  'unknown',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export type ReportConfidence = ProgramReport['confidence'];

export type ScreenReportView =
  | { available: false }
  | {
      available: true;
      screens: number;
      sharedScreens: number;
      batches: number;
      // detected + referenced: the "reports found" figure.
      counted: number;
      suspected: number;
      suspectedPrograms: number;
      rows: number;
      byKind: Totals['reports']['byKind'];
      byLevel: Totals['reports']['byLevel'];
      reportVersion: string | null;
      complexityVersion: string | null;
    };

export function screenReportView(inventory: Inventory): ScreenReportView {
  const totals = inventory.totals.screenReport;
  if (!totals) return { available: false };
  return {
    available: true,
    screens: totals.screens,
    sharedScreens: totals.sharedScreens,
    batches: totals.batches,
    counted: totals.reports.counted,
    suspected: totals.reports.suspected,
    suspectedPrograms: totals.suspectedPrograms,
    rows: totals.reports.rows,
    byKind: totals.reports.byKind,
    byLevel: totals.reports.byLevel,
    reportVersion: inventory.screenReportVersion ?? null,
    complexityVersion: inventory.reportComplexityVersion ?? null,
  };
}

export type ProgramScreenReport =
  | { available: false }
  | {
      available: true;
      programType: NonNullable<Program['programType']>;
      screens: NonNullable<Program['screens']>;
      reports: NonNullable<Program['reports']>;
    };

export function programScreenReport(program: Program): ProgramScreenReport {
  if (!program.screens || !program.reports || !program.programType)
    return { available: false };
  return {
    available: true,
    programType: program.programType,
    screens: program.screens,
    reports: program.reports,
  };
}

// One report of the project. A report of a shared file is listed once, with
// every program that declares it.
export type ReportListRow = {
  key: string;
  programs: { projectPath: string; label: string }[];
  module: string;
  kind: ReportKind;
  name: string;
  file: string;
  line: number | null;
  confidence: ReportConfidence;
  shared: boolean;
  level: ReportLevel;
  score: number | null;
  version: string;
  factors: { factor: string; value: number; points: number }[];
  reason: string | null;
  warnings: string[];
};

// The folder holding the project file, like the quote's module.
export function moduleOfProgram(projectPath: string): string {
  const parts = projectPath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
}

// null when the inventory has no report data (distinct from "no report").
export function reportListRows(inventory: Inventory): ReportListRow[] | null {
  if (!inventory.totals.screenReport) return null;
  const rows = new Map<string, ReportListRow>();
  for (const program of inventory.programs)
    for (const report of program.reports ?? []) {
      const key = [
        report.kind,
        // Exact path: files that differ only in case are two files.
        report.file,
        report.line ?? '',
        report.name.toLowerCase(),
      ].join('\u0000');
      const owner = {
        projectPath: program.projectPath,
        label: programLabel(program.projectPath),
      };
      const existing = rows.get(key);
      if (existing) {
        existing.programs.push(owner);
        continue;
      }
      rows.set(key, {
        key,
        programs: [owner],
        module: moduleOfProgram(program.projectPath),
        kind: report.kind,
        name: report.name,
        file: report.file,
        line: report.line,
        confidence: report.confidence,
        shared: report.shared,
        level: report.complexity.level,
        score: report.complexity.score,
        version: report.complexity.version,
        factors: report.complexity.factors,
        reason: report.complexity.reason ?? null,
        warnings: report.warnings,
      });
    }
  return [...rows.values()];
}

export type ReportListFilter = {
  query: string;
  level: ReportLevel | 'all';
  kind: ReportKind | 'all';
  // counted = detected + referenced.
  confidence: 'all' | 'counted' | 'suspected';
};
export const EMPTY_REPORT_FILTER: ReportListFilter = {
  query: '',
  level: 'all',
  kind: 'all',
  confidence: 'all',
};

export function filterReports(
  rows: readonly ReportListRow[],
  filter: ReportListFilter,
): ReportListRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.level === 'all' || row.level === filter.level) &&
      (filter.kind === 'all' || row.kind === filter.kind) &&
      (filter.confidence === 'all' ||
        (filter.confidence === 'suspected') ===
          (row.confidence === 'suspected')) &&
      (query === '' ||
        row.name.toLowerCase().includes(query) ||
        row.file.toLowerCase().includes(query) ||
        row.programs.some((program) =>
          program.label.toLowerCase().includes(query),
        )),
  );
}

export type ReportSortKey =
  'program' | 'module' | 'kind' | 'name' | 'file' | 'confidence' | 'complexity';
export type ReportSort = { key: ReportSortKey; direction: 'asc' | 'desc' };

const CONFIDENCE_ORDER: Record<ReportConfidence, number> = {
  detected: 0,
  referenced: 1,
  suspected: 2,
};

function sortValue(row: ReportListRow, key: ReportSortKey): number | string {
  switch (key) {
    case 'program':
      return row.programs[0]?.label.toLowerCase() ?? '';
    case 'module':
      return row.module.toLowerCase();
    case 'kind':
      return REPORT_KINDS.indexOf(row.kind);
    case 'name':
      return row.name.toLowerCase();
    case 'file':
      return `${row.file.toLowerCase()}:${String(row.line ?? 0).padStart(8, '0')}`;
    case 'confidence':
      return CONFIDENCE_ORDER[row.confidence];
    // Unrated rows have no score and always come last, like programs not
    // analyzed: sorting never presents missing data as the lowest level.
    case 'complexity':
      return row.score ?? Number.NaN;
  }
}

export function sortReports(
  rows: readonly ReportListRow[],
  sort: ReportSort,
): ReportListRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: sortValue(row, sort.key) }))
    .sort((a, b) => {
      const aMissing = typeof a.value === 'number' && Number.isNaN(a.value);
      const bMissing = typeof b.value === 'number' && Number.isNaN(b.value);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (a.value < b.value) return -sign;
      if (a.value > b.value) return sign;
      return a.index - b.index;
    })
    .map(({ row }) => row);
}
