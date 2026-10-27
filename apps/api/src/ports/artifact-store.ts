// Stores artifact payload bytes under a server-generated ID (DATA-05). The
// store never decides whether a version is public: the artifact service
// commits metadata only after `publish` returned, and reads only versions it
// has a row for.

export type StoredArtifact = { sha256: string; byteLength: number };

export interface ArtifactStore {
  // Writes to a staging copy, then renames it into place on the same
  // filesystem. On failure nothing is left under the published name.
  publish(
    artifactId: string,
    version: number,
    bytes: Uint8Array,
  ): Promise<StoredArtifact>;
  // Bytes of a published version; undefined when the file is missing.
  read(artifactId: string, version: number): Promise<Buffer | undefined>;
  // Removes a published version the database never recorded.
  discard(artifactId: string, version: number): Promise<void>;
  // Startup: removes staging copies a previous process left behind.
  cleanupStaging(): Promise<number>;
}
