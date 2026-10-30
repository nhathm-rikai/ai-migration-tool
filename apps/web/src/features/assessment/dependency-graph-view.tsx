import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
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
import {
  buildDependencyGraph,
  commonModules,
  neighbourhood,
  restingEdges,
  visibleGraph,
  type DependencyGraph,
  type GraphEdge,
  type GraphNode,
} from './dependency-graph';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  groupNodeId,
  groupSlot,
  layoutBoxes,
  type LayoutBox,
  type LayoutRequest,
  COMPONENT_BOX,
  TABLE_BOX,
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
  box?: {
    id: string;
    label: string;
    count: number;
    // Folder boxes: the folder.
    folder: string | null;
    // Drawn as one node; `toggle`: can be opened and closed.
    collapsed: boolean;
    toggle: boolean;
  };
};
type FlowNode = Node<FlowNodeData>;

// Boxes with more members than this start closed (one node per folder, one
// node for all tables, one for COM) so the whole project reads at a glance;
// small corpora open with everything drawn.
export const AUTO_OPEN_MEMBERS = 40;
const SEARCH_RESULTS = 8;

// Opens or closes a box (folder, tables, COM) from inside its node.
const BoxToggle = createContext<(box: string) => void>(() => undefined);

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

// What one layout draws: the visible graph, the boxes drawn closed and
// whether common modules are shown.
type Drawn = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  closed: ReadonlySet<string>;
  common: boolean;
};

// The box a node belongs to and can be drawn in: its folder for programs
// and own files, the table or COM box; null for shared files.
function boxOf(node: GraphNode): string | null {
  if (
    (node.kind === 'program' || node.kind === 'own-module') &&
    node.group !== null
  )
    return groupNodeId(node.group);
  if (node.kind === 'table') return TABLE_BOX;
  if (node.kind === 'component') return COMPONENT_BOX;
  return null;
}

// The node a graph node is drawn in: its box when the box is closed.
function drawnAs(drawn: Drawn) {
  return (node: GraphNode) => {
    const box = boxOf(node);
    return box !== null && drawn.closed.has(box) ? box : node.id;
  };
}

// Boxes open at first: those with few enough members.
function initiallyOpen(graph: DependencyGraph): Set<string> {
  const sizes = new Map<string, number>();
  for (const node of graph.nodes) {
    const box = boxOf(node);
    if (box !== null && node.kind !== 'own-module')
      sizes.set(box, (sizes.get(box) ?? 0) + 1);
  }
  const small = graph.programs <= AUTO_OPEN_MEMBERS;
  return new Set(
    [...sizes]
      .filter(([box, size]) =>
        box.startsWith('folder:') ? small : size <= AUTO_OPEN_MEMBERS,
      )
      .map(([box]) => box),
  );
}

function allBoxes(graph: DependencyGraph): string[] {
  return [
    ...graph.groups.map((group) => groupNodeId(group.id)),
    TABLE_BOX,
    COMPONENT_BOX,
  ];
}

function GraphTab({ graph }: { graph: DependencyGraph }) {
  const { messages } = useLocale();
  const copy = messages.assessment.dashboard.graph;
  const number = useNumber();
  const flow = useReactFlow();
  const [showCommon, setShowCommon] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() =>
    initiallyOpen(graph),
  );
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  // The box opened or closed last: brought into view and outlined so the
  // reader sees what changed without searching for it.
  const [recent, setRecent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Each request remembers what it draws; the canvas shows the one whose
  // layout finished last, so nodes and positions always match.
  const displays = useRef(new Map<LayoutRequest, Drawn>());
  const request = useMemo(() => {
    const visible = visibleGraph(graph, showCommon);
    const closed = new Set(allBoxes(graph).filter((box) => !open.has(box)));
    const next = layoutRequest(graph, visible.nodes, visible.edges, closed);
    displays.current.set(next, { ...visible, closed, common: showCommon });
    // Keep the last few only.
    for (const old of [...displays.current.keys()].slice(0, -4))
      displays.current.delete(old);
    return next;
  }, [graph, showCommon, open]);
  const layoutState = useGraphLayout(request);
  const layout = layoutState.layout;
  const drawn: Drawn | null = layout
    ? (displays.current.get(layout.request) ?? null)
    : null;
  const commonCount = graph.nodes.filter((node) => node.common).length;

  const byId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph],
  );
  const focusedNode = focus ? (byId.get(focus) ?? null) : null;
  const linked = useMemo(() => {
    if (!focus || !drawn) return null;
    const draw = drawnAs(drawn);
    return new Set(
      [...neighbourhood(drawn.edges, focus)].map((id) => {
        const node = byId.get(id);
        return node ? draw(node) : id;
      }),
    );
  }, [drawn, focus, byId]);

  const toggleBox = useCallback((box: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(box)) next.delete(box);
      else next.add(box);
      return next;
    });
    setRecent(box);
    setPendingReveal(box);
  }, []);
  const setAllBoxes = (value: boolean) => {
    setOpen(new Set(value ? allBoxes(graph) : []));
    setRecent(null);
  };
  const boxes = useMemo(() => presentBoxes(graph), [graph]);
  const openBoxes = boxes.filter((box) => open.has(box));

  // Brings a revealed node into view once the layout that draws it is on
  // screen (React Flow takes new nodes on its next frame). A box exists
  // open and closed: wait for the layout that draws it as asked.
  useEffect(() => {
    if (!pendingReveal || !drawn) return;
    if (
      boxes.includes(pendingReveal) &&
      drawn.closed.has(pendingReveal) === open.has(pendingReveal)
    )
      return;
    const frame = requestAnimationFrame(() => {
      if (!flow.getNode(pendingReveal)) return;
      void flow.fitView({
        nodes: [{ id: pendingReveal }],
        maxZoom: 1,
        padding: 0.15,
        duration: reducedMotion() ? 0 : 250,
      });
      setPendingReveal(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingReveal, drawn, flow, boxes, open]);

  // Full screen: the same tab drawn over the page (nothing remounts), page
  // scroll locked, the graph fitted to the new size.
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);
  // Esc also works once the focused element is gone (a folder that opened
  // replaces the button that was clicked).
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
    (id: string) => setFocus((current) => (current === id ? null : id)),
    [],
  );
  // From the search, the panel or the table: focuses the node, shows it
  // (opening its folder, showing common modules) and brings it into view.
  const reveal = useCallback(
    (id: string) => {
      const node = byId.get(id);
      setFocus(id);
      if (node?.common) setShowCommon(true);
      const box = node ? boxOf(node) : null;
      if (box !== null)
        setOpen((current) =>
          current.has(box) ? current : new Set([...current, box]),
        );
      setPendingReveal(id);
    },
    [byId],
  );

  // Esc clears the focus first, then leaves full screen (handled on the
  // window while full screen).
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || expanded) return;
    setFocus(null);
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
        className={`dep-graph-tab${expanded ? ' dep-graph-expanded' : ''}`}
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
            <GraphSearch graph={graph} copy={copy} onPick={reveal} />
            {openBoxes.length > 0 && (
              <ul className="dep-open-boxes" aria-label={copy.openBoxes}>
                <li className="muted">{copy.openBoxes}:</li>
                {openBoxes.map((box) => (
                  <li
                    key={box}
                    className={`dep-open-box${box === recent ? ' recent' : ''}`}
                  >
                    <button
                      type="button"
                      className="dep-open-box-name mono"
                      aria-label={copy.showBox(boxName(box, copy))}
                      onClick={() => {
                        setRecent(box);
                        setPendingReveal(box);
                      }}
                    >
                      {boxName(box, copy)}
                    </button>
                    <button
                      type="button"
                      className="dep-open-box-close"
                      aria-label={copy.collapseBox(boxName(box, copy))}
                      onClick={() => toggleBox(box)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <span className="dep-graph-actions">
              {commonCount > 0 && (
                <label
                  className="dep-graph-toggle"
                  title={copy.showCommonTitle}
                >
                  <input
                    type="checkbox"
                    checked={showCommon}
                    onChange={(event) =>
                      setShowCommon(event.currentTarget.checked)
                    }
                  />
                  {copy.showCommon(number(commonCount))}
                </label>
              )}
              <IconButton
                label={copy.expandAll}
                onClick={() => setAllBoxes(true)}
                path="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 12h6M12 9v6"
              />
              <IconButton
                label={copy.collapseAll}
                onClick={() => setAllBoxes(false)}
                path="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5M9 12h6"
              />
              <IconButton
                label={expanded ? copy.exitFullScreen : copy.fullScreen}
                pressed={expanded}
                onClick={() => setExpanded((value) => !value)}
                path={
                  expanded
                    ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
                    : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
                }
              />
            </span>
          </div>
          <BoxToggle.Provider value={toggleBox}>
            <GraphCanvas
              graph={graph}
              drawn={drawn}
              positions={layout?.positions ?? null}
              byId={byId}
              focus={focus}
              linked={linked}
              recent={recent}
              pending={layoutState.pending}
              failed={layoutState.failed}
              onFocus={toggleFocus}
              onClear={() => setFocus(null)}
            />
          </BoxToggle.Provider>
          <p className="dep-graph-caption muted">
            <span data-testid="graph-summary">
              {copy.summary(
                number(graph.nodes.length),
                number(graph.edges.length),
                number(graph.calls),
              )}{' '}
              · {copy.tableView[graph.tableView]}
            </span>
            <span aria-label={copy.lanesLabel}>
              {copy.lanes.program} → {copy.lanes.own} → {copy.lanes.shared} →{' '}
              {copy.lanes.tables}
            </span>
          </p>
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

// A square toolbar button: an icon, its name as label and tooltip.
function IconButton({
  label,
  path,
  pressed,
  onClick,
}: {
  label: string;
  path: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="dep-icon-button"
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );
}

// The graph is rendered into one element that stays in the page, or moves
// to <body> for full screen (a fixed overlay inside the page would be
// clipped by the panels around it). Moving the element, not the React
// tree, keeps the canvas and its layout mounted.
function useFloatingHost(floating: boolean) {
  const slot = useRef<HTMLDivElement>(null);
  const [host] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    const parent = floating ? document.body : slot.current;
    parent?.appendChild(host);
  }, [floating, host]);
  useLayoutEffect(() => () => host.remove(), [host]);
  return { slot, host };
}

// Boxes that have members in this graph (no table box without tables).
function presentBoxes(graph: DependencyGraph): string[] {
  const present = new Set<string>();
  for (const node of graph.nodes) {
    const box = boxOf(node);
    if (box !== null) present.add(box);
  }
  return allBoxes(graph).filter((box) => present.has(box));
}

// Name of a box in the "open" list: its folder, or the tables/COM box.
function boxName(box: string, copy: Copy): string {
  if (box === TABLE_BOX) return copy.kinds.table;
  if (box === COMPONENT_BOX) return copy.kinds.component;
  const folder = box.slice(groupNodeId('').length);
  return folder === '' ? copy.rootGroup : folder;
}

function boxLabel(box: LayoutBox, copy: Copy): string {
  if (box.kind === 'tables') return copy.kinds.table;
  if (box.kind === 'components') return copy.kinds.component;
  const folder = box.folder === '' ? copy.rootGroup : box.folder;
  return box.kind === 'own' ? `${folder} · ${copy.lanes.own}` : folder;
}

function toFlowBox(
  box: LayoutBox,
  copy: Copy,
): NonNullable<FlowNodeData['box']> {
  const folderBox = box.kind === 'programs';
  return {
    label: boxLabel(box, copy),
    count: folderBox
      ? box.members.filter((node) => node.kind === 'program').length
      : box.members.length,
    id: box.id,
    folder: folderBox ? box.folder : null,
    collapsed: box.collapsed,
    toggle: box.kind !== 'own',
  };
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
  for (const box of layoutBoxes(graph, drawn.nodes, drawn.closed)) {
    nodes.push({
      id: box.id,
      type: 'box',
      position: positions.get(box.id) ?? { x: 0, y: 0 },
      width: box.width,
      height: box.height,
      data: {
        node: null,
        focused: false,
        box: toFlowBox(box, copy),
      },
      selectable: false,
      draggable: false,
      focusable: false,
    });
    if (box.collapsed) {
      for (const node of box.members) boxed.add(node.id);
      continue;
    }
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

function flowEdge(
  edge: {
    id: string;
    kind: GraphEdge['kind'];
    source: string;
    target: string;
  },
  opened = false,
): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // Resting edges are thin and faint whatever they merge; an edge that
    // starts or ends in an open folder is drawn as "opened".
    className: `dep-edge dep-edge-${edge.kind}${opened ? ' dep-edge-opened' : ''}`,
    focusable: false,
    selectable: false,
    // Hundreds of edges would flood screen readers; the search and the
    // focus card carry the relations.
    domAttributes: { 'aria-hidden': true },
  };
}

// Whether a drawn node is an open folder or sits in one. Only folders
// count: the table and COM boxes are targets that open on their own when
// small, and their edges would read as "opened" with every folder closed.
function inOpenFolder(drawn: Drawn, byId: Map<string, GraphNode>) {
  return (id: string) => {
    const node = byId.get(id);
    const box = node ? boxOf(node) : id;
    return box !== null && box.startsWith('folder:') && !drawn.closed.has(box);
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
  byId,
  focus,
  linked,
  recent,
  pending,
  failed,
  onFocus,
  onClear,
}: {
  graph: DependencyGraph;
  drawn: Drawn | null;
  positions: Map<string, Point> | null;
  byId: Map<string, GraphNode>;
  focus: string | null;
  linked: Set<string> | null;
  recent: string | null;
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
  const baseEdges = useMemo(() => {
    if (!drawn) return [];
    const opened = inOpenFolder(drawn, byId);
    return restingEdges(drawn.nodes, drawn.edges, folderOf, drawnAs(drawn)).map(
      (edge) => flowEdge(edge, opened(edge.source) || opened(edge.target)),
    );
  }, [drawn, byId]);
  const nodes = useMemo(
    () =>
      baseNodes.map((node) => {
        if (node.id === recent) return { ...node, className: 'recent' };
        if (!linked || node.type === 'box' || !linked.has(node.id)) return node;
        return {
          ...node,
          className: node.id === focus ? 'focused linked' : 'linked',
          data: { ...node.data, focused: node.id === focus },
        };
      }),
    [baseNodes, linked, focus, recent],
  );
  // Focus draws the node's own edges over the resting ones (which dim).
  // A node inside a collapsed folder is drawn as the folder: its edges
  // start or end there.
  const edges = useMemo(() => {
    if (!focus || !drawn) return baseEdges;
    const draw = drawnAs(drawn);
    const related = new Map<string, Edge>();
    for (const edge of drawn.edges) {
      if (edge.source !== focus && edge.target !== focus) continue;
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      const from = draw(source);
      const to = draw(target);
      if (from === to) continue;
      const id =
        from === edge.source && to === edge.target
          ? edge.id
          : `${edge.kind}|${from}|${to}`;
      if (related.has(id)) continue;
      const base = flowEdge({ ...edge, id, source: from, target: to });
      related.set(id, {
        ...base,
        className: `${base.className ?? ''} linked`,
        label: edgeLabel(edge, copy, number),
        zIndex: 1,
      });
    }
    return [
      ...baseEdges.filter((edge) => !related.has(edge.id)),
      ...related.values(),
    ];
  }, [baseEdges, drawn, focus, byId, copy, number]);
  const toggleBox = useContext(BoxToggle);
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
          // Showing or hiding common modules fits the view again; opening a
          // folder keeps it.
          key={drawn.common ? 'all' : 'hidden'}
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
            else if (node.data.box?.collapsed) toggleBox(node.data.box.id);
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
  const toggleBox = useContext(BoxToggle);
  const box = data.box;
  if (!box) return null;
  const count =
    box.folder !== null
      ? copy.groupCount(number(box.count))
      : copy.boxCount(number(box.count));
  // A collapsed folder is one button (its click reaches the node, which
  // opens it); an open folder has a button to close it again. Merged edges
  // of a folder leave from its right side.
  if (box.collapsed)
    return (
      <div className="dep-node dep-node-folder">
        <Handle type="target" position={Position.Left} isConnectable={false} />
        <button
          type="button"
          className="dep-node-button"
          aria-label={
            box.folder !== null
              ? copy.expandFolder(box.label, count)
              : copy.expandBox(box.label, count)
          }
        >
          <span className="dep-node-type">
            {box.folder !== null ? copy.folderType : box.label} · {count}
          </span>
          <span className="dep-node-label mono">{box.label}</span>
        </button>
        <Handle type="source" position={Position.Right} isConnectable={false} />
      </div>
    );
  return (
    <div className="dep-folder">
      <span className="dep-folder-label mono">{box.label}</span>
      <span className="muted">{count}</span>
      {box.toggle && (
        <button
          type="button"
          className="link-button dep-folder-close"
          aria-label={
            box.folder !== null
              ? copy.collapseFolder(box.label)
              : copy.collapseBox(box.label)
          }
          onClick={(event) => {
            event.stopPropagation();
            toggleBox(box.id);
          }}
        >
          {copy.collapse}
        </button>
      )}
      {box.folder !== null && (
        <Handle type="source" position={Position.Right} isConnectable={false} />
      )}
    </div>
  );
});

// Exact name first, then names starting with the text, then the rest.
function searchRank(node: GraphNode, text: string): number {
  const label = node.label.toLowerCase();
  return label === text ? 0 : label.startsWith(text) ? 1 : 2;
}

// Finds a program, file, table or COM reference by name or path and
// reveals it.
function GraphSearch({
  graph,
  copy,
  onPick,
}: {
  graph: DependencyGraph;
  copy: Copy;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const text = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      text === ''
        ? []
        : graph.nodes
            .filter(
              (node) =>
                node.label.toLowerCase().includes(text) ||
                node.detail.toLowerCase().includes(text),
            )
            .sort(
              (a, b) =>
                searchRank(a, text) - searchRank(b, text) ||
                b.fanIn - a.fanIn ||
                a.label.localeCompare(b.label),
            )
            .slice(0, SEARCH_RESULTS),
    [graph, text],
  );
  return (
    <div className="dep-graph-search">
      <input
        type="search"
        aria-label={copy.search}
        placeholder={copy.search}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {text !== '' && (
        <ul className="dep-search-results" aria-label={copy.searchResults}>
          {matches.length === 0 && <li className="muted">{copy.searchNone}</li>}
          {matches.map((node) => (
            <li key={node.id}>
              <button
                className="dep-search-item"
                onClick={() => {
                  onPick(node.id);
                  setQuery('');
                }}
              >
                <span className="dep-node-type">{copy.kinds[node.kind]}</span>{' '}
                <span className="mono">{node.label}</span>{' '}
                <span className="muted mono">{node.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
