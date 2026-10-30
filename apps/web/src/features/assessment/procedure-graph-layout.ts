import type { ElkExtendedEdge } from 'elkjs/lib/elk-api';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  type LayoutRequest,
} from './dependency-graph-layout';
import {
  PROCEDURE_LANE,
  type ProcedureEdge,
  type ProcedureNode,
} from './procedure-graph';

// Layout of a program's procedure graph (UI04) for the same ELK worker and
// lane fallback as the project graph (`useGraphLayout`): one node per
// procedure, API and table, layered left to right in four partitions (own
// procedures → shared procedures → APIs → tables). Calls inside a lane add
// layers within it, so a caller sits left of what it calls. Edges going
// back to an earlier lane and recursive calls are left out of the layout
// only; they are still drawn.

const NODE_GAP = 14;
const LAYER_SPACING = 90;

export function procedureLayoutRequest(
  nodes: readonly ProcedureNode[],
  edges: readonly ProcedureEdge[],
): LayoutRequest {
  const lane = new Map(
    nodes.map((node) => [node.id, PROCEDURE_LANE[node.kind]]),
  );
  const layoutEdges: ElkExtendedEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const from = lane.get(edge.source);
    const to = lane.get(edge.target);
    if (from === undefined || to === undefined) continue;
    if (edge.source === edge.target || from > to) continue;
    const id = `${edge.source}\u0000${edge.target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    layoutEdges.push({ id, sources: [edge.source], targets: [edge.target] });
  }
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.partitioning.activate': 'true',
      'elk.separateConnectedComponents': 'false',
      'elk.spacing.nodeNode': String(NODE_GAP),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_SPACING),
      'elk.edgeRouting': 'POLYLINE',
      // Fewer crossing-minimisation passes than the default 7: the largest
      // pilot program (142 procedures drawn) lays out in ~0.3 s instead of
      // ~0.7 s, with barely more crossings.
      'elk.layered.thoroughness': '3',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layoutOptions: {
        'elk.partitioning.partition': String(lane.get(node.id) ?? 0),
      },
    })),
    edges: layoutEdges,
  };
}
