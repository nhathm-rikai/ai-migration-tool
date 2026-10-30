import type { SourceInventoryDocument } from '@portal/contracts';
import type { SqlOperation } from './program-detail-model';
import {
  effectiveMapping,
  mappedCrud,
  normalizeTableName,
} from './table-mapping';

// Procedure call graph of one program (UI04), merged in the browser from the
// inventory already loaded; nothing is analysed again. Nodes: every
// procedure of the program's own files (and the code outside procedures of
// a file, when it calls or touches something), the procedures of shared
// files reachable from them, the native APIs they call (`Declare`) and the
// tables they access. Edges: procedure → procedure from `calls[]` (an
// ambiguous call keeps an edge to every candidate, marked as such),
// procedure → API, and procedure → table with its operations from the
// file's `sqlTables`. Shared procedures nothing in this program reaches are
// left out, like the analyzer's `reachableSharedProcedures`.

type Inventory = SourceInventoryDocument;
type InventoryFile = Inventory['files'][number];
type FileAnalysis = Extract<
  NonNullable<InventoryFile['analysis']>,
  { status: 'analyzed' }
>;

export type ProcedureNodeKind =
  'own-procedure' | 'shared-procedure' | 'api' | 'table';
export type ProcedureEdgeKind = 'call' | 'ambiguous' | 'api' | 'table';

// Left-to-right lanes: own procedures → shared procedures → native APIs →
// tables.
export type ProcedureLane = 0 | 1 | 2 | 3;
export const PROCEDURE_LANE: Record<ProcedureNodeKind, ProcedureLane> = {
  'own-procedure': 0,
  'shared-procedure': 1,
  api: 2,
  table: 3,
};

export type ProcedureNode = {
  id: string;
  kind: ProcedureNodeKind;
  label: string;
  // Procedure ID, API library or table name.
  detail: string;
  // Procedures: file name and path; null for APIs and tables.
  file: string | null;
  relativePath: string | null;
  // Sub, Function, Property…; `null` for code outside procedures.
  procedureKind: string | null;
  codeLines: number | null;
  decisionPoints: number | null;
  // SQL with a runtime table name inside the procedure.
  dynamicSql: number;
  // Distinct nodes calling this one / called or accessed by it.
  callers: number;
  callees: number;
};

export type ProcedureEdge = {
  id: string;
  kind: ProcedureEdgeKind;
  source: string;
  target: string;
  // Table edges: operations in C R U D X order.
  operations: SqlOperation[];
  // Call and API edges: uses in the source; table edges: accesses.
  count: number;
  // First line of the use, in the caller's file.
  line: number;
};

export type ProcedureGraph = {
  nodes: ProcedureNode[];
  edges: ProcedureEdge[];
  tableView: 'mapped' | 'raw';
  // Procedures of the program's own files, shared ones reached.
  ownProcedures: number;
  sharedProcedures: number;
};

const OPERATION_ORDER: SqlOperation[] = ['C', 'R', 'U', 'D', 'X'];

export const apiNodeId = (name: string) => `api:${name.toLowerCase()}`;
export const procedureTableNodeId = (table: string) => `table:${table}`;
// Code outside procedures, as the analyzer names it in `calls[].from`.
export const fileOwnerId = (relativePath: string) => `${relativePath}#file`;

const fileName = (path: string) => path.split('/').pop() ?? path;
const declaration = (id: string) => {
  const marker = id.indexOf('#declare:');
  return marker === -1 ? null : id.slice(marker + '#declare:'.length);
};

export function buildProcedureGraph(
  inventory: Inventory,
  projectPath: string,
): ProcedureGraph | null {
  const program = inventory.programs.find(
    (candidate) => candidate.projectPath === projectPath,
  );
  const analysis = program?.analysis;
  if (!program || !analysis) return null;

  const filesByPath = new Map(
    inventory.files.map((file) => [file.manifest.relativePath, file]),
  );
  // Each analyzed member file once, in declaration order; a file declared
  // as shared anywhere in this program counts as shared.
  const files = new Map<string, { analysis: FileAnalysis; shared: boolean }>();
  for (const member of program.members) {
    const path = member.relativePath;
    if (!path) continue;
    const file = filesByPath.get(path)?.analysis;
    if (file?.status !== 'analyzed') continue;
    const known = files.get(path);
    files.set(path, {
      analysis: file,
      shared: (known?.shared ?? false) || member.shared,
    });
  }

  const procedures = new Map<
    string,
    {
      relativePath: string;
      shared: boolean;
      procedure: FileAnalysis['procedures'][number] | null;
    }
  >();
  for (const [relativePath, file] of files) {
    procedures.set(fileOwnerId(relativePath), {
      relativePath,
      shared: file.shared,
      procedure: null,
    });
    for (const procedure of file.analysis.procedures)
      procedures.set(procedure.id, {
        relativePath,
        shared: file.shared,
        procedure,
      });
  }

  // Reached: own procedures and file-level code, then what they call. An
  // ambiguous call draws its candidates but is not followed further, as in
  // the analyzer.
  const outgoing = new Map<string, string[]>();
  for (const call of analysis.calls)
    if (call.resolution !== 'ambiguous' && call.resolution !== 'external')
      outgoing.set(call.from, [
        ...(outgoing.get(call.from) ?? []),
        ...call.targets,
      ]);
  const reached = new Set<string>();
  const queue = [...procedures]
    .filter(([, value]) => !value.shared)
    .map(([id]) => id);
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined || reached.has(next) || !procedures.has(next))
      continue;
    reached.add(next);
    queue.push(...(outgoing.get(next) ?? []));
  }
  for (const call of analysis.calls)
    if (call.resolution === 'ambiguous' && reached.has(call.from))
      for (const target of call.targets)
        if (procedures.has(target)) reached.add(target);

  const nodes = new Map<string, ProcedureNode>();
  const edges = new Map<string, ProcedureEdge>();
  const procedureNode = (id: string) => {
    const existing = nodes.get(id);
    if (existing) return existing;
    const value = procedures.get(id);
    if (!value || !reached.has(id)) return null;
    const { relativePath, shared, procedure } = value;
    const file = files.get(relativePath)?.analysis;
    const created: ProcedureNode = {
      id,
      kind: shared ? 'shared-procedure' : 'own-procedure',
      label: procedure?.name ?? fileName(relativePath),
      detail: id,
      file: fileName(relativePath),
      relativePath,
      procedureKind: procedure?.kind ?? null,
      codeLines: procedure
        ? procedure.codeLines
        : (file?.fileLevelCodeLines ?? null),
      decisionPoints: procedure ? procedure.decisionPoints : null,
      dynamicSql:
        file?.dynamicSql.filter(
          (use) => (use.procedureId ?? fileOwnerId(relativePath)) === id,
        ).length ?? 0,
      callers: 0,
      callees: 0,
    };
    nodes.set(id, created);
    return created;
  };
  const edge = (
    kind: ProcedureEdgeKind,
    source: string,
    target: string,
    line: number,
  ) => {
    const id = `${kind}|${source}|${target}`;
    const existing = edges.get(id);
    if (existing) {
      existing.line = Math.min(existing.line, line);
      return existing;
    }
    const created: ProcedureEdge = {
      id,
      kind,
      source,
      target,
      operations: [],
      count: 0,
      line,
    };
    edges.set(id, created);
    return created;
  };

  // Every own procedure is drawn, even one without calls (an event handler
  // the form runs); shared procedures only once reached.
  for (const [id, value] of procedures)
    if (!value.shared && value.procedure) procedureNode(id);
  for (const id of reached)
    if (procedures.get(id)?.procedure) procedureNode(id);

  const libraries = new Map<string, string>();
  for (const [, file] of files)
    for (const declared of file.analysis.externalDeclarations)
      libraries.set(declared.name.toLowerCase(), declared.library);

  for (const call of analysis.calls) {
    if (!reached.has(call.from)) continue;
    const kind: ProcedureEdgeKind =
      call.resolution === 'external'
        ? 'api'
        : call.resolution === 'ambiguous'
          ? 'ambiguous'
          : 'call';
    for (const target of call.targets) {
      let to: string | null = null;
      if (kind === 'api') {
        const name = declaration(target) ?? call.name;
        to = apiNodeId(name);
        if (!nodes.has(to))
          nodes.set(to, {
            id: to,
            kind: 'api',
            label: name,
            detail: libraries.get(name.toLowerCase()) ?? '',
            file: null,
            relativePath: null,
            procedureKind: null,
            codeLines: null,
            decisionPoints: null,
            dynamicSql: 0,
            callers: 0,
            callees: 0,
          });
      } else if (procedureNode(target)) to = target;
      if (to === null || !procedureNode(call.from)) continue;
      edge(kind, call.from, to, call.line).count += call.count;
    }
  }

  // Same table view as the program's CRUD tab opens with.
  const mapping = effectiveMapping(inventory);
  const tableView = mappedCrud(analysis, mapping) ? 'mapped' : 'raw';
  for (const [relativePath, file] of files)
    for (const access of file.analysis.sqlTables) {
      const from = access.procedureId ?? fileOwnerId(relativePath);
      if (!reached.has(from) || !procedureNode(from)) continue;
      const table =
        tableView === 'mapped'
          ? normalizeTableName(access.table, mapping.defaultSchema)
          : access.table;
      const to = procedureTableNodeId(table);
      if (!nodes.has(to))
        nodes.set(to, {
          id: to,
          kind: 'table',
          label: table,
          detail: table,
          file: null,
          relativePath: null,
          procedureKind: null,
          codeLines: null,
          decisionPoints: null,
          dynamicSql: 0,
          callers: 0,
          callees: 0,
        });
      const tableEdge = edge('table', from, to, access.line);
      tableEdge.count += 1;
      if (!tableEdge.operations.includes(access.operation))
        tableEdge.operations.push(access.operation);
      tableEdge.operations.sort(
        (a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b),
      );
    }

  // A recursive call is an edge to itself; it counts once on each side.
  for (const value of edges.values()) {
    const source = nodes.get(value.source);
    const target = nodes.get(value.target);
    if (!source || !target) continue;
    source.callees += 1;
    target.callers += 1;
  }

  const list = [...nodes.values()];
  return {
    nodes: list,
    edges: [...edges.values()],
    tableView,
    ownProcedures: list.filter((node) => node.kind === 'own-procedure').length,
    sharedProcedures: list.filter((node) => node.kind === 'shared-procedure')
      .length,
  };
}

// Nodes and edges drawn: procedures without any edge (event handlers that
// call nothing, unused helpers) hidden unless asked for. Code outside
// procedures only has a node when it calls or accesses something.
export function visibleProcedureGraph(
  graph: ProcedureGraph,
  showIsolated: boolean,
): { nodes: ProcedureNode[]; edges: ProcedureEdge[] } {
  if (showIsolated) return { nodes: graph.nodes, edges: graph.edges };
  return {
    nodes: graph.nodes.filter((node) => node.callers > 0 || node.callees > 0),
    edges: graph.edges,
  };
}

// The focused node, what calls it and what it calls or accesses.
export function procedureNeighbourhood(
  edges: readonly ProcedureEdge[],
  focus: string,
): Set<string> {
  const linked = new Set([focus]);
  for (const value of edges) {
    if (value.source === focus) linked.add(value.target);
    if (value.target === focus) linked.add(value.source);
  }
  return linked;
}
