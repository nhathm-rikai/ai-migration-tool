import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVE_RUN_STATUSES,
  RunSchema,
  type Run,
  type RunEvent,
  type RunProgress,
  type RunStatus,
  type StartRunInput,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { ApiError } from '../../shared/api/api-error';
import type { RunsApi } from '../../shared/api/runs-api';
import { hasErrorCode } from './run-messages';

// Run state of one project (F02). Every effect only reads (GET); Start,
// Cancel and Retry happen on explicit user actions. The component is keyed by
// project, so switching projects aborts every request of the previous one.

export const RUN_POLL_INTERVAL_MS = 1000;
export const RUN_POLL_MAX_INTERVAL_MS = 8000;
// Reconnects of a broken event stream before polling alone remains.
export const RUN_EVENT_MAX_RECONNECTS = 5;
const PROGRESS_PHASES: readonly RunProgress['phase'][] = [
  'listing',
  'snapshot',
  'inventory',
  'publish',
];

function progressRegresses(previous: RunProgress, next: RunProgress): boolean {
  const from = PROGRESS_PHASES.indexOf(previous.phase);
  const to = PROGRESS_PHASES.indexOf(next.phase);
  return (
    to < from ||
    (to === from &&
      (next.filesSnapshotted < previous.filesSnapshotted ||
        next.filesAnalyzed < previous.filesAnalyzed ||
        next.bytesDone < previous.bytesDone ||
        (previous.filesTotal !== null && next.filesTotal === null)))
  );
}

export function isActiveRun(status: RunStatus): boolean {
  return (ACTIVE_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

// Keeps the newer of two views of the project's current run: a newer run
// wins, then a higher stateVersion, then a later updatedAt. A stale GET never
// overwrites what a newer response already showed.
export function newerRun(existing: Run | null, incoming: Run): Run {
  if (!existing) return incoming;
  if (existing.id !== incoming.id)
    return Date.parse(incoming.createdAt) >= Date.parse(existing.createdAt)
      ? incoming
      : existing;
  if (existing.stateVersion !== incoming.stateVersion)
    return incoming.stateVersion > existing.stateVersion ? incoming : existing;
  // Progress changes do not increment stateVersion/updatedAt. Retain the
  // whole report together so phase, counts, paths and percentage agree.
  if (
    existing.progress &&
    (!incoming.progress ||
      progressRegresses(existing.progress, incoming.progress))
  )
    return existing;
  return Date.parse(incoming.updatedAt) >= Date.parse(existing.updatedAt)
    ? incoming
    : existing;
}

// The run with the stage and progress of an event of the same version, or
// null when the result would not be a valid run.
export function withEvent(run: Run, event: RunEvent): Run | null {
  const next: Record<string, unknown> = { ...run, stage: event.stage };
  if (event.progress) next.progress = event.progress;
  else delete next.progress;
  return Check(RunSchema, next) ? next : null;
}

type RunsState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | {
      status: 'ready';
      current: Run | null;
      history: Run[];
      nextCursor: string | null;
    };

export type RunAction =
  | { status: 'idle' }
  | { status: 'pending'; kind: 'start' | 'cancel' | 'more' }
  | { status: 'error'; kind: 'start' | 'cancel' | 'more'; error: unknown };

// One Start intent: the same key and body for every HTTP retry of it.
type StartIntent = { key: string; input: StartRunInput };

function startInput(
  sourceRevision: number,
  retryOfRunId: string | null,
): StartRunInput {
  // The source revision the user sees; a newer one answers 409.
  const source = {
    strategy: 'current-source',
    expectedSourceRevision: sourceRevision,
  } as const;
  return retryOfRunId === null
    ? { kind: 'analyze', source, retryOfRunId: null }
    : { kind: 'analyze', source, retryOfRunId };
}

export function useAnalyzeRuns(
  api: RunsApi,
  projectId: string,
  // null: no startable source (unregistered or unreadable); Start is refused.
  sourceRevision: number | null,
  newKey: () => string = () => crypto.randomUUID(),
) {
  const [state, setState] = useState<RunsState>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);
  const [action, setAction] = useState<RunAction>({ status: 'idle' });
  // A Start whose outcome is unknown: retried with the same key.
  const [uncertainStart, setUncertainStart] = useState(false);
  const intent = useRef<StartIntent | null>(null);
  // The event stream of the active run is open (polling slows down).
  const streaming = useRef(false);
  const eventGeneration = useRef(0);
  // The current run as last shown, for comparing incoming events.
  const latest = useRef<Run | null>(null);
  useEffect(() => {
    latest.current = state.status === 'ready' ? state.current : null;
  });
  const busy = useRef(false);
  const loaded = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const merge = useCallback(
    (known: Run | null, run: Run, readGeneration?: number) => {
      // A GET captured before an accepted event cannot replace that report,
      // even when all timestamps/counters tie. New state versions still win
      // (in particular a terminal GET after a stream interruption).
      if (
        known?.id === run.id &&
        known.stateVersion === run.stateVersion &&
        readGeneration !== undefined &&
        readGeneration !== eventGeneration.current
      )
        return known;
      return newerRun(known, run);
    },
    [],
  );
  const apply = useCallback(
    (run: Run, readGeneration?: number) => {
      setState((previous) =>
        previous.status === 'ready'
          ? {
              ...previous,
              current: merge(previous.current, run, readGeneration),
            }
          : previous,
      );
    },
    [merge],
  );

  // Current run + first history page; again after every explicit reload.
  useEffect(() => {
    const controller = new AbortController();
    const readGeneration = eventGeneration.current;
    setState((previous) =>
      previous.status === 'ready' ? previous : { status: 'loading' },
    );
    void Promise.all([
      api.current(projectId, controller.signal),
      api.list(projectId, null, controller.signal),
    ]).then(
      ([current, page]) => {
        if (controller.signal.aborted) return;
        loaded.current = true;
        setConnectionLost(false);
        setState((previous) => {
          const known = previous.status === 'ready' ? previous.current : null;
          return {
            status: 'ready',
            current: current.run
              ? merge(known, current.run, readGeneration)
              : known,
            history: page.items,
            nextCursor: page.nextCursor,
          };
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // Keep what is shown: the run did not fail because a GET did.
        if (loaded.current) setConnectionLost(true);
        else setState({ status: 'error', error });
      },
    );
    return () => controller.abort();
  }, [api, projectId, reload, merge]);

  // Bounded polling of the active run: GET only, backoff on failure, stops at
  // a terminal state and on unmount/project switch.
  const tracked =
    state.status === 'ready' &&
    state.current &&
    isActiveRun(state.current.status)
      ? state.current.id
      : null;
  useEffect(() => {
    if (!tracked) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = RUN_POLL_INTERVAL_MS;
    const schedule = () => {
      // While the event stream is open, polling is only a slow safety net.
      const wait = streaming.current ? RUN_POLL_MAX_INTERVAL_MS : delay;
      timer = setTimeout(() => {
        const readGeneration = eventGeneration.current;
        api.get(projectId, tracked, controller.signal).then(
          (run) => {
            if (controller.signal.aborted) return;
            setConnectionLost(false);
            delay = RUN_POLL_INTERVAL_MS;
            apply(run, readGeneration);
            if (isActiveRun(run.status)) schedule();
            // Terminal: refresh the history once.
            else refresh();
          },
          () => {
            if (controller.signal.aborted) return;
            setConnectionLost(true);
            delay = Math.min(delay * 2, RUN_POLL_MAX_INTERVAL_MS);
            schedule();
          },
        );
      }, wait);
    };
    schedule();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, projectId, tracked, apply, refresh]);

  // Event stream of the active run (F05). An event of the shown version
  // updates stage and progress in place; a newer version is read back with
  // GET (the authoritative state); an older or foreign one is dropped. A
  // broken stream reconnects with backoff, a bounded number of times, and
  // the polling above covers the gap. Locale changes do not reconnect.
  useEffect(() => {
    if (!tracked) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const resync = () => {
      const readGeneration = eventGeneration.current;
      return api.get(projectId, tracked, controller.signal).then(
        (run) => {
          if (controller.signal.aborted) return;
          apply(run, readGeneration);
          if (!isActiveRun(run.status)) refresh();
        },
        () => undefined,
      );
    };
    let connection = 0;
    const onEvent = (event: RunEvent) => {
      if (controller.signal.aborted || event.runId !== tracked) return;
      streaming.current = true;
      attempts = 0;
      setConnectionLost(false);
      const shown = latest.current;
      if (!shown || shown.id !== event.runId) return;
      if (event.stateVersion < shown.stateVersion) return;
      eventGeneration.current++;
      if (event.stateVersion > shown.stateVersion) {
        void resync();
        return;
      }
      const patched = withEvent(shown, event);
      if (patched) apply(patched);
    };
    const connect = () => {
      const activeConnection = ++connection;
      // The backend resets sequence when its last subscriber disconnects.
      let sequence = 0;
      const receive = (event: RunEvent) => {
        if (
          activeConnection !== connection ||
          event.runId !== tracked ||
          event.sequence <= sequence
        )
          return;
        sequence = event.sequence;
        onEvent(event);
      };
      api.events(projectId, tracked, controller.signal, receive).then(
        () => {
          if (activeConnection !== connection) return;
          connection++;
          // Ended by the server: the run ended or the backend stops.
          streaming.current = false;
          if (!controller.signal.aborted) void resync();
        },
        () => {
          if (activeConnection !== connection) return;
          connection++;
          streaming.current = false;
          if (controller.signal.aborted) return;
          attempts++;
          if (attempts > RUN_EVENT_MAX_RECONNECTS) return;
          retry = setTimeout(
            connect,
            Math.min(
              RUN_POLL_INTERVAL_MS * 2 ** attempts,
              RUN_POLL_MAX_INTERVAL_MS,
            ),
          );
        },
      );
    };
    connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
      streaming.current = false;
    };
  }, [api, projectId, tracked, apply, refresh]);

  async function mutate<T>(
    kind: 'start' | 'cancel' | 'more',
    send: (signal: AbortSignal) => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> {
    // A double click never sends a second request.
    if (busy.current) return null;
    busy.current = true;
    const controller = new AbortController();
    mutation.current = controller;
    setAction({ status: 'pending', kind });
    try {
      const value = await send(controller.signal);
      if (controller.signal.aborted) return null;
      setAction({ status: 'idle' });
      return { ok: true, value };
    } catch (error) {
      if (controller.signal.aborted) return null;
      setAction({ status: 'error', kind, error });
      return { ok: false, error };
    } finally {
      busy.current = false;
    }
  }

  async function sendStart(next: StartIntent) {
    intent.current = next;
    const result = await mutate('start', (signal) =>
      api.start(projectId, next.key, next.input, signal),
    );
    if (!result) return;
    if (result.ok) {
      intent.current = null;
      setUncertainStart(false);
      apply(result.value);
      return;
    }
    const unknown =
      result.error instanceof ApiError && result.error.outcomeUnknown;
    // A definite answer ends the intent; an unknown one keeps its key.
    if (!unknown) intent.current = null;
    setUncertainStart(unknown);
    // The run may exist (unknown outcome) or another one is active.
    if (unknown || hasErrorCode(result.error, 'RUN_ACTIVE_CONFLICT')) refresh();
  }

  return {
    state,
    action,
    connectionLost,
    uncertainStart,
    refresh,
    // New run, or the same intent again while its outcome is unknown.
    // `revision` names a source just saved by the caller, before this hook
    // has re-rendered with it.
    async start(revision: number | null = sourceRevision) {
      // An intent whose outcome is unknown is resent exactly as it was.
      if (intent.current) return sendStart(intent.current);
      if (revision === null) return;
      return sendStart({
        key: newKey(),
        input: startInput(revision, null),
      });
    },
    // Business retry: always a new run with a new key.
    async retry(runId: string, revision: number | null = sourceRevision) {
      if (revision === null) return;
      return sendStart({
        key: newKey(),
        input: startInput(revision, runId),
      });
    },
    async cancel(run: Run) {
      const result = await mutate('cancel', async (signal) => {
        try {
          return await api.cancel(projectId, run.id, run.stateVersion, signal);
        } catch (error) {
          if (!hasErrorCode(error, 'RUN_STATE_CONFLICT')) throw error;
          // The shown version is stale (e.g. queued -> running meanwhile).
          // Read the run again; cancel once more only if it is still active.
          const fresh = await api.get(projectId, run.id, signal);
          if (!isActiveRun(fresh.status) || fresh.status === 'cancelling')
            return fresh;
          return api.cancel(projectId, run.id, fresh.stateVersion, signal);
        }
      });
      if (!result) return;
      if (result.ok) apply(result.value);
      else refresh();
    },
    async loadMore() {
      if (state.status !== 'ready' || !state.nextCursor) return;
      const cursor = state.nextCursor;
      const result = await mutate('more', (signal) =>
        api.list(projectId, cursor, signal),
      );
      if (!result?.ok) return;
      const page = result.value;
      setState((previous) =>
        previous.status === 'ready' && previous.nextCursor === cursor
          ? {
              ...previous,
              history: [
                ...previous.history,
                ...page.items.filter(
                  (item) => !previous.history.some((run) => run.id === item.id),
                ),
              ],
              nextCursor: page.nextCursor,
            }
          : previous,
      );
    },
  };
}

// History as shown: the known current run replaces its older copy, and a run
// newer than the loaded page is listed first.
export function visibleHistory(current: Run | null, history: Run[]): Run[] {
  if (!current) return history;
  const merged = history.map((run) =>
    run.id === current.id ? newerRun(run, current) : run,
  );
  return merged.some((run) => run.id === current.id)
    ? merged
    : [current, ...merged];
}

export type AnalyzeRunsControl = ReturnType<typeof useAnalyzeRuns>;
