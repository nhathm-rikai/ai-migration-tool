import { describe, expectTypeOf, it } from 'vitest';
import type { Run } from './run.schema.js';

// Compile-time checks of the DTO inferred from RunSchema; `npm run typecheck`
// fails when a schema helper widens a field to unknown.
type RunOf<
  Status extends Run['status'],
  Strategy extends Run['sourceStrategy'],
> = Extract<Run, { status: Status; sourceStrategy: Strategy }>;

describe('Run DTO types', () => {
  it('keeps the snapshot type of each status and strategy', () => {
    expectTypeOf<
      RunOf<'queued', 'current-source'>['sourceSnapshotId']
    >().toEqualTypeOf<null>();
    expectTypeOf<
      RunOf<'running', 'current-source'>['sourceSnapshotId']
    >().toEqualTypeOf<string | null>();
    expectTypeOf<
      RunOf<'succeeded', 'current-source'>['sourceSnapshotId']
    >().toEqualTypeOf<string>();
    expectTypeOf<
      RunOf<Run['status'], 'reuse-snapshot'>['sourceSnapshotId']
    >().toEqualTypeOf<string>();
    expectTypeOf<
      RunOf<Run['status'], 'reuse-snapshot'>['retryOfRunId']
    >().toEqualTypeOf<string>();
  });

  it('keeps the status-specific fields precise', () => {
    expectTypeOf<Run['status']>().toEqualTypeOf<
      | 'queued'
      | 'running'
      | 'cancelling'
      | 'succeeded'
      | 'failed'
      | 'cancelled'
      | 'interrupted'
    >();
    expectTypeOf<
      RunOf<'queued', 'current-source'>['startedAt']
    >().toEqualTypeOf<null>();
    expectTypeOf<
      RunOf<'failed', 'current-source'>['errorCode']
    >().not.toEqualTypeOf<null>();
  });
});
