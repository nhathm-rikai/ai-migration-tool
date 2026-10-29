import type { SourceInventoryDocument } from '@portal/contracts';
import type {
  AssessmentSummary,
  ComplexityLevel,
  ProgramRow,
} from './assessment-summary';
import { programLabel } from './assessment-summary';
import type { CrudView, SqlOperation } from './program-detail-model';
import {
  effectiveMapping,
  mappedCrud,
  type EffectiveMapping,
} from './table-mapping';

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

// A mapped view exists when the schema is inferred from the source or every
// analyzed program carries the analyzer's mapped CRUD.
export function hasMappedCrud(inventory: Inventory): boolean {
  const mapping = effectiveMapping(inventory);
  const analyzed = inventory.programs.filter((program) => program.analysis);
  return (
    analyzed.length > 0 &&
    analyzed.every(
      (program) =>
        program.analysis && mappedCrud(program.analysis, mapping) !== null,
    )
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

// The program's CRUD of the chosen view, one entry per table identifier as
// the inventory writes it (never case-folded here: quoted names that differ
// only in case are different tables; the mapped view already merges what
// the table name mapping merges).
function crudEntries(
  program: Program,
  view: CrudView,
  mapping: EffectiveMapping,
) {
  const analysis = program.analysis;
  if (!analysis) return [];
  const mapped = view === 'mapped' ? mappedCrud(analysis, mapping) : null;
  const entries =
    mapped ??
    analysis.crud.map((entry) => ({ ...entry, names: [entry.table] }));
  const merged = new Map<
    string,
    { table: string; operations: Set<SqlOperation>; names: Set<string> }
  >();
  for (const entry of entries) {
    const key = entry.table;
    const row = merged.get(key) ?? {
      table: entry.table,
      operations: new Set<SqlOperation>(),
      names: new Set<string>(),
    };
    for (const operation of entry.operations) row.operations.add(operation);
    for (const name of entry.names) row.names.add(name);
    merged.set(key, row);
  }
  return [...merged.values()];
}

// One row per table of the chosen view, most-used first. Program counts are
// distinct programs; access counts are distinct (file, line) pairs, so a
// shared file is counted once for the table and once for each program that
// declares it.
const fileOwner = (relativePath: string) => `${relativePath}#file`;

// Procedures (and `#file` owners) a program reaches from its own files
// through resolved calls: the same rule the analyzer uses for the program's
// CRUD, so a shared module counts only for the procedures this program
// calls.
function reachedProcedures(
  program: Program,
  files: Map<string, AnalyzedFile>,
): Set<string> {
  const edges = new Map<string, string[]>();
  for (const call of program.analysis?.calls ?? [])
    if (call.resolution !== 'ambiguous')
      for (const target of call.targets)
        edges.set(call.from, [...(edges.get(call.from) ?? []), target]);
  const queue: string[] = [];
  for (const member of program.members) {
    if (member.shared || !member.relativePath) continue;
    queue.push(fileOwner(member.relativePath));
    for (const procedure of files.get(member.relativePath)?.procedures ?? [])
      queue.push(procedure.id);
  }
  const seen = new Set<string>();
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    queue.push(...(edges.get(next) ?? []));
  }
  return seen;
}

export function crudMatrix(
  inventory: Inventory,
  view: CrudView,
): TableAccess[] {
  const files = analyzedFiles(inventory);
  type Entry = {
    table: string;
    operations: Set<SqlOperation>;
    // Distinct (file, line) accesses per program.
    programs: Map<string, Set<string>>;
    locations: Set<string>;
  };
  const tables = new Map<string, Entry>();
  const mapping = effectiveMapping(inventory);
  for (const program of inventory.programs) {
    // A file declared twice by one program is still one file.
    const memberFiles = [
      ...new Set(
        program.members
          .map((member) => member.relativePath)
          .filter((path): path is string => path !== null),
      ),
    ].map((path) => [path, files.get(path)] as const);
    const reached = reachedProcedures(program, files);
    for (const entry of crudEntries(program, view, mapping)) {
      const key = entry.table;
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
      const uses = row.programs.get(program.projectPath) ?? new Set<string>();
      for (const [path, file] of memberFiles) {
        if (!file) continue;
        for (const use of file.sqlTables)
          if (
            names.has(use.table) &&
            reached.has(use.procedureId ?? fileOwner(path))
          ) {
            const location = `${path}\u0000${use.line}`;
            uses.add(location);
            row.locations.add(location);
          }
      }
      row.programs.set(program.projectPath, uses);
    }
  }
  return [...tables.values()]
    .map((row): TableAccess => {
      let top: TableAccess['top'] = null;
      for (const [projectPath, uses] of row.programs)
        if (!top || uses.size > top.locations)
          top = { program: programLabel(projectPath), locations: uses.size };
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

// Program rows whose "after mapping" table count matches the mapped view
// shown: with an inferred schema the analyzer's stored count (made with
// the stored mapping) is replaced by the count of the inferred view.
export function rowsForMappedView(
  inventory: Inventory,
  rows: ProgramRow[],
): ProgramRow[] {
  const mapping = effectiveMapping(inventory);
  if (!mapping.inferred) return rows;
  const programs = new Map(
    inventory.programs.map((program) => [program.projectPath, program]),
  );
  return rows.map((row) => {
    const analysis = programs.get(row.projectPath)?.analysis;
    if (!analysis) return row;
    return {
      ...row,
      mappedTables: mappedCrud(analysis, mapping)?.length ?? null,
    };
  });
}
