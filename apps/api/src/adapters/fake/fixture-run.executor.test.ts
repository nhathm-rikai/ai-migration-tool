import { queuedRunFixture } from '@portal/contracts/fixtures';
import { expect, it } from 'vitest';
import type { RunProgress } from '../../ports/run-executor.js';
import { createFixtureRunExecutor } from './fixture-run.executor.js';

const snapshotId = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';

it('walks the stages and reports the snapshot it created', async () => {
  const progress: RunProgress[] = [];
  const executor = createFixtureRunExecutor({
    stageDelayMs: 0,
    nextId: () => snapshotId,
  });
  const result = await executor.execute({
    run: queuedRunFixture,
    signal: new AbortController().signal,
    report: (update) => progress.push(update),
  });
  expect(result).toEqual({ status: 'succeeded', sourceSnapshotId: snapshotId });
  expect(progress).toEqual([
    { stage: 'snapshot' },
    { stage: 'inventory', sourceSnapshotId: snapshotId },
    { stage: 'publish', sourceSnapshotId: snapshotId },
  ]);
});

it('settles stopped as soon as it is aborted', async () => {
  const controller = new AbortController();
  const executor = createFixtureRunExecutor({
    stageDelayMs: 60_000,
    nextId: () => snapshotId,
  });
  const pending = executor.execute({
    run: queuedRunFixture,
    signal: controller.signal,
    report: () => undefined,
  });
  controller.abort();
  expect(await pending).toEqual({ status: 'stopped' });
});

it('rejects an unbounded delay', () => {
  expect(() =>
    createFixtureRunExecutor({ stageDelayMs: -1, nextId: () => snapshotId }),
  ).toThrow('Fixture stage delay');
});
