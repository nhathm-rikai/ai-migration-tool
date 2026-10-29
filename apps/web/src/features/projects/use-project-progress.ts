import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@portal/contracts';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import type { RunsApi } from '../../shared/api/runs-api';
import type { SourcesApi } from '../../shared/api/sources-api';

// What the stepper may mark as done, read from stored data only:
// - source: a demo project has its bundled fixture; a local one needs a saved
//   source registration.
// - analysis: the newest succeeded run that published an inventory.
// Reads only (GET); never starts or changes anything.

// Run history pages scanned for a succeeded run before giving up.
export const PROGRESS_RUN_PAGES = 5;

export type ProjectProgress =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | {
      status: 'ready';
      sourceSaved: boolean;
      // Run whose inventory the analysis step shows; null = none yet.
      analysisRunId: string | null;
    };

async function latestInventoryRun(
  runsApi: RunsApi,
  artifactsApi: ArtifactsApi,
  projectId: string,
  signal: AbortSignal,
): Promise<string | null> {
  let cursor: string | null = null;
  for (let page = 0; page < PROGRESS_RUN_PAGES; page++) {
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
  return null;
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
    void Promise.all([source, analysis]).then(
      ([sourceSaved, analysisRunId]) => {
        if (!controller.signal.aborted)
          setTagged({
            projectId,
            progress: { status: 'ready', sourceSaved, analysisRunId },
          });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setTagged({ projectId, progress: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [projectId, demo, runsApi, sourcesApi, artifactsApi, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const state: ProjectProgress =
    tagged.projectId === projectId ? tagged.progress : { status: 'loading' };
  return { state, refresh };
}
