import { describe, expect, it } from 'vitest';
import ELK from 'elkjs/lib/elk.bundled.js';
import { syntheticCorpusFixture } from '@portal/contracts/fixtures';
import { buildDependencyGraph, LANE, visibleGraph } from './dependency-graph';
import {
  NODE_WIDTH,
  groupGrid,
  groupNodeId,
  groupSlot,
  laneLayout,
  layoutBoxes,
  layoutRequest,
  readLayout,
  type LayoutRequest,
  type Point,
} from './dependency-graph-layout';

const corpus = syntheticCorpusFixture({
  programs: 60,
  sharedModules: 8,
  tables: 20,
  folders: 4,
});
const graph = buildDependencyGraph(corpus);
const drawn = visibleGraph(graph, false);
const request = layoutRequest(graph, drawn.nodes, drawn.edges);

// Lane of a top-level box, from the partition the request gives ELK.
const laneOf = (id: string): number => {
  const child = request.children.find((value) => value.id === id);
  if (!child) throw new Error(id);
  return Number(child.layoutOptions?.['elk.partitioning.partition']);
};

// Every box of a lane lies right of every box of the lanes before it.
function expectLanes(positions: Map<string, Point>, input: LayoutRequest) {
  const extent = new Map<number, { min: number; max: number }>();
  for (const child of input.children) {
    const point = positions.get(child.id);
    if (!point) throw new Error(`no position for ${child.id}`);
    const lane = laneOf(child.id);
    const current = extent.get(lane) ?? { min: Infinity, max: -Infinity };
    extent.set(lane, {
      min: Math.min(current.min, point.x),
      max: Math.max(current.max, point.x + child.width),
    });
  }
  const lanes = [...extent.keys()].sort();
  expect(lanes).toEqual([0, 1, 2, 3]);
  for (let index = 1; index < lanes.length; index++) {
    const before = extent.get(lanes[index - 1] ?? 0);
    const after = extent.get(lanes[index] ?? 0);
    expect(after?.min).toBeGreaterThan(before?.max ?? Infinity);
  }
}

describe('UI03 layout request', () => {
  it('boxes programs and own files by folder, tables and COM apart', () => {
    const boxes = layoutBoxes(graph, drawn.nodes);
    expect(boxes.map((box) => box.kind).sort()).toEqual(
      [
        ...graph.groups.flatMap(() => ['programs', 'own']),
        'tables',
        'components',
      ].sort(),
    );
    for (const box of boxes)
      for (const node of box.members) expect(LANE[node.kind]).toBe(box.lane);
    // Shared files are the only nodes ELK places one by one.
    const shared = drawn.nodes.filter((node) => node.kind === 'shared-module');
    expect(request.children).toHaveLength(boxes.length + shared.length);
    const boxed = boxes.reduce((sum, box) => sum + box.members.length, 0);
    expect(boxed + shared.length).toBe(drawn.nodes.length);
    expect(laneOf(groupNodeId(graph.groups[0]?.id ?? ''))).toBe(0);
    // One layout edge per (box, target); never backwards across lanes.
    const ids = new Set(request.edges.map((edge) => edge.id));
    expect(ids.size).toBe(request.edges.length);
    for (const edge of request.edges)
      expect(laneOf(edge.sources[0] ?? '')).toBeLessThanOrEqual(
        laneOf(edge.targets[0] ?? ''),
      );
  });

  it('places programs in a grid inside their folder box', () => {
    expect(groupGrid(1).columns).toBe(1);
    expect(groupGrid(30).columns).toBe(6);
    const grid = groupGrid(5);
    const last = groupSlot(4, grid.columns);
    expect(last.x + NODE_WIDTH).toBeLessThanOrEqual(grid.width);
    expect(groupSlot(1, 2).y).toBe(groupSlot(0, 2).y);
  });

  it('lays out in four lanes with ELK, as the worker does', async () => {
    const result = await new ELK().layout(request);
    const positions = readLayout(result, request);
    expect(positions).not.toBeNull();
    if (positions) expectLanes(positions, request);
  });

  it('keeps the same lanes without ELK', () => {
    expectLanes(laneLayout(request), request);
  });

  it('rejects a worker answer that is not a full layout', () => {
    expect(readLayout(null, request)).toBeNull();
    expect(
      readLayout({ children: [{ id: 'x', x: 'a', y: 0 }] }, request),
    ).toBeNull();
    expect(readLayout({ children: [] }, request)).toBeNull();
    const full = {
      children: request.children.map((child) => ({ id: child.id, x: 1, y: 2 })),
    };
    expect(readLayout(full, request)?.size).toBe(request.children.length);
  });
});
