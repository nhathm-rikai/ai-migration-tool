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
  // Hash of the snapshot the payload was derived from; must match it.
  sourceSnapshotHash: string;
  payload: unknown;
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

  return {
    async publishInventory(
      request: PublishInventoryRequest,
    ): Promise<PublishOutcome> {
      const { run, payload } = request;
      // Schema before any side effect; partial warnings are part of the
      // schema and are kept as they are.
      if (
        !Check(SourceInventorySchema, payload) ||
        payload.snapshotHash !== request.sourceSnapshotHash
      )
        return fail('ANALYSIS_OUTPUT_INVALID', run.id);
      const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
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
        schemaVersion: payload.schemaVersion,
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
