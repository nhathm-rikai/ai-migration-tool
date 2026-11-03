import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { runningRunFixture } from '@portal/contracts/fixtures';
import type { Run, RunEvent, RunProgress } from '@portal/contracts';
import { createRunsApi } from '../../shared/api/runs-api';
import { useAnalyzeRuns, RUN_POLL_INTERVAL_MS } from './use-analyze-runs';

const progress = (count: number, path: string): RunProgress => ({
  phase: 'inventory',
  filesSnapshotted: 10,
  filesAnalyzed: count,
  filesTotal: 10,
  bytesDone: 100,
  bytesTotal: 100,
  recentPaths: [path],
});
const run: Run = { ...runningRunFixture, stage: 'inventory' };
const event = (sequence: number, count: number, path: string): RunEvent => ({
  runId: run.id,
  sequence,
  stateVersion: run.stateVersion,
  status: run.status,
  stage: run.stage,
  occurredAt: run.updatedAt,
  progress: progress(count, path),
});

async function open() {
  vi.useFakeTimers();
  const streams: {
    emit: (event: RunEvent) => void;
    fail: (error: Error) => void;
  }[] = [];
  const api = {
    ...createRunsApi(),
    current: vi.fn(() => Promise.resolve({ run })),
    list: vi.fn(() => Promise.resolve({ items: [], nextCursor: null })),
    get: vi.fn(() => Promise.resolve(run)),
    events: vi.fn(
      (
        _project: string,
        _run: string,
        _signal: AbortSignal,
        emit: (event: RunEvent) => void,
      ) =>
        new Promise<void>((_resolve, fail) => {
          streams.push({ emit, fail });
        }),
    ),
  };
  const view = renderHook(() => useAnalyzeRuns(api, run.projectId, 1));
  await act(async () => {
    await Promise.resolve();
  });
  expect(streams).toHaveLength(1);
  const shown = () =>
    view.result.current.state.status === 'ready'
      ? view.result.current.state.current?.progress
      : undefined;
  return { ...view, api, streams, shown };
}
afterEach(() => vi.useRealTimers());

it('F05-AC01 ignores reordered and duplicate sequences, including phase/count/path', async () => {
  const view = await open();
  await act(async () => {
    view.streams[0]?.emit(event(10, 8, 'new.bas'));
    await Promise.resolve();
  });
  await act(async () => {
    view.streams[0]?.emit({
      ...event(9, 1, 'old.bas'),
      stage: 'snapshot',
      progress: { ...progress(1, 'old.bas'), phase: 'snapshot' },
    });
    view.streams[0]?.emit(event(10, 9, 'duplicate.bas'));
    await Promise.resolve();
  });
  expect(view.shown()).toEqual(progress(8, 'new.bas'));
});

it.each(['current', 'poll'])(
  'F05-AC01 ignores a %s GET started before the newer event even at identical version/time/count',
  async (kind) => {
    const view = await open();
    let release: (() => void) | undefined;
    const stale = { ...run, progress: progress(8, 'old.bas') };
    if (kind === 'current') {
      view.api.current.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ run: stale });
          }),
      );
      await act(async () => {
        view.result.current.refresh();
        await Promise.resolve();
      });
    } else {
      view.api.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(stale);
          }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_INTERVAL_MS);
      });
    }
    expect(release).toBeDefined();
    await act(async () => {
      view.streams[0]?.emit(event(10, 8, 'new.bas'));
      await Promise.resolve();
    });
    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    expect(view.shown()).toEqual(progress(8, 'new.bas'));
  },
);

it('F05-AC02 accepts reset sequence on reconnect, drops callbacks from the previous connection and retains progress', async () => {
  const view = await open();
  await act(async () => {
    view.streams[0]?.emit(event(10, 8, 'before.bas'));
    await Promise.resolve();
  });
  await act(async () => {
    view.streams[0]?.fail(new Error('disconnected'));
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2 * RUN_POLL_INTERVAL_MS);
  });
  expect(view.streams).toHaveLength(2);
  await act(async () => {
    view.streams[1]?.emit(event(1, 9, 'reconnected.bas'));
    await Promise.resolve();
  });
  expect(view.shown()).toEqual(progress(9, 'reconnected.bas'));
  await act(async () => {
    view.streams[0]?.emit(event(11, 10, 'old-connection.bas'));
    await Promise.resolve();
  });
  expect(view.shown()).toEqual(progress(9, 'reconnected.bas'));
});
