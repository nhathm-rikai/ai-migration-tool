import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectSource, PutProjectSourceInput } from '@portal/contracts';
import type { SourcesApi } from '../../shared/api/sources-api';

// Source registration state of one project (F01). Reads on open and on an
// explicit reload; saving is an explicit user action. The caller keys the
// component by project, so switching projects aborts the previous requests
// and a late response of project A never lands on project B.

export type SourceState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; source: ProjectSource | null };

export type SaveState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'saved' }
  | { status: 'error'; error: unknown };

export function useProjectSource(api: SourcesApi, projectId: string) {
  const [state, setState] = useState<SourceState>({ status: 'loading' });
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [reload, setReload] = useState(0);
  const mutation = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => mutation.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    reading.current = controller;
    const startedAt = generation.current;
    setState((previous) =>
      previous.status === 'ready' ? previous : { status: 'loading' },
    );
    void api.get(projectId, controller.signal).then(
      (response) => {
        if (!controller.signal.aborted && startedAt === generation.current)
          setState({ status: 'ready', source: response.source });
      },
      (error: unknown) => {
        if (!controller.signal.aborted && startedAt === generation.current)
          setState({ status: 'error', error });
      },
    );
    return () => {
      controller.abort();
      if (reading.current === controller) reading.current = null;
    };
  }, [api, projectId, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  return {
    state,
    save,
    refresh,
    // Resolves true when saved. A second call while one is pending is
    // ignored; a failed save is never retried automatically.
    async put(input: PutProjectSourceInput): Promise<boolean> {
      if (mutation.current) return false;
      const controller = new AbortController();
      mutation.current = controller;
      setSave({ status: 'pending' });
      try {
        const response = await api.put(projectId, input, controller.signal);
        if (controller.signal.aborted) return false;
        // Invalidate every read started before this save completed, including
        // refreshes requested while PUT was pending. Late errors are stale too.
        generation.current++;
        reading.current?.abort();
        setState({ status: 'ready', source: response.source });
        setSave({ status: 'saved' });
        return true;
      } catch (error) {
        if (!controller.signal.aborted) setSave({ status: 'error', error });
        return false;
      } finally {
        if (mutation.current === controller) mutation.current = null;
      }
    },
  };
}

export type ProjectSourceControl = ReturnType<typeof useProjectSource>;

// Revision a Start may name, or null while the source is missing/unreadable.
export function startableRevision(state: SourceState): number | null {
  if (state.status !== 'ready' || !state.source) return null;
  return state.source.status === 'ready' ? state.source.revision : null;
}
