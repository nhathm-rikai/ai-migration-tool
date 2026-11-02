import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syntheticCorpusFixture } from '@portal/contracts/fixtures';
import { buildDependencyGraph, visibleGraph } from './dependency-graph';
import { layoutRequest } from './dependency-graph-layout';
import { LAYOUT_TIMEOUT_MS, useGraphLayout } from './use-graph-layout';

// The ELK worker as the page sees it: elkjs posts commands and reads
// `onmessage`; nothing in elkjs listens for `error`.
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  static answer: ((message: unknown, worker: FakeWorker) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  terminated = false;
  constructor() {
    super();
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    FakeWorker.answer?.(message, this);
  }
  terminate() {
    this.terminated = true;
  }
}

class BlockedWorker {
  constructor() {
    throw new DOMException('blocked', 'SecurityError');
  }
}

const corpus = syntheticCorpusFixture({
  programs: 12,
  sharedModules: 3,
  tables: 5,
});
const graph = buildDependencyGraph(corpus);
const drawn = visibleGraph(graph, true);
const request = layoutRequest(graph, drawn.nodes, drawn.edges);

afterEach(() => {
  FakeWorker.instances = [];
  FakeWorker.answer = null;
  vi.useRealTimers();
});

describe('UI03 layout worker failures', () => {
  it('uses the ELK answer of a working worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.answer = (message, worker) => {
      if (
        typeof message !== 'object' ||
        message === null ||
        !('cmd' in message) ||
        message.cmd !== 'layout' ||
        !('id' in message)
      )
        return;
      const data = {
        children: request.children.map((child) => ({
          id: child.id,
          x: 5,
          y: 7,
        })),
      };
      worker.onmessage?.({ data: { id: message.id, data } });
    };
    const { result } = renderHook(() => useGraphLayout(request));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.failed).toBe(false);
    expect(
      result.current.layout?.positions.get(request.children[0]?.id ?? ''),
    ).toEqual({ x: 5, y: 7 });
  });

  it('falls back when the worker cannot be created', async () => {
    vi.stubGlobal('Worker', BlockedWorker);
    const { result } = renderHook(() => useGraphLayout(request));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.layout?.positions.size).toBe(request.children.length);
  });

  it('falls back and stops the worker when its script fails to load', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { result } = renderHook(() => useGraphLayout(request));
    expect(result.current.pending).toBe(true);
    const worker = FakeWorker.instances[0];
    if (!worker) throw new Error('no worker');
    act(() => {
      worker.dispatchEvent(new Event('error'));
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.layout?.positions.size).toBe(request.children.length);
    expect(worker.terminated).toBe(true);
  });

  it('falls back when the layout never answers, and clears its timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    const { result, unmount } = renderHook(() => useGraphLayout(request));
    expect(result.current.pending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LAYOUT_TIMEOUT_MS);
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.failed).toBe(true);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the worker and its timer on unmount', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    const { unmount } = renderHook(() => useGraphLayout(request));
    unmount();
    expect(FakeWorker.instances.every((worker) => worker.terminated)).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
