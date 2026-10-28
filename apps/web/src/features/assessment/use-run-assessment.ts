import { useCallback, useEffect, useState } from 'react';
import type { ArtifactEnvelope } from '@portal/contracts';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';

// Loads the inventory artifact of one run: the run's published list, then
// the exact version it names. Only GETs; a new run/project aborts the old
// requests and their late answers are dropped.

export type AssessmentState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  // The run has no published inventory (local run before B08).
  | { status: 'empty' }
  | { status: 'ready'; artifact: ArtifactEnvelope };

export function useRunAssessment(
  api: ArtifactsApi,
  projectId: string,
  runId: string,
) {
  const [state, setState] = useState<AssessmentState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const list = await api.listForRun(projectId, runId, signal);
        const ref = list.items.find(
          (item) => item.kind === 'source-inventory' && item.runId === runId,
        );
        if (!ref) {
          if (!signal.aborted) setState({ status: 'empty' });
          return;
        }
        const artifact = await api.getVersion(
          projectId,
          ref.id,
          ref.version,
          signal,
        );
        // The envelope must be the version that was asked for.
        if (
          artifact.id !== ref.id ||
          artifact.version !== ref.version ||
          artifact.runId !== runId ||
          artifact.projectId !== projectId
        )
          throw new Error('Artifact does not match the requested version.');
        if (!signal.aborted) setState({ status: 'ready', artifact });
      } catch (error) {
        if (!signal.aborted) setState({ status: 'error', error });
      }
    })();
    return () => controller.abort();
  }, [api, projectId, runId, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, retry };
}
