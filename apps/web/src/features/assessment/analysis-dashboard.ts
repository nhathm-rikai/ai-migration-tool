import type { SourceInventoryDocument } from '@portal/contracts';
import type {
  AssessmentSummary,
  ComplexityLevel,
  ProgramRow,
} from './assessment-summary';
import { programLabel } from './assessment-summary';
import type { CrudView, SqlOperation } from './program-detail-model';

// View model of the analysis dashboard (UI02): KPI cards, line split,
// complexity histogram and the project-wide CRUD matrix. Counts only what
// the inventory states, once per file: a file several programs declare is
// one file here. Complexity levels are read, never recomputed.

type Inventory = SourceInventoryDocument;
type Program = Inventory['programs'][number];
type Counters = Inventory['totals']['uniqueCounters'];

export type DashboardKpis = {
  programs: number;
  completePrograms: number;
  physicalLines: number;
  codeLines: number;
  // Procedures of analyzed files, each file once.
  procedures: number;
  analyzedFiles: number;
  // Distinct (file, line) pairs with a table access or a runtime table name.
  sqlLocations: number;
  // SQL texts with runtime values concatenated in; null when the inventory
  // predates sql-access-v5.
  concatenatedSql: number | null;
  tables: number;
  // Tables counted after table name mapping.
  tablesMapped: boolean;
  highPrograms: number;
  analyzedPrograms: number;
};

export type LocPartKey =
  'code' | 'comment' | 'blank' | 'designer' | 'unclassified';
export type LocPart = { key: LocPartKey; lines: number };

export type HistogramBin = { level: ComplexityLevel; programs: number };

export type TableAccess = {
  table: string;
  operations: Record<Exclude<SqlOperation, 'X'>, boolean>;
  // Distinct programs whose CRUD names the table.
  programs: number;
  // Distinct (file, line) accesses in the source; a shared file once.
  locations: number;
  // Program with the most accesses to the table (its own and shared files).
  top: { program: string; locations: number } | null;
};

export const LEVELS: readonly ComplexityLevel[] = [
  'low',
  'medium',
  'high',
  'very-high',
];

type AnalyzedFile = Extract<
  NonNullable<Inventory['files'][number]['analysis']>,
  { status: 'analyzed' }
>;

function analyzedFiles(inventory: Inventory): Map<string, AnalyzedFile> {
  const files = new Map<string, AnalyzedFile>();
  for (const file of inventory.files)
    if (file.analysis?.status === 'analyzed')
      files.set(file.manifest.relativePath, file.analysis);
  return files;
}

// Mapped names exist only when every analyzed program carries them.
export function hasMappedCrud(inventory: Inventory): boolean {
  const analyzed = inventory.programs.filter((program) => program.analysis);
  return (
    analyzed.length > 0 &&
    analyzed.every((program) => program.analysis?.normalizedCrud)
  );
}

export function dashboardKpis(
  inventory: Inventory,
  summary: AssessmentSummary,
): DashboardKpis {
  const files = analyzedFiles(inventory);
  let procedures = 0;
  let concatenated = 0;
  let concatenatedKnown = false;
  const locations = new Set<string>();
  for (const [path, file] of files) {
    procedures += file.procedures.length;
    for (const use of [...file.sqlTables, ...file.dynamicSql])
      locations.add(`${path}\u0000${use.line}`);
    if (file.concatenatedSql) {
      concatenatedKnown = true;
      concatenated += file.concatenatedSql.length;
    }
  }
  const mapped = hasMappedCrud(inventory);
  const tables = crudMatrix(inventory, mapped ? 'mapped' : 'raw').length;
  const analyzed = summary.programs.filter((row) => row.complexity);
  return {
    programs: summary.programs.length,
    completePrograms: summary.programs.filter((row) => row.state === 'complete')
      .length,
    physicalLines: summary.unique.physicalLines,
    codeLines: summary.unique.codeLines,
    procedures,
    analyzedFiles: files.size,
    sqlLocations: locations.size,
    concatenatedSql: concatenatedKnown ? concatenated : null,
    tables,
    tablesMapped: mapped,
    highPrograms: analyzed.filter(
      (row) =>
        row.complexity?.level === 'high' ||
        row.complexity?.level === 'very-high',
    ).length,
    analyzedPrograms: analyzed.length,
  };
}

// Physical lines by class; designer and metadata lines are one part, and
// unclassified lines are listed only when there are any.
export function locDistribution(counters: Counters): LocPart[] {
  const parts: LocPart[] = [
    { key: 'code', lines: counters.codeLines },
    { key: 'comment', lines: counters.commentOnlyLines },
    { key: 'blank', lines: counters.blankLines },
    { key: 'designer', lines: counters.designerLines + counters.metadataLines },
  ];
  if (counters.unclassifiedLines > 0)
    parts.push({ key: 'unclassified', lines: counters.unclassifiedLines });
  return parts;
}

export function complexityHistogram(rows: readonly ProgramRow[]): {
  bins: HistogramBin[];
  notAnalyzed: number;
} {
  return {
    bins: LEVELS.map((level) => ({
      level,
      programs: rows.filter((row) => row.complexity?.level === level).length,
    })),
    notAnalyzed: rows.filter((row) => !row.complexity).length,
  };
}

const lower = (value: string) => value.toLowerCase();

// The program's CRUD of the chosen view, one entry per table (a table can
// appear more than once, e.g. read in one file and updated in another).
function crudEntries(program: Program, view: CrudView) {
  const analysis = program.analysis;
  if (!analysis) return [];
  const entries =
    view === 'mapped' && analysis.normalizedCrud
      ? analysis.normalizedCrud
      : analysis.crud.map((entry) => ({ ...entry, names: [entry.table] }));
  const merged = new Map<
    string,
    { table: string; operations: Set<SqlOperation>; names: Set<string> }
  >();
  for (const entry of entries) {
    const key = lower(entry.table);
    const row = merged.get(key) ?? {
      table: entry.table,
      operations: new Set<SqlOperation>(),
      names: new Set<string>(),
    };
    for (const operation of entry.operations) row.operations.add(operation);
    for (const name of entry.names) row.names.add(lower(name));
    merged.set(key, row);
  }
  return [...merged.values()];
}

// One row per table of the chosen view, most-used first. Program counts are
// distinct programs; access counts are distinct (file, line) pairs, so a
// shared file is counted once for the table and once for each program that
// declares it.
export function crudMatrix(
  inventory: Inventory,
  view: CrudView,
): TableAccess[] {
  const files = analyzedFiles(inventory);
  type Entry = {
    table: string;
    operations: Set<SqlOperation>;
    programs: Map<string, number>;
    locations: Set<string>;
  };
  const tables = new Map<string, Entry>();
  for (const program of inventory.programs) {
    const memberFiles = program.members
      .map((member) => member.relativePath)
      .filter((path): path is string => path !== null)
      .map((path) => [path, files.get(path)] as const);
    for (const entry of crudEntries(program, view)) {
      const key = lower(entry.table);
      let row = tables.get(key);
      if (!row) {
        row = {
          table: entry.table,
          operations: new Set(),
          programs: new Map(),
          locations: new Set(),
        };
        tables.set(key, row);
      }
      for (const operation of entry.operations) row.operations.add(operation);
      const names = entry.names;
      let uses = 0;
      for (const [path, file] of memberFiles) {
        if (!file) continue;
        const lines = new Set<number>();
        for (const use of file.sqlTables)
          if (names.has(lower(use.table))) lines.add(use.line);
        uses += lines.size;
        for (const line of lines) row.locations.add(`${path}\u0000${line}`);
      }
      row.programs.set(
        program.projectPath,
        (row.programs.get(program.projectPath) ?? 0) + uses,
      );
    }
  }
  return [...tables.values()]
    .map((row): TableAccess => {
      let top: TableAccess['top'] = null;
      for (const [projectPath, locations] of row.programs)
        if (!top || locations > top.locations)
          top = { program: programLabel(projectPath), locations };
      return {
        table: row.table,
        operations: {
          C: row.operations.has('C'),
          R: row.operations.has('R'),
          U: row.operations.has('U'),
          D: row.operations.has('D'),
        },
        programs: row.programs.size,
        locations: row.locations.size,
        top,
      };
    })
    .sort(
      (a, b) =>
        b.programs - a.programs ||
        b.locations - a.locations ||
        a.table.localeCompare(b.table),
    );
}

// Member files of a program by kind ("form", "module", ...), lower-cased,
// in a fixed order; the "type" column of the program list.
const KIND_ORDER = [
  'form',
  'module',
  'class',
  'user-control',
  'property-page',
  'user-document',
  'designer',
];
export function memberKinds(
  row: ProgramRow,
): { kind: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const member of row.members) {
    const kind = lower(member.kind);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const rank = (kind: string) => {
    const index = KIND_ORDER.indexOf(kind);
    return index === -1 ? KIND_ORDER.length : index;
  };
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort(
      (a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind),
    );
}
