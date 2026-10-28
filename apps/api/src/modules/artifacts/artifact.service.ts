import { createHash } from 'node:crypto';
import {
  SourceInventorySchema,
  type ArtifactList,
  type ArtifactRef,
  type Project,
  type Run,
  type RunErrorCode,
  type SourceInventoryArtifact,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import type { ArtifactStore } from '../../ports/artifact-store.js';
import { AppError } from '../../shared/app-error.js';
import { getErrorReason } from '../../shared/error-diagnostics.js';
import type { ArtifactRepository } from './artifact.repository.js';

// Publishes and reads artifacts (B07). Publish order (DATA-05): validate the
// payload, write staging → rename into place, then commit the row. Only a
// version with a row is read, and only while its run is `succeeded`: an
// artifact whose run ended cancelled/failed/interrupted (cancel won after the
// publish) stays isolated and is never shown as a result.

export type PublishFailureCode = Extract<
  RunErrorCode,
  'ANALYSIS_OUTPUT_INVALID' | 'ARTIFACT_WRITE_FAILED'
>;

export type PublishOutcome =
  | { status: 'published'; artifact: ArtifactRef }
  | { status: 'failed'; errorCode: PublishFailureCode };

export type PublishInventoryRequest = {
  run: Run;
  sourceSnapshotId: string;
  // Hash of the snapshot record the payload was derived from.
  sourceSnapshotHash: string;
  // What the payload's own `snapshotHash` (content of the files it read)
  // must be for that snapshot.
  payloadSnapshotHash: string;
  payload: unknown;
};

// A payload that passed the inventory schema and the snapshot hash check,
// serialized as the bytes to store. Built by `prepareInventory`, possibly in
// a worker thread so a large inventory does not block the API.
export type PreparedInventory = {
  status: 'prepared';
  schemaVersion: SourceInventoryArtifact['schemaVersion'];
  bytes: Uint8Array;
};

// Pure: validate (partial warnings are part of the schema and kept as they
// are), check the payload names the expected snapshot content, serialize.
export function prepareInventory(
  payload: unknown,
  payloadSnapshotHash: string,
): PreparedInventory | { status: 'invalid' } {
  if (
    !Check(SourceInventorySchema, payload) ||
    payload.snapshotHash !== payloadSnapshotHash
  )
    return { status: 'invalid' };
  return {
    status: 'prepared',
    schemaVersion: payload.schemaVersion,
    // Own ArrayBuffer (no pooled Buffer), so it can be transferred.
    bytes: new TextEncoder().encode(JSON.stringify(payload)),
  };
}

export type PublishPreparedRequest = {
  run: Run;
  sourceSnapshotId: string;
  sourceSnapshotHash: string;
  prepared: PreparedInventory;
};

type ArtifactLog = {
  error(details: Record<string, unknown>, message: string): void;
};

export function createArtifactService(deps: {
  repository: ArtifactRepository;
  store: ArtifactStore;
  projects: { get(projectId: string): Project };
  runs: { get(projectId: string, runId: string): Run };
  nextId(): string;
  now(): Date;
  log: ArtifactLog;
}) {
  const { repository, store, log } = deps;

  function fail(
    code: PublishFailureCode,
    runId: string,
    error?: unknown,
  ): PublishOutcome {
    log.error(
      {
        code,
        runId,
        ...(error === undefined ? {} : { reason: getErrorReason(error) }),
      },
      'Artifact was not published.',
    );
    return { status: 'failed', errorCode: code };
  }

  // Write staging → rename, then commit the row (DATA-05).
  async function publishPrepared(
    request: PublishPreparedRequest,
  ): Promise<PublishOutcome> {
    const { run, prepared } = request;
    const { bytes } = prepared;
    const id = deps.nextId();
    const version = 1;
    let stored;
    try {
      stored = await store.publish(id, version, bytes);
    } catch (error) {
      return fail('ARTIFACT_WRITE_FAILED', run.id, error);
    }
    const artifact: ArtifactRef = {
      id,
      version,
      kind: 'source-inventory',
      schemaVersion: prepared.schemaVersion,
      projectId: run.projectId,
      runId: run.id,
      sourceSnapshotId: request.sourceSnapshotId,
      sourceSnapshotHash: request.sourceSnapshotHash,
      mode: run.source.kind === 'fixture' ? 'demo' : 'local',
      sha256: stored.sha256,
      byteLength: stored.byteLength,
      createdAt: deps.now().toISOString(),
    };
    try {
      repository.insert(artifact);
    } catch (error) {
      // Not recorded, so not public. Remove the app-owned directory; if
      // that fails too it stays an orphan nobody reads (runbook in the
      // API README).
      try {
        await store.discard(id, version);
      } catch (discardError) {
        log.error(
          {
            code: 'ARTIFACT_ORPHANED',
            runId: run.id,
            artifactId: id,
            reason: getErrorReason(discardError),
          },
          'Unrecorded artifact could not be removed.',
        );
      }
      return fail('ARTIFACT_WRITE_FAILED', run.id, error);
    }
    return { status: 'published', artifact };
  }

  return {
    publishPrepared,

    // Schema before any side effect.
    async publishInventory(
      request: PublishInventoryRequest,
    ): Promise<PublishOutcome> {
      const prepared = prepareInventory(
        request.payload,
        request.payloadSnapshotHash,
      );
      if (prepared.status !== 'prepared')
        return fail('ANALYSIS_OUTPUT_INVALID', request.run.id);
      return publishPrepared({
        run: request.run,
        sourceSnapshotId: request.sourceSnapshotId,
        sourceSnapshotHash: request.sourceSnapshotHash,
        prepared,
      });
    },

    listForRun(projectId: string, runId: string): ArtifactList {
      const run = deps.runs.get(projectId, runId);
      if (run.status !== 'succeeded') return { items: [] };
      return { items: repository.listByRun(projectId, runId) };
    },

    async getVersion(
      projectId: string,
      artifactId: string,
      version: string,
    ): Promise<SourceInventoryArtifact> {
      deps.projects.get(projectId);
      const ref = repository.find(projectId, artifactId, Number(version));
      if (!ref) throw new AppError('ARTIFACT_NOT_FOUND');
      const run = deps.runs.get(projectId, ref.runId);
      if (run.status !== 'succeeded') throw new AppError('ARTIFACT_NOT_FOUND');
      // The stored bytes must still be the ones that were published.
      const bytes = await store.read(ref.id, ref.version);
      if (
        !bytes ||
        bytes.byteLength !== ref.byteLength ||
        createHash('sha256').update(bytes).digest('hex') !== ref.sha256
      )
        throw new Error('Stored artifact does not match its recorded hash.');
      const payload: unknown = JSON.parse(bytes.toString('utf8'));
      if (!Check(SourceInventorySchema, payload))
        throw new Error('Stored artifact does not match the inventory schema.');
      return { ...ref, payload };
    },
  };
}

export type ArtifactService = ReturnType<typeof createArtifactService>;
