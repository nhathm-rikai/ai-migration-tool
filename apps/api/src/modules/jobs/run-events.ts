import {
  ACTIVE_RUN_STATUSES,
  type Run,
  type RunEvent,
  type RunProgress,
  type RunStatus,
} from '@portal/contracts';
import type { RunRepository } from './run.repository.js';

// Run events (B09) and per-file progress (PF08), in memory only.
//
// - `notify(runId)` after a state or stage change: the event is built from
//   the run read back from the database on a later tick, so it is only ever
//   sent for a committed, readable state (B09-AC01), also when the change
//   was made inside a transaction.
// - `setProgress(runId, progress)` from the executing run: kept for GET run
//   and sent at most PROGRESS_INTERVAL_MS apart (≤ 5 per second). Progress
//   never goes down within a run, and is dropped once the run is no longer
//   active.
// - Subscribers are bounded per run and in total; a listener that throws is
//   removed. A subscriber that goes away never affects the run (B09-AC02).

export const PROGRESS_INTERVAL_MS = 200;
export const MAX_SUBSCRIBERS_PER_RUN = 4;
export const MAX_SUBSCRIBERS = 32;

export type RunEventListener = {
  event(event: RunEvent): void;
  // The hub closed (shutdown): end the stream.
  end(): void;
};

const ACTIVE: readonly RunStatus[] = ACTIVE_RUN_STATUSES;

const PHASES: readonly RunProgress['phase'][] = [
  'listing',
  'snapshot',
  'inventory',
  'publish',
];

// Share of the run done (§2b.2): (snapshotted + analyzed) / (2 × total).
export function progressFraction(progress: RunProgress): number {
  if (progress.phase === 'publish') return 1;
  if (!progress.filesTotal) return 0;
  return Math.min(
    1,
    (progress.filesSnapshotted + progress.filesAnalyzed) /
      (2 * progress.filesTotal),
  );
}

// A later report may not go back a phase, nor down within one.
function goesBack(previous: RunProgress, next: RunProgress): boolean {
  const from = PHASES.indexOf(previous.phase);
  const to = PHASES.indexOf(next.phase);
  if (to !== from) return to < from;
  return progressFraction(next) < progressFraction(previous);
}

export function createRunEventHub(deps: {
  read(runId: string): Run | undefined;
  now(): Date;
}) {
  const listeners = new Map<string, Set<RunEventListener>>();
  const sequences = new Map<string, number>();
  const progress = new Map<string, RunProgress>();
  const pending = new Set<string>();
  const throttles = new Map<
    string,
    { last: number; timer: NodeJS.Timeout | undefined }
  >();
  let flush: NodeJS.Immediate | null = null;
  let closed = false;
  let total = 0;

  function emit(run: Run): void {
    const active = ACTIVE.includes(run.status);
    if (!active) {
      progress.delete(run.id);
      const throttle = throttles.get(run.id);
      clearTimeout(throttle?.timer);
      throttles.delete(run.id);
    }
    const subscribers = listeners.get(run.id);
    if (!subscribers || subscribers.size === 0) return;
    const sequence = (sequences.get(run.id) ?? 0) + 1;
    sequences.set(run.id, sequence);
    const known = progress.get(run.id);
    const event: RunEvent = {
      runId: run.id,
      sequence,
      stateVersion: run.stateVersion,
      status: run.status,
      stage: run.stage,
      occurredAt: deps.now().toISOString(),
      ...(known && active ? { progress: known } : {}),
    };
    for (const listener of [...subscribers]) {
      try {
        listener.event(event);
      } catch {
        remove(run.id, listener);
      }
    }
  }

  function remove(runId: string, listener: RunEventListener): void {
    const subscribers = listeners.get(runId);
    if (!subscribers?.delete(listener)) return;
    total--;
    if (subscribers.size === 0) {
      listeners.delete(runId);
      sequences.delete(runId);
    }
  }

  function progressOf(run: Run): RunProgress | undefined {
    return ACTIVE.includes(run.status) ? progress.get(run.id) : undefined;
  }

  function notify(runId: string): void {
    if (closed) return;
    pending.add(runId);
    flush ??= setImmediate(() => {
      flush = null;
      const ids = [...pending];
      pending.clear();
      for (const id of ids) {
        const run = deps.read(id);
        if (run) emit(run);
      }
    });
  }

  return {
    notify,
    setProgress(runId: string, next: RunProgress): void {
      if (closed) return;
      const previous = progress.get(runId);
      // Never backwards within a run (a late report loses).
      if (previous && goesBack(previous, next)) return;
      progress.set(runId, next);
      const throttle = throttles.get(runId) ?? { last: 0, timer: undefined };
      throttles.set(runId, throttle);
      if (throttle.timer) return;
      const wait = throttle.last + PROGRESS_INTERVAL_MS - Date.now();
      const send = () => {
        throttle.timer = undefined;
        throttle.last = Date.now();
        notify(runId);
      };
      if (wait <= 0) send();
      else throttle.timer = setTimeout(send, wait);
    },
    // Progress of an active run for GET responses; undefined otherwise.
    progressOf,
    // Undefined when the bounds are reached; the caller answers busy.
    subscribe(
      runId: string,
      listener: RunEventListener,
    ): (() => void) | undefined {
      if (closed || total >= MAX_SUBSCRIBERS) return undefined;
      const subscribers = listeners.get(runId) ?? new Set();
      if (subscribers.size >= MAX_SUBSCRIBERS_PER_RUN) return undefined;
      subscribers.add(listener);
      listeners.set(runId, subscribers);
      total++;
      return () => remove(runId, listener);
    },
    // The first event of a new subscription: the committed state now.
    snapshot(run: Run): RunEvent {
      const sequence = (sequences.get(run.id) ?? 0) + 1;
      sequences.set(run.id, sequence);
      const known = progressOf(run);
      return {
        runId: run.id,
        sequence,
        stateVersion: run.stateVersion,
        status: run.status,
        stage: run.stage,
        occurredAt: deps.now().toISOString(),
        ...(known ? { progress: known } : {}),
      };
    },
    close(): void {
      closed = true;
      if (flush) clearImmediate(flush);
      flush = null;
      for (const throttle of throttles.values()) clearTimeout(throttle.timer);
      throttles.clear();
      const open = [...listeners.values()].flatMap((set) => [...set]);
      listeners.clear();
      total = 0;
      for (const listener of open) {
        try {
          listener.end();
        } catch {
          // The stream is gone already.
        }
      }
    },
  };
}

export type RunEventHub = ReturnType<typeof createRunEventHub>;

// The run repository with an event after every committed state or stage
// change. Reads and admission pass through unchanged.
export function withRunEvents(
  repository: RunRepository,
  hub: Pick<RunEventHub, 'notify'>,
): RunRepository {
  const notified = <T extends Run | undefined>(run: T): T => {
    if (run) hub.notify(run.id);
    return run;
  };
  return {
    ...repository,
    insert: (record) => notified(repository.insert(record)),
    claimNextQueued: (now) => notified(repository.claimNextQueued(now)),
    transition: (runId, expected, patch, now) =>
      notified(repository.transition(runId, expected, patch, now)),
    updateProgress: (runId, stateVersion, progress, now) =>
      notified(repository.updateProgress(runId, stateVersion, progress, now)),
  };
}
