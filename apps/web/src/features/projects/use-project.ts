import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@portal/contracts';
import type { ProjectsApi } from '../../shared/api/projects-api';

export type ProjectState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; project: Project };

// The project named by the URL. Tagged with its id so a late answer for a
// previous project is never shown for the current one.
export function useProject(api: ProjectsApi, projectId: string | null) {
  const [tagged, setTagged] = useState<{
    projectId: string | null;
    state: ProjectState;
  }>({ projectId: null, state: { status: 'idle' } });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (projectId === null) return;
    const controller = new AbortController();
    setTagged({ projectId, state: { status: 'loading' } });
    void api.get(projectId, controller.signal).then(
      (project) => {
        if (!controller.signal.aborted)
          setTagged({ projectId, state: { status: 'ready', project } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setTagged({ projectId, state: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [api, projectId, retry]);
  const state: ProjectState =
    projectId === null
      ? { status: 'idle' }
      : tagged.projectId === projectId
        ? tagged.state
        : { status: 'loading' };
  return {
    state,
    retry: useCallback(() => setRetry((value) => value + 1), []),
  };
}
