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
  | 'COMPLEXITY_DRAFT';

export type ComplexityView = {
  score: number;
  level: ComplexityLevel;
  draft: boolean;
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

// A declared member file that was not found, with the number of programs
// declaring it; grouped by target path (case-insensitive) and reason.
export type MissingMember = {
  // Root-relative path the member points to; the declared path as written
  // when it is absolute or leaves the source root.
  path: string;
  resolution: Exclude<MemberResolution, 'resolved' | 'case-mismatch'>;
  programs: number;
};

export type AssessmentSummary = {
  missingMembers: MissingMember[];
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
    // A case-only difference still finds the file (Windows), so it is not
    // a missing member.
    unresolvedMembers: program.members.filter(
      (member) =>
        member.resolution !== 'resolved' &&
        member.resolution !== 'case-mismatch',
    ).length,
  };
}

// The path a declared member points to, from the project file's folder,
// with `\` and `.`/`..` resolved. Display only: the analyzer already
// decided the resolution; this never looks for the file.
function memberTarget(projectPath: string, declaredPath: string): string {
  const declared = declaredPath.trim().replace(/\\/g, '/');
  if (/^([A-Za-z]:|\/)/.test(declared)) return declaredPath.trim();
  const segments = projectPath.split('/').slice(0, -1);
  for (const segment of declared.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return declaredPath.trim();
      segments.pop();
    } else segments.push(segment);
  }
  return segments.join('/');
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

  const missing = new Map<string, MissingMember>();
  for (const program of inventory.programs) {
    const seen = new Set<string>();
    for (const member of program.members) {
      if (
        member.resolution === 'resolved' ||
        member.resolution === 'case-mismatch'
      )
        continue;
      // Projects in different folders reach the same file by different
      // relative paths: grouped by the path they point to and the reason,
      // since a missing file and an absolute path need different fixes.
      const path = memberTarget(program.projectPath, member.declaredPath);
      const key = `${member.resolution}|${path.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = missing.get(key);
      if (entry) entry.programs += 1;
      else
        missing.set(key, {
          path,
          resolution: member.resolution,
          programs: 1,
        });
    }
  }

  return {
    missingMembers: [...missing.values()].sort(
      (a, b) =>
        b.programs - a.programs ||
        a.path.localeCompare(b.path) ||
        a.resolution.localeCompare(b.resolution),
    ),
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

// The project file name without folder or extension. VB project files often
// keep the IDE default name ("Project1"), so the file name is what tells
// programs apart; the declared name is shown beside it when it differs.
export function programLabel(projectPath: string): string {
  const file = projectPath.split(/[\\/]/).pop() ?? projectPath;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

export type ProgramSortKey =
  | 'program'
  | 'kind'
  | 'state'
  | 'ownCodeLines'
  | 'codeLines'
  | 'procedures'
  | 'tables'
  | 'complexity';
export type ProgramSort = { key: ProgramSortKey; direction: 'asc' | 'desc' };

const STATE_ORDER: Record<ProgramState, number> = {
  complete: 0,
  partial: 1,
  unsupported: 2,
};

function sortValue(row: ProgramRow, key: ProgramSortKey): number | string {
  switch (key) {
    case 'program':
      return programLabel(row.projectPath).toLowerCase();
    case 'kind':
      // Member kinds, sorted: programs of the same make-up sort together.
      return row.members
        .map((member) => member.kind.toLowerCase())
        .sort()
        .join(',');
    case 'state':
      return STATE_ORDER[row.state];
    case 'complexity':
      return row.complexity?.score ?? Number.NaN;
    default:
      return row[key] ?? Number.NaN;
  }
}

// Stable sort; programs without a value (not analyzed) always come last so
// sorting never presents them as 0.
export function sortPrograms(
  rows: readonly ProgramRow[],
  sort: ProgramSort,
): ProgramRow[] {
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

export function countBy<K extends string>(
  rows: readonly ProgramRow[],
  key: (row: ProgramRow) => K | null,
): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const row of rows) {
    const value = key(row);
    if (value !== null) counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export function pageOf<T>(
  rows: readonly T[],
  page: number,
  size: number,
): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return {
    items: rows.slice((current - 1) * size, current * size),
    page: current,
    pages,
  };
}
