import { randomUUID } from 'node:crypto';
import { succeededRunFixture } from '@portal/contracts/fixtures';
import type { Run } from '@portal/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_SNAPSHOT_HASH,
  demoInventory,
} from '../../adapters/fake/demo-inventory.js';
import type { ArtifactStore } from '../../ports/artifact-store.js';
import type { ArtifactRepository } from './artifact.repository.js';
import { createArtifactService } from './artifact.service.js';

const run: Run = succeededRunFixture;

function setup(
  options: { insertFails?: boolean; discardFails?: boolean } = {},
) {
  const publish = vi.fn((_id: string, _version: number, bytes: Uint8Array) =>
    Promise.resolve({ sha256: '0'.repeat(64), byteLength: bytes.byteLength }),
  );
  const discard = vi.fn(() =>
    options.discardFails
      ? Promise.reject(new Error('locked'))
      : Promise.resolve(),
  );
  const store: ArtifactStore = {
    publish,
    read: () => Promise.resolve(undefined),
    discard,
    cleanupStaging: () => Promise.resolve(0),
  };
  const insert = vi.fn(() => {
    if (options.insertFails) throw new Error('SQLITE_FULL');
  });
  const repository: ArtifactRepository = {
    insert,
    listByRun: () => [],
    find: () => undefined,
  };
  const log = { error: vi.fn() };
  const service = createArtifactService({
    repository,
    store,
    projects: { get: vi.fn() },
    runs: { get: () => run },
    nextId: randomUUID,
    now: () => new Date('2026-10-27T00:00:00.000Z'),
    log,
  });
  return { service, publish, discard, insert, log };
}

const request = {
  run,
  sourceSnapshotId: randomUUID(),
  sourceSnapshotHash: DEMO_SNAPSHOT_HASH,
  payload: demoInventory,
};

describe('artifact service publish (B07)', () => {
  it('validates the payload before writing anything', async () => {
    const { service, publish } = setup();
    const invalid = await service.publishInventory({
      ...request,
      payload: { ...demoInventory, programs: 'not-a-list' },
    });
    expect(invalid).toEqual({
      status: 'failed',
      errorCode: 'ANALYSIS_OUTPUT_INVALID',
    });
    const otherSnapshot = await service.publishInventory({
      ...request,
      sourceSnapshotHash: 'f'.repeat(64),
    });
    expect(otherSnapshot.status).toBe('failed');
    expect(publish).not.toHaveBeenCalled();
  });

  it('removes the published directory when the metadata commit fails', async () => {
    const { service, discard } = setup({ insertFails: true });
    const outcome = await service.publishInventory(request);
    expect(outcome).toEqual({
      status: 'failed',
      errorCode: 'ARTIFACT_WRITE_FAILED',
    });
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('logs an orphan, still failing the publish, when the cleanup fails too', async () => {
    const { service, log } = setup({ insertFails: true, discardFails: true });
    const outcome = await service.publishInventory(request);
    expect(outcome.status).toBe('failed');
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ARTIFACT_ORPHANED' }),
      expect.any(String),
    );
  });

  it('records a server-generated ID, version 1, the run and the payload hash', async () => {
    const { service, insert } = setup();
    const outcome = await service.publishInventory(request);
    expect(outcome.status).toBe('published');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        projectId: run.projectId,
        runId: run.id,
        mode: 'local',
        sourceSnapshotHash: DEMO_SNAPSHOT_HASH,
      }),
    );
  });
});
