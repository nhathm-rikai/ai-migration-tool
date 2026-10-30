import { useEffect, useRef, useState } from 'react';
import ELK, { type ELK as ElkApi } from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import {
  laneLayout,
  readLayout,
  type LayoutRequest,
  type Point,
} from './dependency-graph-layout';

// Runs the ELK layout of one request in ELK's own Web Worker (the API
// object on the page only passes messages) and keeps the last finished
// layout on screen while a newer one runs (toggling common modules).
// Answers for an older request are dropped. Without Worker support (tests)
// the lane layout is used at once. elkjs never rejects when its worker
// cannot be created, fails to load or crashes, so those are watched here,
// and a layout that does not answer in time also falls back: the lane
// layout is shown with `failed` so the page can say so.

export type GraphLayoutState = {
  pending: boolean;
  failed: boolean;
  layout: { request: LayoutRequest; positions: Map<string, Point> } | null;
};

export const LAYOUT_TIMEOUT_MS = 20_000;

type LayoutEngine = {
  elk: ElkApi;
  // Settles once the worker reports an error (load failure or crash).
  broken: Promise<void>;
  terminate: () => void;
};

// null: no Worker support. 'failed': the worker could not be created.
function createEngine(): LayoutEngine | null | 'failed' {
  if (typeof Worker === 'undefined') return null;
  let markBroken: () => void = () => undefined;
  const broken = new Promise<void>((resolve) => {
    markBroken = resolve;
  });
  const created: { worker?: Worker } = {};
  try {
    const elk = new ELK({
      workerFactory: () => {
        const worker = new Worker(elkWorkerUrl);
        created.worker = worker;
        worker.addEventListener('error', () => markBroken());
        return worker;
      },
    });
    return {
      elk,
      broken,
      terminate: () => elk.terminateWorker(),
    };
  } catch {
    created.worker?.terminate();
    return 'failed';
  }
}

export function useGraphLayout(request: LayoutRequest): GraphLayoutState {
  const [state, setState] = useState<GraphLayoutState>({
    pending: true,
    failed: false,
    layout: null,
  });
  const engineRef = useRef<LayoutEngine | null | 'failed'>(null);

  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    return () => {
      if (engine && engine !== 'failed') engine.terminate();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    const fallBack = (failed: boolean) =>
      setState({
        pending: false,
        failed,
        layout: { request, positions: laneLayout(request) },
      });
    if (!engine || engine === 'failed') {
      fallBack(engine === 'failed');
      return;
    }
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LAYOUT_TIMEOUT_MS);
    });
    setState((previous) => ({ ...previous, pending: true }));
    // Every branch settles to positions or null; nothing is left to reject.
    void Promise.race([
      engine.elk
        .layout(request)
        .then((result: unknown) => readLayout(result, request))
        .catch(() => null),
      engine.broken.then(() => null),
      timedOut,
    ]).then((positions) => {
      clearTimeout(timer);
      if (!current) return;
      if (!positions) {
        // A worker that broke or hangs answers nothing more: stop it and
        // let later requests use the lane layout.
        engine.terminate();
        engineRef.current = 'failed';
        fallBack(true);
        return;
      }
      setState({
        pending: false,
        failed: false,
        layout: { request, positions },
      });
    });
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [request]);

  return state;
}
