import {
  queuedRunFixture,
  runningRunFixture,
} from '@portal/contracts/fixtures';
import type { Run, RunEvent, RunProgress } from '@portal/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SUBSCRIBERS_PER_RUN,
  PROGRESS_INTERVAL_MS,
  createRunEventHub,
  progressFraction,
} from './run-events.js';

const progress = (patch: Partial<RunProgress>): RunProgress => ({
  phase: 'snapshot',
  filesSnapshotted: 0,
  filesAnalyzed: 0,
  filesTotal: 10,
  bytesDone: 0,
  bytesTotal: 100,
  recentPaths: [],
  ...patch,
});

function hubWith(initial: Run) {
  // What the database holds: events are built from it, never from callers.
  let stored: Run | undefined = initial;
  const hub = createRunEventHub({
    read: () => stored,
    now: () => new Date('2026-11-02T00:00:00.000Z'),
  });
  const events: RunEvent[] = [];
  const end = vi.fn();
  const unsubscribe = hub.subscribe(initial.id, {
    event: (event) => events.push(event),
    end,
  });
  return {
    hub,
    events,
    end,
    unsubscribe,
    store: (run: Run | undefined) => {
      stored = run;
    },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('run event hub (B09/PF08)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('B09-AC01 builds each event from the committed run, on a later tick, in sequence', async () => {
    const { hub, events, store } = hubWith(queuedRunFixture);
    hub.notify(queuedRunFixture.id);
    // Nothing is sent inside the caller (it may still be in a transaction).
    expect(events).toEqual([]);
    const running = { ...runningRunFixture, id: queuedRunFixture.id };
    store(running);
    await tick();
    expect(events).toEqual([
      expect.objectContaining({
        runId: queuedRunFixture.id,
        sequence: 1,
        status: 'running',
        stateVersion: runningRunFixture.stateVersion,
      }),
    ]);
    // Two changes before the tick: one event of the latest committed state.
    hub.notify(running.id);
    hub.notify(running.id);
    await tick();
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
  });

  it('PF08 progress goes out at most every interval and never backwards', async () => {
    vi.useFakeTimers();
    const { hub, events } = hubWith(runningRunFixture);
    const id = runningRunFixture.id;
    hub.setProgress(id, progress({ filesSnapshotted: 2 }));
    hub.setProgress(id, progress({ filesSnapshotted: 4 }));
    hub.setProgress(id, progress({ filesSnapshotted: 3 }));
    hub.setProgress(id, progress({ phase: 'listing', filesTotal: null }));
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS);
    expect(events).toHaveLength(2);
    expect(events.at(-1)?.progress?.filesSnapshotted).toBe(4);
    expect(hub.progressOf(runningRunFixture)?.filesSnapshotted).toBe(4);
    const fractions = events.map((event) =>
      event.progress ? progressFraction(event.progress) : 0,
    );
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
  });

  it('drops the progress of a run that is no longer active', async () => {
    const { hub, events, store } = hubWith(runningRunFixture);
    hub.setProgress(runningRunFixture.id, progress({ filesSnapshotted: 5 }));
    await tick();
    const succeeded = {
      ...runningRunFixture,
      status: 'succeeded',
      stage: null,
      stateVersion: 3,
      finishedAt: '2026-11-02T00:00:01.000Z',
      sourceSnapshotId: runningRunFixture.sourceSnapshotId,
    } as Run;
    store(succeeded);
    hub.notify(succeeded.id);
    await tick();
    expect(events.at(-1)).toMatchObject({ status: 'succeeded' });
    expect(events.at(-1)).not.toHaveProperty('progress');
    expect(hub.progressOf(succeeded)).toBeUndefined();
  });

  it('progress share: unknown total is 0, publish is 1', () => {
    expect(progressFraction(progress({ filesTotal: null }))).toBe(0);
    expect(
      progressFraction(progress({ filesSnapshotted: 10, filesAnalyzed: 5 })),
    ).toBe(0.75);
    expect(progressFraction(progress({ phase: 'publish' }))).toBe(1);
  });

  it('B09-AC02 bounds subscribers, removes a throwing one, ends streams on close', async () => {
    const { hub, events, end } = hubWith(runningRunFixture);
    const extra = [];
    for (let i = 1; i < MAX_SUBSCRIBERS_PER_RUN; i++)
      extra.push(
        hub.subscribe(runningRunFixture.id, {
          event: () => {
            throw new Error('gone');
          },
          end: () => undefined,
        }),
      );
    expect(extra.every(Boolean)).toBe(true);
    expect(
      hub.subscribe(runningRunFixture.id, {
        event: () => undefined,
        end: () => undefined,
      }),
    ).toBeUndefined();
    hub.notify(runningRunFixture.id);
    await tick();
    expect(events).toHaveLength(1);
    // The throwing listeners were removed: there is room again.
    expect(
      hub.subscribe(runningRunFixture.id, {
        event: () => undefined,
        end: () => undefined,
      }),
    ).toBeDefined();
    hub.close();
    expect(end).toHaveBeenCalledTimes(1);
    hub.notify(runningRunFixture.id);
    await tick();
    expect(events).toHaveLength(1);
  });
});
