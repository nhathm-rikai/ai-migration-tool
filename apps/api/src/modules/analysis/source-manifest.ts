import { createHash } from 'node:crypto';
import type { SourceFileRole } from './language-analyzer.js';
import {
  decodeSourceBytes,
  SOURCE_DECODER_VERSION,
  type DecodeFailureCode,
  type EncodingDecisionSource,
  type ProfileEncoding,
  type SourceEncoding,
} from './source-decoder.js';
import {
  SOURCE_NORMALIZATION_VERSION,
  splitSourceLines,
  toNormalizedText,
  type NewlineStyle,
  type SourceLines,
} from './source-text.js';

// One manifest entry per file in a snapshot. Raw bytes are hashed before
// decoding; text entries also record the normalized (LF, UTF-8) hash.

type EntryBase = {
  relativePath: string;
  role: SourceFileRole;
  byteLength: number;
  rawSha256: string;
};

export type ManifestEntry =
  | (EntryBase & {
      kind: 'text';
      encoding: SourceEncoding;
      encodingSource: EncodingDecisionSource;
      normalizedSha256: string;
      lineCount: number;
      newlineStyle: NewlineStyle;
    })
  | (EntryBase & { kind: 'binary' | 'excluded' })
  | (EntryBase & {
      kind: 'error';
      errorCode: DecodeFailureCode;
      attemptedEncoding: SourceEncoding | null;
    });

export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

const SEGMENT_INVALID = /^(?:|\.|\.\.)$/;

// Snapshot paths are relative POSIX paths produced by the workspace layer;
// anything else is a programming error, not user data.
export function isRelativeSourcePath(path: string): boolean {
  return (
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !/^[A-Za-z]:/.test(path) &&
    path.split('/').every((segment) => !SEGMENT_INVALID.test(segment))
  );
}

export function createManifestEntry(input: {
  relativePath: string;
  role: SourceFileRole;
  bytes: Uint8Array;
  profileEncoding: ProfileEncoding | null;
  override?: ProfileEncoding;
}): { entry: ManifestEntry; lines: SourceLines | null } {
  if (!isRelativeSourcePath(input.relativePath))
    throw new Error(`Invalid relative source path: ${input.relativePath}`);
  const base: EntryBase = {
    relativePath: input.relativePath,
    role: input.role,
    byteLength: input.bytes.byteLength,
    rawSha256: sha256(input.bytes),
  };
  if (input.role === 'resource')
    return { entry: { ...base, kind: 'binary' }, lines: null };
  if (input.role !== 'code' && input.role !== 'project')
    return { entry: { ...base, kind: 'excluded' }, lines: null };

  const decoded = decodeSourceBytes(input.bytes, {
    profileEncoding: input.profileEncoding,
    ...(input.override ? { override: input.override } : {}),
  });
  if (!decoded.ok)
    return {
      entry: {
        ...base,
        kind: 'error',
        errorCode: decoded.code,
        attemptedEncoding: decoded.attemptedEncoding,
      },
      lines: null,
    };
  const lines = splitSourceLines(decoded.text);
  return {
    entry: {
      ...base,
      kind: 'text',
      encoding: decoded.encoding,
      encodingSource: decoded.decisionSource,
      normalizedSha256: sha256(toNormalizedText(lines)),
      lineCount: lines.lines.length,
      newlineStyle: lines.newlineStyle,
    },
    lines,
  };
}

// Same bytes decoded under a different profile/decoder/normalization must
// produce a different snapshot identity.
export function computeSnapshotHash(
  entries: readonly ManifestEntry[],
  profileId: string,
): string {
  const sorted = [...entries].sort((a, b) =>
    a.relativePath < b.relativePath
      ? -1
      : a.relativePath > b.relativePath
        ? 1
        : 0,
  );
  return sha256(
    JSON.stringify({
      profileId,
      decoderVersion: SOURCE_DECODER_VERSION,
      normalizationVersion: SOURCE_NORMALIZATION_VERSION,
      entries: sorted.map((entry) => [
        entry.relativePath,
        entry.kind,
        entry.rawSha256,
        entry.kind === 'text' ? entry.encoding : null,
        entry.kind === 'text' ? entry.normalizedSha256 : null,
      ]),
    }),
  );
}
