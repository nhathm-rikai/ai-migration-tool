import type {
  CodeFileAnalysis,
  CodeReference,
  ProjectExternalReference,
} from './language-analyzer.js';
import type { SqlOperation } from './sql-access.js';
import {
  normalizeTableName,
  UNCONFIGURED_TABLE_NAMES,
  type TableNameMapping,
} from './table-names.js';

// Language-neutral, per-program facts built from per-file analyses: call
// graph, CRUD matrix, size metrics and a draft complexity score. Everything
// is lexical; a name that matches several procedures stays ambiguous instead
// of being guessed.

export const CALL_GRAPH_VERSION = 'call-graph-v2';
export const COMPLEXITY_VERSION = 'complexity-v0-draft';

type AnalyzedFile = Extract<CodeFileAnalysis, { status: 'analyzed' }>;

export type CallResolution = 'local' | 'program' | 'ambiguous' | 'external';

// One distinct (caller, name) use. `from` is a procedure ID, or
// `<file>#file` for code outside procedures. Targets are procedure IDs, or
// `<file>#declare:<name>` for external (native) procedures.
export type ProgramCall = {
  from: string;
  name: string;
  resolution: CallResolution;
  targets: string[];
  line: number;
  count: number;
};

export type CrudEntry = {
  table: string;
  operations: SqlOperation[];
  // First place each table is accessed, as evidence.
  evidence: { relativePath: string; line: number };
  // True when only reached through a procedure of a shared file.
  viaSharedOnly: boolean;
};

// CRUD after table name mapping: one row per assumed database object, with
// the names written in the source that were merged into it.
export type NormalizedCrudEntry = CrudEntry & { names: string[] };

export type ProgramMetrics = {
  ownFiles: number;
  ownCodeLines: number;
  ownProcedures: number;
  decisionPoints: number;
  maxProcedureDecisionPoints: number;
  // Procedures of shared files reachable from the program's own code.
  reachableSharedProcedures: number;
  tables: number;
  // Distinct tables after table name mapping.
  normalizedTables: number;
  dynamicSql: number;
  components: number;
  externalApis: number;
};

export type ComplexityScore = {
  version: typeof COMPLEXITY_VERSION;
  score: number;
  level: 'low' | 'medium' | 'high';
  parts: Record<
    | 'size'
    | 'decisions'
    | 'tables'
    | 'dynamicSql'
    | 'components'
    | 'externalApis',
    number
  >;
};

export type ProgramAnalysis = {
  calls: ProgramCall[];
  crud: CrudEntry[];
  normalizedCrud: NormalizedCrudEntry[];
  externalApis: { name: string; library: string }[];
  metrics: ProgramMetrics;
  // Uses `tables` (names as written); `normalizedComplexity` uses
  // `normalizedTables`, so both views stay visible while the mapping is an
  // assumption.
  complexity: ComplexityScore;
  normalizedComplexity: ComplexityScore;
};

export type ProgramFile = {
  relativePath: string;
  // Listed by more than one program (e.g. a common module).
  shared: boolean;
  analysis: AnalyzedFile;
  references: readonly CodeReference[];
};

const fileOwner = (relativePath: string) => `${relativePath}#file`;

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// Names every identifier `references` in a corpus may need to match.
export function callableNames(analyses: readonly AnalyzedFile[]): Set<string> {
  const names = new Set<string>();
  for (const analysis of analyses) {
    for (const procedure of analysis.procedures)
      names.add(procedure.name.toLowerCase());
    for (const declaration of analysis.externalDeclarations)
      names.add(declaration.name.toLowerCase());
  }
  return names;
}

type Callable = {
  id: string;
  relativePath: string;
  global: boolean;
  external: { name: string; library: string } | null;
};

function buildCalls(files: readonly ProgramFile[]) {
  const byFile = new Map<string, Map<string, Callable[]>>();
  const globals = new Map<string, Callable[]>();
  for (const file of files) {
    const local = new Map<string, Callable[]>();
    byFile.set(file.relativePath, local);
    const add = (name: string, callable: Callable) => {
      pushTo(local, name.toLowerCase(), callable);
      if (callable.global) pushTo(globals, name.toLowerCase(), callable);
    };
    for (const procedure of file.analysis.procedures)
      add(procedure.name, {
        id: procedure.id,
        relativePath: file.relativePath,
        global: procedure.visibility === 'global',
        external: null,
      });
    for (const declaration of file.analysis.externalDeclarations)
      add(declaration.name, {
        id: `${file.relativePath}#declare:${declaration.name}`,
        relativePath: file.relativePath,
        global: declaration.visibility === 'global',
        external: { name: declaration.name, library: declaration.library },
      });
  }

  const calls = new Map<string, ProgramCall>();
  const callables = new Map<string, Callable>();
  for (const file of files) {
    const local = byFile.get(file.relativePath);
    for (const reference of file.references) {
      const key = reference.name.toLowerCase();
      const from = reference.procedureId ?? fileOwner(file.relativePath);
      const localTargets = local?.get(key) ?? [];
      // Declarations and return-value assignments were already left out
      // by the analyzer, so a self-reference here is real recursion.
      const candidates =
        localTargets.length > 0 ? localTargets : (globals.get(key) ?? []);
      if (candidates.length === 0) continue;
      const [first] = candidates;
      const resolution: CallResolution =
        candidates.length > 1
          ? 'ambiguous'
          : first?.external
            ? 'external'
            : localTargets.length > 0
              ? 'local'
              : 'program';
      const callKey = `${from}\u0000${key}`;
      const existing = calls.get(callKey);
      if (existing) {
        existing.count += 1;
        continue;
      }
      for (const callable of candidates) callables.set(callable.id, callable);
      calls.set(callKey, {
        from,
        name: reference.name,
        resolution,
        targets: candidates.map((callable) => callable.id),
        line: reference.line,
        count: 1,
      });
    }
  }
  return { calls: [...calls.values()], callables };
}

// Procedures (and `#file` owners) reachable from the program's own files.
function reachable(
  files: readonly ProgramFile[],
  calls: readonly ProgramCall[],
): Set<string> {
  const edges = new Map<string, string[]>();
  for (const call of calls)
    if (call.resolution !== 'ambiguous')
      for (const target of call.targets) pushTo(edges, call.from, target);
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const file of files) {
    if (file.shared) continue;
    queue.push(fileOwner(file.relativePath));
    for (const procedure of file.analysis.procedures) queue.push(procedure.id);
  }
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    queue.push(...(edges.get(next) ?? []));
  }
  return seen;
}

const OPERATION_ORDER: SqlOperation[] = ['C', 'R', 'U', 'D', 'X'];

const sortOperations = (operations: SqlOperation[]) =>
  operations.sort(
    (a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b),
  );

// `crud` is in first-access order, so each merged row keeps the evidence of
// the first access to any of its names.
function normalizeCrud(
  crud: readonly CrudEntry[],
  mapping: TableNameMapping,
): NormalizedCrudEntry[] {
  const merged = new Map<string, NormalizedCrudEntry>();
  for (const entry of crud) {
    const table = normalizeTableName(entry.table, mapping);
    const existing = merged.get(table);
    if (!existing) {
      merged.set(table, {
        ...entry,
        table,
        operations: [...entry.operations],
        names: [entry.table],
      });
      continue;
    }
    for (const operation of entry.operations)
      if (!existing.operations.includes(operation))
        existing.operations.push(operation);
    existing.names.push(entry.table);
    existing.viaSharedOnly &&= entry.viaSharedOnly;
  }
  return [...merged.values()]
    .map((entry) => ({
      ...entry,
      operations: sortOperations(entry.operations),
      names: entry.names.sort(),
    }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

function scale(value: number, full: number, weight: number): number {
  return Math.min(weight, (weight * Math.log1p(value)) / Math.log1p(full));
}

// Draft v0 for the TL to calibrate: weighted log scales capped per part,
// total 0-100. Level thresholds were fitted to the 15-program pilot list
// (Low/Medium/High), so they are a starting point, not a validated model.
export function scoreComplexity(metrics: ProgramMetrics): ComplexityScore {
  const parts = {
    size: scale(metrics.ownCodeLines, 10000, 30),
    decisions: scale(metrics.decisionPoints, 2000, 20),
    tables: scale(metrics.tables, 30, 15),
    dynamicSql: scale(metrics.dynamicSql, 30, 15),
    components: scale(metrics.components, 8, 10),
    externalApis: scale(metrics.externalApis, 10, 10),
  };
  const rounded = Object.fromEntries(
    Object.entries(parts).map(([key, value]) => [
      key,
      Math.round(value * 10) / 10,
    ]),
  ) as ComplexityScore['parts'];
  const score = Math.round(
    Object.values(parts).reduce((sum, value) => sum + value, 0),
  );
  return {
    version: COMPLEXITY_VERSION,
    score,
    level: score < 40 ? 'low' : score < 55 ? 'medium' : 'high',
    parts: rounded,
  };
}

export function analyzeProgram(
  files: readonly ProgramFile[],
  externalReferences: readonly ProjectExternalReference[],
  tableNames: TableNameMapping = UNCONFIGURED_TABLE_NAMES,
): ProgramAnalysis {
  const { calls, callables } = buildCalls(files);
  const reached = reachable(files, calls);
  const own = files.filter((file) => !file.shared);

  const crud = new Map<string, CrudEntry>();
  let dynamicSql = 0;
  let reachableSharedProcedures = 0;
  for (const file of files) {
    const counts = (procedureId: string | null) =>
      reached.has(procedureId ?? fileOwner(file.relativePath));
    if (file.shared)
      reachableSharedProcedures += file.analysis.procedures.filter(
        (procedure) => reached.has(procedure.id),
      ).length;
    for (const use of file.analysis.dynamicSql)
      if (counts(use.procedureId)) dynamicSql += 1;
    for (const access of file.analysis.sqlTables) {
      if (!counts(access.procedureId)) continue;
      const entry = crud.get(access.table);
      if (!entry) {
        crud.set(access.table, {
          table: access.table,
          operations: [access.operation],
          evidence: { relativePath: file.relativePath, line: access.line },
          viaSharedOnly: file.shared,
        });
        continue;
      }
      if (!entry.operations.includes(access.operation))
        entry.operations.push(access.operation);
      if (!file.shared) entry.viaSharedOnly = false;
    }
  }
  for (const entry of crud.values()) sortOperations(entry.operations);
  const normalizedCrud = normalizeCrud([...crud.values()], tableNames);

  const externalApis = new Map<string, { name: string; library: string }>();
  for (const call of calls)
    if (call.resolution === 'external' && reached.has(call.from))
      for (const target of call.targets) {
        const external = callables.get(target)?.external;
        if (external) externalApis.set(external.name.toLowerCase(), external);
      }

  const ownProcedures = own.flatMap((file) => file.analysis.procedures);
  const metrics: ProgramMetrics = {
    ownFiles: own.length,
    ownCodeLines: own.reduce(
      (sum, file) => sum + file.analysis.counters.codeLines,
      0,
    ),
    ownProcedures: ownProcedures.length,
    decisionPoints: ownProcedures.reduce(
      (sum, procedure) => sum + procedure.decisionPoints,
      0,
    ),
    maxProcedureDecisionPoints: Math.max(
      0,
      ...ownProcedures.map((procedure) => procedure.decisionPoints),
    ),
    reachableSharedProcedures,
    tables: crud.size,
    normalizedTables: normalizedCrud.length,
    dynamicSql,
    components: externalReferences.filter(
      (reference) => reference.kind === 'component',
    ).length,
    externalApis: externalApis.size,
  };
  return {
    calls,
    crud: [...crud.values()].sort((a, b) => a.table.localeCompare(b.table)),
    normalizedCrud,
    externalApis: [...externalApis.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    metrics,
    complexity: scoreComplexity(metrics),
    normalizedComplexity: scoreComplexity({
      ...metrics,
      tables: metrics.normalizedTables,
    }),
  };
}
