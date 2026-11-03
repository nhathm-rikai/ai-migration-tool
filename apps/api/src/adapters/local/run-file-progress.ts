import {
  RUN_PROGRESS_RECENT_PATHS_MAX,
  type RunProgress,
} from '@portal/contracts';

// Per-file progress of one execution (PF08), built up by the executor and
// sent whole on every change. Paths are relative to the source root.
export function createRunFileProgress(send?: (progress: RunProgress) => void) {
  let state: RunProgress = {
    phase: 'listing',
    filesSnapshotted: 0,
    filesAnalyzed: 0,
    filesTotal: null,
    bytesDone: 0,
    bytesTotal: null,
    recentPaths: [],
  };
  return {
    update(patch: Partial<Omit<RunProgress, 'recentPaths'>>, path?: string) {
      state = {
        ...state,
        ...patch,
        recentPaths:
          path === undefined
            ? state.recentPaths
            : [...state.recentPaths, path].slice(
                -RUN_PROGRESS_RECENT_PATHS_MAX,
              ),
      };
      send?.(state);
    },
    recent(paths: readonly string[]) {
      state = {
        ...state,
        recentPaths: paths.slice(-RUN_PROGRESS_RECENT_PATHS_MAX),
      };
    },
  };
}
