import {
  projectReportItems,
  REPORT_COMPLEXITY_VERSION,
} from '@portal/contracts';
import { redactWithId } from './redact-path.js';
import type {
  CodeFileAnalysis,
  LanguageAnalyzer,
  ProjectExternalReference,
} from './language-analyzer.js';

// Screen (画面), report (帳票) and batch (バッチ) counting, language neutral.
// The counting rules are in specs/source-inventory.md §7. Everything here is
// lexical evidence: a report row says where code can produce output, and a
// `suspected` row is never added to the report total.

export {
  REPORT_COMPLEXITY_VERSION,
  SCREEN_REPORT_VERSION,
} from '@portal/contracts';

type AnalyzedFile = Extract<CodeFileAnalysis, { status: 'analyzed' }>;

export type ReportKind =
  'data-report' | 'crystal' | 'excel' | 'print' | 'file-output' | 'unknown';
export type ReportConfidence = 'detected' | 'referenced' | 'suspected';
export type ReportLevel = 'low' | 'medium' | 'high' | 'very-high' | 'unrated';
export type RatedLevel = Exclude<ReportLevel, 'unrated'>;

export const REPORT_KIND_LIST: readonly ReportKind[] = [
  'data-report',
  'crystal',
  'excel',
  'print',
  'file-output',
  'unknown',
];
export const REPORT_LEVEL_LIST: readonly ReportLevel[] = [
  'low',
  'medium',
  'high',
  'very-high',
  'unrated',
];

// ---- Complexity of one report (R10, reference only) -----------------------

// Measures of the procedures scored for one report (AR06): the procedure that
// makes it and what it calls (REPORT_CALL_DEPTH levels), measured together.
export type ReportEvidence = {
  decisionPoints: number;
  executableLines: number;
  // Distinct tables accessed.
  tables: number;
  // SQL with a runtime table name or concatenated runtime values, by place.
  dynamicSql: number;
  // Distinct (caller, callee) pairs of resolved calls made by the scored
  // procedures.
  calls: number;
};

// Statements that print, draw or position on a printer / report object.
export type PrintOps = { content: number; drawing: number; position: number };

// How far down the resolved call graph a report is scored, from the procedure
// that makes it (decided 11/11/2026: 2 levels, never up into a handler).
export const REPORT_CALL_DEPTH = 2;

type Steps = readonly (readonly [number, number])[];

// Step tables: [value at least, points]. The highest step reached counts.
// Changing these constants changes levels without touching the logic; bump
// REPORT_COMPLEXITY_VERSION when they change.
export type ReportComplexityConfig = {
  steps: Record<keyof ReportEvidence, Steps>;
  // Print / draw density: each group has its own steps and the factor is
  // min(cap, content points + drawing points). Position adds nothing.
  printDensity: { content: Steps; drawing: Steps; cap: number };
  // Score at which medium, high and very-high start.
  levelThresholds: readonly [number, number, number];
};

export const DEFAULT_REPORT_COMPLEXITY_CONFIG: ReportComplexityConfig = {
  steps: {
    decisionPoints: [
      [5, 1],
      [15, 2],
      [30, 3],
    ],
    executableLines: [
      [30, 1],
      [80, 2],
      [150, 3],
    ],
    tables: [
      [2, 1],
      [4, 2],
      [8, 3],
    ],
    dynamicSql: [[1, 3]],
    calls: [
      [3, 1],
      [8, 2],
      [15, 3],
    ],
  },
  // Initial thresholds decided 11/11/2026; to be reviewed with the pilot.
  printDensity: {
    content: [
      [20, 1],
      [60, 2],
      [120, 3],
    ],
    drawing: [
      [10, 1],
      [30, 2],
      [60, 3],
    ],
    cap: 3,
  },
  levelThresholds: [3, 6, 9],
};

export type ReportFactor = { factor: string; value: number; points: number };
// What was scored (stored with the report as evidence).
export type ReportScope = {
  procedures: { id: string; tier: 0 | 1 | 2 }[];
  unresolvedCalls: number;
  printOps: PrintOps;
};
export type ReportComplexity = {
  version: string;
  level: ReportLevel;
  score: number | null;
  factors: ReportFactor[];
  reason?: string;
  scope?: ReportScope;
};

const FACTOR_ORDER: (keyof ReportEvidence)[] = [
  'decisionPoints',
  'executableLines',
  'tables',
  'dynamicSql',
  'calls',
];
const DESIGN_FACTOR: ReportFactor = {
  factor: 'design-not-analyzed',
  value: 1,
  points: 0,
};
const RATED: RatedLevel[] = ['low', 'medium', 'high', 'very-high'];

const pointsOf = (value: number, steps: Steps) =>
  steps.reduce(
    (best, [atLeast, step]) => (value >= atLeast ? Math.max(best, step) : best),
    0,
  );

export function scoreReportComplexity(
  evidence: ReportEvidence,
  config: ReportComplexityConfig = DEFAULT_REPORT_COMPLEXITY_CONFIG,
  options: {
    designNotAnalyzed?: boolean;
    printOps?: PrintOps;
    scope?: ReportScope;
  } = {},
): ReportComplexity {
  const printOps = options.printOps ?? { content: 0, drawing: 0, position: 0 };
  const factors: ReportFactor[] = [
    ...FACTOR_ORDER.map((factor) => ({
      factor,
      value: evidence[factor],
      points: pointsOf(evidence[factor], config.steps[factor]),
    })),
    {
      factor: 'printDensity',
      // Position statements are recorded in the scope, not scored.
      value: printOps.content + printOps.drawing,
      points: Math.min(
        config.printDensity.cap,
        pointsOf(printOps.content, config.printDensity.content) +
          pointsOf(printOps.drawing, config.printDensity.drawing),
      ),
    },
  ];
  const score = factors.reduce((sum, factor) => sum + factor.points, 0);
  const [medium, high, veryHigh] = config.levelThresholds;
  let level: RatedLevel =
    score < medium
      ? 'low'
      : score < high
        ? 'medium'
        : score < veryHigh
          ? 'high'
          : 'very-high';
  const scope = options.scope ? { scope: options.scope } : {};
  if (!options.designNotAnalyzed)
    return {
      version: REPORT_COMPLEXITY_VERSION,
      level,
      score,
      factors,
      ...scope,
    };
  // The design (.rpt/.dsr) is not analyzed, so only the calling code is
  // scored; that must not read as a low report.
  const reason =
    RATED.indexOf(level) < RATED.indexOf('medium')
      ? 'DESIGN_NOT_ANALYZED_FLOOR'
      : undefined;
  if (reason) level = 'medium';
  return {
    version: REPORT_COMPLEXITY_VERSION,
    level,
    score,
    factors: [...factors, DESIGN_FACTOR],
    ...(reason ? { reason } : {}),
    ...scope,
  };
}

export function unratedComplexity(
  reason: 'SUSPECTED' | 'NO_PROCEDURE',
  designNotAnalyzed: boolean,
): ReportComplexity {
  return {
    version: REPORT_COMPLEXITY_VERSION,
    level: 'unrated',
    score: null,
    factors: designNotAnalyzed ? [DESIGN_FACTOR] : [],
    reason,
  };
}

// ---- Rows ------------------------------------------------------------------

export type ReportRow = {
  kind: ReportKind;
  name: string;
  file: string;
  line: number | null;
  confidence: ReportConfidence;
  procedureId: string | null;
  warnings: string[];
  complexity: ReportComplexity;
  // file-output: a .csv path (screen-report-v2).
  subkind?: 'csv';
  // file-output: a log or temporary file, not a report output (v2).
  excludeReason?: string;
};

export type ProgramReport = ReportRow & { shared: boolean };

export type ProgramScreen = {
  name: string | null;
  file: string;
  shared: boolean;
  warnings: string[];
};

const fileNameOf = (text: string) => text.split(/[\\/]/).at(-1) ?? text;

export type ProgramType = 'screen' | 'batch' | 'unknown';

// One report of the project. A report of a shared file is listed by several
// programs and may be scored differently in each (its calls are resolved per
// program); the project-level entry keeps the HIGHEST score (ties: the first
// program in inventory order) and records every program's own score.
export type ProjectReport = ProgramReport & {
  programs: { program: string; level: ReportLevel; score: number | null }[];
};

export type ScreenReportTotals = {
  screens: number;
  sharedScreens: number;
  batches: number;
  reports: {
    rows: number;
    counted: number;
    suspected: number;
    byKind: Record<ReportKind, number>;
    byLevel: Record<ReportLevel, number>;
  };
  suspectedPrograms: number;
  reportItems: ProjectReport[];
};

// Facts of one procedure that a report score may need, whatever file it is in.
export type ProcedureFacts = {
  decisionPoints: number;
  executableLines: number;
  // Tables accessed, lower case.
  tables: readonly string[];
  // Places (file:line) of SQL with a runtime table name or concatenated values.
  dynamicSql: readonly string[];
  printOps: PrintOps;
  // Calls by name at run time (CallByName): never resolvable.
  dynamicCalls: number;
};

// What only the program a row is listed under can tell: whether the design
// file of a Crystal report resolves from that program's project file, and the
// call graph this program resolves (a shared module resolves calls differently
// in each program that lists it).
export type ProgramContext = {
  projectPath: string;
  // A design file path as written (relative, "/" separated) found in the
  // source from this project's folder or from the source root.
  designExists(projectPath: string, written: string): boolean;
  factsOf(procedureId: string): ProcedureFacts | undefined;
  // Procedures this program resolves from a procedure (local or program
  // level; ambiguous and native calls are not followed).
  calleesOf(procedureId: string): readonly string[];
  // Distinct calls of the procedure that stay unresolved here (ambiguous,
  // native); CallByName is counted in the facts.
  unresolvedCallsOf(procedureId: string): number;
};

// The procedures scored for a set of root procedures: the roots (tier 0) and
// what they call within `depth` levels. A tier is the SHORTEST call path, so
// A->X->B and A->B make B tier 1; a procedure is in the scope once (cycles
// end at a procedure already seen). Only resolved calls are followed.
export function reportScope(
  roots: readonly string[],
  context: Pick<ProgramContext, 'factsOf' | 'calleesOf'>,
  depth = REPORT_CALL_DEPTH,
): { id: string; tier: 0 | 1 | 2 }[] {
  const tiers = new Map<string, 0 | 1 | 2>();
  let frontier: string[] = [];
  for (const id of roots)
    if (!tiers.has(id) && context.factsOf(id)) {
      tiers.set(id, 0);
      frontier.push(id);
    }
  for (let tier = 1; tier <= Math.min(depth, 2); tier += 1) {
    const next: string[] = [];
    for (const id of frontier)
      for (const callee of context.calleesOf(id)) {
        if (tiers.has(callee) || !context.factsOf(callee)) continue;
        tiers.set(callee, tier as 1 | 2);
        next.push(callee);
      }
    frontier = next;
  }
  return [...tiers].map(([id, tier]) => ({ id, tier }));
}

// Measures of a scope, together: the measures are merged first and scored
// once (not a sum of scores). Branches and executable lines add up per
// procedure; tables are a union of names; dynamic SQL a union of places;
// calls a union of (caller, callee) pairs.
function measureScope(
  scope: readonly { id: string; tier: 0 | 1 | 2 }[],
  context: ProgramContext,
): { evidence: ReportEvidence; printOps: PrintOps; unresolvedCalls: number } {
  const tables = new Set<string>();
  const dynamicSql = new Set<string>();
  const pairs = new Set<string>();
  const printOps: PrintOps = { content: 0, drawing: 0, position: 0 };
  let decisionPoints = 0;
  let executableLines = 0;
  let unresolvedCalls = 0;
  for (const { id } of scope) {
    const facts = context.factsOf(id);
    if (!facts) continue;
    decisionPoints += facts.decisionPoints;
    executableLines += facts.executableLines;
    for (const table of facts.tables) tables.add(table);
    for (const place of facts.dynamicSql) dynamicSql.add(place);
    printOps.content += facts.printOps.content;
    printOps.drawing += facts.printOps.drawing;
    printOps.position += facts.printOps.position;
    unresolvedCalls += context.unresolvedCallsOf(id) + facts.dynamicCalls;
    for (const callee of context.calleesOf(id))
      pairs.add(`${id}\u0000${callee}`);
  }
  return {
    evidence: {
      decisionPoints,
      executableLines,
      tables: tables.size,
      dynamicSql: dynamicSql.size,
      calls: pairs.size,
    },
    printOps,
    unresolvedCalls,
  };
}

// A row of a file before its complexity is scored: a report is scored per
// report (a unit), over the rows that make it in one program, so the score is
// given when the program's rows are all known. `null`: not scored yet.
export type ReportDraft = Omit<ReportRow, 'complexity'> & {
  complexity: ReportComplexity | null;
};
// A row of a file, completed for one program.
export type FileReport = (context: ProgramContext) => ReportDraft;

// Report rows of one analyzed code file, each finished per program.
export function buildCodeFileReportRows(input: {
  analyzer: LanguageAnalyzer;
  relativePath: string;
  lines: string[];
  analysis: AnalyzedFile;
}): FileReport[] {
  const { analysis, relativePath } = input;
  const seen = new Set<string>();
  const rows: FileReport[] = [];
  for (const signal of input.analyzer.findReportSignals(
    relativePath,
    input.lines,
  )) {
    const procedure = analysis.procedures.find(
      (candidate) =>
        candidate.startLine <= signal.line && signal.line <= candidate.endLine,
    );
    // A Crystal report is told apart by the path written in the code, so
    // two reports with the same file name in different folders stay two.
    const key = `${signal.kind}\u0000${(signal.path ?? signal.name).toLowerCase()}\u0000${procedure?.id ?? ''}\u0000${signal.subkind ?? ''}\u0000${signal.excludeReason ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const crystal = signal.kind === 'crystal';
    rows.push((context) => {
      const found =
        crystal &&
        signal.absolute !== true &&
        signal.path !== undefined &&
        context.designExists(context.projectPath, signal.path);
      const confidence: ReportConfidence = !crystal
        ? 'suspected'
        : found
          ? 'detected'
          : 'referenced';
      return {
        kind: signal.kind,
        name: signal.name,
        file: relativePath,
        line: signal.line,
        confidence,
        procedureId: procedure?.id ?? null,
        warnings: confidence === 'referenced' ? ['REPORT_FILE_MISSING'] : [],
        // A report with no procedure is unrated; the others are scored with
        // the rest of their unit (see scoreProgramReports).
        complexity: procedure
          ? null
          : unratedComplexity('NO_PROCEDURE', crystal),
        ...(signal.subkind ? { subkind: signal.subkind } : {}),
        ...(signal.excludeReason
          ? { excludeReason: signal.excludeReason }
          : {}),
      };
    });
  }
  return rows;
}

// A report designer member (e.g. a DataReport .dsr). Design is not parsed, so
// the row is unrated: no procedure holds it.
export function designerReportRow(
  relativePath: string,
  header: { line: number; name: string },
): FileReport {
  return () => ({
    kind: 'data-report',
    name: header.name,
    file: relativePath,
    line: header.line,
    confidence: 'detected',
    procedureId: null,
    warnings: [],
    complexity: unratedComplexity('NO_PROCEDURE', true),
  });
}

// The unit a row is scored with, by the same conventions as the report count
// (contracts/report-templates.ts): a Crystal template is one unit wherever it is
// used; code print and CSV / Excel export are one unit per source file and per
// way; any other row (not counted as a report) is its own unit.
function unitKeys(drafts: readonly ReportDraft[]): string[] {
  const slashed = (name: string) =>
    name
      .replaceAll('\\', '/')
      .replace(/^(?:\.\/)+/, '')
      .toLowerCase();
  // A name without a folder joins the path of its file name when this program
  // writes only one path for it.
  const pathsOf = new Map<string, Set<string>>();
  for (const draft of drafts) {
    if (draft.kind !== 'crystal') continue;
    const path = slashed(draft.name);
    if (!path.includes('/')) continue;
    const name = path.split('/').at(-1) ?? path;
    pathsOf.set(name, (pathsOf.get(name) ?? new Set()).add(path));
  }
  return drafts.map((draft, index) => {
    if (draft.kind === 'crystal') {
      const path = slashed(draft.name);
      const paths = path.includes('/') ? undefined : pathsOf.get(path);
      return `crystal\u0000${paths?.size === 1 ? ([...paths][0] ?? path) : path}`;
    }
    if (draft.excludeReason !== undefined) return `row\u0000${index}`;
    if (draft.kind === 'print') return `print\u0000${draft.file}`;
    if (
      draft.kind === 'excel' ||
      (draft.kind === 'file-output' && draft.subkind === 'csv')
    )
      return `export\u0000${draft.file}`;
    return `row\u0000${index}`;
  });
}

// Scores every row of a program: the rows of one unit share one score, taken
// over the union of their procedures and what those call (AR06).
function scoreProgramReports<Row extends ReportDraft>(
  drafts: readonly Row[],
  context: ProgramContext,
  config: ReportComplexityConfig = DEFAULT_REPORT_COMPLEXITY_CONFIG,
): (Omit<Row, 'complexity'> & { complexity: ReportComplexity })[] {
  const keys = unitKeys(drafts);
  const roots = new Map<string, string[]>();
  drafts.forEach((draft, index) => {
    if (draft.complexity !== null || draft.procedureId === null) return;
    const key = keys[index] ?? '';
    roots.set(key, [...(roots.get(key) ?? []), draft.procedureId]);
  });
  const scored = new Map<string, ReportComplexity>();
  for (const [key, procedures] of roots) {
    const scope = reportScope(procedures, context);
    const { evidence, printOps, unresolvedCalls } = measureScope(
      scope,
      context,
    );
    scored.set(
      key,
      scoreReportComplexity(evidence, config, {
        // Only a Crystal report has a design that is not analyzed.
        designNotAnalyzed: key.startsWith('crystal\u0000'),
        printOps,
        scope: { procedures: scope, unresolvedCalls, printOps },
      }),
    );
  }
  return drafts.map((draft, index) => ({
    ...draft,
    complexity:
      draft.complexity ??
      scored.get(keys[index] ?? '') ??
      unratedComplexity('NO_PROCEDURE', draft.kind === 'crystal'),
  }));
}

// ---- Per program -----------------------------------------------------------

export type ScreenReportMember = {
  kind: string;
  name: string | null;
  declaredPath: string;
  // Path the screen is reported under: the real file, else declared path
  // resolved against the project directory.
  displayPath: string;
  relativePath: string | null;
  resolution: string;
  fileStatus: string | null;
  shared: boolean;
};

function screenWarnings(member: ScreenReportMember): string[] {
  if (member.relativePath === null) return ['SCREEN_FILE_MISSING'];
  return member.fileStatus === 'analyzed' ? [] : ['SCREEN_FILE_NOT_ANALYZED'];
}

export function buildProgramScreenReport(input: {
  analyzer: LanguageAnalyzer;
  projectPath: string;
  startup: string | undefined;
  members: readonly ScreenReportMember[];
  externalReferences: readonly ProjectExternalReference[];
  rowsByFile: ReadonlyMap<string, readonly FileReport[]>;
  context: Omit<ProgramContext, 'projectPath'>;
}): {
  programType: ProgramType;
  screens: ProgramScreen[];
  reports: ProgramReport[];
} {
  const { analyzer } = input;
  const screens: ProgramScreen[] = [];
  const reports: ProgramReport[] = [];
  const drafts: (ReportDraft & { shared: boolean })[] = [];
  const seenScreens = new Set<string>();
  const seenFiles = new Set<string>();
  for (const member of input.members) {
    if (analyzer.isScreenMemberKind(member.kind)) {
      // Two resolved files that differ only in case are two files (a
      // case-sensitive file system); an unresolved path is matched loosely.
      const key =
        member.relativePath ?? redactWithId(member.displayPath).toLowerCase();
      if (!seenScreens.has(key)) {
        seenScreens.add(key);
        screens.push({
          name: member.name,
          file: redactWithId(member.displayPath),
          shared: member.shared,
          warnings: screenWarnings(member),
        });
      }
    }
    if (member.relativePath === null) continue;
    if (seenFiles.has(member.relativePath)) continue;
    seenFiles.add(member.relativePath);
    for (const finish of input.rowsByFile.get(member.relativePath) ?? [])
      drafts.push({
        ...finish({ ...input.context, projectPath: input.projectPath }),
        shared: member.shared,
      });
  }
  reports.push(
    ...scoreProgramReports(drafts, {
      ...input.context,
      projectPath: input.projectPath,
    }),
  );

  // A report runtime (Crystal, DataReport) among the references without a
  // report of its own kind found: one suspected row keeps the gap visible.
  const gap = input.externalReferences.find((reference) => {
    const runtime = analyzer.reportRuntimeOf(reference);
    return runtime !== null && !reports.some((row) => row.kind === runtime);
  });
  if (gap)
    reports.push({
      kind: 'unknown',
      // File name only: the reference may carry a path of the author's
      // machine (the same rule as the redacted external references).
      name: fileNameOf(gap.fileName ?? gap.description ?? gap.identifier),
      file: input.projectPath,
      line: null,
      confidence: 'suspected',
      procedureId: null,
      warnings: [],
      complexity: unratedComplexity('SUSPECTED', false),
      shared: false,
    });

  const programType: ProgramType =
    screens.length > 0
      ? 'screen'
      : analyzer.isBatchStartup(input.startup)
        ? 'batch'
        : 'unknown';
  return { programType, screens, reports };
}

// ---- Project totals --------------------------------------------------------

type ProgramView = {
  // Project path of the program.
  program: string;
  screens: readonly ProgramScreen[];
  reports: readonly ProgramReport[];
  programType: ProgramType;
};

const zeroRecord = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

export { reportKey } from '@portal/contracts';

export function buildScreenReportTotals(
  programs: readonly ProgramView[],
): ScreenReportTotals {
  const screens = new Map<string, ProgramScreen>();
  let suspectedPrograms = 0;
  let batches = 0;
  for (const program of programs) {
    if (program.programType === 'batch') batches += 1;
    if (program.reports.some((row) => row.confidence === 'suspected'))
      suspectedPrograms += 1;
    for (const screen of program.screens) {
      const key = screen.warnings.includes('SCREEN_FILE_MISSING')
        ? screen.file.toLowerCase()
        : screen.file;
      const existing = screens.get(key);
      if (!existing) screens.set(key, screen);
      else if (screen.shared) existing.shared = true;
    }
  }
  // The project-level list: one rule, shared with the readers of stored
  // inventories (contracts/screen-report-items.ts).
  const items = projectReportItems(
    programs.map((program) => ({
      projectPath: program.program,
      reports: program.reports,
    })),
  );
  const byKind = zeroRecord(REPORT_KIND_LIST);
  const byLevel = zeroRecord(REPORT_LEVEL_LIST);
  let counted = 0;
  for (const row of items) {
    byKind[row.kind] += 1;
    byLevel[row.complexity.level] += 1;
    if (row.confidence !== 'suspected') counted += 1;
  }
  return {
    screens: screens.size,
    sharedScreens: [...screens.values()].filter((screen) => screen.shared)
      .length,
    batches,
    reports: {
      rows: items.length,
      counted,
      suspected: items.length - counted,
      byKind,
      byLevel,
    },
    suspectedPrograms,
    reportItems: items,
  };
}
