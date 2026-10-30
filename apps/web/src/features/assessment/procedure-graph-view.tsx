import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  useStore,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { createPortal } from 'react-dom';
import type { SourceInventoryDocument } from '@portal/contracts';
import { useLocale } from '../../shared/i18n/locale-context';
import type { Messages } from '../../shared/i18n/vi';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  type LayoutRequest,
  type Point,
} from './dependency-graph-layout';
import {
  buildProcedureGraph,
  procedureNeighbourhood,
  visibleProcedureGraph,
  type ProcedureEdge,
  type ProcedureGraph,
  type ProcedureNode,
} from './procedure-graph';
import { procedureLayoutRequest } from './procedure-graph-layout';
import { useGraphLayout } from './use-graph-layout';
import { ICON, IconButton, useFloatingHost } from './graph-frame';

// Call graph tab of the program detail (UI04): the program's procedures,
// the shared procedures they reach, the native APIs they call and the
// tables they access, on the same React Flow canvas and ELK worker as the
// project graph (UI03). Clicking a procedure (or picking it in the search or
// the side card) dims everything but it, its callers and what it calls; the
// side card lists the same relations as buttons for keyboard and screen
// reader use, and the "Calls" tab keeps every call as a table. Loaded
// lazily with its libraries.

type Copy = Messages['assessment']['detail']['graph'];
type FlowNodeData = { node: ProcedureNode; focused: boolean };
type FlowNode = Node<FlowNodeData>;

const SEARCH_RESULTS = 8;
// Zoom below which node names cannot be read; zoom a focused node is shown at
// when its neighbours do not fit above it.
const READABLE_ZOOM = 0.55;
const FOCUS_ZOOM = 0.85;
const MINIMAP_NODES = 40;

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

export function ProcedureGraphView({
  inventory,
  projectPath,
}: {
  inventory: SourceInventoryDocument;
  projectPath: string;
}) {
  const { messages } = useLocale();
  const graph = useMemo(
    () => buildProcedureGraph(inventory, projectPath),
    [inventory, projectPath],
  );
  if (!graph || graph.nodes.length === 0)
    return (
      <p className="empty-state">{messages.assessment.detail.graph.empty}</p>
    );
  return (
    <ReactFlowProvider>
      <GraphTab graph={graph} />
    </ReactFlowProvider>
  );
}

type Drawn = {
  nodes: ProcedureNode[];
  edges: ProcedureEdge[];
  isolated: boolean;
};

function GraphTab({ graph }: { graph: ProcedureGraph }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail.graph;
  const number = useNumber();
  const flow = useReactFlow();
  // A program without any call or table access would draw nothing.
  const [showIsolated, setShowIsolated] = useState(
    () => graph.edges.length === 0,
  );
  const [focus, setFocus] = useState<string | null>(null);
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Each request remembers what it draws; the canvas shows the one whose
  // layout finished last, so nodes and positions always match.
  const displays = useRef(new Map<LayoutRequest, Drawn>());
  const request = useMemo(() => {
    const visible = visibleProcedureGraph(graph, showIsolated);
    const next = procedureLayoutRequest(visible.nodes, visible.edges);
    displays.current.set(next, { ...visible, isolated: showIsolated });
    for (const old of [...displays.current.keys()].slice(0, -4))
      displays.current.delete(old);
    return next;
  }, [graph, showIsolated]);
  const layoutState = useGraphLayout(request);
  const layout = layoutState.layout;
  const drawn = layout ? (displays.current.get(layout.request) ?? null) : null;
  const isolatedCount = graph.nodes.filter(
    (node) => node.callers === 0 && node.callees === 0,
  ).length;

  const byId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph],
  );
  const focusedNode = focus ? (byId.get(focus) ?? null) : null;
  const linked = useMemo(
    () => (focus ? procedureNeighbourhood(graph.edges, focus) : null),
    [graph, focus],
  );

  // A focused procedure is brought into view with what it calls and what
  // calls it, so a large program (drawn tiny to fit) zooms to the part
  // being read. When those are spread too far apart to read at once, the
  // view centres the procedure at a readable zoom instead; its edges and
  // the side card lead to the rest.
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);
  useEffect(() => {
    if (!pendingReveal || !drawn) return;
    const frame = requestAnimationFrame(() => {
      const node = flow.getNode(pendingReveal);
      if (!node) return;
      const duration = reducedMotion() ? 0 : 250;
      const ids = [...procedureNeighbourhood(graph.edges, pendingReveal)]
        .filter((id) => flow.getNode(id))
        .map((id) => ({ id }));
      const bounds = flow.getNodesBounds(ids.map(({ id }) => id));
      const fits =
        Math.min(
          paneWidth / (bounds.width * 1.3),
          paneHeight / (bounds.height * 1.3),
        ) >= READABLE_ZOOM;
      if (fits)
        void flow.fitView({ nodes: ids, maxZoom: 1, padding: 0.15, duration });
      else
        void flow.setCenter(
          node.position.x + NODE_WIDTH / 2,
          node.position.y + NODE_HEIGHT / 2,
          { zoom: FOCUS_ZOOM, duration },
        );
      setPendingReveal(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingReveal, drawn, flow, graph, paneWidth, paneHeight]);

  // Full screen as in the project graph: page scroll locked, Esc clears
  // the focus first, then leaves; the graph is fitted to the new size.
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (focus) setFocus(null);
      else setExpanded(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [expanded, focus]);
  const firstSize = useRef(true);
  useEffect(() => {
    if (firstSize.current) {
      firstSize.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ duration: reducedMotion() ? 0 : 250 });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, flow]);

  const toggleFocus = useCallback(
    (id: string) => {
      if (focus === id) {
        setFocus(null);
        return;
      }
      setFocus(id);
      setPendingReveal(id);
    },
    [focus],
  );
  // From the search or the side card: focuses the node, draws it (a
  // procedure without edges is hidden by default) and brings it into view.
  const reveal = useCallback(
    (id: string) => {
      const node = byId.get(id);
      setFocus(id);
      if (node && node.callers === 0 && node.callees === 0)
        setShowIsolated(true);
      setPendingReveal(id);
    },
    [byId],
  );

  // Handled on the window while full screen.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !expanded) setFocus(null);
  };

  const { slot, host } = useFloatingHost(expanded);
  const content = (
    <>
      {expanded && (
        <div
          className="dep-graph-backdrop"
          aria-hidden="true"
          onClick={() => setExpanded(false)}
        />
      )}
      <div
        className={`dep-graph-tab proc-graph-tab${expanded ? ' dep-graph-expanded' : ''}`}
        onKeyDown={onKeyDown}
        {...(expanded
          ? {
              role: 'dialog',
              'aria-modal': true,
              'aria-label': copy.canvasLabel,
            }
          : {})}
      >
        <div className="dep-graph-main">
          <div className="dep-graph-bar">
            <ProcedureSearch graph={graph} copy={copy} onPick={reveal} />
            <span className="dep-graph-actions">
              {isolatedCount > 0 && (
                <label className="dep-graph-toggle">
                  <input
                    type="checkbox"
                    checked={showIsolated}
                    onChange={(event) =>
                      setShowIsolated(event.currentTarget.checked)
                    }
                  />
                  {copy.showIsolated(number(isolatedCount))}
                </label>
              )}
              <IconButton
                label={expanded ? copy.exitFullScreen : copy.fullScreen}
                pressed={expanded}
                onClick={() => setExpanded((value) => !value)}
                path={expanded ? ICON.exitFullScreen : ICON.fullScreen}
              />
            </span>
          </div>
          <GraphCanvas
            drawn={drawn}
            positions={layout?.positions ?? null}
            focus={focus}
            linked={linked}
            pending={layoutState.pending}
            failed={layoutState.failed}
            onFocus={toggleFocus}
            onClear={() => setFocus(null)}
          />
          <p className="dep-graph-caption muted">
            <span data-testid="procedure-graph-summary">
              {copy.summary(
                number(graph.ownProcedures),
                number(graph.sharedProcedures),
                number(graph.edges.length),
              )}{' '}
              · {copy.tableView[graph.tableView]}
            </span>
            <span>
              {copy.lanes.own} → {copy.lanes.shared} → {copy.lanes.api} →{' '}
              {copy.lanes.tables}
            </span>
          </p>
        </div>
        <aside className="dep-graph-side" aria-label={copy.sideLabel}>
          {focusedNode ? (
            <FocusCard
              graph={graph}
              node={focusedNode}
              byId={byId}
              copy={copy}
              onPick={reveal}
              onClear={() => setFocus(null)}
            />
          ) : (
            <p className="muted dep-common-note">{copy.sideHint}</p>
          )}
          <p className="muted dep-common-note">{copy.note}</p>
        </aside>
      </div>
    </>
  );
  return (
    <>
      <div ref={slot} />
      {createPortal(content, host)}
    </>
  );
}

function flowNodes(drawn: Drawn, positions: Map<string, Point>): FlowNode[] {
  return drawn.nodes.map((node) => ({
    id: node.id,
    type: 'proc',
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: { node, focused: false },
  }));
}

function flowEdge(edge: ProcedureEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    className: `dep-edge proc-edge-${edge.kind}`,
    focusable: false,
    selectable: false,
    // The side card and the "Calls" tab carry the same relations.
    domAttributes: { 'aria-hidden': true },
  };
}

function edgeLabel(
  edge: ProcedureEdge,
  copy: Copy,
  number: (n: number) => string,
) {
  if (edge.kind === 'table') return edge.operations.join('');
  return copy.uses(number(edge.count));
}

function GraphCanvas({
  drawn,
  positions,
  focus,
  linked,
  pending,
  failed,
  onFocus,
  onClear,
}: {
  drawn: Drawn | null;
  positions: Map<string, Point> | null;
  focus: string | null;
  linked: Set<string> | null;
  pending: boolean;
  failed: boolean;
  onFocus: (id: string) => void;
  onClear: () => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail.graph;
  const number = useNumber();
  const baseNodes = useMemo(
    () => (drawn && positions ? flowNodes(drawn, positions) : []),
    [drawn, positions],
  );
  const drawnIds = useMemo(
    () => new Set(drawn?.nodes.map((node) => node.id) ?? []),
    [drawn],
  );
  const baseEdges = useMemo(
    () =>
      (drawn?.edges ?? [])
        .filter(
          (edge) => drawnIds.has(edge.source) && drawnIds.has(edge.target),
        )
        .map(flowEdge),
    [drawn, drawnIds],
  );
  const nodes = useMemo(
    () =>
      linked
        ? baseNodes.map((node) =>
            linked.has(node.id)
              ? {
                  ...node,
                  className: node.id === focus ? 'focused linked' : 'linked',
                  data: { ...node.data, focused: node.id === focus },
                }
              : node,
          )
        : baseNodes,
    [baseNodes, linked, focus],
  );
  const edges = useMemo(() => {
    if (!focus || !drawn) return baseEdges;
    const related = new Map(
      drawn.edges
        .filter((edge) => edge.source === focus || edge.target === focus)
        .map((edge) => [edge.id, edge]),
    );
    return baseEdges.map((edge) => {
      const value = related.get(edge.id);
      return value
        ? {
            ...edge,
            className: `${edge.className ?? ''} linked`,
            label: edgeLabel(value, copy, number),
            // Over the nodes they cross, so they can be followed.
            zIndex: 1000,
          }
        : edge;
    });
  }, [baseEdges, drawn, focus, copy, number]);
  const nodeTypes = useMemo(() => ({ proc: ProcedureFlowNode }), []);

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
          // Showing or hiding procedures without edges fits the view again.
          key={drawn.isolated ? 'all' : 'linked'}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onlyRenderVisibleElements
          fitView
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          onNodeClick={(_event, node) => onFocus(node.id)}
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
          {/* A small graph fits the canvas; the minimap would cover it. */}
          {drawn.nodes.length > MINIMAP_NODES && (
            <MiniMap pannable zoomable nodeClassName={() => 'minimap-node'} />
          )}
        </ReactFlow>
      )}
    </div>
  );
}

function nodeType(node: ProcedureNode, copy: Copy): string {
  if (node.kind === 'api') return copy.kinds.api;
  if (node.kind === 'table') return copy.kinds.table;
  return node.procedureKind ?? copy.fileLevel;
}

const ProcedureFlowNode = memo(function ProcedureFlowNode({
  data,
}: NodeProps<FlowNode>) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail.graph;
  const number = useNumber();
  const { node } = data;
  const shared = node.kind === 'shared-procedure';
  return (
    <div className={`dep-node proc-node-${node.kind}`} title={node.detail}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        className="dep-node-button"
        aria-pressed={data.focused}
        aria-label={copy.focusNode(nodeType(node, copy), node.label)}
      >
        {/* Two lines fit the node: kind and file, then the name. */}
        <span className="dep-node-type">
          {nodeType(node, copy)}
          {shared && <span className="dep-node-state">{copy.shared}</span>}
          {(node.file ?? (node.kind === 'api' ? node.detail : '')) && (
            <span className="proc-node-file mono">
              {node.file ?? node.detail}
            </span>
          )}
          {node.dynamicSql > 0 && (
            <span className="dep-node-state">
              {copy.dynamicSql(number(node.dynamicSql))}
            </span>
          )}
        </span>
        <span className="dep-node-label mono">{node.label}</span>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
});

// Exact name first, then names starting with the text, then the rest.
function searchRank(node: ProcedureNode, text: string): number {
  const label = node.label.toLowerCase();
  return label === text ? 0 : label.startsWith(text) ? 1 : 2;
}

function ProcedureSearch({
  graph,
  copy,
  onPick,
}: {
  graph: ProcedureGraph;
  copy: Copy;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const text = query.trim().toLowerCase();
  const results = text
    ? graph.nodes
        .filter(
          (node) =>
            node.label.toLowerCase().includes(text) ||
            node.detail.toLowerCase().includes(text),
        )
        .sort(
          (a, b) =>
            searchRank(a, text) - searchRank(b, text) ||
            a.label.localeCompare(b.label),
        )
        .slice(0, SEARCH_RESULTS)
    : [];
  return (
    <div className="dep-graph-search">
      <input
        type="search"
        aria-label={copy.search}
        placeholder={copy.search}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {text && (
        <ul className="dep-search-results" aria-label={copy.searchResults}>
          {results.length === 0 && <li className="muted">{copy.searchNone}</li>}
          {results.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                className="dep-search-item"
                onClick={() => {
                  onPick(node.id);
                  setQuery('');
                }}
              >
                <span className="mono">{node.label}</span>
                <span className="muted">
                  {nodeType(node, copy)}
                  {node.file !== null && ` · ${node.file}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FocusCard({
  graph,
  node,
  byId,
  copy,
  onPick,
  onClear,
}: {
  graph: ProcedureGraph;
  node: ProcedureNode;
  byId: Map<string, ProcedureNode>;
  copy: Copy;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const number = useNumber();
  const callers = graph.edges.filter((edge) => edge.target === node.id);
  const callees = graph.edges.filter(
    (edge) => edge.source === node.id && edge.kind !== 'table',
  );
  const tables = graph.edges.filter(
    (edge) => edge.source === node.id && edge.kind === 'table',
  );
  const item = (edge: ProcedureEdge, other: string) => {
    const target = byId.get(other);
    if (!target) return null;
    return (
      <li key={edge.id}>
        <button
          type="button"
          className="dep-search-item"
          onClick={() => onPick(other)}
        >
          <span className="mono">{target.label}</span>{' '}
          <span className="muted">
            {edge.kind === 'table'
              ? edge.operations.join('')
              : copy.uses(number(edge.count))}
            {edge.kind === 'ambiguous' && ` · ${copy.ambiguous}`}
            {target.file !== null && ` · ${target.file}`} · L{edge.line}
          </span>
        </button>
      </li>
    );
  };
  const list = (title: string, edges: ProcedureEdge[], side: 'in' | 'out') =>
    edges.length > 0 && (
      <>
        <h5 className="proc-focus-list-title">{title}</h5>
        <ul className="dep-search-results proc-focus-list">
          {edges.map((edge) =>
            item(edge, side === 'in' ? edge.source : edge.target),
          )}
        </ul>
      </>
    );
  return (
    <section className="dep-focus-card" aria-live="polite">
      <div className="dep-focus-heading">
        <h4>{copy.focusedTitle}</h4>
        <button type="button" className="link-button" onClick={onClear}>
          {copy.clearFocus}
        </button>
      </div>
      <p className="dep-focus-label">
        <span className="badge">{nodeType(node, copy)}</span>{' '}
        <strong className="mono">{node.label}</strong>
      </p>
      <p className="mono muted">{node.relativePath ?? node.detail}</p>
      <dl className="dep-focus-numbers">
        {node.codeLines !== null && (
          <div>
            <dt>{copy.codeLines}</dt>
            <dd>{number(node.codeLines)}</dd>
          </div>
        )}
        {node.decisionPoints !== null && (
          <div>
            <dt>{copy.decisions}</dt>
            <dd>{number(node.decisionPoints)}</dd>
          </div>
        )}
        <div>
          <dt>{copy.callers}</dt>
          <dd>{number(node.callers)}</dd>
        </div>
      </dl>
      {node.dynamicSql > 0 && (
        <p className="notice">{copy.dynamicSql(number(node.dynamicSql))}</p>
      )}
      {list(copy.calledBy, callers, 'in')}
      {list(copy.callsTo, callees, 'out')}
      {list(copy.tables, tables, 'out')}
      {callers.length + callees.length + tables.length === 0 && (
        <p className="muted">{copy.noEdges}</p>
      )}
    </section>
  );
}
