import type {
  ProjectReportItem,
  SourceInventoryDocument,
} from './source-inventory.schema.js';

// The project-level report list of an inventory (AR04), in ONE place: the
// analyzer writes it into `totals.screenReport.reportItems`, and an inventory
// stored before that field existed gets the same list derived here, by the
// same rule, on read. Totals, the UI and every export use this list; nothing
// aggregates program rows on its own.
//
// Rule: a report of a shared file is listed by several programs and may be
// scored differently in each (its calls are resolved per program). The
// project-level entry keeps the HIGHEST score (ties: the first program in
// inventory order) and records every program's own score.

type ProgramRows = {
  projectPath: string;
  reports?: readonly ProjectReportItemRow[] | undefined;
};
type ProjectReportItemRow = NonNullable<
  SourceInventoryDocument['programs'][number]['reports']
>[number];
type Totals = NonNullable<SourceInventoryDocument['totals']['screenReport']>;

// Identity of a report across programs: exact path, so files that differ only
// in case are two reports.
export const reportKey = (row: {
  kind: string;
  file: string;
  line: number | null;
  name: string;
}) =>
  `${row.kind}\u0000${row.file}\u0000${row.line ?? ''}\u0000${row.name.toLowerCase()}`;

export function projectReportItems(
  programs: readonly ProgramRows[],
): ProjectReportItem[] {
  const items = new Map<string, ProjectReportItem>();
  for (const program of programs)
    for (const row of program.reports ?? []) {
      const key = reportKey(row);
      const own = {
        program: program.projectPath,
        level: row.complexity.level,
        score: row.complexity.score,
      };
      const existing = items.get(key);
      if (!existing) {
        items.set(key, { ...row, programs: [own] });
        continue;
      }
      if (!existing.programs.some((entry) => entry.program === own.program))
        existing.programs.push(own);
      // Strictly higher only: a tie keeps the first program's entry.
      if ((row.complexity.score ?? -1) > (existing.complexity.score ?? -1)) {
        const listed = existing.programs;
        Object.assign(existing, row, { programs: listed });
      } else if (row.shared) existing.shared = true;
    }
  return [...items.values()];
}

const KINDS = [
  'data-report',
  'crystal',
  'excel',
  'print',
  'file-output',
  'unknown',
] as const;
const LEVELS = ['low', 'medium', 'high', 'very-high', 'unrated'] as const;

// The screen/report totals of an inventory with the project-level list always
// present: as stored when the analyzer wrote it, else derived (counts by kind
// and level included, so they agree with the list). undefined: the inventory
// has no screen/report data at all.
export function normalizeScreenReportTotals(
  inventory: Pick<SourceInventoryDocument, 'programs'> & {
    totals: Pick<SourceInventoryDocument['totals'], 'screenReport'>;
  },
): (Totals & { reportItems: ProjectReportItem[] }) | undefined {
  const totals = inventory.totals.screenReport;
  if (!totals) return undefined;
  if (totals.reportItems) return { ...totals, reportItems: totals.reportItems };
  const reportItems = projectReportItems(inventory.programs);
  const byKind = Object.fromEntries(
    KINDS.map((k) => [k, 0]),
  ) as Totals['reports']['byKind'];
  const byLevel = Object.fromEntries(
    LEVELS.map((l) => [l, 0]),
  ) as Totals['reports']['byLevel'];
  let counted = 0;
  for (const item of reportItems) {
    byKind[item.kind] += 1;
    byLevel[item.complexity.level] += 1;
    if (item.confidence !== 'suspected') counted += 1;
  }
  return {
    ...totals,
    reports: {
      rows: reportItems.length,
      counted,
      suspected: reportItems.length - counted,
      byKind,
      byLevel,
    },
    reportItems,
  };
}
