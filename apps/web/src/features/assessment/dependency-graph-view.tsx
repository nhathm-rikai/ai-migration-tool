import {
  memo,
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import type { SourceInventoryDocument } from '@portal/contracts';
import { useLocale } from '../../shared/i18n/locale-context';
import type { Messages } from '../../shared/i18n/vi';
import { pageOf } from './assessment-summary';
import {
  buildDependencyGraph,
  commonModules,
  neighbourhood,
  restingEdges,
  visibleGraph,
  type DependencyGraph,
  type GraphEdge,
  type GraphNode,
  type GraphNodeKind,
} from './dependency-graph';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  groupNodeId,
  groupSlot,
  layoutBoxes,
  type LayoutBox,
  layoutRequest,
  type Point,
} from './dependency-graph-layout';
import { useGraphLayout } from './use-graph-layout';

// Call graph tab of the analysis step (UI03, demo02 layout): React Flow
// canvas in four lanes with programs boxed by folder, a "Common module
// (fan-in)" panel on the right and a table of every node with the same
// numbers for keyboard and screen reader use. Clicking a node (or "focus"
// in the table/panel) dims everything but the node and its direct
// neighbours; the related edges run the demo's dash animation unless the
// browser asks for reduced motion. Loaded lazily with its libraries.

type Copy = Messages['assessment']['dashboard']['graph'];
type FlowNodeData = {
  // null for boxes.
  node: GraphNode | null;
  focused: boolean;
  box?: { label: string; count: number; programs: boolean };
};
type FlowNode = Node<FlowNodeData>;

const TABLE_PAGE_SIZE = 50;
const KINDS: GraphNodeKind[] = [
  'program',
  'own-module',
  'shared-module',
  'table',
  'component',
];

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function useNumber() {
  const { locale } = useLocale();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale);
    return (value: number) => format.format(value);
  }, [locale]);
}

export function DependencyGraphView({
  inventory,
}: {
  inventory: SourceInventoryDocument;
}) {
  const { messages } = useLocale();
  const graph = useMemo(() => buildDependencyGraph(inventory), [inventory]);
  if (graph.nodes.length === 0)
    return (
      <p className="empty-state">{messages.assessment.dashboard.graph.empty}</p>
    );
  return (
    <ReactFlowProvider>
      <GraphTab graph={graph} />
    </ReactFlowProvider>
  );
}

type Drawn = { nodes: GraphNode[]; edges: GraphEdge[] };

function GraphTab({ graph }: { graph: DependencyGraph }) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard.graph;
  const number = useNumber();
  const flow = useReactFlow();
  const [showCommon, setShowCommon] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  // Both variants are cheap to prepare; the one on screen is the one whose
  // layout finished last, so nodes and positions always match.
  const variants = useMemo(() => {
    const make = (common: boolean) => {
      const drawn = visibleGraph(graph, common);
      return {
        drawn,
        request: layoutRequest(graph, drawn.nodes, drawn.edges),
      };
    };
    return { hidden: make(false), all: make(true) };
  }, [graph]);
  const wanted = showCommon ? variants.all : variants.hidden;
  const layoutState = useGraphLayout(wanted.request);
  const layout = layoutState.layout;
  const drawn: Drawn | null = layout
    ? layout.request === variants.all.request
      ? variants.all.drawn
      : variants.hidden.drawn
    : null;
  const commonCount = graph.nodes.filter((node) => node.common).length;

  const byId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph],
  );
  const focusedNode = focus ? (byId.get(focus) ?? null) : null;
  const linked = useMemo(
    () => (focus && drawn ? neighbourhood(drawn.edges, focus) : null),
    [drawn, focus],
  );

  const toggleFocus = useCallback(
    (id: string) => setFocus((current) => (current === id ? null : id)),
    [],
  );
  // From the panel or the table: also brings the node into view, and shows
  // common modules first when the node is one of them.
  const reveal = useCallback(
    (id: string) => {
      setFocus(id);
      if (byId.get(id)?.common) setShowCommon(true);
      const node = flow.getNode(id);
      if (node)
        void flow.fitView({
          nodes: [{ id }],
          maxZoom: 1,
          duration: reducedMotion() ? 0 : 250,
        });
    },
    [byId, flow],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setFocus(null);
  };

  return (
    <div className="dep-graph-tab" onKeyDown={onKeyDown}>
      <div className="dep-graph-main">
        <div className="dep-graph-toolbar">
          <span className="muted">{copy.hint}</span>
          <ol className="dep-graph-lanes" aria-label={copy.canvasLabel}>
            <li>{copy.lanes.program}</li>
            <li>→ {copy.lanes.own}</li>
            <li>→ {copy.lanes.shared}</li>
            <li>→ {copy.lanes.tables}</li>
          </ol>
        </div>
        <div className="dep-graph-toolbar">
          <span className="muted" data-testid="graph-summary">
            {copy.summary(
              number(graph.nodes.length),
              number(graph.edges.length),
              number(graph.calls),
            )}{' '}
            · {copy.tableView[graph.tableView]}
          </span>
          {commonCount > 0 && (
            <label className="dep-graph-toggle">
              <input
                type="checkbox"
                checked={showCommon}
                onChange={(event) => setShowCommon(event.currentTarget.checked)}
              />
              {copy.showCommon(number(commonCount))}
            </label>
          )}
        </div>
        <GraphCanvas
          graph={graph}
          drawn={drawn}
          positions={layout?.positions ?? null}
          layoutKey={
            layout?.request === variants.all.request ? 'all' : 'hidden'
          }
          focus={focus}
          linked={linked}
          pending={layoutState.pending}
          failed={layoutState.failed}
          onFocus={toggleFocus}
          onClear={() => setFocus(null)}
        />
      </div>
      <aside className="dep-graph-side" aria-label={copy.commonTitle}>
        {focusedNode && (
          <FocusCard
            node={focusedNode}
            copy={copy}
            onClear={() => setFocus(null)}
          />
        )}
        <CommonPanel graph={graph} copy={copy} onFocus={reveal} />
      </aside>
      <GraphTable graph={graph} focus={focus} onFocus={reveal} />
    </div>
  );
}

function boxLabel(box: LayoutBox, copy: Copy): string {
  if (box.kind === 'tables') return copy.kinds.table;
  if (box.kind === 'components') return copy.kinds.component;
  const folder = box.folder === '' ? copy.rootGroup : box.folder;
  return box.kind === 'own' ? `${folder} · ${copy.lanes.own}` : folder;
}

// React Flow nodes for one finished layout: each box at its ELK position
// with its nodes in a grid inside, then the unboxed (shared) files.
function flowNodes(
  graph: DependencyGraph,
  drawn: Drawn,
  positions: Map<string, Point>,
  copy: Copy,
): FlowNode[] {
  const nodes: FlowNode[] = [];
  const boxed = new Set<string>();
  for (const box of layoutBoxes(graph, drawn.nodes)) {
    nodes.push({
      id: box.id,
      type: 'box',
      position: positions.get(box.id) ?? { x: 0, y: 0 },
      width: box.width,
      height: box.height,
      data: {
        node: null,
        focused: false,
        box: {
          label: boxLabel(box, copy),
          count: box.members.length,
          programs: box.kind === 'programs',
        },
      },
      selectable: false,
      draggable: false,
      focusable: false,
    });
    box.members.forEach((node, index) => {
      boxed.add(node.id);
      nodes.push({
        id: node.id,
        type: 'dep',
        parentId: box.id,
        position: groupSlot(index, box.columns),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: { node, focused: false },
      });
    });
  }
  for (const node of drawn.nodes) {
    if (boxed.has(node.id)) continue;
    nodes.push({
      id: node.id,
      type: 'dep',
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: { node, focused: false },
    });
  }
  return nodes;
}

function flowEdge(edge: {
  id: string;
  kind: GraphEdge['kind'];
  source: string;
  target: string;
}): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    className: `dep-edge dep-edge-${edge.kind}`,
    focusable: false,
    selectable: false,
    // Hundreds of edges would flood screen readers; the node table carries
    // the same relations.
    domAttributes: { 'aria-hidden': true },
  };
}

const folderOf = (program: GraphNode) => groupNodeId(program.group ?? '');

function edgeLabel(edge: GraphEdge, copy: Copy, number: (n: number) => string) {
  if (edge.kind === 'table') return edge.operations.join('');
  if (edge.kind === 'call') return copy.calls(number(edge.calls));
  return undefined;
}

function GraphCanvas({
  graph,
  drawn,
  positions,
  layoutKey,
  focus,
  linked,
  pending,
  failed,
  onFocus,
  onClear,
}: {
  graph: DependencyGraph;
  drawn: Drawn | null;
  positions: Map<string, Point> | null;
  layoutKey: string;
  focus: string | null;
  linked: Set<string> | null;
  pending: boolean;
  failed: boolean;
  onFocus: (id: string) => void;
  onClear: () => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard.graph;
  const number = useNumber();
  // Base objects change only with the layout; focus swaps in new objects
  // for the nodes and edges it touches, so React Flow re-renders just those.
  const baseNodes = useMemo(
    () => (drawn && positions ? flowNodes(graph, drawn, positions, copy) : []),
    [graph, drawn, positions, copy],
  );
  const baseEdges = useMemo(
    () =>
      drawn
        ? restingEdges(drawn.nodes, drawn.edges, folderOf).map(flowEdge)
        : [],
    [drawn],
  );
  const nodes = useMemo(
    () =>
      linked
        ? baseNodes.map((node) =>
            node.type === 'box' || !linked.has(node.id)
              ? node
              : {
                  ...node,
                  className: node.id === focus ? 'focused linked' : 'linked',
                  data: { ...node.data, focused: node.id === focus },
                },
          )
        : baseNodes,
    [baseNodes, linked, focus],
  );
  // Focus draws the node's own edges over the resting ones (which dim).
  const edges = useMemo(() => {
    if (!focus || !drawn) return baseEdges;
    const related = drawn.edges.filter(
      (edge) => edge.source === focus || edge.target === focus,
    );
    const ids = new Set(related.map((edge) => edge.id));
    return [
      ...baseEdges.filter((edge) => !ids.has(edge.id)),
      ...related.map((edge) => {
        const base = flowEdge(edge);
        return {
          ...base,
          className: `${base.className ?? ''} linked`,
          label: edgeLabel(edge, copy, number),
          zIndex: 1,
        };
      }),
    ];
  }, [baseEdges, drawn, focus, copy, number]);
  const nodeTypes = useMemo(() => ({ dep: DepNode, box: BoxNode }), []);

  return (
    <div
      className={`dep-graph-canvas${focus ? ' has-focus' : ''}`}
      role="group"
      aria-label={copy.canvasLabel}
      aria-busy={pending}
    >
      {pending && (
        <p className="dep-graph-status" role="status">
          {copy.layoutPending}
        </p>
      )}
      {failed && (
        <p className="dep-graph-status" role="note">
          {copy.layoutFailed}
        </p>
      )}
      {drawn && positions && (
        <ReactFlow
          // A new layout (common modules shown or hidden) fits the view
          // again.
          key={layoutKey}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onlyRenderVisibleElements
          fitView
          minZoom={0.03}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          // The node's button gets keyboard focus; Enter/Space click it and
          // the click reaches the node like a mouse click.
          onNodeClick={(_event, node) => {
            if (node.type !== 'box') onFocus(node.id);
          }}
          onPaneClick={onClear}
          proOptions={{ hideAttribution: true }}
          ariaLabelConfig={{
            'controls.ariaLabel': copy.flow.controls,
            'controls.zoomIn.ariaLabel': copy.flow.zoomIn,
            'controls.zoomOut.ariaLabel': copy.flow.zoomOut,
            'controls.fitView.ariaLabel': copy.flow.fitView,
            'minimap.ariaLabel': copy.flow.minimap,
          }}
        >
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeClassName={(node) =>
              node.type === 'box' ? 'minimap-folder' : 'minimap-node'
            }
          />
        </ReactFlow>
      )}
    </div>
  );
}

const DepNode = memo(function DepNode({ data }: NodeProps<FlowNode>) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard.graph;
  const number = useNumber();
  const node = data.node;
  if (!node) return null;
  const kind = copy.kinds[node.kind];
  const state = node.state;
  return (
    <div
      className={`dep-node dep-node-${node.kind}${
        state && state !== 'complete' ? ` dep-node-${state}` : ''
      }`}
      title={node.detail}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        className="dep-node-button"
        aria-pressed={data.focused}
        aria-label={copy.focusNode(kind, node.label)}
      >
        <span className="dep-node-type">
          {node.memberKind ?? kind}
          {state && state !== 'complete' && (
            <span className="dep-node-state">{copy.state[state]}</span>
          )}
        </span>
        <span className="dep-node-label mono">{node.label}</span>
        {state === 'unsupported' && (
          <span className="dep-node-note">{copy.unknownDependencies}</span>
        )}
        {state !== 'unsupported' && node.unresolvedMembers > 0 && (
          <span className="dep-node-note">
            {copy.missingMembers(number(node.unresolvedMembers))}
          </span>
        )}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
});

const BoxNode = memo(function BoxNode({ data }: NodeProps<FlowNode>) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard.graph;
  const number = useNumber();
  if (!data.box) return null;
  // Merged edges of a folder's programs leave from its right side.
  return (
    <div className="dep-folder">
      <span className="dep-folder-label mono">{data.box.label}</span>
      <span className="muted">
        {data.box.programs
          ? copy.groupCount(number(data.box.count))
          : copy.boxCount(number(data.box.count))}
      </span>
      {data.box.programs && (
        <Handle type="source" position={Position.Right} isConnectable={false} />
      )}
    </div>
  );
});

function FocusCard({
  node,
  copy,
  onClear,
}: {
  node: GraphNode;
  copy: Copy;
  onClear: () => void;
}) {
  const number = useNumber();
  return (
    <section className="dep-focus-card" aria-labelledby="dep-focus-title">
      <div className="dep-focus-heading">
        <h4 id="dep-focus-title">{copy.focusedTitle}</h4>
        <button className="link-button" onClick={onClear}>
          {copy.clearFocus}
        </button>
      </div>
      <p className="mono dep-focus-label" title={node.detail}>
        {node.label}
      </p>
      <p className="muted">
        {copy.kinds[node.kind]}
        {node.state && <> · {copy.state[node.state]}</>}
      </p>
      <dl className="dep-focus-numbers">
        <div>
          <dt>{copy.fanIn}</dt>
          <dd className="mono">{number(node.fanIn)}</dd>
        </div>
        <div>
          <dt>{copy.fanOut}</dt>
          <dd className="mono">{number(node.fanOut)}</dd>
        </div>
        {(node.kind === 'own-module' || node.kind === 'shared-module') && (
          <div>
            <dt>{copy.callers}</dt>
            <dd className="mono">{number(node.callers)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

const COMMON_SHOWN = 8;

function CommonPanel({
  graph,
  copy,
  onFocus,
}: {
  graph: DependencyGraph;
  copy: Copy;
  onFocus: (id: string) => void;
}) {
  const number = useNumber();
  const modules = useMemo(
    () => commonModules(graph).slice(0, COMMON_SHOWN),
    [graph],
  );
  const max = Math.max(1, ...modules.map((node) => node.fanIn));
  return (
    <section className="dep-common" aria-labelledby="dep-common-title">
      <h4 id="dep-common-title">{copy.commonTitle}</h4>
      {modules.length === 0 ? (
        <p className="muted">{copy.commonNone}</p>
      ) : (
        <ol className="dep-common-list">
          {modules.map((node, index) => (
            <li key={node.id}>
              <button
                className="dep-common-item"
                onClick={() => onFocus(node.id)}
                aria-label={copy.focusNode(copy.kinds[node.kind], node.label)}
              >
                <span className="dep-common-row">
                  <span className="mono">{node.label}</span>
                  <span className="mono muted">
                    {number(node.fanIn)}
                    {node.common && <> · {copy.commonHidden}</>}
                  </span>
                </span>
                <span className="dep-common-bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${(node.fanIn / max) * 100}%`,
                      animationDelay: `${index * 60}ms`,
                    }}
                  />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted dep-common-note">{copy.commonNote}</p>
    </section>
  );
}

// The same nodes and numbers as the canvas, as a table: the graph for
// keyboard and screen reader users.
function GraphTable({
  graph,
  focus,
  onFocus,
}: {
  graph: DependencyGraph;
  focus: string | null;
  onFocus: (id: string) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard.graph;
  const programCopy = messages.assessment.programs;
  const number = useNumber();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<GraphNodeKind | 'all'>('all');
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return graph.nodes
      .filter(
        (node) =>
          (kind === 'all' || node.kind === kind) &&
          (text === '' ||
            node.label.toLowerCase().includes(text) ||
            node.detail.toLowerCase().includes(text)),
      )
      .sort(
        (a, b) =>
          b.fanIn - a.fanIn ||
          b.fanOut - a.fanOut ||
          a.label.localeCompare(b.label),
      );
  }, [graph, query, kind]);
  const current = pageOf(rows, page, TABLE_PAGE_SIZE);
  return (
    <details className="dep-graph-table">
      <summary>{copy.tableTitle}</summary>
      <div className="program-filters">
        <label>
          <span>{copy.tableFilter}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span>{copy.tableKind}</span>
          <select
            value={kind}
            onChange={(event) => {
              const value = event.currentTarget.value;
              const next = KINDS.find((item) => item === value);
              setKind(next ?? 'all');
              setPage(1);
            }}
          >
            <option value="all">{copy.all}</option>
            {KINDS.map((item) => (
              <option key={item} value={item}>
                {copy.kinds[item]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted" role="status">
        {copy.tableCount(rows.length, graph.nodes.length)}
      </p>
      <div className="table-scroll">
        <table className="program-table">
          <thead>
            <tr>
              <th scope="col">{copy.columns.node}</th>
              <th scope="col">{copy.columns.kind}</th>
              <th scope="col">{copy.columns.state}</th>
              <th scope="col" className="num">
                {copy.columns.fanIn}
              </th>
              <th scope="col" className="num">
                {copy.columns.fanOut}
              </th>
              <th scope="col">{copy.columns.action}</th>
            </tr>
          </thead>
          <tbody>
            {current.items.map((node) => (
              <tr
                key={node.id}
                className={node.id === focus ? 'selected' : undefined}
                data-node={node.id}
              >
                <th scope="row">
                  <span className="mono">{node.label}</span>
                  {node.detail !== node.label && (
                    <span className="mono muted" title={node.detail}>
                      {node.detail}
                    </span>
                  )}
                </th>
                <td>{copy.kinds[node.kind]}</td>
                <td>
                  {node.state ? (
                    <>
                      {copy.state[node.state]}
                      {node.unresolvedMembers > 0 && (
                        <span className="muted">
                          {' '}
                          ·{' '}
                          {copy.missingMembers(number(node.unresolvedMembers))}
                        </span>
                      )}
                    </>
                  ) : node.common ? (
                    copy.commonHidden
                  ) : (
                    '—'
                  )}
                </td>
                <td className="num">{number(node.fanIn)}</td>
                <td className="num">{number(node.fanOut)}</td>
                <td>
                  <button
                    className="button small"
                    aria-pressed={node.id === focus}
                    aria-label={copy.focusNode(
                      copy.kinds[node.kind],
                      node.label,
                    )}
                    onClick={() => onFocus(node.id)}
                  >
                    {copy.focusAction}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {current.pages > 1 && (
        <nav className="pagination" aria-label={copy.tablePagination}>
          <button
            className="button small"
            disabled={current.page <= 1}
            onClick={() => setPage(current.page - 1)}
          >
            {programCopy.previous}
          </button>
          <span>{programCopy.page(current.page, current.pages)}</span>
          <button
            className="button small"
            disabled={current.page >= current.pages}
            onClick={() => setPage(current.page + 1)}
          >
            {programCopy.next}
          </button>
        </nav>
      )}
    </details>
  );
}
