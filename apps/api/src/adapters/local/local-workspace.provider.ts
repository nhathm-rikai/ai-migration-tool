import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createSnapshotStorage } from './snapshot-storage.js';
import {
  computeSnapshotHash,
  createManifestEntry,
  isRelativeSourcePath,
  sha256,
  type ManifestEntry,
} from '../../modules/analysis/source-manifest.js';
import { SOURCE_DECODER_VERSION } from '../../modules/analysis/source-decoder.js';
import { declaredCodeMemberPaths } from '../../modules/analysis/source-inventory.js';
import {
  SOURCE_NORMALIZATION_VERSION,
  toNormalizedText,
} from '../../modules/analysis/source-text.js';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type CreateSnapshotRequest,
  type CreateSnapshotResult,
  type SkippedEntry,
  type SnapshotFailureCode,
  type SnapshotFile,
  type SnapshotManifest,
  type WorkspaceProvider,
} from '../../ports/workspace-provider.js';

// Local filesystem snapshot store (B06, DATA-04/05). Layout under
// `<dataDir>/snapshots`:
//   .staging/<id>/       copy in progress, never read by anyone else
//   <id>/manifest.json   published snapshot (renamed from staging)
//   <id>/raw/<path>      bytes as read from the source
//   <id>/normalized/<path>  LF/UTF-8 view of text files
// The source is opened read-only and links are never followed. A second pass
// after the copy compares every directory listing and file identity/size/
// mtime with the first one; any difference fails the snapshot SOURCE_CHANGED.

const STAGING = '.staging';
const MANIFEST = 'manifest.json';
const RAW = 'raw';
const NORMALIZED = 'normalized';
// No O_NOFOLLOW on Windows; the fstat identity check below covers a link
// swapped in between lstat and open there.
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

class SnapshotFailure extends Error {
  constructor(readonly code: SnapshotFailureCode) {
    super(code);
  }
}

class SnapshotStopped extends Error {}

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

// A file that vanished or turned into something else since it was listed.
function isChange(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP';
}

function isDenied(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'EACCES' || code === 'EPERM';
}

type Fingerprint = string;
const fingerprint = (stats: BigIntStats): Fingerprint =>
  `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}`;

function storagePath(base: string, relativePath: string): string {
  return join(base, ...relativePath.split('/'));
}

export function createLocalWorkspaceProvider(options: {
  // App-owned directory, outside every registered source root.
  snapshotsDir: string;
}): WorkspaceProvider {
  const { snapshotsDir } = options;
  const stagingDir = join(snapshotsDir, STAGING);
  const storage = createSnapshotStorage(snapshotsDir);

  async function collect(
    request: CreateSnapshotRequest,
    staging: string,
  ): Promise<SnapshotManifest> {
    const { root, profile, limits, signal } = request;
    const entries: ManifestEntry[] = [];
    const skipped: SkippedEntry[] = [];
    // What the first pass saw, compared by the verification pass.
    const listings = new Map<string, string[]>();
    const files = new Map<string, Fingerprint>();
    let seenFiles = 0;
    let totalBytes = 0;

    const checkpoint = () => {
      if (signal.aborted) throw new SnapshotStopped();
    };

    async function readSourceFile(
      absolute: string,
      listed: BigIntStats,
    ): Promise<Buffer | 'unreadable'> {
      let handle;
      try {
        handle = await open(absolute, READ_FLAGS);
      } catch (error) {
        if (isDenied(error)) return 'unreadable';
        if (isChange(error)) throw new SnapshotFailure('SOURCE_CHANGED');
        throw error;
      }
      try {
        const before = await handle.stat({ bigint: true });
        if (fingerprint(before) !== fingerprint(listed))
          throw new SnapshotFailure('SOURCE_CHANGED');
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (
          fingerprint(after) !== fingerprint(listed) ||
          BigInt(bytes.byteLength) !== listed.size
        )
          throw new SnapshotFailure('SOURCE_CHANGED');
        return bytes;
      } finally {
        await handle.close();
      }
    }

    // Files outside the profile's source types, held until every project
    // file was read: one a project declares as code (a module kept as .TXT)
    // is copied, the rest stay listed for coverage only.
    const excludedFiles: {
      absolute: string;
      relativePath: string;
      stats: BigIntStats;
    }[] = [];
    const projects: { relativePath: string; lines: string[] }[] = [];

    async function addFile(
      absolute: string,
      relativePath: string,
      stats: BigIntStats,
      declaredRole?: 'code',
    ): Promise<void> {
      const byteLength = Number(stats.size);
      const role = declaredRole ?? profile.analyzer.fileRole(relativePath);
      // Not source: never read unless a project declares it (keeps agent
      // settings, hooks and secrets of the source out of the snapshot).
      if (role === 'excluded') {
        excludedFiles.push({ absolute, relativePath, stats });
        return;
      }
      if (byteLength > limits.maxFileBytes) {
        skipped.push({
          relativePath,
          kind: 'file',
          reason: 'too-large',
          byteLength,
        });
        return;
      }
      if (totalBytes + byteLength > limits.maxTotalBytes)
        throw new SnapshotFailure('SOURCE_LIMIT_EXCEEDED');
      const bytes = await readSourceFile(absolute, stats);
      if (bytes === 'unreadable') {
        skipped.push({
          relativePath,
          kind: 'file',
          reason: 'unreadable',
          byteLength,
        });
        return;
      }
      totalBytes += bytes.byteLength;
      files.set(relativePath, fingerprint(stats));
      const { entry, lines } = createManifestEntry({
        relativePath,
        role,
        bytes,
        profileEncoding: profile.defaultEncoding,
      });
      entries.push(entry);
      if (role === 'project' && lines)
        projects.push({ relativePath, lines: lines.lines });
      const raw = storagePath(join(staging, RAW), relativePath);
      await storage.writeNew(raw, bytes);
      if (lines) {
        const normalized = storagePath(join(staging, NORMALIZED), relativePath);
        await storage.writeNew(normalized, toNormalizedText(lines));
      }
      await request.afterFileRead?.(relativePath);
    }

    async function walk(absolute: string, relativeDir: string): Promise<void> {
      checkpoint();
      let names: string[];
      try {
        names = (await readdir(absolute)).sort(byName);
      } catch (error) {
        if (relativeDir === '' && (isChange(error) || isDenied(error)))
          throw new SnapshotFailure('SOURCE_UNREADABLE');
        if (isDenied(error)) {
          skipped.push({
            relativePath: relativeDir,
            kind: 'directory',
            reason: 'unreadable',
            byteLength: null,
          });
          return;
        }
        if (isChange(error)) throw new SnapshotFailure('SOURCE_CHANGED');
        throw error;
      }
      listings.set(relativeDir, names);
      for (const name of names) {
        checkpoint();
        const relativePath =
          relativeDir === '' ? name : `${relativeDir}/${name}`;
        const childPath = join(absolute, name);
        let stats: BigIntStats;
        try {
          stats = await lstat(childPath, { bigint: true });
        } catch (error) {
          if (isChange(error)) throw new SnapshotFailure('SOURCE_CHANGED');
          throw error;
        }
        const kind = stats.isDirectory()
          ? 'directory'
          : stats.isFile()
            ? 'file'
            : 'other';
        if (!isRelativeSourcePath(relativePath)) {
          skipped.push({
            relativePath,
            kind,
            reason: 'invalid-name',
            byteLength: null,
          });
          continue;
        }
        if (stats.isSymbolicLink()) {
          skipped.push({
            relativePath,
            kind: 'other',
            reason: 'link',
            byteLength: null,
          });
          continue;
        }
        if (stats.isDirectory()) {
          await walk(childPath, relativePath);
          continue;
        }
        seenFiles++;
        if (seenFiles > limits.maxFiles)
          throw new SnapshotFailure('SOURCE_LIMIT_EXCEEDED');
        if (!stats.isFile()) {
          skipped.push({
            relativePath,
            kind,
            reason: 'special',
            byteLength: null,
          });
          continue;
        }
        await addFile(childPath, relativePath, stats);
      }
    }

    // Second pass: same listings, same files with the same identity, size
    // and modification time. Catches edits, additions and removals made
    // while the copy ran, including in files already copied.
    async function verify(): Promise<void> {
      for (const [relativeDir, names] of listings) {
        checkpoint();
        const absolute = storagePath(root, relativeDir || '.');
        let now: string[];
        try {
          now = (await readdir(absolute)).sort(byName);
        } catch (error) {
          if (isChange(error) || isDenied(error))
            throw new SnapshotFailure('SOURCE_CHANGED');
          throw error;
        }
        if (now.length !== names.length || now.some((n, i) => n !== names[i]))
          throw new SnapshotFailure('SOURCE_CHANGED');
      }
      for (const [relativePath, seen] of files) {
        checkpoint();
        let stats: BigIntStats;
        try {
          stats = await lstat(storagePath(root, relativePath), {
            bigint: true,
          });
        } catch (error) {
          if (isChange(error)) throw new SnapshotFailure('SOURCE_CHANGED');
          throw error;
        }
        if (!stats.isFile() || fingerprint(stats) !== seen)
          throw new SnapshotFailure('SOURCE_CHANGED');
      }
    }

    // Declared paths are matched case-insensitively, like member resolution.
    async function addDeclaredMembers(): Promise<void> {
      const declared = new Set(
        projects.flatMap(({ relativePath, lines }) =>
          declaredCodeMemberPaths(profile, relativePath, lines).map((path) =>
            path.toLowerCase(),
          ),
        ),
      );
      for (const file of excludedFiles) {
        checkpoint();
        if (declared.has(file.relativePath.toLowerCase()))
          await addFile(file.absolute, file.relativePath, file.stats, 'code');
        else
          skipped.push({
            relativePath: file.relativePath,
            kind: 'file',
            reason: 'excluded',
            byteLength: Number(file.stats.size),
          });
      }
    }

    await walk(root, '');
    await addDeclaredMembers();
    await verify();
    const coverage = [...skipped]
      .sort((a, b) => byName(a.relativePath, b.relativePath))
      .map((entry) => [entry.relativePath, entry.kind, entry.reason]);
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshotId: request.snapshotId,
      profileId: profile.id,
      decoderVersion: SOURCE_DECODER_VERSION,
      normalizationVersion: SOURCE_NORMALIZATION_VERSION,
      // Same bytes with different coverage are a different snapshot.
      snapshotHash: sha256(
        JSON.stringify({
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          entries: computeSnapshotHash(entries, profile.id),
          skipped: coverage,
        }),
      ),
      fileCount: entries.length,
      totalBytes,
      entries,
      skipped,
    };
  }

  // Recomputes every hash of a published snapshot from its stored files.
  async function verifyStored(
    directory: string,
    manifest: SnapshotManifest,
    signal?: AbortSignal,
  ): Promise<boolean> {
    for (const entry of manifest.entries) {
      signal?.throwIfAborted();
      if (!isRelativeSourcePath(entry.relativePath)) return false;
      const raw = await storage.read(
        storagePath(join(directory, RAW), entry.relativePath),
      );
      if (
        sha256(raw) !== entry.rawSha256 ||
        raw.byteLength !== entry.byteLength
      )
        return false;
      if (entry.kind === 'text') {
        const normalized = await storage.read(
          storagePath(join(directory, NORMALIZED), entry.relativePath),
        );
        if (sha256(normalized) !== entry.normalizedSha256) return false;
      }
    }
    const coverage = [...manifest.skipped]
      .sort((a, b) => byName(a.relativePath, b.relativePath))
      .map((entry) => [entry.relativePath, entry.kind, entry.reason]);
    return (
      manifest.snapshotHash ===
      sha256(
        JSON.stringify({
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          entries: computeSnapshotHash(manifest.entries, manifest.profileId),
          skipped: coverage,
        }),
      )
    );
  }

  return {
    async createSnapshot(request): Promise<CreateSnapshotResult> {
      if (!/^[0-9a-f-]{36}$/.test(request.snapshotId))
        throw new Error('Snapshot ID must be a server-generated UUID.');
      const staging = join(stagingDir, request.snapshotId);
      const published = join(snapshotsDir, request.snapshotId);
      // wx-like: a leftover with this ID is never reused.
      await storage.createDirectory(staging);
      try {
        const manifest = await collect(request, staging);
        await storage.writeNew(
          join(staging, MANIFEST),
          JSON.stringify(manifest),
        );
        if (request.signal.aborted) throw new SnapshotStopped();
        // Atomic on one filesystem: readers see the whole snapshot or none.
        await storage.publish(staging, published);
        return { status: 'published', manifest };
      } catch (error) {
        await storage.remove(staging);
        if (error instanceof SnapshotStopped) return { status: 'stopped' };
        if (error instanceof SnapshotFailure)
          return { status: 'failed', errorCode: error.code };
        throw error;
      }
    },

    async openSnapshot(snapshotId, signal) {
      if (!/^[0-9a-f-]{36}$/.test(snapshotId)) return undefined;
      const directory = join(snapshotsDir, snapshotId);
      let manifest: SnapshotManifest;
      try {
        const parsed: unknown = JSON.parse(
          (await storage.read(join(directory, MANIFEST))).toString('utf8'),
        );
        if (!isSnapshotManifest(parsed) || parsed.snapshotId !== snapshotId)
          return undefined;
        manifest = parsed;
        return (await verifyStored(directory, manifest, signal))
          ? manifest
          : undefined;
      } catch (error) {
        if (isChange(error) || error instanceof SyntaxError) return undefined;
        throw error;
      }
    },

    async readSnapshotFiles(manifest, signal) {
      if (!/^[0-9a-f-]{36}$/.test(manifest.snapshotId)) return undefined;
      const directory = join(snapshotsDir, manifest.snapshotId, RAW);
      const files: SnapshotFile[] = [];
      try {
        for (const entry of manifest.entries) {
          signal?.throwIfAborted();
          if (!isRelativeSourcePath(entry.relativePath)) return undefined;
          const bytes = await storage.read(
            storagePath(directory, entry.relativePath),
          );
          if (
            bytes.byteLength !== entry.byteLength ||
            sha256(bytes) !== entry.rawSha256
          )
            return undefined;
          files.push({ relativePath: entry.relativePath, bytes });
        }
      } catch (error) {
        if (isChange(error)) return undefined;
        throw error;
      }
      return files;
    },

    async discardSnapshot(snapshotId) {
      if (!/^[0-9a-f-]{36}$/.test(snapshotId)) return;
      await storage.remove(join(snapshotsDir, snapshotId));
    },

    async cleanupStaging() {
      let names: string[];
      try {
        names = await storage.names(stagingDir);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return 0;
        throw error;
      }
      // Only directories this store created: UUID-named staging copies.
      const owned = names.filter((name) => /^[0-9a-f-]{36}$/.test(name));
      for (const name of owned) await storage.remove(join(stagingDir, name));
      return owned.length;
    },
  };
}

// Structural check of a stored manifest before trusting its paths.
function isSnapshotManifest(value: unknown): value is SnapshotManifest {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === SNAPSHOT_SCHEMA_VERSION &&
    typeof record.snapshotId === 'string' &&
    typeof record.profileId === 'string' &&
    typeof record.snapshotHash === 'string' &&
    Array.isArray(record.entries) &&
    Array.isArray(record.skipped) &&
    record.entries.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).relativePath === 'string' &&
        typeof (entry as Record<string, unknown>).rawSha256 === 'string' &&
        typeof (entry as Record<string, unknown>).byteLength === 'number',
    )
  );
}
