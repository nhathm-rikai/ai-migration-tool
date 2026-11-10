import type { SourceInventoryDocument } from './source-inventory.schema.js';
import { normalizeScreenReportTotals } from './screen-report-items.js';

// The reports (帳票) of a project, counted once each (10/11/2026).
//
// The analyzer writes one row per sign in the code (a .rpt string in a
// procedure, a Printer.Print, an Open For Output ...). A customer asks how
// many report forms there are, so this module turns the signs into output
// units by three conventions (REPORT_COUNTING_BASIS states them):
//
//  1. Crystal / DataReport: one unit per template. A .rpt written with a
//     folder in the code is identified by its normalized path (case-insensitive,
//     "/" and "\" alike): sales/Detail.rpt and stock/Detail.rpt are two. A
//     .rpt written by name only (also App.Path & "\x.rpt") is identified by
//     the file name, assuming the same name is the same template; such a name
//     joins the path-identified template when it is the only path with that
//     file name in the project. A .dsr is identified by its file.
//  2. Print in code (Printer.Print, PrintForm, EndDoc): one unit per source
//     file (.frm / .bas / .cls) that prints.
//  3. CSV / Excel export: one unit per source file that exports.
//
// The origins are counted apart: a file that calls Crystal, prints and
// exports is up to three units. File output that is neither (plain data or
// exchange files) is listed apart and not counted; paths with log, tmp, temp,
// debug, err words are taken as log or temporary files and left out. A report
// runtime without a template (an OCX alone) is listed apart and not counted.
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
  // What the report is told apart by: the normalized path written in the code,
  // the bare file name (assumed the same template), or the source file
  // (print / export).
  identity: 'path' | 'name' | 'file';
  designFile: string | null;
  status: ReportTemplateStatus | null;
  // Print / export origin: the source file that makes the report. Crystal: the
  // path written in the code, when it has a folder.
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
    // Of the Crystal / DataReport reports: told apart by path or by name only.
    identityPath: number;
    identityName: number;
    // Source files that make output in two or more of the three ways.
    overlapFiles: number;
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
    identity: 'path' | 'name' | 'file';
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

  const items = totals.reportItems as Item[];
  const slashed = (name: string) => name.replaceAll('\\', '/');
  const normalizedPath = (name: string) =>
    slashed(name)
      .replace(/^(?:\.\/)+/, '')
      .toLowerCase();
  // The paths written in the code, by file name: a name without folder joins
  // the path of its file name when there is only one.
  const pathsOf = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.confidence === 'suspected' || item.kind !== 'crystal') continue;
    const path = normalizedPath(item.name);
    if (!path.includes('/')) continue;
    const name = baseName(path);
    const paths = pathsOf.get(name) ?? new Set<string>();
    paths.add(path);
    pathsOf.set(name, paths);
  }
  const crystalIdentity = (name: string): { key: string; byPath: boolean } => {
    const path = normalizedPath(name);
    if (path.includes('/')) return { key: path, byPath: true };
    const paths = pathsOf.get(path);
    return paths?.size === 1
      ? { key: [...paths][0] ?? path, byPath: true }
      : { key: path, byPath: false };
  };

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
    if (
      draft.origin === 'crystal' &&
      draft.kind === 'crystal' &&
      draft.file === null &&
      slashed(item.name).includes('/')
    )
      draft.file = slashed(item.name);
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

  for (const item of items) {
    if (item.confidence !== 'suspected') {
      const crystal = item.kind === 'crystal';
      if (!crystal && item.kind !== 'data-report') continue;
      const found = crystal ? crystalIdentity(item.name) : null;
      const identity = found ? found.key : item.file.toLowerCase();
      add(
        `crystal\u0000${item.kind}\u0000${identity}`,
        {
          id: `RT-${item.kind}-${identity}`,
          origin: 'crystal',
          name: crystal ? baseName(item.name) : item.name,
          kind: crystal ? 'crystal' : 'data-report',
          identity: found && !found.byPath ? 'name' : 'path',
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
          identity: 'file',
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
        identity: draft.identity,
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
  // The source files that make output: where Crystal is called, printed in and
  // exported from.
  const originsOfFile = new Map<string, Set<ReportOrigin>>();
  for (const report of reports)
    for (const usage of report.usages) {
      const origins = originsOfFile.get(usage.file) ?? new Set<ReportOrigin>();
      origins.add(report.origin);
      originsOfFile.set(usage.file, origins);
    }
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
      identityPath: crystal.filter((r) => r.identity === 'path').length,
      identityName: crystal.filter((r) => r.identity === 'name').length,
      overlapFiles: [...originsOfFile.values()].filter((o) => o.size > 1)
        .length,
      dataFiles: dataFiles.length,
      excluded: excludedKeys.size,
    },
  };
}
