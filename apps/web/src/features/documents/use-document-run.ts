import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DocumentLogEntry,
  DocumentRun,
  DocumentRunner,
  DocumentRuntimeStatus,
  StartDocumentRunInput,
} from '@portal/contracts';
import { ApiError } from '../../shared/api/api-error';
import type { DocumentsApi } from '../../shared/api/documents-api';
import {
  isActiveRun,
  RUN_POLL_INTERVAL_MS,
  RUN_POLL_MAX_INTERVAL_MS,
} from '../jobs/use-analyze-runs';
import { hasErrorCode } from '../jobs/run-messages';

// Document run state of one project (step 3). Effects only read (GET);
// Start and Cancel happen on explicit user actions. Polling reads the active
// run and its log; leaving the page never cancels the run (FE-03).

const MAX_LOG_LINES = 2000;

type State =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | {
      status: 'ready';
      run: DocumentRun | null;
      runner: DocumentRunner;
      runtime: DocumentRuntimeStatus;
      specPack: string;
    };

export type DocumentAction =
  | { status: 'idle' }
  | { status: 'pending'; kind: 'start' | 'cancel' }
  | { status: 'error'; kind: 'start' | 'cancel'; error: unknown };

// A newer run wins, then a higher stateVersion, then a later update.
function newer(
  existing: DocumentRun | null,
  incoming: DocumentRun,
): DocumentRun {
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

export function useDocumentRun(
  api: DocumentsApi,
  projectId: string,
  newKey: () => string = () => crypto.randomUUID(),
) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);
  const [action, setAction] = useState<DocumentAction>({ status: 'idle' });
  const [uncertainStart, setUncertainStart] = useState(false);
  const [log, setLog] = useState<{
    runId: string | null;
    items: DocumentLogEntry[];
  }>({
    runId: null,
    items: [],
  });
  const intent = useRef<{ key: string; input: StartDocumentRunInput } | null>(
    null,
  );
  const busy = useRef(false);
  const loaded = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const apply = useCallback((run: DocumentRun) => {
    setState((previous) =>
      previous.status === 'ready'
        ? { ...previous, run: newer(previous.run, run) }
        : previous,
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.current(projectId, controller.signal).then(
      (current) => {
        if (controller.signal.aborted) return;
        loaded.current = true;
        setConnectionLost(false);
        setState((previous) => {
          const known = previous.status === 'ready' ? previous.run : null;
          return {
            status: 'ready',
            run: current.run ? newer(known, current.run) : known,
            runner: current.runner,
            runtime: current.runtime,
            specPack: current.specPack,
          };
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (loaded.current) setConnectionLost(true);
        else setState({ status: 'error', error });
      },
    );
    return () => controller.abort();
  }, [api, projectId, reload]);

  const runId = state.status === 'ready' ? (state.run?.id ?? null) : null;
  const active =
    state.status === 'ready' &&
    state.run !== null &&
    isActiveRun(state.run.status);

  // Run + log polling while active; one last log read once it ended.
  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = RUN_POLL_INTERVAL_MS;
    let after = 0;
    setLog((previous) =>
      previous.runId === runId ? previous : { runId, items: [] },
    );
    const readLog = async () => {
      // Pages until caught up; entries are append-only by sequence.
      for (;;) {
        const page = await api.log(projectId, runId, after, controller.signal);
        if (controller.signal.aborted) return;
        // Stop when nothing new came back (also guards a misbehaving server).
        if (page.items.length === 0 || page.last <= after) return;
        after = page.last;
        setLog((previous) => {
          if (previous.runId !== runId) return previous;
          const known = previous.items.at(-1)?.sequence ?? 0;
          const fresh = page.items.filter((item) => item.sequence > known);
          return {
            runId,
            items: [...previous.items, ...fresh].slice(-MAX_LOG_LINES),
          };
        });
      }
    };
    const tick = async () => {
      try {
        const run = await api.get(projectId, runId, controller.signal);
        if (controller.signal.aborted) return;
        apply(run);
        await readLog();
        setConnectionLost(false);
        delay = RUN_POLL_INTERVAL_MS;
        if (isActiveRun(run.status)) schedule();
        else refresh();
      } catch {
        if (controller.signal.aborted) return;
        setConnectionLost(true);
        delay = Math.min(delay * 2, RUN_POLL_MAX_INTERVAL_MS);
        schedule();
      }
    };
    const schedule = () => {
      timer = setTimeout(() => void tick(), delay);
    };
    if (active) schedule();
    else void readLog().catch(() => {});
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, projectId, runId, active, apply, refresh]);

  async function mutate<T>(
    kind: 'start' | 'cancel',
    send: (signal: AbortSignal) => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> {
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

  async function sendStart(next: {
    key: string;
    input: StartDocumentRunInput;
  }) {
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
    if (!unknown) intent.current = null;
    setUncertainStart(unknown);
    if (
      unknown ||
      hasErrorCode(result.error, 'RUN_ACTIVE_CONFLICT') ||
      hasErrorCode(result.error, 'RUNTIME_RECOVERY_REQUIRED')
    )
      refresh();
  }

  return {
    state,
    action,
    connectionLost,
    uncertainStart,
    log: log.runId === runId ? log.items : [],
    refresh,
    // New run, or the same intent again while its outcome is unknown.
    async start(input: StartDocumentRunInput) {
      if (intent.current) return sendStart(intent.current);
      return sendStart({ key: newKey(), input });
    },
    async cancel(run: DocumentRun) {
      const result = await mutate('cancel', async (signal) => {
        try {
          return await api.cancel(projectId, run.id, run.stateVersion, signal);
        } catch (error) {
          if (!hasErrorCode(error, 'RUN_STATE_CONFLICT')) throw error;
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
  };
}
