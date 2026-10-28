import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ArtifactStore } from '../../ports/artifact-store.js';
import { createSnapshotStorage } from './snapshot-storage.js';

// Filesystem artifact store (B07, DATA-05). Layout under the data directory:
//   artifacts/.staging/<id>-v<version>/   write in progress, never read
//   artifacts/<id>-v<version>/payload.json   published (renamed from staging)
// Staging and published directories share one parent filesystem, so publish
// is one directory rename. Every path is checked by the same link-safe
// storage as snapshots; a link in artifact storage is ARTIFACT_STORAGE_INVALID.

const STAGING = '.staging';
const PAYLOAD = 'payload.json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ENTRY = /^([0-9a-f-]{36})-v([1-9][0-9]{0,8})$/;

function entryName(artifactId: string, version: number): string {
  if (!UUID.test(artifactId))
    throw new Error('Artifact ID must be a server-generated UUID.');
  if (!Number.isInteger(version) || version < 1 || version > 999_999_999)
    throw new Error('Artifact version must be a positive integer.');
  return `${artifactId}-v${version}`;
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

export function createFilesystemArtifactStore(options: {
  artifactsDir: string;
  // Test hook: runs after the staging copy is complete, before the rename.
  beforePublish?: (artifactId: string, version: number) => Promise<void>;
}): ArtifactStore {
  const { artifactsDir } = options;
  const stagingDir = join(artifactsDir, STAGING);
  const storage = createSnapshotStorage(
    artifactsDir,
    'ARTIFACT_STORAGE_INVALID',
  );

  return {
    async publish(artifactId, version, bytes) {
      const name = entryName(artifactId, version);
      const staging = join(stagingDir, name);
      const published = join(artifactsDir, name);
      await storage.createDirectory(staging);
      try {
        await storage.writeNew(join(staging, PAYLOAD), bytes);
        await options.beforePublish?.(artifactId, version);
        await storage.publish(staging, published);
      } catch (error) {
        await storage.remove(staging);
        throw error;
      }
      return {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: bytes.byteLength,
      };
    },

    async read(artifactId, version) {
      try {
        return await storage.read(
          join(artifactsDir, entryName(artifactId, version), PAYLOAD),
        );
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return undefined;
        throw error;
      }
    },

    async discard(artifactId, version) {
      await storage.remove(join(artifactsDir, entryName(artifactId, version)));
    },

    async cleanupStaging() {
      let names: string[];
      try {
        names = await storage.names(stagingDir);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return 0;
        throw error;
      }
      // Only directories this store created.
      const owned = names.filter((name) => ENTRY.test(name));
      for (const name of owned) await storage.remove(join(stagingDir, name));
      return owned.length;
    },
  };
}
