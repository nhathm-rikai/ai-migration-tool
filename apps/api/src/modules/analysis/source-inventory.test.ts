import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SourceInventorySchema,
  type SourceInventoryDocument,
} from '@portal/contracts';
import { Check, Errors } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { programSummaryCsv } from './program-summary.js';
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

  it('matches the published source-inventory-v1 schema', () => {
    // Compile-time: the producer type is assignable to the contract.
    const document: SourceInventoryDocument = inventory;
    expect([...Errors(SourceInventorySchema, document)]).toEqual([]);
    expect(Check(SourceInventorySchema, document)).toBe(true);
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

it('marks modules listed by several programs as shared and links calls', () => {
  const text = (relativePath: string, body: string) => ({
    relativePath,
    bytes: Buffer.from(body.replaceAll('\n', '\r\n')),
  });
  const inventory = buildSourceInventory({
    profile: profile(),
    files: [
      text('a/A.VBP', 'Type=Exe\nModule=A; A.BAS\nModule=C; ..\\cmn\\C.TXT\n'),
      text('b/B.VBP', 'Type=Exe\nModule=C; ..\\cmn\\C.TXT\n'),
      text('a/A.BAS', 'Sub Main()\n    LogIt\nEnd Sub\n'),
      text(
        'cmn/C.TXT',
        'Public Sub LogIt()\n    x = "SELECT 1 FROM T1"\nEnd Sub\n',
      ),
    ],
  });
  const program = inventory.programs.find((p) => p.projectPath === 'a/A.VBP');
  expect(program?.members.map((m) => [m.relativePath, m.shared])).toEqual([
    ['a/A.BAS', false],
    ['cmn/C.TXT', true],
  ]);
  expect(program?.analysis?.calls).toMatchObject([
    { name: 'LogIt', resolution: 'program', targets: ['cmn/C.TXT#sub:LogIt'] },
  ]);
  expect(program?.analysis?.crud).toMatchObject([
    { table: 'T1', operations: ['R'], viaSharedOnly: true },
  ]);
  expect(program?.analysis?.metrics.ownCodeLines).toBe(3);
});

it('writes one CSV row per program with a BOM and quoted cells', () => {
  const inventory = buildSourceInventory({
    profile: profile(),
    files: [
      {
        relativePath: 'P.VBP',
        bytes: Buffer.from('Type=Exe\r\nName="A, B"\r\n'),
      },
    ],
  });
  const [header, row] = programSummaryCsv(inventory).split('\r\n');
  expect(header?.startsWith('\uFEFFprojectPath,name,status')).toBe(true);
  expect(row?.startsWith('P.VBP,"A, B",parsed,true,0,0,0,0')).toBe(true);
});

it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\t=1'])(
  'exports the program name %j as text, not a formula',
  (name) => {
    const inventory = buildSourceInventory({
      profile: profile(),
      files: [
        {
          relativePath: 'P.VBP',
          bytes: Buffer.from(`Type=Exe\r\nName="${name}"\r\n`),
        },
      ],
    });
    const row = programSummaryCsv(inventory).split('\r\n')[1] ?? '';
    expect(row.split(',')[1]).toBe(`'${name}`);
  },
);

it('keeps recursive calls in the program call graph', () => {
  const inventory = buildSourceInventory({
    profile: profile(),
    files: [
      {
        relativePath: 'P.VBP',
        bytes: Buffer.from('Type=Exe\r\nModule=M; M.BAS\r\n'),
      },
      {
        relativePath: 'M.BAS',
        bytes: Buffer.from(
          'Function Recur(n As Long) As Long\r\n    If n > 0 Then Recur = Recur(n - 1)\r\nEnd Function\r\n',
        ),
      },
    ],
  });
  expect(inventory.programs[0]?.analysis?.calls).toEqual([
    {
      from: 'M.BAS#function:Recur',
      name: 'Recur',
      resolution: 'local',
      targets: ['M.BAS#function:Recur'],
      line: 2,
      count: 1,
    },
  ]);
});
