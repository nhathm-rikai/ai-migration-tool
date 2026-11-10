import type { SourceInventoryDocument } from './source-inventory.schema.js';
import { normalizeScreenReportTotals } from './screen-report-items.js';

// The reports (帳票) of a project, counted once each (10/11/2026).
//
// The analyzer writes one row per sign in the code (a .rpt string in a
// procedure, a Printer.Print, an Open For Output ...). A customer asks how
// many report forms there are, so this module turns the signs into reports
// by three rules, each an explicit assumption:
//
//  1. Crystal / DataReport: every template name is one report (a .rpt name
//     without folder, case-insensitive, or a .dsr file), however many places
//     name it. It has its design file, or it is missing.
//  2. Print in code (Printer.Print, PrintForm, EndDoc): every source file
//     (form or module) that prints is one report.
//  3. CSV / Excel export: every source file that exports is one report.
//
// File output that is neither (plain data or exchange files) is listed apart
// and not counted; paths with log, tmp, temp, debug, err words are log or
// temporary files and are left out. A report runtime without a template (an
// OCX alone) is listed apart and not counted.
//
// Pure and derived on read from the stored rows, so an inventory stored
// before this existed gets the same answer.

type Inventory = Pick<SourceInventoryDocument, 'programs'> & {
  totals: Pick<SourceInventoryDocument['totals'], 'screenReport'>;
};
type Level = 'low' | 'medium' | 'high' | 'very-high' | 'unrated';

export const REPORT_ORIGINS = ['crystal', 'print', 'export'] as const;
export type ReportOrigin = (typeof REPORT_ORIGINS)[number];
export type ReportTemplateKind = 'crystal' | 'data-report';
export type ReportTemplateStatus = 'design-file' | 'missing-file';

export type ReportUsage = {
  file: string;
  line: number | null;
  procedure: string | null;
  programs: string[];
};

export type ReportComplexity = {
  level: Level;
  score: number | null;
  version: string;
  factors: { factor: string; value: number; points: number }[];
  reason?: string | undefined;
};

export type ReportEntry = {
  id: string;
  origin: ReportOrigin;
  // Template name (crystal) or the source file the report is made in.
  name: string;
  // Crystal origin only.
  kind: ReportTemplateKind | null;
  designFile: string | null;
  status: ReportTemplateStatus | null;
  // Print / export origin: the file (form or module) that makes the report.
  file: string | null;
  complexity: ReportComplexity;
  usages: ReportUsage[];
  programs: string[];
};

export type DataFileKind = 'file-output' | 'unknown';
export type DataFileOutput = {
  id: string;
  file: string;
  procedure: string | null;
  kinds: DataFileKind[];
  evidence: { file: string; line: number | null; kind: DataFileKind }[];
  programs: string[];
};

export type ReportSummary = {
  // Every counted report, the three origins together.
  reports: ReportEntry[];
  // Not counted: other file output and report runtimes without a template.
  dataFiles: DataFileOutput[];
  counts: {
    total: number;
    crystal: number;
    // Of the Crystal / DataReport reports: design file present or missing.
    designFile: number;
    missingFile: number;
    print: number;
    export: number;
    byLevel: Record<Level, number>;
    dataFiles: number;
    // Log and temporary file outputs left out, per (file, procedure).
    excluded: number;
  };
};

const LEVELS: readonly Level[] = [
  'low',
  'medium',
  'high',
  'very-high',
  'unrated',
];

type Item = {
  kind: string;
  subkind?: string | undefined;
  excludeReason?: string | undefined;
  name: string;
  file: string;
  line: number | null;
  confidence: string;
  procedureId: string | null;
  complexity: {
    level: Level;
    score: number | null;
    version: string;
    factors: { factor: string; value: number; points: number }[];
    reason?: string | undefined;
  };
  programs: { program: string }[];
};

const complexityOf = (item: Item): ReportComplexity => ({
  level: item.complexity.level,
  score: item.complexity.score,
  version: item.complexity.version,
  factors: item.complexity.factors.map((factor) => ({ ...factor })),
  ...(item.complexity.reason ? { reason: item.complexity.reason } : {}),
});

const baseName = (path: string) => path.split(/[\\/]/).at(-1) ?? path;
const stemOf = (path: string) => baseName(path).replace(/\.[^.]*$/, '');
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function deriveReportSummary(
  inventory: Inventory,
): ReportSummary | undefined {
  const totals = normalizeScreenReportTotals(inventory);
  if (!totals) return undefined;

  type Draft = {
    id: string;
    origin: ReportOrigin;
    name: string;
    kind: ReportTemplateKind | null;
    designFile: string | null;
    file: string | null;
    complexity: ReportComplexity;
    usages: Map<string, ReportUsage>;
    programs: Set<string>;
  };
  const drafts = new Map<string, Draft>();
  type DataDraft = {
    file: string;
    procedure: string | null;
    evidence: Map<string, DataFileOutput['evidence'][number]>;
    programs: Set<string>;
  };
  const dataDrafts = new Map<string, DataDraft>();
  const excludedKeys = new Set<string>();

  const add = (
    key: string,
    seed: Omit<Draft, 'usages' | 'programs' | 'complexity'>,
    item: Item,
  ) => {
    let draft = drafts.get(key);
    if (!draft) {
      draft = {
        ...seed,
        complexity: complexityOf(item),
        usages: new Map(),
        programs: new Set(),
      };
      drafts.set(key, draft);
    } else if ((item.complexity.score ?? -1) > (draft.complexity.score ?? -1))
      draft.complexity = complexityOf(item);
    if (item.confidence === 'detected' && draft.designFile === null)
      draft.designFile =
        draft.origin === 'crystal'
          ? draft.kind === 'data-report'
            ? item.file
            : item.name
          : null;
    const programs = item.programs.map((entry) => entry.program);
    const usageKey = `${item.file}\u0000${item.line ?? ''}\u0000${item.procedureId ?? ''}`;
    const usage = draft.usages.get(usageKey);
    if (usage) {
      for (const program of programs)
        if (!usage.programs.includes(program)) usage.programs.push(program);
    } else
      draft.usages.set(usageKey, {
        file: item.file,
        line: item.line,
        procedure: item.procedureId,
        programs: [...programs],
      });
    for (const program of programs) draft.programs.add(program);
  };

  for (const item of totals.reportItems as Item[]) {
    if (item.confidence !== 'suspected') {
      const crystal = item.kind === 'crystal';
      if (!crystal && item.kind !== 'data-report') continue;
      const identity = crystal
        ? baseName(item.name).toLowerCase()
        : item.file.toLowerCase();
      add(
        `crystal\u0000${item.kind}\u0000${identity}`,
        {
          id: `RT-${item.kind}-${identity}`,
          origin: 'crystal',
          name: crystal ? baseName(item.name) : item.name,
          kind: crystal ? 'crystal' : 'data-report',
          designFile: null,
          file: null,
        },
        item,
      );
      continue;
    }
    // A sign of print, export or other file output.
    if (item.excludeReason !== undefined) {
      excludedKeys.add(`${item.file}\u0000${item.procedureId ?? ''}`);
      continue;
    }
    const origin: ReportOrigin | null =
      item.kind === 'print'
        ? 'print'
        : item.kind === 'excel' ||
            (item.kind === 'file-output' && item.subkind === 'csv')
          ? 'export'
          : null;
    if (origin !== null) {
      add(
        `${origin}\u0000${item.file}`,
        {
          id: `RP-${origin}-${item.file}`,
          origin,
          name: stemOf(item.file),
          kind: null,
          designFile: null,
          file: item.file,
        },
        item,
      );
      continue;
    }
    const dataKind: DataFileKind =
      item.kind === 'file-output' ? 'file-output' : 'unknown';
    const key = `${item.file}\u0000${item.procedureId ?? ''}`;
    let data = dataDrafts.get(key);
    if (!data) {
      data = {
        file: item.file,
        procedure: item.procedureId,
        evidence: new Map(),
        programs: new Set(),
      };
      dataDrafts.set(key, data);
    }
    data.evidence.set(`${item.line ?? ''}\u0000${dataKind}`, {
      file: item.file,
      line: item.line,
      kind: dataKind,
    });
    for (const entry of item.programs) data.programs.add(entry.program);
  }

  const reports: ReportEntry[] = [...drafts.values()]
    .map((draft): ReportEntry => {
      const usages = [...draft.usages.values()].sort(
        (a, b) => byText(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0),
      );
      const status: ReportTemplateStatus | null =
        draft.origin === 'crystal'
          ? draft.designFile === null
            ? 'missing-file'
            : 'design-file'
          : null;
      return {
        id: draft.id,
        origin: draft.origin,
        name: draft.name,
        kind: draft.kind,
        designFile: draft.designFile,
        status,
        file: draft.file,
        complexity: draft.complexity,
        usages,
        programs: [...draft.programs].sort(byText),
      };
    })
    .sort(
      (a, b) =>
        REPORT_ORIGINS.indexOf(a.origin) - REPORT_ORIGINS.indexOf(b.origin) ||
        byText(a.name.toLowerCase(), b.name.toLowerCase()) ||
        byText(a.file ?? '', b.file ?? ''),
    );

  const dataFiles: DataFileOutput[] = [...dataDrafts.values()]
    .sort(
      (a, b) =>
        byText(a.file, b.file) || byText(a.procedure ?? '', b.procedure ?? ''),
    )
    .map((draft, index): DataFileOutput => {
      const evidence = [...draft.evidence.values()].sort(
        (a, b) => (a.line ?? 0) - (b.line ?? 0),
      );
      return {
        id: `DF-${String(index + 1).padStart(4, '0')}`,
        file: draft.file,
        procedure: draft.procedure,
        kinds: (['file-output', 'unknown'] as const).filter((kind) =>
          evidence.some((row) => row.kind === kind),
        ),
        evidence,
        programs: [...draft.programs].sort(byText),
      };
    });

  const byLevel = Object.fromEntries(
    LEVELS.map((level) => [level, 0]),
  ) as Record<Level, number>;
  for (const report of reports) byLevel[report.complexity.level] += 1;
  const crystal = reports.filter((report) => report.origin === 'crystal');
  return {
    reports,
    dataFiles,
    counts: {
      total: reports.length,
      crystal: crystal.length,
      designFile: crystal.filter((r) => r.status === 'design-file').length,
      missingFile: crystal.filter((r) => r.status === 'missing-file').length,
      print: reports.filter((r) => r.origin === 'print').length,
      export: reports.filter((r) => r.origin === 'export').length,
      byLevel,
      dataFiles: dataFiles.length,
      excluded: excludedKeys.size,
    },
  };
}
