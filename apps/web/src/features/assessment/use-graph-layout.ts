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
// the lane layout is used at once; when the worker fails the lane layout is
// shown with `failed` so the page can say so.

export type GraphLayoutState = {
  pending: boolean;
  failed: boolean;
  layout: { request: LayoutRequest; positions: Map<string, Point> } | null;
};

function createElk(): ElkApi | null {
  if (typeof Worker === 'undefined') return null;
  return new ELK({ workerFactory: () => new Worker(elkWorkerUrl) });
}

export function useGraphLayout(request: LayoutRequest): GraphLayoutState {
  const [state, setState] = useState<GraphLayoutState>({
    pending: true,
    failed: false,
    layout: null,
  });
  const elkRef = useRef<ElkApi | null>(null);

  useEffect(() => {
    const elk = createElk();
    elkRef.current = elk;
    return () => {
      elk?.terminateWorker();
      elkRef.current = null;
    };
  }, []);

  useEffect(() => {
    const elk = elkRef.current;
    if (!elk) {
      setState({
        pending: false,
        failed: false,
        layout: { request, positions: laneLayout(request) },
      });
      return;
    }
    let current = true;
    setState((previous) => ({ ...previous, pending: true }));
    // Failures are caught into the lane layout below; nothing is left
    // to reject.
    void elk
      .layout(request)
      .then((result: unknown) => readLayout(result, request))
      .catch(() => null)
      .then((positions) => {
        if (!current) return;
        setState(
          positions
            ? { pending: false, failed: false, layout: { request, positions } }
            : {
                pending: false,
                failed: true,
                layout: { request, positions: laneLayout(request) },
              },
        );
      });
    return () => {
      current = false;
    };
  }, [request]);

  return state;
}
