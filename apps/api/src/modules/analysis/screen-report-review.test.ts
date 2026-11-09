import { describe, expect, it } from 'vitest';
import { buildSourceInventory } from './source-inventory.js';
import { findSourceProfile } from './source-profiles.js';
import { detectVb6ReportDesigner } from './vb6/vb6-report-signals.js';
import {
  ALL_PROGRAMS,
  buildInventoryReport,
} from '../inventory-report/inventory-report.js';

// Independent review of AR04 at 71fd9f7: each test reproduces one finding.
// Fixtures are written for this test; nothing comes from customer source.

const profile = findSourceProfile('vb6-cp932-v1');
if (!profile) throw new Error('profile missing');

type TestFile = { relativePath: string; bytes: Uint8Array };
const file = (relativePath: string, ...lines: string[]): TestFile => ({
  relativePath,
  bytes: new TextEncoder().encode(lines.join('\r\n') + '\r\n'),
});
const vbp = (path: string, ...entries: string[]) =>
  file(path, 'Type=Exe', ...entries, 'Name="P"');
const bas = (path: string, ...code: string[]) =>
  file(path, 'Attribute VB_Name = "M"', ...code);
const frm = (path: string, ...code: string[]) =>
  file(
    path,
    'VERSION 5.00',
    'Begin VB.Form F',
    'End',
    'Attribute VB_Name = "F"',
    ...code,
  );
const sub = (name: string, ...body: string[]) => [
  `Public Sub ${name}()`,
  ...body,
  'End Sub',
];
const program = (
  inventory: ReturnType<typeof buildSourceInventory>,
  path: string,
) => {
  const found = inventory.programs.find((p) => p.projectPath === path);
  if (!found) throw new Error(path);
  return found;
};

describe('review finding 1: absolute OCX path in the unknown row', () => {
  const inventory = buildSourceInventory({
    profile,
    files: [
      vbp(
        'a/A.vbp',
        'Object={00025600-0000-0000-C000-000000000046}#4.6#0; C:\\Program Files\\Crystal\\crystl32.ocx',
        'Module=M; M.bas',
      ),
      bas('a/M.bas', ...sub('Main')),
    ].map((f) => (f.relativePath === 'a/M.bas' ? f : f)),
  });
  it('keeps only the file name in the analyzer row', () => {
    const row = program(inventory, 'a/A.vbp').reports?.[0];
    expect(row).toMatchObject({ kind: 'unknown', name: 'crystl32.ocx' });
    expect(JSON.stringify(program(inventory, 'a/A.vbp').reports)).not.toContain(
      'Program Files',
    );
  });
  it('is guarded in the technical report as well', () => {
    const legacyLike = JSON.parse(
      JSON.stringify(inventory),
    ) as typeof inventory;
    const row = legacyLike.programs[0]?.reports?.[0];
    if (!row) throw new Error('row');
    row.name = 'C:\\Program Files\\Crystal\\crystl32.ocx';
    const report = buildInventoryReport(legacyLike, ALL_PROGRAMS);
    expect(JSON.stringify(report)).not.toContain('Program Files');
    expect(report.reports[0]?.name).toBe('<absolute path>/crystl32.ocx');
  });
});

describe('review finding 2: VB6-exported DataReport header', () => {
  const header = [
    'VERSION 6.00',
    'Begin {78E93846-85FD-11D0-8487-00A0C90DC8A9} rptSales ',
    '   Caption         =   "Sales"',
    '   ClientHeight    =   6495',
    'End',
  ];
  it('is recognised by the designer GUID, whatever the instance name', () => {
    expect(detectVb6ReportDesigner(header)).toEqual({
      line: 2,
      name: 'rptSales',
    });
  });
  it('counts a .dsr member with that header as a detected data-report', () => {
    const inventory = buildSourceInventory({
      profile,
      files: [
        vbp('a/A.vbp', 'Designer=rptSales.Dsr', 'Module=M; M.bas'),
        file('a/rptSales.Dsr', ...header),
        bas('a/M.bas', ...sub('Main')),
      ],
    });
    expect(program(inventory, 'a/A.vbp').reports).toEqual([
      expect.objectContaining({
        kind: 'data-report',
        name: 'rptSales',
        confidence: 'detected',
      }),
    ]);
    expect(inventory.totals.screenReport?.reports.counted).toBe(1);
  });
  it('still leaves a DataEnvironment designer out', () => {
    expect(
      detectVb6ReportDesigner([
        'VERSION 6.00',
        'Begin {C0A63B80-4B21-11D3-BD95-D426EF2C7949} DataEnvironment DE1',
      ]),
    ).toBeNull();
  });
});

describe('review finding 3: same-name .rpt in different folders', () => {
  const caller = bas(
    'app/M.bas',
    ...sub(
      'Show1',
      '    a.ReportFileName = "Reports\\Order.rpt"',
      '    b.ReportFileName = "Archive\\Order.rpt"',
    ),
  );
  const build = (known: string[]) =>
    buildSourceInventory({
      profile,
      files: [vbp('app/A.vbp', 'Module=M; M.bas'), caller],
      knownPaths: known,
    });
  const rows = (known: string[]) =>
    program(build(known), 'app/A.vbp').reports ?? [];

  it('keeps two rows and flags both as missing when only another folder has the file', () => {
    const found = rows(['Other/Order.rpt']);
    expect(found).toHaveLength(2);
    for (const row of found)
      expect(row).toMatchObject({
        confidence: 'referenced',
        warnings: ['REPORT_FILE_MISSING'],
      });
    expect(found.map((row) => row.name).sort()).toEqual([
      'Archive/Order.rpt',
      'Reports/Order.rpt',
    ]);
  });

  it('finds a design file only where the written path resolves', () => {
    const found = rows(['app/Reports/Order.rpt']);
    const byName = Object.fromEntries(found.map((row) => [row.name, row]));
    expect(byName['Reports/Order.rpt']).toMatchObject({
      confidence: 'detected',
      warnings: [],
    });
    expect(byName['Archive/Order.rpt']).toMatchObject({
      confidence: 'referenced',
    });
  });

  it('resolves case-insensitively and from the source root too', () => {
    expect(rows(['app/reports/ORDER.RPT'])[0]?.confidence).toBe('detected');
    expect(rows(['Reports/Order.rpt'])[0]?.confidence).toBe('detected');
  });

  it('never resolves an absolute path by file name alone', () => {
    const inventory = buildSourceInventory({
      profile,
      files: [
        vbp('app/A.vbp', 'Module=M; M.bas'),
        bas(
          'app/M.bas',
          ...sub('S', '    r.ReportFileName = "C:\\X\\Order.rpt"'),
        ),
      ],
      knownPaths: ['Other/Order.rpt'],
    });
    expect(program(inventory, 'app/A.vbp').reports?.[0]).toMatchObject({
      name: 'Order.rpt',
      confidence: 'referenced',
    });
  });
});

describe('review finding 4: calls factor stays inside the program', () => {
  const rpt = '    r.ReportFileName = "r.rpt"';
  const caller = bas(
    'a/M.bas',
    ...sub('Show1', rpt, '    Foo', '    Bar', '    Baz'),
  );
  const scoreWith = (extra: TestFile[]) => {
    const inventory = buildSourceInventory({
      profile,
      files: [vbp('a/A.vbp', 'Module=M; M.bas'), caller, ...extra],
      knownPaths: ['r.rpt'],
    });
    return program(inventory, 'a/A.vbp').reports?.[0]?.complexity;
  };
  it('is not raised by same-name procedures of an unrelated program', () => {
    const alone = scoreWith([]);
    const withOther = scoreWith([
      vbp('b/B.vbp', 'Module=O; O.bas'),
      bas('b/O.bas', ...sub('Foo'), ...sub('Bar'), ...sub('Baz')),
    ]);
    expect(withOther?.score).toBe(alone?.score);
    expect(withOther?.factors.find((f) => f.factor === 'calls')).toMatchObject({
      value: 0,
    });
  });
  it('counts procedures the program itself resolves', () => {
    const own = scoreWith(
      [
        file(
          'a/O.bas',
          'Attribute VB_Name = "O"',
          ...sub('Foo'),
          ...sub('Bar'),
          ...sub('Baz'),
        ),
      ].map((f) => f),
    );
    // O.bas is not a member of the program, so nothing resolves.
    expect(own?.factors.find((f) => f.factor === 'calls')).toMatchObject({
      value: 0,
    });
    const inventory = buildSourceInventory({
      profile,
      files: [
        vbp('a/A.vbp', 'Module=M; M.bas', 'Module=O; O.bas'),
        caller,
        bas('a/O.bas', ...sub('Foo'), ...sub('Bar'), ...sub('Baz')),
      ],
      knownPaths: ['r.rpt'],
    });
    expect(
      program(inventory, 'a/A.vbp').reports?.[0]?.complexity.factors.find(
        (f) => f.factor === 'calls',
      ),
    ).toMatchObject({ value: 3, points: 1 });
  });
});

describe('review finding 5: files that differ only in case, both resolved', () => {
  const inventory = buildSourceInventory({
    profile,
    files: [
      vbp('a/A.vbp', 'Form=Main.frm', 'Form=main.frm'),
      frm('a/Main.frm', ...sub('Go', '    Printer.Print "x"')),
      frm('a/main.frm', ...sub('Go', '    Printer.Print "y"')),
    ],
  });
  it('counts each resolved file as its own screen and report', () => {
    const a = program(inventory, 'a/A.vbp');
    expect(a.screens?.map((s) => s.file)).toEqual(['a/Main.frm', 'a/main.frm']);
    expect(a.reports).toHaveLength(2);
    expect(inventory.totals.screenReport).toMatchObject({
      screens: 2,
      reports: { rows: 2 },
    });
  });
});
