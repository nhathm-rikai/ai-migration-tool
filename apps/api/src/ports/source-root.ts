// Filesystem policy for a registered source root (B03, DATA-03). The service
// decides registration and revisions; the adapter only answers where a path
// physically is and whether it may be read. Nothing here walks the source.

export type SourceRootRejection =
  // Not an absolute local path in a form this OS accepts.
  | 'INVALID_INPUT'
  // Network/device path, or overlaps the application or its data directory
  // (directly or through a link).
  | 'SOURCE_FORBIDDEN'
  // Missing, not a directory or not readable by this process.
  | 'SOURCE_UNREADABLE';

export type ResolvedSourceRoot = {
  // Canonical physical path; server-internal, never sent to clients or logs.
  root: string;
  // Last path segment, safe to show.
  displayName: string;
};

export interface SourceRootPolicy {
  resolve(
    rootPath: string,
  ):
    | ({ ok: true } & ResolvedSourceRoot)
    | { ok: false; code: SourceRootRejection };
  // Cheap re-check of a registered root: still the same physical directory,
  // still allowed and readable.
  check(root: string): 'ready' | 'unreadable';
}
