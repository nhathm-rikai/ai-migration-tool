import {
  deriveReportSummary,
  REPORT_COUNTING_BASIS,
  SourceInventorySchema,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_COMPLEXITY_CONFIG,
  REPORT_COMPLEXITY_VERSION,
  scoreReportComplexity,
} from './screen-report.js';
import { buildSourceInventory } from './source-inventory.js';
import { findSourceProfile } from './source-profiles.js';

// Fixtures are written for this test; nothing comes from customer source.
const profile = findSourceProfile('vb6-cp932-v1');
if (!profile) throw new Error('profile missing');

type TestFile = { relativePath: string; bytes: Uint8Array };

const file = (relativePath: string, ...lines: string[]): TestFile => ({
  relativePath,
  bytes: new TextEncoder().encode(lines.join('\r\n') + '\r\n'),
});
const at = (relativePath: string, source: TestFile): TestFile => ({
  ...source,
  relativePath,
});
const vbp = (path: string, ...entries: string[]) =>
  file(path, 'Type=Exe', ...entries, 'Name="P"');
const frm = (name: string, ...code: string[]) =>
  file(
    `${name}.frm`,
    'VERSION 5.00',
    `Begin VB.Form ${name}`,
    'End',
    `Attribute VB_Name = "${name}"`,
    ...code,
  );
const bas = (name: string, ...code: string[]) =>
  file(`${name}.bas`, `Attribute VB_Name = "${name}"`, ...code);
const sub = (name: string, ...body: string[]) => [
  `Public Sub ${name}()`,
  ...body,
  'End Sub',
];

const build = (...files: TestFile[]) =>
  buildSourceInventory({ profile, files });
type Inventory = ReturnType<typeof build>;
const program = (inventory: Inventory, projectPath: string) => {
  const found = inventory.programs.find((p) => p.projectPath === projectPath);
  if (!found) throw new Error(`no program ${projectPath}`);
  return found;
};

describe('AR04-AC01 screens and batch', () => {
  const inventory = build(
    vbp(
      'a/A.vbp',
      'Form=F1.frm',
      'Form=F2.frm',
      'Form=F3.frm',
      'Module=M; M.bas',
      'Startup="F1"',
    ),
    vbp('b/B.vbp', 'Form=..\\a\\F1.frm', 'Module=M; M.bas'),
    vbp('c/C.vbp', 'Module=M; M.bas', 'Startup="Sub Main"'),
    vbp('d/D.vbp', 'Form=F9.frm', 'Module=M; M.bas', 'Startup="Sub Main"'),
    ...['F1', 'F2', 'F3'].map((name) =>
      at(`a/${name}.frm`, frm(name, ...sub('Go'))),
    ),
    at('a/M.bas', bas('M', ...sub('Main'))),
    at('b/M.bas', bas('M', ...sub('Main'))),
    at('c/M.bas', bas('M', ...sub('Main'))),
    at('d/M.bas', bas('M', ...sub('Main'))),
    at('d/F9.frm', frm('F9', ...sub('Go'))),
  );

  it('counts 3 screens for a program with 3 forms and 1 module', () => {
    const a = program(inventory, 'a/A.vbp');
    expect(a.screens?.map((s) => s.file)).toEqual([
      'a/F1.frm',
      'a/F2.frm',
      'a/F3.frm',
    ]);
    expect(a.programType).toBe('screen');
  });

  it('flags a form declared by two programs as shared and counts it once overall', () => {
    expect(
      program(inventory, 'a/A.vbp').screens?.find((s) => s.file === 'a/F1.frm')
        ?.shared,
    ).toBe(true);
    expect(program(inventory, 'b/B.vbp').screens).toHaveLength(1);
    // F1, F2, F3 (A) and F9 (D) = 4 distinct forms; only F1 is shared.
    expect(inventory.totals.screenReport).toMatchObject({
      screens: 4,
      sharedScreens: 1,
    });
  });

  it('is a batch only without forms and with Sub Main startup', () => {
    expect(program(inventory, 'c/C.vbp')).toMatchObject({
      programType: 'batch',
      screens: [],
    });
    expect(program(inventory, 'd/D.vbp').programType).toBe('screen');
    expect(inventory.totals.screenReport?.batches).toBe(1);
  });

  it('is unknown without forms and without Sub Main', () => {
    const only = build(
      vbp('x/X.vbp', 'Module=M; M.bas'),
      at('x/M.bas', bas('M', ...sub('Main'))),
    );
    expect(program(only, 'x/X.vbp').programType).toBe('unknown');
  });

  it('counts a form that cannot be analyzed or is missing, with a warning', () => {
    const broken = build(
      vbp('x/X.vbp', 'Form=Bad.frm', 'Form=Gone.frm'),
      file('x/Bad.frm', 'not a form designer', 'Sub A()', 'End Sub'),
    );
    expect(program(broken, 'x/X.vbp').screens).toEqual([
      expect.objectContaining({
        file: 'x/Bad.frm',
        warnings: ['SCREEN_FILE_NOT_ANALYZED'],
      }),
      expect.objectContaining({
        file: 'x/Gone.frm',
        warnings: ['SCREEN_FILE_MISSING'],
      }),
    ]);
  });
});

describe('AR04-AC02/AC03 report rows', () => {
  const rptCall = (name: string) =>
    sub('Show1', `    rpt.ReportFileName = "${name}"`);

  it('gives each row file and line, detected when the .rpt exists', () => {
    const inventory = buildSourceInventory({
      profile,
      files: [
        vbp('a/A.vbp', 'Module=M; M.bas'),
        at(
          'a/M.bas',
          bas(
            'M',
            ...rptCall('has.rpt'),
            ...sub('Other', '    Printer.Print "x"'),
          ),
        ),
      ],
      knownPaths: ['a/has.rpt'],
    });
    expect(program(inventory, 'a/A.vbp').reports).toEqual([
      expect.objectContaining({
        kind: 'crystal',
        name: 'has.rpt',
        file: 'a/M.bas',
        line: 3,
        confidence: 'detected',
        warnings: [],
      }),
      expect.objectContaining({
        kind: 'print',
        file: 'a/M.bas',
        line: 6,
        confidence: 'suspected',
      }),
    ]);
  });

  it('marks a .rpt that is only named as referenced with REPORT_FILE_MISSING', () => {
    const inventory = build(
      vbp('a/A.vbp', 'Module=M; M.bas'),
      at('a/M.bas', bas('M', ...rptCall('gone.rpt'))),
    );
    expect(program(inventory, 'a/A.vbp').reports).toEqual([
      expect.objectContaining({
        kind: 'crystal',
        confidence: 'referenced',
        warnings: ['REPORT_FILE_MISSING'],
      }),
    ]);
  });

  it('adds one unknown/suspected row for a Crystal OCX without any report code', () => {
    const inventory = build(
      vbp(
        'a/A.vbp',
        'Object={00025600-0000-0000-C000-000000000046}#4.6#0; crystl32.ocx',
        'Module=M; M.bas',
      ),
      at('a/M.bas', bas('M', ...sub('Main'))),
    );
    expect(program(inventory, 'a/A.vbp').reports).toEqual([
      expect.objectContaining({
        kind: 'unknown',
        confidence: 'suspected',
        file: 'a/A.vbp',
        line: null,
      }),
    ]);
  });

  it('reads a DataReport .dsr member as a detected data-report with its header line', () => {
    const inventory = build(
      vbp('a/A.vbp', 'Designer=rptOrder.Dsr', 'Module=M; M.bas'),
      file(
        'a/rptOrder.Dsr',
        'VERSION 6.00',
        'Begin {C0A63B80-4B21-11D3-BD95-D426EF2C7949} DataReport rptOrder',
        'End',
      ),
      at('a/M.bas', bas('M', ...sub('Main'))),
    );
    expect(program(inventory, 'a/A.vbp').reports).toEqual([
      expect.objectContaining({
        kind: 'data-report',
        name: 'rptOrder',
        file: 'a/rptOrder.Dsr',
        line: 2,
        confidence: 'detected',
      }),
    ]);
  });
});

describe('AR04-AC04/AC11 totals', () => {
  const inventory = build(
    vbp('a/A.vbp', 'Module=Common; ..\\cmn\\C.bas', 'Module=M; M.bas'),
    vbp('b/B.vbp', 'Module=Common; ..\\cmn\\C.bas'),
    at(
      'cmn/C.bas',
      bas('C', ...sub('Shared1', '    rpt.ReportFileName = "s.rpt"')),
    ),
    at(
      'a/M.bas',
      bas(
        'M',
        ...sub('P1', '    Printer.Print "a"', '    Printer.EndDoc'),
        ...sub('P2', '    Printer.Print "b"'),
        ...sub(
          'X',
          '    Set x = CreateObject("Excel.Application")',
          '    x.ActiveSheet.Cells(1, 1).Value = "x"',
        ),
      ),
    ),
  );

  it('counts a report of a shared file in every program but once in the project', () => {
    expect(program(inventory, 'a/A.vbp').reports?.[0]).toMatchObject({
      name: 's.rpt',
      shared: true,
    });
    expect(program(inventory, 'b/B.vbp').reports).toHaveLength(1);
    expect(inventory.totals.screenReport?.reports).toMatchObject({
      rows: 4,
      counted: 1,
      suspected: 3,
    });
  });

  it('keeps suspected rows out of the counted total and counts programs', () => {
    // One row per kind/name/procedure: Printer twice in P1 is one row.
    expect(inventory.totals.screenReport?.reports.byKind).toEqual({
      'data-report': 0,
      crystal: 1,
      excel: 1,
      print: 2,
      'file-output': 0,
      unknown: 0,
    });
    expect(inventory.totals.screenReport?.suspectedPrograms).toBe(1);
  });

  it('has the same total by kind, by level and in the list', () => {
    const reports = inventory.totals.screenReport?.reports;
    const sum = (record: Record<string, number> | undefined) =>
      Object.values(record ?? {}).reduce((a, b) => a + b, 0);
    expect(sum(reports?.byKind)).toBe(reports?.rows);
    expect(sum(reports?.byLevel)).toBe(reports?.rows);
    // Prints and exports are scored too; only rows with no holding procedure
    // (the DataReport design, file-level code) stay unrated.
    expect(reports?.byLevel.unrated).toBeLessThan(reports?.rows ?? 0);
  });
});

describe('AR04-AC09/AC10 report complexity', () => {
  // One template per procedure: procedures of the same template are one unit
  // and are scored together (AR06).
  const rptOf = (name: string) => `    rpt.ReportFileName = "${name}.rpt"`;
  const branches = (count: number) =>
    Array.from({ length: count }, (_, i) => [
      `    If a${i} > 0 Then`,
      `        b = b + ${i}`,
      '    End If',
    ]).flat();
  const reportsOf = (...procedures: string[][]) => {
    const inventory = buildSourceInventory({
      profile,
      files: [
        vbp('a/A.vbp', 'Module=M; M.bas'),
        at('a/M.bas', bas('M', ...procedures.flat())),
      ],
      knownPaths: ['r.rpt', 'r1.rpt', 'r2.rpt', 'r3.rpt'],
    });
    return program(inventory, 'a/A.vbp').reports ?? [];
  };

  const simple = sub('Simple', rptOf('r1'));
  const branchy = sub(
    'Branchy',
    rptOf('r2'),
    ...branches(35),
    '    s = "SELECT A FROM T1"',
    '    s = "SELECT A FROM T2"',
    '    s = "SELECT A FROM T3"',
    '    s = "SELECT A FROM T4"',
  );
  const dynamic = sub(
    'Dynamic',
    rptOf('r3'),
    ...branches(35),
    '    s = "SELECT A FROM T1"',
    '    s = "SELECT A FROM T2"',
    '    s = "SELECT A FROM T3"',
    '    s = "SELECT A FROM T4"',
    '    s = "SELECT A FROM " & tbl',
  );

  it('gives three same-kind reports three different levels with a factor sum equal to the score', () => {
    const reports = reportsOf(simple, branchy, dynamic);
    // The simple report scores 0 but its .rpt design is not analyzed, so it
    // is floored to medium instead of low (AC10).
    expect(reports.map((r) => r.complexity.level)).toEqual([
      'medium',
      'high',
      'very-high',
    ]);
    expect(reports[0]?.complexity).toMatchObject({
      score: 0,
      reason: 'DESIGN_NOT_ANALYZED_FLOOR',
    });
    for (const report of reports) {
      expect(report.complexity.version).toBe(REPORT_COMPLEXITY_VERSION);
      expect(
        report.complexity.factors.reduce((sum, f) => sum + f.points, 0),
      ).toBe(report.complexity.score);
    }
    expect(
      reports[2]?.complexity.factors.find((f) => f.factor === 'dynamicSql'),
    ).toMatchObject({ value: 1, points: 3 });
  });

  it('rates a simple report low when nothing about it is missing', () => {
    const none = {
      decisionPoints: 0,
      executableLines: 3,
      tables: 0,
      dynamicSql: 0,
      calls: 0,
    };
    expect(scoreReportComplexity(none).level).toBe('low');
    expect(
      scoreReportComplexity(none, undefined, { designNotAnalyzed: true }).level,
    ).toBe('medium');
  });

  it('changes the level by changing only the constants', () => {
    const evidence = {
      decisionPoints: 16,
      executableLines: 20,
      tables: 4,
      dynamicSql: 0,
      calls: 0,
    };
    const base = scoreReportComplexity(
      evidence,
      DEFAULT_REPORT_COMPLEXITY_CONFIG,
    );
    const stricter = scoreReportComplexity(evidence, {
      ...DEFAULT_REPORT_COMPLEXITY_CONFIG,
      levelThresholds: [1, 2, 3],
    });
    expect(base.score).toBe(stricter.score);
    expect(base.level).toBe('medium');
    expect(stricter.level).toBe('very-high');
  });

  it('scores a print or export on the procedure that holds it, without a design floor', () => {
    const inventory = build(
      vbp('a/A.vbp', 'Module=M; M.bas'),
      at(
        'a/M.bas',
        bas(
          'M',
          'Sub Pr()',
          '    If a Then',
          '        Printer.Print "x"',
          '    End If',
          'End Sub',
        ),
      ),
    );
    const [row] = program(inventory, 'a/A.vbp').reports ?? [];
    expect(row?.kind).toBe('print');
    expect(row?.complexity.level).not.toBe('unrated');
    expect(row?.complexity.score).not.toBeNull();
    // No design file, so no design factor and no floor.
    expect(row?.complexity.reason).toBeUndefined();
    expect(
      row?.complexity.factors.some((f) => f.factor === 'design-not-analyzed'),
    ).toBe(false);
  });

  it('never rates missing data as low: no-procedure rows are unrated', () => {
    const inventory = build(
      vbp('a/A.vbp', 'Module=M; M.bas'),
      at('a/M.bas', bas('M', 'Printer.Print "top"')),
    );
    const [row] = program(inventory, 'a/A.vbp').reports ?? [];
    expect(row?.complexity).toMatchObject({ level: 'unrated', score: null });
    expect(row?.complexity.reason).toBe('NO_PROCEDURE');
    const noProcedure = buildSourceInventory({
      profile,
      files: [
        vbp('a/A.vbp', 'Module=M; M.bas'),
        at('a/M.bas', bas('M', 'x = "n.rpt"')),
      ],
      knownPaths: ['n.rpt'],
    });
    expect(
      program(noProcedure, 'a/A.vbp').reports?.[0]?.complexity,
    ).toMatchObject({ level: 'unrated', reason: 'NO_PROCEDURE' });
  });

  it('scores only the calling code of a missing .rpt design and never as low', () => {
    const inventory = build(
      vbp('a/A.vbp', 'Module=M; M.bas'),
      at('a/M.bas', bas('M', ...simple)),
    );
    const complexity = program(inventory, 'a/A.vbp').reports?.[0]?.complexity;
    expect(complexity?.level).toBe('medium');
    expect(complexity?.factors.map((f) => f.factor)).toContain(
      'design-not-analyzed',
    );
  });

  it('keeps a .dsr data-report unrated with the design-not-analyzed factor', () => {
    const inventory = build(
      vbp('a/A.vbp', 'Designer=r.Dsr'),
      file(
        'a/r.Dsr',
        'Begin {C0A63B80-4B21-11D3-BD95-D426EF2C7949} DataReport r',
      ),
    );
    const complexity = program(inventory, 'a/A.vbp').reports?.[0]?.complexity;
    expect(complexity?.level).toBe('unrated');
    expect(complexity?.factors.map((f) => f.factor)).toEqual([
      'design-not-analyzed',
    ]);
  });
});

describe('AR04-AC05 compatibility', () => {
  it('validates a new inventory and the same inventory without the new fields', () => {
    const inventory = build(
      vbp('a/A.vbp', 'Form=F1.frm'),
      at('a/F1.frm', frm('F1', ...sub('Go'))),
    );
    const document = { ...inventory, skipped: [] };
    expect(Check(SourceInventorySchema, document)).toBe(true);
    const legacy = JSON.parse(JSON.stringify(document)) as Record<
      string,
      unknown
    > & {
      totals: Record<string, unknown>;
      programs: Record<string, unknown>[];
    };
    delete legacy['screenReportVersion'];
    delete legacy['reportComplexityVersion'];
    delete legacy.totals['screenReport'];
    for (const p of legacy.programs) {
      delete p['programType'];
      delete p['screens'];
      delete p['reports'];
    }
    expect(Check(SourceInventorySchema, legacy)).toBe(true);
  });
});

// The counting basis says what the counting does: Crystal per template, code
// print and CSV/Excel export at most one unit each per file.
describe('counting basis: one file with 2 templates, a print and a CSV', () => {
  const inventory = build(
    vbp('a/A.vbp', 'Module=M; M.bas'),
    at(
      'a/M.bas',
      bas(
        'M',
        ...sub(
          'Go',
          '    rpt.ReportFileName = "one.rpt"',
          '    rpt.ReportFileName = "two.rpt"',
          '    Printer.Print "a"',
          '    Printer.Print "b"',
          '    Open sOut For Output As #1',
          '    Write #1, a, b',
          '    Close #1',
        ),
      ),
    ),
  );

  it('totals 2 Crystal + 1 print + 1 CSV = 4 (not at most 3)', () => {
    const summary = deriveReportSummary(inventory);
    expect(summary?.counts).toMatchObject({
      total: 4,
      crystal: 2,
      print: 1,
      export: 1,
    });
  });

  it('the basis text states that rule in both languages', () => {
    const overlap = REPORT_COUNTING_BASIS.find((item) => item.id === 'overlap');
    expect(overlap?.vi.text).toContain('2 + 1 + 1 = 4');
    expect(overlap?.ja.text).toContain('2 + 1 + 1 = 4');
    for (const text of [overlap?.vi.text, overlap?.ja.text])
      expect(text).not.toMatch(/tối đa 3 đơn vị|最大3件/);
  });
});
