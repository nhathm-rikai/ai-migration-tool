import type { SourceInventoryDocument } from '@portal/contracts';

// View model of one inventory artifact (F03). It only selects and counts
// what the inventory already states: unique totals come from
// `totals.uniqueCounters`, per-program LoC from each program, complexity
// from the analyzer. Nothing here recomputes LoC or complexity, and a
// program that was not analyzed has `null` metrics, never 0.

type Program = SourceInventoryDocument['programs'][number];
type Complexity = NonNullable<Program['analysis']>['complexity'];

export type ProgramState = 'complete' | 'partial' | 'unsupported';
export type MemberResolution = Program['members'][number]['resolution'];
export type MemberFileStatus = NonNullable<
  Program['members'][number]['fileStatus']
>;
export type ComplexityLevel = Complexity['level'];

export type AssessmentWarning =
  | 'PROGRAM_UNSUPPORTED'
  | 'PROGRAM_INCOMPLETE'
  | 'MEMBER_UNRESOLVED'
  | 'FILE_ERROR'
  | 'FILE_UNSUPPORTED'
  | 'FILES_SKIPPED'
  | 'UNCLASSIFIED_LINES'
  | 'TABLE_NAMES_NOT_CONFIRMED'
  | 'COMPLEXITY_DRAFT'
  | 'COMPLEXITY_REVIEW';

export type ComplexityView = {
  score: number;
  level: ComplexityLevel;
  draft: boolean;
  needsReview: boolean;
};

export type ProgramRow = {
  key: string;
  name: string | null;
  projectPath: string;
  state: ProgramState;
  issue: string | null;
  // LoC of files only this program declares.
  ownCodeLines: number | null;
  // LoC of every analyzed member, shared files included.
  codeLines: number | null;
  procedures: number | null;
  tables: number | null;
  // Present only when the inventory has the mapped view.
  mappedTables: number | null;
  complexity: ComplexityView | null;
  members: Program['members'];
  sharedMembers: number;
  unresolvedMembers: number;
};

export type AssessmentSummary = {
  unique: {
    files: number;
    codeFiles: number;
    analyzedCodeFiles: number;
    unsupportedFiles: number;
    errorFiles: number;
    // null: inventory written before `skipped` existed.
    skippedFiles: number | null;
    codeLines: number;
    physicalLines: number;
    // Distinct files declared by two or more programs.
    sharedFiles: number;
  };
  // Sum of per-program LoC: shared files count once per program. Never the
  // size of the source; shown apart from the unique totals.
  perProgramCodeLines: number;
  programs: ProgramRow[];
  partial: boolean;
  warnings: AssessmentWarning[];
  tableMapping: SourceInventoryDocument['tableNames'] | null;
  complexityVersion: string;
};

const isDraft = (version: string) => version.endsWith('-draft');

function complexityView(complexity: Complexity): ComplexityView {
  return {
    score: complexity.score,
    level: complexity.level,
    draft: isDraft(complexity.version),
    needsReview: (complexity.reviewFlags?.length ?? 0) > 0,
  };
}

function programRow(program: Program): ProgramRow {
  const analysis = program.analysis;
  const state: ProgramState =
    program.status === 'unsupported' || !analysis
      ? 'unsupported'
      : program.complete
        ? 'complete'
        : 'partial';
  return {
    key: program.projectPath,
    name: program.name,
    projectPath: program.projectPath,
    state,
    issue: program.issue?.reason ?? null,
    ownCodeLines: analysis ? analysis.metrics.ownCodeLines : null,
    codeLines: analysis ? program.counters.codeLines : null,
    procedures: analysis ? analysis.metrics.ownProcedures : null,
    tables: analysis ? analysis.metrics.tables : null,
    mappedTables: analysis?.metrics.normalizedTables ?? null,
    complexity: analysis ? complexityView(analysis.complexity) : null,
    members: program.members,
    sharedMembers: program.members.filter((member) => member.shared).length,
    unresolvedMembers: program.members.filter(
      (member) => member.resolution !== 'resolved',
    ).length,
  };
}

export function summarizeInventory(
  inventory: SourceInventoryDocument,
): AssessmentSummary {
  const programs = inventory.programs.map(programRow);
  const sharedPaths = new Set<string>();
  for (const program of inventory.programs)
    for (const member of program.members)
      if (member.shared && member.relativePath)
        sharedPaths.add(member.relativePath);
  const { totals } = inventory;
  const skippedFiles = inventory.skipped ? inventory.skipped.length : null;

  const warnings: AssessmentWarning[] = [];
  const warn = (code: AssessmentWarning, when: boolean) => {
    if (when) warnings.push(code);
  };
  warn(
    'PROGRAM_UNSUPPORTED',
    programs.some((row) => row.state === 'unsupported'),
  );
  warn(
    'PROGRAM_INCOMPLETE',
    programs.some((row) => row.state === 'partial'),
  );
  warn(
    'MEMBER_UNRESOLVED',
    programs.some((row) => row.unresolvedMembers > 0),
  );
  warn('FILE_ERROR', totals.errorFiles > 0);
  warn('FILE_UNSUPPORTED', totals.unsupportedFiles > 0);
  warn('FILES_SKIPPED', (skippedFiles ?? 0) > 0);
  warn('UNCLASSIFIED_LINES', totals.uniqueCounters.unclassifiedLines > 0);
  warn(
    'TABLE_NAMES_NOT_CONFIRMED',
    inventory.tableNames?.status !== 'confirmed',
  );
  warn(
    'COMPLEXITY_DRAFT',
    isDraft(inventory.complexityVersion) ||
      programs.some((row) => row.complexity?.draft),
  );
  warn(
    'COMPLEXITY_REVIEW',
    programs.some((row) => row.complexity?.needsReview),
  );

  return {
    unique: {
      files: totals.files,
      codeFiles: totals.codeFiles,
      analyzedCodeFiles: totals.analyzedCodeFiles,
      unsupportedFiles: totals.unsupportedFiles,
      errorFiles: totals.errorFiles,
      skippedFiles,
      codeLines: totals.uniqueCounters.codeLines,
      physicalLines: totals.uniqueCounters.physicalLines,
      sharedFiles: sharedPaths.size,
    },
    perProgramCodeLines: programs.reduce(
      (sum, row) => sum + (row.codeLines ?? 0),
      0,
    ),
    programs,
    partial:
      programs.some((row) => row.state !== 'complete') ||
      totals.errorFiles > 0 ||
      totals.unsupportedFiles > 0 ||
      (skippedFiles ?? 0) > 0 ||
      totals.uniqueCounters.unclassifiedLines > 0,
    warnings,
    tableMapping: inventory.tableNames ?? null,
    complexityVersion: inventory.complexityVersion,
  };
}

export type ProgramFilter = {
  query: string;
  state: ProgramState | 'all';
  level: ComplexityLevel | 'all';
};

export function filterPrograms(
  rows: readonly ProgramRow[],
  filter: ProgramFilter,
): ProgramRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.state === 'all' || row.state === filter.state) &&
      (filter.level === 'all' || row.complexity?.level === filter.level) &&
      (query === '' ||
        (row.name ?? '').toLowerCase().includes(query) ||
        row.projectPath.toLowerCase().includes(query)),
  );
}
