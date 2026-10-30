import type { SourceInventoryDocument } from '@portal/contracts';
import { programLabel, type ProgramState } from './assessment-summary';
import { hasMappedCrud } from './analysis-dashboard';
import type { SqlOperation } from './program-detail-model';
import { effectiveMapping, mappedCrud } from './table-mapping';

// Project-wide dependency graph (UI03), merged in the browser from the
// inventory already loaded; nothing is analysed again. Nodes: programs, the
// member files only one program declares, shared member files, tables (the
// CRUD view the dashboard shows) and COM references. Edges: program → member
// file, program → table with its operations, program → COM reference, and
// resolved procedure calls (`resolution: 'program'`) merged to file → file
// with their call count. VB6 has no program → program calls, and no
// Screen/Action/DAO layer is invented. A member that was not found has no
// node; its program carries the count instead.

type Inventory = SourceInventoryDocument;
type Program = Inventory['programs'][number];

export type GraphNodeKind =
  'program' | 'own-module' | 'shared-module' | 'table' | 'component';
export type GraphEdgeKind = 'member' | 'table' | 'call' | 'component';

// Left-to-right lanes: Program → own files → shared files → tables (COM
// references share the last lane).
export type GraphLane = 0 | 1 | 2 | 3;
export const LANE: Record<GraphNodeKind, GraphLane> = {
  program: 0,
  'own-module': 1,
  'shared-module': 2,
  table: 3,
  component: 3,
};

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  // Project or file path, table name, or the COM identifier.
  detail: string;
  // Folder group of a program or own file (`''` = top of the corpus).
  group: string | null;
  // Programs only.
  state: ProgramState | null;
  unresolvedMembers: number;
  // Member files: the kind declared in the project (Form, Module…).
  memberKind: string | null;
  // Distinct programs pointing at the node (members, tables, COM); 0 for
  // programs.
  fanIn: number;
  // Distinct nodes the node points at: a program's files, tables and COM
  // references; a file's called files.
  fanOut: number;
  // Distinct files calling into this file.
  callers: number;
  // Shared file or COM reference nearly every program uses (constants).
  common: boolean;
};

export type GraphEdge = {
  id: string;
  kind: GraphEdgeKind;
  source: string;
  target: string;
  // Table edges: operations of the CRUD view, in C R U D X order.
  operations: SqlOperation[];
  // Call edges: distinct call sites and the call count summed over them.
  sites: number;
  calls: number;
};

export type GraphGroup = { id: string; label: string; programs: string[] };

export type DependencyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
  programs: number;
  // Resolved call sites between two files and their count, each site once
  // however many programs declare the file.
  callSites: number;
  calls: number;
  tableView: 'mapped' | 'raw';
};

// A shared file or COM reference used by more than this share of programs
// is hidden by default (constants and helpers every program declares);
// only once the corpus has enough programs for a share to mean something.
export const COMMON_FAN_IN_RATIO = 0.8;
export const COMMON_MIN_PROGRAMS = 5;

const OPERATION_ORDER: SqlOperation[] = ['C', 'R', 'U', 'D', 'X'];

export const programNodeId = (projectPath: string) => `program:${projectPath}`;
export const fileNodeId = (relativePath: string) => `file:${relativePath}`;
export const tableNodeId = (table: string) => `table:${table}`;
const componentKey = (reference: Program['externalReferences'][number]) =>
  (reference.fileName ?? reference.identifier).toLowerCase();
export const componentNodeId = (key: string) => `com:${key}`;

const fileOf = (procedureId: string) => {
  const hash = procedureId.indexOf('#');
  return hash === -1 ? procedureId : procedureId.slice(0, hash);
};

const fileName = (path: string) => path.split('/').pop() ?? path;

// Folder groups: the first folder below the folders every program shares,
// so `src/KNR/KNR0101/KNR0101.vbp` groups under `KNR`.
export function programGroups(
  projectPaths: readonly string[],
): Map<string, string> {
  const folders = projectPaths.map((path) => path.split('/').slice(0, -1));
  let common = 0;
  const first = folders[0];
  if (first && projectPaths.length > 1)
    while (
      common < first.length &&
      folders.every((parts) => parts[common] === first[common])
    )
      common++;
  // A single program keeps its own folder as the group.
  if (projectPaths.length === 1) common = 0;
  const groups = new Map<string, string>();
  projectPaths.forEach((path, index) =>
    groups.set(path, folders[index]?.[common] ?? ''),
  );
  return groups;
}

function programState(program: Program): ProgramState {
  if (program.status === 'unsupported' || !program.analysis)
    return 'unsupported';
  return program.complete ? 'complete' : 'partial';
}

export function buildDependencyGraph(inventory: Inventory): DependencyGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const node = (
    value: Omit<GraphNode, 'fanIn' | 'fanOut' | 'callers' | 'common'>,
  ) => {
    const existing = nodes.get(value.id);
    if (existing) return existing;
    const created: GraphNode = {
      ...value,
      fanIn: 0,
      fanOut: 0,
      callers: 0,
      common: false,
    };
    nodes.set(value.id, created);
    return created;
  };
  const edge = (kind: GraphEdgeKind, source: string, target: string) => {
    const id = `${kind}|${source}|${target}`;
    const existing = edges.get(id);
    if (existing) return existing;
    const created: GraphEdge = {
      id,
      kind,
      source,
      target,
      operations: [],
      sites: 0,
      calls: 0,
    };
    edges.set(id, created);
    return created;
  };

  // A file several programs declare is shared everywhere, whatever order the
  // programs come in.
  const sharedFiles = new Set<string>();
  for (const program of inventory.programs)
    for (const member of program.members)
      if (member.shared && member.relativePath)
        sharedFiles.add(member.relativePath);

  const groups = programGroups(inventory.programs.map((p) => p.projectPath));
  const tableView = hasMappedCrud(inventory) ? 'mapped' : 'raw';
  const mapping = effectiveMapping(inventory);
  const callSites = new Set<string>();
  let calls = 0;

  for (const program of inventory.programs) {
    const programId = programNodeId(program.projectPath);
    const state = programState(program);
    node({
      id: programId,
      kind: 'program',
      label: programLabel(program.projectPath),
      detail: program.projectPath,
      group: groups.get(program.projectPath) ?? '',
      state,
      unresolvedMembers: program.members.filter(
        (member) =>
          member.resolution !== 'resolved' &&
          member.resolution !== 'case-mismatch',
      ).length,
      memberKind: null,
    });
    for (const member of program.members) {
      const path = member.relativePath;
      if (path === null) continue;
      const shared = sharedFiles.has(path);
      node({
        id: fileNodeId(path),
        kind: shared ? 'shared-module' : 'own-module',
        label: fileName(path),
        detail: path,
        // An own file has one program: it is boxed with that folder.
        group: shared ? null : (groups.get(program.projectPath) ?? ''),
        state: null,
        unresolvedMembers: 0,
        memberKind: member.kind,
      });
      edge('member', programId, fileNodeId(path));
    }
    for (const reference of program.externalReferences) {
      const key = componentKey(reference);
      node({
        id: componentNodeId(key),
        kind: 'component',
        label:
          reference.fileName ?? reference.description ?? reference.identifier,
        detail: reference.identifier,
        group: null,
        state: null,
        unresolvedMembers: 0,
        memberKind: null,
      });
      edge('component', programId, componentNodeId(key));
    }
    const analysis = program.analysis;
    if (!analysis) continue;
    const crud =
      (tableView === 'mapped' ? mappedCrud(analysis, mapping) : null) ??
      analysis.crud;
    for (const entry of crud) {
      const id = tableNodeId(entry.table);
      node({
        id,
        kind: 'table',
        label: entry.table,
        detail: entry.table,
        group: null,
        state: null,
        unresolvedMembers: 0,
        memberKind: null,
      });
      const tableEdge = edge('table', programId, id);
      for (const operation of entry.operations)
        if (!tableEdge.operations.includes(operation))
          tableEdge.operations.push(operation);
      tableEdge.operations.sort(
        (a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b),
      );
    }
    for (const call of analysis.calls) {
      if (call.resolution !== 'program') continue;
      const from = fileOf(call.from);
      for (const target of call.targets) {
        const to = fileOf(target);
        if (from === to) continue;
        const source = fileNodeId(from);
        const destination = fileNodeId(to);
        if (!nodes.has(source) || !nodes.has(destination)) continue;
        // Programs sharing a file repeat its calls: each site counts once.
        const site = [call.from, call.line, call.name, target].join('\u0000');
        if (callSites.has(site)) continue;
        callSites.add(site);
        calls += call.count;
        const callEdge = edge('call', source, destination);
        callEdge.sites += 1;
        callEdge.calls += call.count;
      }
    }
  }

  for (const value of edges.values()) {
    const source = nodes.get(value.source);
    const target = nodes.get(value.target);
    if (!source || !target) continue;
    source.fanOut += 1;
    if (value.kind === 'call') target.callers += 1;
    else target.fanIn += 1;
  }

  const programCount = inventory.programs.length;
  for (const value of nodes.values())
    value.common =
      (value.kind === 'shared-module' || value.kind === 'component') &&
      programCount >= COMMON_MIN_PROGRAMS &&
      value.fanIn > programCount * COMMON_FAN_IN_RATIO;

  const groupList = new Map<string, GraphGroup>();
  for (const program of inventory.programs) {
    const id = groups.get(program.projectPath) ?? '';
    const group = groupList.get(id) ?? { id, label: id, programs: [] };
    group.programs.push(programNodeId(program.projectPath));
    groupList.set(id, group);
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    groups: [...groupList.values()].sort((a, b) => a.id.localeCompare(b.id)),
    programs: programCount,
    callSites: callSites.size,
    calls,
    tableView,
  };
}

// Nodes and edges drawn with the current toggles: common files and COM
// references hidden unless asked for, with every edge touching them.
export function visibleGraph(
  graph: DependencyGraph,
  showCommon: boolean,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (showCommon) return { nodes: graph.nodes, edges: graph.edges };
  const hidden = new Set(
    graph.nodes.filter((value) => value.common).map((value) => value.id),
  );
  return {
    nodes: graph.nodes.filter((value) => !hidden.has(value.id)),
    edges: graph.edges.filter(
      (value) => !hidden.has(value.source) && !hidden.has(value.target),
    ),
  };
}

// The focused node and its direct neighbours over the given edges.
export function neighbourhood(
  edges: readonly GraphEdge[],
  focus: string,
): Set<string> {
  const linked = new Set([focus]);
  for (const value of edges) {
    if (value.source === focus) linked.add(value.target);
    if (value.target === focus) linked.add(value.source);
  }
  return linked;
}

// Shared files by fan-in, most used first: the "Common module" panel.
export function commonModules(graph: DependencyGraph): GraphNode[] {
  return graph.nodes
    .filter((value) => value.kind === 'shared-module')
    .sort((a, b) => b.fanIn - a.fanIn || a.label.localeCompare(b.label));
}

// An edge as drawn: a graph edge, or a program's edges merged into one
// from its folder box (`edge` null, `programs` = programs merged).
export type ShownEdge = {
  id: string;
  kind: GraphEdgeKind;
  source: string;
  target: string;
  edge: GraphEdge | null;
  programs: number;
};

// Edges drawn while nothing is focused. Programs' edges to shared files,
// tables and COM references are merged per folder box (a corpus of a few
// hundred programs would otherwise draw thousands of lines), and a call
// from an own file into a shared file is left out (its program's member
// edge already joins the two). Focusing a node draws its own edges again.
export function restingEdges(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  folderOf: (program: GraphNode) => string,
): ShownEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const shown = new Map<string, ShownEdge>();
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    if (
      edge.kind === 'call' &&
      source.kind === 'own-module' &&
      target.kind === 'shared-module'
    )
      continue;
    if (source.kind === 'program' && target.kind !== 'own-module') {
      const folder = folderOf(source);
      const id = `folder|${folder}|${target.id}`;
      const merged = shown.get(id) ?? {
        id,
        kind: edge.kind,
        source: folder,
        target: target.id,
        edge: null,
        programs: 0,
      };
      merged.programs += 1;
      shown.set(id, merged);
      continue;
    }
    shown.set(edge.id, {
      id: edge.id,
      kind: edge.kind,
      source: edge.source,
      target: edge.target,
      edge,
      programs: 1,
    });
  }
  return [...shown.values()];
}
