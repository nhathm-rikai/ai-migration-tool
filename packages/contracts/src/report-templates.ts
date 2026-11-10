import type { SourceInventoryDocument } from './source-inventory.schema.js';
import { normalizeScreenReportTotals } from './screen-report-items.js';

// Reports counted by TEMPLATE, not by sign in the code (10/11/2026).
//
// What a customer asks is "how many report forms are there". The analyzer
// writes one row per sign (a .rpt string in a procedure, a Printer.Print, an
// Open For Output ...), so the same template named in two procedures is two
// rows, and a print call is not a template at all. This module reads the
// project-level rows (normalizeScreenReportTotals) and answers two separate
// questions, never added together:
//
//  1. Templates: Crystal Reports / DataReport designs, one per template
//     identity across the whole project. A template with its design file in
//     the source is `design-file`; one only named in the code is
//     `missing-file` (the design file has to be requested from the customer).
//  2. Output functions: places where code prints or exports data (print,
//     Excel, CSV, other file output, report runtime without a template), one
//     per (file, procedure). They need confirmation: a print call does not
//     prove a report form, and a log or temporary file is not an output.
//
// Pure and derived on read, so an inventory stored before this existed gets
// the same answer from its stored rows.

type Inventory = Pick<SourceInventoryDocument, 'programs'> & {
  totals: Pick<SourceInventoryDocument['totals'], 'screenReport'>;
};
type Level = 'low' | 'medium' | 'high' | 'very-high' | 'unrated';

export const REPORT_TEMPLATE_KINDS = ['crystal', 'data-report'] as const;
export type ReportTemplateKind = (typeof REPORT_TEMPLATE_KINDS)[number];
export type ReportTemplateStatus = 'design-file' | 'missing-file';

export type ReportTemplateUsage = {
  file: string;
  line: number | null;
  procedure: string | null;
  programs: string[];
};

export type TemplateComplexity = {
  level: Level;
  score: number | null;
  version: string;
  factors: { factor: string; value: number; points: number }[];
  reason?: string | undefined;
};

export type ReportTemplate = {
  id: string;
  kind: ReportTemplateKind;
  name: string;
  // The design file as the source names it (relative path); null when only
  // referenced by name.
  designFile: string | null;
  status: ReportTemplateStatus;
  // Highest score of any place that uses the template.
  complexity: TemplateComplexity;
  usages: ReportTemplateUsage[];
  programs: string[];
};

export const OUTPUT_FUNCTION_KINDS = [
  'print',
  'excel',
  'csv',
  'file-output',
  'unknown',
] as const;
export type OutputFunctionKind = (typeof OUTPUT_FUNCTION_KINDS)[number];

export type OutputFunction = {
  id: string;
  file: string;
  procedure: string | null;
  kinds: OutputFunctionKind[];
  evidence: { file: string; line: number | null; kind: OutputFunctionKind }[];
  programs: string[];
  // A log or temporary file: listed, not counted.
  excluded: boolean;
  excludeReason: string | null;
};

export type ReportSummary = {
  templates: ReportTemplate[];
  functions: OutputFunction[];
  counts: {
    templates: number;
    designFile: number;
    missingFile: number;
    byLevel: Record<Level, number>;
    // Output functions that need confirmation (excluded ones left out).
    functions: number;
    // Distinct programs holding at least one of them.
    functionPrograms: number;
    // Log / temporary file outputs left out of the count.
    excludedFunctions: number;
  };
};

const LEVELS: readonly Level[] = [
  'low',
  'medium',
  'high',
  'very-high',
  'unrated',
];

const complexityOf = (item: {
  complexity: {
    level: Level;
    score: number | null;
    version: string;
    factors: { factor: string; value: number; points: number }[];
    reason?: string | undefined;
  };
}): TemplateComplexity => ({
  level: item.complexity.level,
  score: item.complexity.score,
  version: item.complexity.version,
  factors: item.complexity.factors.map((factor) => ({ ...factor })),
  ...(item.complexity.reason ? { reason: item.complexity.reason } : {}),
});

const baseName = (path: string) => path.split(/[\\/]/).at(-1) ?? path;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function deriveReportSummary(
  inventory: Inventory,
): ReportSummary | undefined {
  const totals = normalizeScreenReportTotals(inventory);
  if (!totals) return undefined;

  type Draft = {
    id: string;
    kind: ReportTemplateKind;
    name: string;
    designFile: string | null;
    complexity: TemplateComplexity;
    usages: Map<string, ReportTemplateUsage>;
    programs: Set<string>;
  };
  const drafts = new Map<string, Draft>();
  type FunctionDraft = {
    file: string;
    procedure: string | null;
    excluded: boolean;
    excludeReason: string | null;
    evidence: Map<string, OutputFunction['evidence'][number]>;
    programs: Set<string>;
  };
  const functionDrafts = new Map<string, FunctionDraft>();

  for (const item of totals.reportItems) {
    const programs = item.programs.map((entry) => entry.program);
    if (item.confidence !== 'suspected') {
      const crystal = item.kind === 'crystal';
      if (!crystal && item.kind !== 'data-report') continue;
      const identity = crystal
        ? baseName(item.name).toLowerCase()
        : item.file.toLowerCase();
      const key = `${item.kind}\u0000${identity}`;
      let draft = drafts.get(key);
      if (!draft) {
        draft = {
          id: `RT-${item.kind}-${identity}`,
          kind: crystal ? 'crystal' : 'data-report',
          name: crystal ? baseName(item.name) : item.name,
          designFile: null,
          complexity: complexityOf(item),
          usages: new Map(),
          programs: new Set(),
        };
        drafts.set(key, draft);
      } else if ((item.complexity.score ?? -1) > (draft.complexity.score ?? -1))
        draft.complexity = complexityOf(item);
      if (item.confidence === 'detected' && draft.designFile === null)
        draft.designFile = crystal ? item.name : item.file;
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
      continue;
    }
    // A suspected row is an output function (never a template).
    const kind: OutputFunctionKind =
      item.kind === 'file-output' && item.subkind === 'csv'
        ? 'csv'
        : item.kind === 'print' ||
            item.kind === 'excel' ||
            item.kind === 'file-output' ||
            item.kind === 'unknown'
          ? item.kind
          : 'unknown';
    const excluded = item.excludeReason !== undefined;
    const key = `${item.file}\u0000${item.procedureId ?? ''}\u0000${excluded ? 'x' : 'o'}`;
    let draft = functionDrafts.get(key);
    if (!draft) {
      draft = {
        file: item.file,
        procedure: item.procedureId,
        excluded,
        excludeReason: item.excludeReason ?? null,
        evidence: new Map(),
        programs: new Set(),
      };
      functionDrafts.set(key, draft);
    }
    draft.evidence.set(`${item.line ?? ''}\u0000${kind}`, {
      file: item.file,
      line: item.line,
      kind,
    });
    for (const program of programs) draft.programs.add(program);
  }

  const templates: ReportTemplate[] = [...drafts.values()]
    .map((draft): ReportTemplate => {
      const usages = [...draft.usages.values()].sort(
        (a, b) => byText(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0),
      );
      return {
        id: draft.id,
        kind: draft.kind,
        name: draft.name,
        designFile: draft.designFile,
        status: draft.designFile === null ? 'missing-file' : 'design-file',
        complexity: draft.complexity,
        usages,
        programs: [...draft.programs].sort(byText),
      };
    })
    .sort((a, b) => byText(a.name.toLowerCase(), b.name.toLowerCase()));

  const functions: OutputFunction[] = [...functionDrafts.values()]
    .sort(
      (a, b) =>
        byText(a.file, b.file) ||
        byText(a.procedure ?? '', b.procedure ?? '') ||
        Number(a.excluded) - Number(b.excluded),
    )
    .map((draft, index): OutputFunction => {
      const evidence = [...draft.evidence.values()].sort(
        (a, b) => (a.line ?? 0) - (b.line ?? 0),
      );
      const kinds = OUTPUT_FUNCTION_KINDS.filter((kind) =>
        evidence.some((row) => row.kind === kind),
      );
      return {
        id: `OF-${String(index + 1).padStart(4, '0')}`,
        file: draft.file,
        procedure: draft.procedure,
        kinds,
        evidence,
        programs: [...draft.programs].sort(byText),
        excluded: draft.excluded,
        excludeReason: draft.excludeReason,
      };
    });

  const byLevel = Object.fromEntries(
    LEVELS.map((level) => [level, 0]),
  ) as Record<Level, number>;
  for (const template of templates) byLevel[template.complexity.level] += 1;
  const counted = functions.filter((entry) => !entry.excluded);
  return {
    templates,
    functions,
    counts: {
      templates: templates.length,
      designFile: templates.filter((t) => t.status === 'design-file').length,
      missingFile: templates.filter((t) => t.status === 'missing-file').length,
      byLevel,
      functions: counted.length,
      functionPrograms: new Set(counted.flatMap((entry) => entry.programs))
        .size,
      excludedFunctions: functions.length - counted.length,
    },
  };
}
