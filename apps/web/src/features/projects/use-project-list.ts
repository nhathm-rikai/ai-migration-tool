import { useEffect, useState } from 'react';
import type { ProjectList } from '@portal/contracts';
import type { ProjectsApi } from '../../shared/api/projects-api';
import { projectErrorMessage } from './project-messages';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: ProjectList };
export function useProjectList(api: ProjectsApi) {
  const [query, setQuery] = useState<{
    cursor: string | null;
    revision: number;
  }>({ cursor: null, revision: 0 });
  const [state, setState] = useState<ListState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void api.list(query.cursor, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setState({ status: 'ready', page });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            message: projectErrorMessage(error, 'list'),
          });
      },
    );
    return () => controller.abort();
  }, [api, query]);
  return {
    state,
    cursor: query.cursor,
    refresh: () =>
      setQuery((previous) => ({
        cursor: null,
        revision: previous.revision + 1,
      })),
    retry: () =>
      setQuery((previous) => ({
        ...previous,
        revision: previous.revision + 1,
      })),
    next: (cursor: string) =>
      setQuery((previous) => ({ cursor, revision: previous.revision + 1 })),
  };
}
