import {
  cancellingRunFixture,
  cancelledRunFixture,
  queuedRunFixture,
  runningRunFixture,
  succeededRunFixture,
} from '@portal/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import {
  cancelPatch,
  completionPatch,
  interruptedPatch,
  stopUnconfirmedPatch,
} from './job-state.js';

const now = '2026-10-26T00:00:00.000Z';
const success = {
  status: 'succeeded',
  sourceSnapshotId: queuedRunFixture.id,
} as const;

describe('run state machine', () => {
  it('cancels queued to cancelled and running to cancelling only', () => {
    expect(cancelPatch(queuedRunFixture, now)).toMatchObject({
      status: 'cancelled',
      startedAt: null,
      finishedAt: now,
    });
    expect(cancelPatch(runningRunFixture, now)).toMatchObject({
      status: 'cancelling',
      stage: 'inventory',
      finishedAt: null,
    });
    expect(cancelPatch(succeededRunFixture, now)).toBeNull();
    expect(cancelPatch(cancellingRunFixture, now)).toBeNull();
  });

  it('lets a committed cancellation win over a late success', () => {
    for (const reason of [null, 'cancel', 'timeout', 'shutdown'] as const)
      expect(
        completionPatch(cancellingRunFixture, success, reason, now),
      ).toMatchObject({
        status: 'cancelled',
        stage: null,
      });
  });

  it('never changes a terminal run', () => {
    for (const run of [succeededRunFixture, cancelledRunFixture]) {
      expect(completionPatch(run, success, null, now)).toBeNull();
      expect(stopUnconfirmedPatch(run, now)).toBeNull();
      expect(interruptedPatch(run, now)).toBeNull();
    }
  });

  it('maps a running completion by stop reason before the result', () => {
    expect(
      completionPatch(runningRunFixture, success, 'timeout', now),
    ).toMatchObject({
      status: 'failed',
      errorCode: 'TIMEOUT',
    });
    expect(
      completionPatch(runningRunFixture, success, 'shutdown', now),
    ).toMatchObject({
      status: 'interrupted',
    });
    expect(
      completionPatch(runningRunFixture, success, null, now),
    ).toMatchObject({
      status: 'succeeded',
      // The snapshot recorded while running is kept.
      sourceSnapshotId: runningRunFixture.sourceSnapshotId,
    });
    expect(
      completionPatch(runningRunFixture, { status: 'stopped' }, null, now),
    ).toMatchObject({ status: 'failed', errorCode: 'INTERNAL_ERROR' });
  });
});
