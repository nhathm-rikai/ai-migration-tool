import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVE_RUN_STATUSES,
  FIXTURE_SOURCE_REVISION,
  type Run,
  type RunStatus,
  type StartRunInput,
} from '@portal/contracts';
import { ApiError } from '../../shared/api/api-error';
import type { RunsApi } from '../../shared/api/runs-api';
import { hasErrorCode } from './run-messages';

// Run state of one project (F02). Every effect only reads (GET); Start,
// Cancel and Retry happen on explicit user actions. The component is keyed by
// project, so switching projects aborts every request of the previous one.

export const RUN_POLL_INTERVAL_MS = 1000;
export const RUN_POLL_MAX_INTERVAL_MS = 8000;

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
  return Date.parse(incoming.updatedAt) >= Date.parse(existing.updatedAt)
    ? incoming
    : existing;
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

function startInput(retryOfRunId: string | null): StartRunInput {
  // Every project is a demo project on the bundled source until B03.
  const source = {
    strategy: 'current-source',
    expectedSourceRevision: FIXTURE_SOURCE_REVISION,
  } as const;
  return retryOfRunId === null
    ? { kind: 'analyze', source, retryOfRunId: null }
    : { kind: 'analyze', source, retryOfRunId };
}

export function useAnalyzeRuns(
  api: RunsApi,
  projectId: string,
  newKey: () => string = () => crypto.randomUUID(),
) {
  const [state, setState] = useState<RunsState>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);
  const [action, setAction] = useState<RunAction>({ status: 'idle' });
  // A Start whose outcome is unknown: retried with the same key.
  const [uncertainStart, setUncertainStart] = useState(false);
  const intent = useRef<StartIntent | null>(null);
  const busy = useRef(false);
  const loaded = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const apply = useCallback((run: Run) => {
    setState((previous) =>
      previous.status === 'ready'
        ? { ...previous, current: newerRun(previous.current, run) }
        : previous,
    );
  }, []);

  // Current run + first history page; again after every explicit reload.
  useEffect(() => {
    const controller = new AbortController();
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
            current: current.run ? newerRun(known, current.run) : known,
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
  }, [api, projectId, reload]);

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
      timer = setTimeout(() => {
        api.get(projectId, tracked, controller.signal).then(
          (run) => {
            if (controller.signal.aborted) return;
            setConnectionLost(false);
            delay = RUN_POLL_INTERVAL_MS;
            apply(run);
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
      }, delay);
    };
    schedule();
    return () => {
      controller.abort();
      clearTimeout(timer);
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
    start: () =>
      sendStart(intent.current ?? { key: newKey(), input: startInput(null) }),
    // Business retry: always a new run with a new key.
    retry: (runId: string) =>
      sendStart({ key: newKey(), input: startInput(runId) }),
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
