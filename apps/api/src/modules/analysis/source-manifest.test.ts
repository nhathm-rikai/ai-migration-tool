import { expect, it } from 'vitest';
import {
  computeSnapshotHash,
  createManifestEntry,
  sha256,
} from './source-manifest.js';

const bytes = Buffer.from('Option Explicit\r\nx = 1\r\n');

it('hashes raw bytes and the LF-normalized view separately', () => {
  const { entry, lines } = createManifestEntry({
    relativePath: 'A/MOD.BAS',
    role: 'code',
    bytes,
    profileEncoding: 'cp932',
  });
  expect(entry).toEqual({
    relativePath: 'A/MOD.BAS',
    role: 'code',
    byteLength: bytes.byteLength,
    rawSha256: sha256(bytes),
    kind: 'text',
    encoding: 'ascii',
    encodingSource: 'ascii',
    normalizedSha256: sha256('Option Explicit\nx = 1\n'),
    lineCount: 2,
    newlineStyle: 'crlf',
  });
  expect(lines?.lines).toEqual(['Option Explicit', 'x = 1']);
});

it('keeps binary/excluded files out of decoding and records decode failures', () => {
  const binary = Uint8Array.from([0x00, 0xff]);
  expect(
    createManifestEntry({
      relativePath: 'F.FRX',
      role: 'resource',
      bytes: binary,
      profileEncoding: 'cp932',
    }),
  ).toEqual({
    entry: {
      relativePath: 'F.FRX',
      role: 'resource',
      byteLength: 2,
      rawSha256: sha256(binary),
      kind: 'binary',
    },
    lines: null,
  });
  expect(
    createManifestEntry({
      relativePath: 'BAD.BAS',
      role: 'code',
      bytes: Uint8Array.from([0x85, 0x40]),
      profileEncoding: 'cp932',
    }).entry,
  ).toMatchObject({
    kind: 'error',
    errorCode: 'SOURCE_ENCODING_ERROR',
    attemptedEncoding: 'cp932',
  });
});

it.each([
  '/abs/A.BAS',
  'C:/A.BAS',
  '..\\A.BAS',
  '../A.BAS',
  'a//b.bas',
  'a/./b.bas',
])('rejects non-relative snapshot path %j', (relativePath) => {
  expect(() =>
    createManifestEntry({
      relativePath,
      role: 'code',
      bytes,
      profileEncoding: 'cp932',
    }),
  ).toThrow('Invalid relative source path');
});

it('changes the snapshot identity with the profile but not with entry order', () => {
  const entry = (relativePath: string) =>
    createManifestEntry({
      relativePath,
      role: 'code',
      bytes,
      profileEncoding: 'cp932',
    }).entry;
  const entries = [entry('B.BAS'), entry('A.BAS')];
  const hash = computeSnapshotHash(entries, 'profile-a');
  expect(computeSnapshotHash([...entries].reverse(), 'profile-a')).toBe(hash);
  expect(computeSnapshotHash(entries, 'profile-b')).not.toBe(hash);
});
