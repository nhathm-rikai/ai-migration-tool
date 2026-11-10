import {
  normalizeScreenReportTotals,
  type SourceInventoryDocument,
} from '@portal/contracts';

// View model of the screen (画面), report (帳票) and batch counts (AR04). It
// only selects what the inventory states: counts come from
// `totals.screenReport`, rows from each program. An inventory written before
// AR04 has none of these fields: that is "no data, analyze again", never 0.

type Inventory = SourceInventoryDocument;
type Program = Inventory['programs'][number];
type Totals = NonNullable<Inventory['totals']['screenReport']>;

export const REPORT_LEVELS = [
  'low',
  'medium',
  'high',
  'very-high',
  'unrated',
] as const;
export type ReportLevel = (typeof REPORT_LEVELS)[number];

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
  // Stored before reportItems existed: derived by the shared contracts rule.
  const totals = normalizeScreenReportTotals(inventory);
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
