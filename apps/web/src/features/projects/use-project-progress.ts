import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@portal/contracts';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import type { RunsApi } from '../../shared/api/runs-api';
import type { SourcesApi } from '../../shared/api/sources-api';
import {
  isActiveRun,
  RUN_POLL_INTERVAL_MS,
  RUN_POLL_MAX_INTERVAL_MS,
} from '../jobs/use-analyze-runs';

// What the stepper may mark as done, read from stored data only:
// - source: a demo project has its bundled fixture; a local one needs a saved
//   source registration.
// - analysis: the newest succeeded run that published an inventory.
// Lives in the app shell, so an active run is followed to its end whichever
// step is open. Reads only (GET); never starts or changes anything.

export type ProjectProgress =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | {
      status: 'ready';
      sourceSaved: boolean;
      // Run whose inventory the analysis step shows; null = none yet.
      analysisRunId: string | null;
      // Queued/running run being followed; null = none.
      activeRunId: string | null;
    };

// Walks the whole history, newest first, until a succeeded run with an
// inventory or the last page.
async function latestInventoryRun(
  runsApi: RunsApi,
  artifactsApi: ArtifactsApi,
  projectId: string,
  signal: AbortSignal,
): Promise<string | null> {
  let cursor: string | null = null;
  for (;;) {
    const runs = await runsApi.list(projectId, cursor, signal);
    for (const run of runs.items) {
      if (run.status !== 'succeeded') continue;
      const artifacts = await artifactsApi.listForRun(
        projectId,
        run.id,
        signal,
      );
      if (artifacts.items.some((item) => item.kind === 'source-inventory'))
        return run.id;
    }
    if (!runs.nextCursor) return null;
    cursor = runs.nextCursor;
  }
}

export function useProjectProgress(
  project: Project | null,
  apis: {
    runsApi?: RunsApi | undefined;
    sourcesApi?: SourcesApi | undefined;
    artifactsApi?: ArtifactsApi | undefined;
  },
) {
  const { runsApi, sourcesApi, artifactsApi } = apis;
  // Tagged with its project so a switch never shows the previous marks.
  const [tagged, setTagged] = useState<{
    projectId: string | null;
    progress: ProjectProgress;
  }>({ projectId: null, progress: { status: 'loading' } });
  const [reload, setReload] = useState(0);
  const projectId = project?.id ?? null;
  const demo = project?.mode === 'demo';
  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    if (projectId === null) return;
    const controller = new AbortController();
    // A re-read keeps the shown marks until it answers.
    setTagged((previous) =>
      previous.projectId === projectId
        ? previous
        : { projectId, progress: { status: 'loading' } },
    );
    const source = demo
      ? Promise.resolve(true)
      : sourcesApi
        ? sourcesApi
            .get(projectId, controller.signal)
            .then((response) => response.source !== null)
        : Promise.resolve(false);
    const analysis =
      runsApi && artifactsApi
        ? latestInventoryRun(
            runsApi,
            artifactsApi,
            projectId,
            controller.signal,
          )
        : Promise.resolve(null);
    const active = runsApi
      ? runsApi
          .current(projectId, controller.signal)
          .then(({ run }) => (run && isActiveRun(run.status) ? run.id : null))
      : Promise.resolve(null);
    void Promise.all([source, analysis, active]).then(
      ([sourceSaved, analysisRunId, activeRunId]) => {
        if (!controller.signal.aborted)
          setTagged({
            projectId,
            progress: {
              status: 'ready',
              sourceSaved,
              analysisRunId,
              activeRunId,
            },
          });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setTagged({ projectId, progress: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [projectId, demo, runsApi, sourcesApi, artifactsApi, reload]);

  // Follow the active run (GET with backoff) and read the marks again once
  // it ends, even after the run panel has been closed.
  const followed =
    tagged.projectId === projectId && tagged.progress.status === 'ready'
      ? tagged.progress.activeRunId
      : null;
  useEffect(() => {
    if (!runsApi || projectId === null || followed === null) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = RUN_POLL_INTERVAL_MS;
    const schedule = () => {
      timer = setTimeout(() => {
        runsApi.get(projectId, followed, controller.signal).then(
          (run) => {
            if (controller.signal.aborted) return;
            delay = RUN_POLL_INTERVAL_MS;
            if (isActiveRun(run.status)) schedule();
            else refresh();
          },
          () => {
            if (controller.signal.aborted) return;
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
  }, [runsApi, projectId, followed, refresh]);

  const state: ProjectProgress =
    tagged.projectId === projectId ? tagged.progress : { status: 'loading' };
  return { state, refresh };
}
