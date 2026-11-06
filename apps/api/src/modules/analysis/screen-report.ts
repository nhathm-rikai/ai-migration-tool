import type {
  CodeFileAnalysis,
  CodeReference,
  LanguageAnalyzer,
  ProjectExternalReference,
} from './language-analyzer.js';

// Screen (画面), report (帳票) and batch (バッチ) counting, language neutral.
// The counting rules are in specs/source-inventory.md §7. Everything here is
// lexical evidence: a report row says where code can produce output, and a
// `suspected` row is never added to the report total.

export const SCREEN_REPORT_VERSION = 'screen-report-v1';
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
};

export type ProgramReport = ReportRow & { shared: boolean };

export type ProgramScreen = {
  name: string | null;
  file: string;
  shared: boolean;
  warnings: string[];
};

export type ProgramType = 'screen' | 'batch' | 'unknown';

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
};

// Report rows of one analyzed code file. `hasFile(name)` says whether a file
// with that base name exists in the source (design file of a Crystal report).
export function buildCodeFileReportRows(input: {
  analyzer: LanguageAnalyzer;
  relativePath: string;
  lines: string[];
  analysis: AnalyzedFile;
  references: readonly CodeReference[];
  hasFile: (name: string) => boolean;
  config?: ReportComplexityConfig;
}): ReportRow[] {
  const { analysis, relativePath } = input;
  const seen = new Set<string>();
  const rows: ReportRow[] = [];
  for (const signal of input.analyzer.findReportSignals(
    relativePath,
    input.lines,
  )) {
    const procedure = analysis.procedures.find(
      (candidate) =>
        candidate.startLine <= signal.line && signal.line <= candidate.endLine,
    );
    const key = `${signal.kind}\u0000${signal.name.toLowerCase()}\u0000${procedure?.id ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const crystal = signal.kind === 'crystal';
    const present = crystal && input.hasFile(signal.name);
    const confidence: ReportConfidence = !crystal
      ? 'suspected'
      : present
        ? 'detected'
        : 'referenced';
    const complexity: ReportComplexity =
      confidence === 'suspected'
        ? unratedComplexity('SUSPECTED', false)
        : !procedure
          ? unratedComplexity('NO_PROCEDURE', true)
          : scoreReportComplexity(
              evidenceOf(procedure.id, analysis, input.references),
              input.config,
              { designNotAnalyzed: true },
            );
    rows.push({
      kind: signal.kind,
      name: signal.name,
      file: relativePath,
      line: signal.line,
      confidence,
      procedureId: procedure?.id ?? null,
      warnings: confidence === 'referenced' ? ['REPORT_FILE_MISSING'] : [],
      complexity,
    });
  }
  return rows;
}

function evidenceOf(
  procedureId: string,
  analysis: AnalyzedFile,
  references: readonly CodeReference[],
): ReportEvidence {
  const procedure = analysis.procedures.find((item) => item.id === procedureId);
  const own = (fact: { procedureId: string | null }) =>
    fact.procedureId === procedureId;
  const callee = new Set(
    references
      .filter((reference) => reference.procedureId === procedureId)
      .map((reference) => reference.name.toLowerCase())
      .filter((name) => name !== procedure?.name.toLowerCase()),
  );
  return {
    decisionPoints: procedure?.decisionPoints ?? 0,
    executableLines: procedure?.executableLines ?? 0,
    tables: new Set(
      analysis.sqlTables.filter(own).map((access) => access.table),
    ).size,
    dynamicSql:
      analysis.dynamicSql.filter(own).length +
      analysis.concatenatedSql.filter(own).length,
    calls: callee.size,
  };
}

// A report designer member (e.g. a DataReport .dsr). Design is not parsed, so
// the row is unrated: no procedure holds it.
export function designerReportRow(
  relativePath: string,
  header: { line: number; name: string },
): ReportRow {
  return {
    kind: 'data-report',
    name: header.name,
    file: relativePath,
    line: header.line,
    confidence: 'detected',
    procedureId: null,
    warnings: [],
    complexity: unratedComplexity('NO_PROCEDURE', true),
  };
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
  rowsByFile: ReadonlyMap<string, readonly ReportRow[]>;
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
      const key = member.displayPath.toLowerCase();
      if (!seenScreens.has(key)) {
        seenScreens.add(key);
        screens.push({
          name: member.name,
          file: member.displayPath,
          shared: member.shared,
          warnings: screenWarnings(member),
        });
      }
    }
    if (member.relativePath === null) continue;
    const fileKey = member.relativePath.toLowerCase();
    if (seenFiles.has(fileKey)) continue;
    seenFiles.add(fileKey);
    for (const row of input.rowsByFile.get(member.relativePath) ?? [])
      reports.push({ ...row, shared: member.shared });
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
      name: gap.fileName ?? gap.description ?? gap.identifier,
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
  screens: readonly ProgramScreen[];
  reports: readonly ProgramReport[];
  programType: ProgramType;
};

const zeroRecord = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

export function buildScreenReportTotals(
  programs: readonly ProgramView[],
): ScreenReportTotals {
  const screens = new Map<string, ProgramScreen>();
  const rows = new Map<string, ProgramReport>();
  let suspectedPrograms = 0;
  let batches = 0;
  for (const program of programs) {
    if (program.programType === 'batch') batches += 1;
    if (program.reports.some((row) => row.confidence === 'suspected'))
      suspectedPrograms += 1;
    for (const screen of program.screens) {
      const key = screen.file.toLowerCase();
      const existing = screens.get(key);
      if (!existing) screens.set(key, screen);
      else if (screen.shared) existing.shared = true;
    }
    for (const row of program.reports)
      rows.set(
        `${row.kind}\u0000${row.file.toLowerCase()}\u0000${row.line ?? ''}\u0000${row.name.toLowerCase()}`,
        row,
      );
  }
  const byKind = zeroRecord(REPORT_KIND_LIST);
  const byLevel = zeroRecord(REPORT_LEVEL_LIST);
  let counted = 0;
  for (const row of rows.values()) {
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
      rows: rows.size,
      counted,
      suspected: rows.size - counted,
      byKind,
      byLevel,
    },
    suspectedPrograms,
  };
}
