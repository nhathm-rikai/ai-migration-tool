import { projectReportItems } from '@portal/contracts';
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

export { SCREEN_REPORT_VERSION } from '@portal/contracts';
export const REPORT_COMPLEXITY_VERSION = 'report-complexity-v1-draft';

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

// Evidence read from the procedure that holds the report line.
export type ReportEvidence = {
  decisionPoints: number;
  executableLines: number;
  // Distinct tables accessed in the procedure.
  tables: number;
  // SQL with a runtime table name or concatenated runtime values.
  dynamicSql: number;
  // Distinct other procedures called (depth 1).
  calls: number;
};

// Step tables: [value at least, points]. The highest step reached counts.
// Changing these constants changes levels without touching the logic; bump
// REPORT_COMPLEXITY_VERSION when they change.
export type ReportComplexityConfig = {
  steps: Record<keyof ReportEvidence, readonly (readonly [number, number])[]>;
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
  levelThresholds: [3, 6, 9],
};

export type ReportFactor = { factor: string; value: number; points: number };
export type ReportComplexity = {
  version: string;
  level: ReportLevel;
  score: number | null;
  factors: ReportFactor[];
  reason?: string;
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

export function scoreReportComplexity(
  evidence: ReportEvidence,
  config: ReportComplexityConfig = DEFAULT_REPORT_COMPLEXITY_CONFIG,
  options: { designNotAnalyzed?: boolean } = {},
): ReportComplexity {
  const factors: ReportFactor[] = FACTOR_ORDER.map((factor) => {
    const value = evidence[factor];
    const points = config.steps[factor].reduce(
      (best, [atLeast, step]) =>
        value >= atLeast ? Math.max(best, step) : best,
      0,
    );
    return { factor, value, points };
  });
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
  if (!options.designNotAnalyzed)
    return { version: REPORT_COMPLEXITY_VERSION, level, score, factors };
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

// What only the program a row is listed under can tell: whether the design
// file of a Crystal report resolves from that program's project file, and the
// procedures the report's procedure calls inside that program.
export type ProgramContext = {
  projectPath: string;
  // A design file path as written (relative, "/" separated) found in the
  // source from this project's folder or from the source root.
  designExists(projectPath: string, written: string): boolean;
  // Distinct procedures the program resolves from this procedure (local or
  // program level; ambiguous and native calls are not counted).
  callsOf(procedureId: string): number;
};
// A row of a file, completed for one program.
export type FileReport = (context: ProgramContext) => ReportRow;

// Report rows of one analyzed code file, each finished per program.
export function buildCodeFileReportRows(input: {
  analyzer: LanguageAnalyzer;
  relativePath: string;
  lines: string[];
  analysis: AnalyzedFile;
  config?: ReportComplexityConfig;
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
      // Every report is scored on the procedure that holds the line that
      // makes it (a Crystal report, a print, an export); only a Crystal
      // report has a design that is not analyzed.
      const complexity: ReportComplexity = !procedure
        ? unratedComplexity('NO_PROCEDURE', crystal)
        : scoreReportComplexity(
            {
              ...evidenceOf(procedure.id, analysis),
              calls: context.callsOf(procedure.id),
            },
            input.config,
            { designNotAnalyzed: crystal },
          );
      return {
        kind: signal.kind,
        name: signal.name,
        file: relativePath,
        line: signal.line,
        confidence,
        procedureId: procedure?.id ?? null,
        warnings: confidence === 'referenced' ? ['REPORT_FILE_MISSING'] : [],
        complexity,
        ...(signal.subkind ? { subkind: signal.subkind } : {}),
        ...(signal.excludeReason
          ? { excludeReason: signal.excludeReason }
          : {}),
      };
    });
  }
  return rows;
}

// Evidence of the procedure that holds a report, without its calls (those
// depend on the program, see ProgramContext.callsOf).
function evidenceOf(
  procedureId: string,
  analysis: AnalyzedFile,
): Omit<ReportEvidence, 'calls'> {
  const procedure = analysis.procedures.find((item) => item.id === procedureId);
  const own = (fact: { procedureId: string | null }) =>
    fact.procedureId === procedureId;
  return {
    decisionPoints: procedure?.decisionPoints ?? 0,
    executableLines: procedure?.executableLines ?? 0,
    tables: new Set(
      analysis.sqlTables.filter(own).map((access) => access.table),
    ).size,
    dynamicSql:
      analysis.dynamicSql.filter(own).length +
      analysis.concatenatedSql.filter(own).length,
  };
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
      reports.push({
        ...finish({ ...input.context, projectPath: input.projectPath }),
        shared: member.shared,
      });
  }

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
