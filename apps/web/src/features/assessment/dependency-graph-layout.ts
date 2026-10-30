import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import {
  LANE,
  type DependencyGraph,
  type GraphLane,
  type GraphEdge,
  type GraphNode,
} from './dependency-graph';

// Layout of the dependency graph (UI03). ELK (layered, left to right) places
// the top-level boxes in four partitions, one per lane. Lanes of many small
// nodes are boxed so the drawing stays compact instead of one very tall
// column: programs and own files by folder, tables and COM references in one
// box each, nodes in a grid inside. Shared files stay single nodes, ordered
// by ELK. ELK sees one box per group and one edge per (box, target) pair.
// The request is plain data and runs in ELK's Web Worker; `laneLayout` is
// the same lanes without ELK, used when no worker is available or it fails.

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 52;
const GAP = 10;
const GROUP_PADDING = 12;
const GROUP_HEADER = 30;
const LANE_SPACING = 160;
// Rows of a table or COM box before it gets another column.
const BOX_ROWS = 30;
const MAX_BOX_COLUMNS = 6;

export type Point = { x: number; y: number };

export const groupNodeId = (group: string) => `folder:${group}`;
const ownBoxId = (group: string) => `own:${group}`;
export const TABLE_BOX = 'box:tables';
export const COMPONENT_BOX = 'box:components';

export type LayoutBoxKind = 'programs' | 'own' | 'tables' | 'components';
export type LayoutBox = {
  id: string;
  kind: LayoutBoxKind;
  lane: GraphLane;
  // Folder of program/own boxes (`''` = top of the corpus).
  folder: string;
  members: GraphNode[];
  // Closed: drawn as one node standing for its members (a closed folder
  // stands for its programs and own files), members not drawn.
  collapsed: boolean;
  columns: number;
  width: number;
  height: number;
};

// Columns of a folder box: wider boxes for big folders.
function folderColumns(count: number): number {
  return count > 48 ? 8 : count > 24 ? 6 : count > 8 ? 4 : count > 3 ? 2 : 1;
}

export function groupGrid(
  count: number,
  columns = folderColumns(count),
): { columns: number; width: number; height: number } {
  const rows = Math.max(1, Math.ceil(count / columns));
  return {
    columns,
    width: GROUP_PADDING * 2 + columns * NODE_WIDTH + (columns - 1) * GAP,
    height:
      GROUP_HEADER + GROUP_PADDING + rows * NODE_HEIGHT + (rows - 1) * GAP,
  };
}

// Position of the n-th node inside its box, relative to the box.
export function groupSlot(index: number, columns: number): Point {
  return {
    x: GROUP_PADDING + (index % columns) * (NODE_WIDTH + GAP),
    y: GROUP_HEADER + Math.floor(index / columns) * (NODE_HEIGHT + GAP),
  };
}

// Boxes of the shown nodes, folders in the graph's folder order.
export function layoutBoxes(
  graph: DependencyGraph,
  nodes: readonly GraphNode[],
  closed: ReadonlySet<string> = new Set(),
): LayoutBox[] {
  const boxes: LayoutBox[] = [];
  const shut = (
    id: string,
    kind: LayoutBoxKind,
    lane: GraphLane,
    folder: string,
    members: GraphNode[],
  ) => {
    if (members.length > 0)
      boxes.push({
        id,
        kind,
        lane,
        folder,
        members,
        collapsed: true,
        columns: 0,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
  };
  const add = (
    id: string,
    kind: LayoutBoxKind,
    lane: GraphLane,
    folder: string,
    members: GraphNode[],
    columns?: number,
  ) => {
    if (members.length === 0) return;
    if (closed.has(id)) {
      shut(id, kind, lane, folder, members);
      return;
    }
    boxes.push({
      id,
      kind,
      lane,
      folder,
      members,
      collapsed: false,
      ...groupGrid(members.length, columns),
    });
  };
  const byKind = (kind: GraphNode['kind']) =>
    nodes.filter((node) => node.kind === kind);
  const programs = byKind('program');
  const own = byKind('own-module');
  for (const group of graph.groups) {
    if (closed.has(groupNodeId(group.id))) {
      shut(
        groupNodeId(group.id),
        'programs',
        0,
        group.id,
        [...programs, ...own].filter((node) => node.group === group.id),
      );
      continue;
    }
    add(
      groupNodeId(group.id),
      'programs',
      0,
      group.id,
      programs.filter((node) => node.group === group.id),
    );
    add(
      ownBoxId(group.id),
      'own',
      1,
      group.id,
      own.filter((node) => node.group === group.id),
    );
  }
  const columns = (count: number) =>
    Math.min(MAX_BOX_COLUMNS, Math.max(1, Math.ceil(count / BOX_ROWS)));
  const tables = byKind('table').sort((a, b) => b.fanIn - a.fanIn);
  const components = byKind('component').sort((a, b) => b.fanIn - a.fanIn);
  add(TABLE_BOX, 'tables', 3, '', tables, columns(tables.length));
  add(
    COMPONENT_BOX,
    'components',
    3,
    '',
    components,
    columns(components.length),
  );
  return boxes;
}

export type LayoutRequest = ElkNode & {
  children: (ElkNode & { width: number; height: number })[];
  edges: ElkExtendedEdge[];
};

// Top-level boxes and edges for ELK. Edges that would go right to left
// (a shared file calling an own file) are left out of the layout only;
// they are still drawn.
export function layoutRequest(
  graph: DependencyGraph,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  closed: ReadonlySet<string> = new Set(),
): LayoutRequest {
  const boxOf = new Map<string, string>();
  const lane = new Map<string, number>();
  const children: LayoutRequest['children'] = [];
  const child = (id: string, value: number, width: number, height: number) => {
    lane.set(id, value);
    children.push({
      id,
      width,
      height,
      layoutOptions: { 'elk.partitioning.partition': String(value) },
    });
  };
  for (const box of layoutBoxes(graph, nodes, closed)) {
    for (const member of box.members) boxOf.set(member.id, box.id);
    child(box.id, box.lane, box.width, box.height);
  }
  // Shared files, ordered by the folders of the programs declaring them
  // (mean folder position), so they sit across from their users whatever
  // is open.
  const folderIndex = new Map(
    graph.groups.map((group, index) => [group.id, index]),
  );
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const users = new Map<string, number[]>();
  for (const edge of edges) {
    if (edge.kind !== 'member') continue;
    const program = byId.get(edge.source);
    const index = folderIndex.get(program?.group ?? '');
    if (index === undefined) continue;
    users.set(edge.target, [...(users.get(edge.target) ?? []), index]);
  }
  const position = (id: string) => {
    const values = users.get(id) ?? [];
    return values.length === 0
      ? Number.MAX_SAFE_INTEGER
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  const unboxed = nodes
    .filter((node) => !boxOf.has(node.id))
    .sort(
      (a, b) =>
        position(a.id) - position(b.id) || a.label.localeCompare(b.label),
    );
  for (const node of unboxed) {
    boxOf.set(node.id, node.id);
    child(node.id, LANE[node.kind], NODE_WIDTH, NODE_HEIGHT);
  }
  const layoutEdges = new Map<string, ElkExtendedEdge>();
  for (const edge of edges) {
    const source = boxOf.get(edge.source);
    const target = boxOf.get(edge.target);
    if (!source || !target || source === target) continue;
    if ((lane.get(source) ?? 0) > (lane.get(target) ?? 0)) continue;
    const id = `${source}\u0000${target}`;
    if (!layoutEdges.has(id))
      layoutEdges.set(id, { id, sources: [source], targets: [target] });
  }
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.partitioning.activate': 'true',
      // Disconnected parts stay in their lanes instead of side by side.
      'elk.separateConnectedComponents': 'false',
      'elk.spacing.nodeNode': String(GAP + 4),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(LANE_SPACING),
      'elk.edgeRouting': 'POLYLINE',
      // Keep the order of the request top to bottom: opening or closing a
      // folder makes room but does not reshuffle the other boxes. The order
      // is already chosen (folders, shared files by their folders), so ELK's
      // crossing minimisation, most of its run time on large corpora, is
      // skipped and each layer keeps the request order.
      'elk.layered.crossingMinimization.strategy': 'NONE',
    },
    children,
    edges: [...layoutEdges.values()],
  };
}

// Same lanes without ELK: boxes stacked top to bottom in request order.
export function laneLayout(request: LayoutRequest): Map<string, Point> {
  const lanes = new Map<number, number>();
  const widths = new Map<number, number>();
  const laneOf = (child: LayoutRequest['children'][number]) =>
    Number(child.layoutOptions?.['elk.partitioning.partition'] ?? 0);
  for (const child of request.children)
    widths.set(
      laneOf(child),
      Math.max(widths.get(laneOf(child)) ?? 0, child.width),
    );
  const laneX = new Map<number, number>();
  let x = 0;
  for (const value of [0, 1, 2, 3]) {
    laneX.set(value, x);
    if (widths.has(value)) x += (widths.get(value) ?? 0) + LANE_SPACING;
  }
  const positions = new Map<string, Point>();
  for (const child of request.children) {
    const value = laneOf(child);
    const y = lanes.get(value) ?? 0;
    positions.set(child.id, { x: laneX.get(value) ?? 0, y });
    lanes.set(value, y + child.height + GAP + 4);
  }
  return positions;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// Top-level positions from the worker's answer (untrusted message data);
// null when it is not a laid-out graph covering every requested box.
export function readLayout(
  value: unknown,
  request: LayoutRequest,
): Map<string, Point> | null {
  if (!isRecord(value) || !Array.isArray(value.children)) return null;
  const children: unknown[] = value.children;
  const positions = new Map<string, Point>();
  for (const child of children) {
    if (!isRecord(child)) return null;
    const { id, x, y } = child;
    if (
      typeof id !== 'string' ||
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return null;
    positions.set(id, { x, y });
  }
  return request.children.every((child) => positions.has(child.id))
    ? positions
    : null;
}
