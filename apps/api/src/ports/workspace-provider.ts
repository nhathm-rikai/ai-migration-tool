import type { RunErrorCode } from '@portal/contracts';
import type { ManifestEntry } from '../modules/analysis/source-manifest.js';
import type { SourceProfile } from '../modules/analysis/source-profiles.js';

// Immutable source snapshots (B06). The provider copies the allowed files of
// a registered root into app-owned storage and publishes the snapshot
// directory atomically; the caller records it in the database. Nothing is
// ever written to the source.

export const SNAPSHOT_SCHEMA_VERSION = 'source-snapshot-v1';

// Files seen but not copied. They stay in the manifest so coverage never
// assumes 100%.
export type SkippedReason =
  // Symlink, junction or other reparse point: never followed.
  | 'link'
  // Not a source type of the profile (agent settings, logs, builds...).
  | 'excluded'
  | 'too-large'
  // Socket, FIFO, device.
  | 'special'
  | 'unreadable'
  // Not representable as a portable relative path (e.g. `\` on POSIX).
  | 'invalid-name';

export type SkippedEntry = {
  relativePath: string;
  kind: 'file' | 'directory' | 'other';
  reason: SkippedReason;
  // From lstat, when known; the content was not read.
  byteLength: number | null;
};

export type SnapshotManifest = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  profileId: string;
  decoderVersion: string;
  normalizationVersion: string;
  snapshotHash: string;
  fileCount: number;
  totalBytes: number;
  entries: ManifestEntry[];
  skipped: SkippedEntry[];
};

export type SnapshotFile = { relativePath: string; bytes: Uint8Array };

export type SnapshotLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

export type SnapshotFailureCode = Extract<
  RunErrorCode,
  'SOURCE_UNREADABLE' | 'SOURCE_CHANGED' | 'SOURCE_LIMIT_EXCEEDED'
>;

export type CreateSnapshotRequest = {
  snapshotId: string;
  // Canonical root, already revalidated against the source policy.
  root: string;
  profile: SourceProfile;
  limits: SnapshotLimits;
  // Aborted on cancel/timeout/shutdown: stop and discard the staging copy.
  signal: AbortSignal;
  // Called after each file was read, before the next one; tests use it to
  // change the source in the middle of a copy.
  afterFileRead?: (relativePath: string) => Promise<void> | void;
};

export type CreateSnapshotResult =
  | { status: 'published'; manifest: SnapshotManifest }
  | { status: 'failed'; errorCode: SnapshotFailureCode }
  | { status: 'stopped' };

export interface WorkspaceProvider {
  createSnapshot(request: CreateSnapshotRequest): Promise<CreateSnapshotResult>;
  // Reads a published snapshot back and verifies every hash; undefined when
  // it is missing or does not match its manifest.
  openSnapshot(snapshotId: string): Promise<SnapshotManifest | undefined>;
  // Raw bytes of every manifest entry, in manifest order, each checked
  // against its recorded hash and size; undefined when any does not match.
  readSnapshotFiles(
    manifest: SnapshotManifest,
  ): Promise<SnapshotFile[] | undefined>;
  // Removes a published snapshot the database never recorded.
  discardSnapshot(snapshotId: string): Promise<void>;
  // Startup: removes staging copies a previous process left behind.
  cleanupStaging(): Promise<number>;
}
