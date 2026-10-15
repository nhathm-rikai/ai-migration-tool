import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSourceInventory } from './source-inventory.js';
import { findSourceProfile, type SourceProfile } from './source-profiles.js';

const FIXTURE_ROOT = fileURLToPath(
  new URL('../../../../../tests/fixtures/vb6-sample/', import.meta.url),
);

// Test-only stand-in for the future workspace provider: relative POSIX paths.
function readFixtureFiles() {
  return readdirSync(FIXTURE_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'README.md')
    .map((entry) => {
      const absolute = join(entry.parentPath, entry.name);
      return {
        relativePath: relative(FIXTURE_ROOT, absolute).split(sep).join('/'),
        bytes: readFileSync(absolute),
      };
    });
}

function profile(): SourceProfile {
  const found = findSourceProfile('vb6-cp932-v1');
  if (!found) throw new Error('profile missing');
  return found;
}

describe('buildSourceInventory on the vb6-sample fixture', () => {
  const files = readFixtureFiles();
  const inventory = buildSourceInventory({ profile: profile(), files });

  it('lists every file with role and decode result, nothing silently dropped', () => {
    expect(
      Object.fromEntries(
        inventory.files.map((file) => [
          file.manifest.relativePath,
          [
            file.manifest.role,
            file.manifest.kind,
            file.analysis?.status ?? null,
          ],
        ]),
      ),
    ).toEqual({
      'cmn/COMMON.BAS': ['code', 'text', 'analyzed'],
      'programs/SAMPLE/BUILD.LOG': ['excluded', 'excluded', null],
      'programs/SAMPLE/LEGACY.CLS': ['unsupported', 'excluded', null],
      'programs/SAMPLE/SAMPLE.BAS': ['code', 'text', 'analyzed'],
      'programs/SAMPLE/SAMPLE.VBP': ['project', 'text', null],
      'programs/SAMPLE/SAMPLEFORM.FRM': ['code', 'text', 'analyzed'],
      'programs/SAMPLE/SAMPLEFORM.FRX': ['resource', 'binary', null],
    });
    expect(inventory.totals).toMatchObject({
      files: 7,
      codeFiles: 3,
      analyzedCodeFiles: 3,
      unsupportedFiles: 1,
      errorFiles: 0,
    });
    // 24 (SAMPLE.BAS) + 7 (SAMPLEFORM.FRM) + 4 (COMMON.BAS), hand-labelled.
    expect(inventory.totals.uniqueCounters.codeLines).toBe(35);
  });

  it('resolves project members and keeps unresolved ones visible', () => {
    const [program] = inventory.programs;
    expect(inventory.programs).toHaveLength(1);
    expect(program?.name).toBe('SampleProject');
    expect(
      program?.members.map((member) => [
        member.declaredPath,
        member.relativePath,
        member.resolution,
        member.fileStatus,
      ]),
    ).toEqual([
      [
        'SAMPLEFORM.FRM',
        'programs/SAMPLE/SAMPLEFORM.FRM',
        'resolved',
        'analyzed',
      ],
      ['SAMPLE.BAS', 'programs/SAMPLE/SAMPLE.BAS', 'resolved', 'analyzed'],
      [
        '..\\..\\cmn\\Common.bas',
        'cmn/COMMON.BAS',
        'case-mismatch',
        'analyzed',
      ],
      ['MISSING.BAS', null, 'missing', null],
      ['LEGACY.CLS', 'programs/SAMPLE/LEGACY.CLS', 'resolved', 'unsupported'],
    ]);
    expect(program?.complete).toBe(false);
    expect(program?.counters.codeLines).toBe(35);
    expect(program?.externalReferences.map((ref) => ref.fileName)).toEqual([
      'stdole2.tlb',
      'SPIN32.OCX',
    ]);
  });

  it('is deterministic for the same bytes and profile', () => {
    const again = buildSourceInventory({
      profile: profile(),
      files: [...files].reverse(),
    });
    expect(again.snapshotHash).toBe(inventory.snapshotHash);
  });
});

it('marks members escaping the corpus root and duplicate paths', () => {
  const vbp = (body: string) => ({
    relativePath: 'P.VBP',
    bytes: Buffer.from(body),
  });
  const inventory = buildSourceInventory({
    profile: profile(),
    files: [vbp('Type=Exe\r\nModule=A; ..\\A.BAS\r\nForm=C:\\x\\F.FRM\r\n')],
  });
  expect(
    inventory.programs[0]?.members.map((member) => member.resolution),
  ).toEqual(['outside-root', 'absolute-path']);
  expect(() =>
    buildSourceInventory({ profile: profile(), files: [vbp(''), vbp('')] }),
  ).toThrow('Duplicate source path');
});

it('counts an undecodable file as an error, not as zero LoC', () => {
  const inventory = buildSourceInventory({
    profile: profile(),
    files: [{ relativePath: 'BAD.BAS', bytes: Uint8Array.from([0x85, 0x40]) }],
  });
  expect(inventory.files[0]).toMatchObject({
    manifest: { kind: 'error', errorCode: 'SOURCE_ENCODING_ERROR' },
    analysis: null,
  });
  expect(inventory.totals).toMatchObject({
    errorFiles: 1,
    analyzedCodeFiles: 0,
  });
});

it('does not report a program complete while lines stay unclassified', () => {
  const inventory = buildSourceInventory({
    profile: profile(),
    files: [
      {
        relativePath: 'P.VBP',
        bytes: Buffer.from('Type=Exe\r\nModule=A; A.BAS\r\n'),
      },
      {
        relativePath: 'A.BAS',
        bytes: Buffer.from('Sub A()\r\n    s = "open\r\nEnd Sub\r\n'),
      },
    ],
  });
  expect(inventory.programs[0]).toMatchObject({
    status: 'parsed',
    complete: false,
    counters: { unclassifiedLines: 1, codeLines: 2 },
  });
});

it('keeps an unparseable project file visible as unsupported', () => {
  const inventory = buildSourceInventory({
    profile: profile(),
    files: [
      {
        relativePath: 'P.VBP',
        bytes: Buffer.from('"This is not a VBP project"'),
      },
    ],
  });
  expect(inventory.programs).toHaveLength(1);
  expect(inventory.programs[0]).toMatchObject({
    projectPath: 'P.VBP',
    status: 'unsupported',
    issue: { reason: 'PROJECT_LINE_UNRECOGNIZED', line: 1 },
    members: [],
    counters: { codeLines: 0 },
    complete: false,
  });
  expect(inventory.totals.unsupportedFiles).toBe(1);
});

it('records a UTF-32 file as a decode error, not as analyzed code', () => {
  const inventory = buildSourceInventory({
    profile: profile(),
    files: [
      {
        relativePath: 'U.BAS',
        bytes: Uint8Array.from([
          0xff, 0xfe, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00,
        ]),
      },
    ],
  });
  expect(inventory.files[0]).toMatchObject({
    manifest: { kind: 'error', errorCode: 'SOURCE_ENCODING_UNSUPPORTED' },
    analysis: null,
  });
  expect(inventory.totals).toMatchObject({
    errorFiles: 1,
    analyzedCodeFiles: 0,
  });
});
