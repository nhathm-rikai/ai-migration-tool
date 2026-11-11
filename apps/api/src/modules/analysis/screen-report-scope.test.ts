import {
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

// AR06: a report is scored over the procedure that makes it and what it calls
// (2 levels), measured together. Fixtures are written for this test; nothing
// comes from customer source.
const profile = findSourceProfile('vb6-cp932-v1');
if (!profile) throw new Error('profile missing');

type TestFile = { relativePath: string; bytes: Uint8Array };
const file = (relativePath: string, ...lines: string[]): TestFile => ({
  relativePath,
  bytes: new TextEncoder().encode(lines.join('\r\n') + '\r\n'),
});
const bas = (name: string, ...code: string[]) =>
  file(`a/${name}.bas`, `Attribute VB_Name = "${name}"`, ...code);
const frm = (name: string, ...code: string[]) =>
  file(
    `a/${name}.frm`,
    'VERSION 5.00',
    `Begin VB.Form ${name}`,
    'End',
    `Attribute VB_Name = "${name}"`,
    ...code,
  );
const sub = (name: string, ...body: string[]) => [
  `Public Sub ${name}()`,
  ...body,
  'End Sub',
];
const branches = (count: number) =>
  Array.from({ length: count }, (_, i) => [
    `    If a${i} > 0 Then`,
    `        b = b + ${i}`,
    '    End If',
  ]).flat();
const repeat = (count: number, line: string) =>
  Array.from({ length: count }, () => line);
const print = '    Printer.Print "x"';

// One program A.vbp with the given modules (.bas) and forms (.frm).
const programOf = (
  files: TestFile[],
  options: { projectName?: string; knownPaths?: string[] } = {},
) => {
  const members = files.map((f) => {
    const name = f.relativePath.replace(/^a\//, '');
    return name.endsWith('.frm')
      ? `Form=${name}`
      : `Module=${name.replace(/\.bas$/, '')}; ${name}`;
  });
  const inventory = buildSourceInventory({
    profile,
    files: [
      file(
        `a/${options.projectName ?? 'A'}.vbp`,
        'Type=Exe',
        ...members,
        'Name="P"',
      ),
      ...files,
    ],
    knownPaths: options.knownPaths ?? [],
  });
  const found = inventory.programs.find((p) =>
    p.projectPath.endsWith(`${options.projectName ?? 'A'}.vbp`),
  );
  if (!found) throw new Error('no program');
  return { inventory, reports: found.reports ?? [] };
};

const factor = (
  row: { complexity: { factors: { factor: string }[] } } | undefined,
  name: string,
) =>
  row?.complexity.factors.find((f) => f.factor === name) as
    { factor: string; value: number; points: number } | undefined;
const scopeOf = (
  row:
    | { complexity: { scope?: { procedures: { id: string; tier: number }[] } } }
    | undefined,
) =>
  (row?.complexity.scope?.procedures ?? []).map(
    (p) => `${p.id.split(':').at(-1)}:${p.tier}`,
  );
const printRows = (reports: ReturnType<typeof programOf>['reports']) =>
  reports.filter((r) => r.kind === 'print');

describe('AR06-AC01 model version', () => {
  it('writes report-complexity-v3 on the inventory and on every scored report', () => {
    const { inventory, reports } = programOf([bas('M', ...sub('Root', print))]);
    expect(REPORT_COMPLEXITY_VERSION).toBe('report-complexity-v3-draft');
    expect(inventory.reportComplexityVersion).toBe(REPORT_COMPLEXITY_VERSION);
    expect(reports[0]?.complexity.version).toBe(REPORT_COMPLEXITY_VERSION);
  });
});

describe('AR06-AC02 shared procedures are counted once', () => {
  it('counts a procedure called by two printing procedures of one file once', () => {
    const { reports } = programOf([
      bas(
        'M',
        ...sub('PrintA', print, '    Call Shared'),
        ...sub('PrintB', print, '    Call Shared'),
        ...sub('Shared', ...branches(3), '    s = "SELECT A FROM T1"'),
      ),
    ]);
    const rows = printRows(reports);
    // Two rows (one per procedure) of ONE unit: one score for both.
    expect(rows).toHaveLength(2);
    expect(rows[0]?.complexity).toEqual(rows[1]?.complexity);
    expect(scopeOf(rows[0]).sort()).toEqual([
      'PrintA:0',
      'PrintB:0',
      'Shared:1',
    ]);
    expect(factor(rows[0], 'decisionPoints')?.value).toBe(3);
    expect(factor(rows[0], 'tables')?.value).toBe(1);
    // Two (caller, callee) pairs: PrintA->Shared and PrintB->Shared.
    expect(factor(rows[0], 'calls')?.value).toBe(2);
  });

  it('counts the shared procedure in full in each report (not split)', () => {
    const { reports } = programOf(
      [
        bas(
          'M',
          ...sub('UseA', '    rpt.ReportFileName = "a.rpt"', '    Call Shared'),
          ...sub('UseB', '    rpt.ReportFileName = "b.rpt"', '    Call Shared'),
          ...sub('Shared', ...branches(3)),
        ),
      ],
      { knownPaths: ['a.rpt', 'b.rpt'] },
    );
    const [a, b] = reports.filter((r) => r.kind === 'crystal');
    expect(factor(a, 'decisionPoints')?.value).toBe(3);
    expect(factor(b, 'decisionPoints')?.value).toBe(3);
  });
});

describe('AR06-AC03 call cycles', () => {
  it('ends on A->B->A and A->A without counting a procedure twice', () => {
    const { reports } = programOf([
      bas(
        'M',
        ...sub('A', print, '    Call B', '    Call A'),
        ...sub('B', '    Call A', ...branches(2)),
      ),
    ]);
    const [row] = printRows(reports);
    expect(scopeOf(row)).toEqual(['A:0', 'B:1']);
    expect(factor(row, 'decisionPoints')?.value).toBe(2);
  });
});

describe('AR06-AC04 depth is 2 levels by the shortest path', () => {
  const chain = (...names: string[]) =>
    names.flatMap((name, i) =>
      sub(
        name,
        ...(i === 0 ? [print] : []),
        ...(names[i + 1] ? [`    Call ${names[i + 1]}`] : []),
        ...branches(1),
      ),
    );

  it('scores tiers 1 and 2 and leaves tier 3 out', () => {
    const { reports } = programOf([
      bas('M', ...chain('Root', 'L1', 'L2', 'L3')),
    ]);
    const [row] = printRows(reports);
    expect(scopeOf(row)).toEqual(['Root:0', 'L1:1', 'L2:2']);
    expect(factor(row, 'decisionPoints')?.value).toBe(3);
  });

  it('takes the tier from the shortest path whatever the order of the calls', () => {
    const { reports } = programOf([
      bas(
        'M',
        ...sub('A', print, '    Call X', '    Call B'),
        ...sub('X', '    Call B'),
        ...sub('B', '    Call C'),
        ...sub('C', '    Call D'),
        ...sub('D'),
      ),
    ]);
    const [row] = printRows(reports);
    expect(scopeOf(row).sort()).toEqual(['A:0', 'B:1', 'C:2', 'X:1']);
  });
});

describe('AR06-AC04b each program resolves the calls of a shared module itself', () => {
  const shared = bas('M', ...sub('Root', print, '    Call Helper'));
  const helperA = file(
    'a/HA.bas',
    'Attribute VB_Name = "HA"',
    ...sub('Helper', ...branches(6)),
  );
  const helperB = file(
    'a/HB.bas',
    'Attribute VB_Name = "HB"',
    ...sub('Helper', '    x = 1'),
  );
  const build = () =>
    buildSourceInventory({
      profile,
      files: [
        file('a/A.vbp', 'Type=Exe', 'Module=M; M.bas', 'Module=HA; HA.bas'),
        file('a/B.vbp', 'Type=Exe', 'Module=M; M.bas', 'Module=HB; HB.bas'),
        shared,
        helperA,
        helperB,
      ],
    });

  it('scores the report per program and keeps the highest at project level', () => {
    const inventory = build();
    const of = (path: string) =>
      inventory.programs.find((p) => p.projectPath === path)?.reports?.[0];
    expect(factor(of('a/A.vbp'), 'decisionPoints')?.value).toBe(6);
    expect(factor(of('a/B.vbp'), 'decisionPoints')?.value).toBe(0);
    const item = inventory.totals.screenReport?.reportItems?.[0];
    expect(factor(item, 'decisionPoints')?.value).toBe(6);
    expect(item?.programs.map((p) => p.score)).toEqual([
      of('a/A.vbp')?.complexity.score,
      of('a/B.vbp')?.complexity.score,
    ]);
  });

  it('leaves a DataReport without a procedure unrated, with the reason', () => {
    const { reports } = programOf([]);
    expect(reports).toEqual([]);
    const inventory = buildSourceInventory({
      profile,
      files: [
        file('a/A.vbp', 'Type=Exe', 'Designer=r.Dsr'),
        file(
          'a/r.Dsr',
          'Begin {C0A63B80-4B21-11D3-BD95-D426EF2C7949} DataReport r',
        ),
      ],
    });
    expect(inventory.programs[0]?.reports?.[0]?.complexity).toMatchObject({
      level: 'unrated',
      score: null,
      reason: 'NO_PROCEDURE',
    });
  });
});

describe('AR06-AC04c measures are merged, then scored once', () => {
  it('scores 3 + 3 branches as 6 (over the threshold of 5), not as two zeros', () => {
    const { reports } = programOf([
      bas(
        'M',
        ...sub('Root', print, '    Call Other', ...branches(3)),
        ...sub('Other', ...branches(3)),
      ),
    ]);
    const [row] = printRows(reports);
    expect(factor(row, 'decisionPoints')).toMatchObject({
      value: 6,
      points: 1,
    });
  });

  it('counts a table written in two procedures once and two tables as two', () => {
    const { reports } = programOf([
      bas(
        'M',
        ...sub(
          'Root',
          print,
          '    Call Other',
          '    s = "SELECT A FROM T1"',
          '    s = "SELECT A FROM T2"',
        ),
        ...sub('Other', '    s = "SELECT A FROM t1"'),
      ),
    ]);
    expect(factor(printRows(reports)[0], 'tables')?.value).toBe(2);
  });

  it('counts a dynamic SQL place once even when two procedures reach it', () => {
    const { reports } = programOf([
      bas(
        'M',
        ...sub('PrintA', print, '    Call Shared'),
        ...sub('PrintB', print, '    Call Shared'),
        ...sub('Shared', '    s = "SELECT A FROM " & tbl'),
      ),
    ]);
    expect(factor(printRows(reports)[0], 'dynamicSql')?.value).toBe(1);
  });
});

describe('AR06-AC05 only resolved calls are followed', () => {
  it('counts unresolved calls and does not let them change the score', () => {
    const declare =
      'Private Declare Function GetTickCount Lib "kernel32" () As Long';
    const withUnresolved = programOf([
      bas(
        'M',
        declare,
        ...sub(
          'Root',
          print,
          '    Call Dup',
          '    t = GetTickCount()',
          '    CallByName obj, "Run", VbMethod',
        ),
      ),
      bas('N1', ...sub('Dup', ...branches(9))),
      bas('N2', ...sub('Dup', ...branches(9))),
    ]);
    const [row] = printRows(withUnresolved.reports);
    expect(scopeOf(row)).toEqual(['Root:0']);
    // Dup (ambiguous), GetTickCount (native) and CallByName.
    expect(row?.complexity.scope?.unresolvedCalls).toBe(3);
    const without = programOf([bas('M', ...sub('Root', print))]);
    expect(row?.complexity.score).toBe(
      printRows(without.reports)[0]?.complexity.score,
    );
  });
});

describe('AR06-AC06 file unit and template unit', () => {
  const m = bas(
    'M',
    ...sub('UseA1', '    rpt.ReportFileName = "a.rpt"', '    Call Heavy'),
    ...sub('UseA2', '    rpt.ReportFileName = "a.rpt"', ...branches(6)),
    ...sub('UseB', '    rpt.ReportFileName = "b.rpt"'),
    ...sub('Printing', print, '    Call Heavy'),
    ...sub(
      'Exporting',
      '    Open "out.csv" For Output As #1',
      '    Write #1, "a", "b"',
      '    Close #1',
      '    Call Heavy',
    ),
    ...sub('Heavy', ...branches(4)),
  );
  const { reports } = programOf([m], { knownPaths: ['a.rpt', 'b.rpt'] });
  const byName = (name: string) => reports.filter((r) => r.name === name);

  it('unites the places that use one template, one procedure once', () => {
    const rows = byName('a.rpt');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.complexity).toEqual(rows[1]?.complexity);
    expect(scopeOf(rows[0]).sort()).toEqual(['Heavy:1', 'UseA1:0', 'UseA2:0']);
    // 4 (Heavy) + 6 (UseA2) branches.
    expect(factor(rows[0], 'decisionPoints')?.value).toBe(10);
  });

  it('scores the other template, the print and the export each on their own', () => {
    expect(scopeOf(byName('b.rpt')[0])).toEqual(['UseB:0']);
    expect(scopeOf(printRows(reports)[0]).sort()).toEqual([
      'Heavy:1',
      'Printing:0',
    ]);
    const csv = reports.find((r) => r.subkind === 'csv');
    expect(scopeOf(csv).sort()).toEqual(['Exporting:0', 'Heavy:1']);
    expect(factor(csv, 'decisionPoints')?.value).toBe(4);
  });
});

describe('AR06-AC07 the limit: data prepared before in another place', () => {
  const { reports } = programOf([
    frm(
      'F',
      'Private Sub cmdPrint_Click()',
      '    Call LoadData',
      '    Call PrintReport',
      'End Sub',
      ...sub(
        'LoadData',
        '    s = "SELECT A FROM T1"',
        '    s = "SELECT A FROM T2"',
      ),
      ...sub('PrintReport', print),
    ),
  ]);

  it('does not count LoadData, which is called by the handler, not by PrintReport', () => {
    const [row] = printRows(reports);
    expect(scopeOf(row)).toEqual(['PrintReport:0']);
    expect(factor(row, 'tables')?.value).toBe(0);
  });

  it('states the limit in the counting basis, in both languages', () => {
    const item = REPORT_COUNTING_BASIS.find((i) => i.id === 'complexity');
    expect(item?.vi.text).toContain('LoadData()');
    expect(item?.vi.text).toContain('2 tầng');
    expect(item?.ja.text).toContain('LoadData()');
    expect(item?.ja.text).toContain('2階層');
  });
});

describe('AR06-AC08 print and draw density', () => {
  // One procedure with `content` print, `drawing` line and `position`
  // statements, read through the print unit.
  const scored = (content: number, drawing: number, position = 0) => {
    const { reports } = programOf([
      bas(
        'M',
        ...sub(
          'Root',
          ...repeat(content, '    Printer.Print "x"'),
          ...repeat(drawing, '    Printer.Line (0, 0)-(100, 100)'),
          ...repeat(position, '    Printer.CurrentX = 100'),
          // Makes the print report; it is not a counted statement.
          '    Printer.EndDoc',
        ),
      ),
    ]);
    return printRows(reports)[0];
  };
  const printPoints = (content: number, drawing: number) =>
    factor(scored(content, drawing), 'printDensity')?.points;

  it('counts the three groups by statements', () => {
    const row = scored(4, 3, 2);
    expect(row?.complexity.scope?.printOps).toEqual({
      content: 4,
      drawing: 3,
      position: 2,
    });
  });

  it('scores content 20 / 60 / 120 and drawing 10 / 30 / 60 as 1 / 2 / 3', () => {
    expect([19, 20, 59, 60, 119, 120].map((n) => printPoints(n, 0))).toEqual([
      0, 1, 1, 2, 2, 3,
    ]);
    expect([9, 10, 29, 30, 59, 60].map((n) => printPoints(0, n))).toEqual([
      0, 1, 1, 2, 2, 3,
    ]);
  });

  it('adds the two groups up to a cap of 3', () => {
    expect(printPoints(19, 9)).toBe(0);
    expect(printPoints(20, 10)).toBe(2);
    expect(printPoints(60, 30)).toBe(3);
    expect(printPoints(120, 60)).toBe(3);
  });

  it('records position statements without scoring them', () => {
    const row = scored(0, 0, 500);
    expect(row?.complexity.scope?.printOps.position).toBe(500);
    expect(factor(row, 'printDensity')).toMatchObject({ value: 0, points: 0 });
  });

  it('does not multiply a statement by the loop around it', () => {
    const { reports } = programOf([
      bas(
        'M',
        ...sub(
          'Root',
          '    For i = 1 To 1000',
          '        Printer.Print i',
          '    Next i',
        ),
      ),
    ]);
    expect(printRows(reports)[0]?.complexity.scope?.printOps.content).toBe(1);
  });

  it('counts a printer variable, a With Printer block and PrintForm', () => {
    const { reports } = programOf([
      frm(
        'F',
        ...sub(
          'Root',
          '    Dim p As Printer',
          '    Set p = Printer',
          '    p.Print "a"',
          '    p.Circle (0, 0), 5',
          '    With Printer',
          '        .Print "b"',
          '        .Line (0, 0)-(5, 5)',
          '        .CurrentX = 10',
          '    End With',
          '    Me.PrintForm',
        ),
      ),
    ]);
    expect(printRows(reports)[0]?.complexity.scope?.printOps).toEqual({
      content: 3,
      drawing: 2,
      position: 1,
    });
  });

  it('does not count Debug.Print, drawing on a form or control, or Print #n', () => {
    const { reports } = programOf([
      frm(
        'F',
        ...sub(
          'Root',
          print,
          '    Debug.Print "x"',
          '    Me.Print "x"',
          '    Picture1.Print "x"',
          '    Print "x"',
          '    Line (0, 0)-(5, 5)',
          '    Me.Line (0, 0)-(5, 5)',
          '    Picture1.Line (0, 0)-(5, 5)',
          '    Picture1.Circle (0, 0), 5',
          '    Picture1.PSet (0, 0)',
          '    Me.CurrentX = 10',
          '    Picture1.CurrentY = 10',
          '    n = Picture1.TextWidth("x")',
          '    Print #1, "x"',
        ),
      ),
    ]);
    expect(printRows(reports)[0]?.complexity.scope?.printOps).toEqual({
      content: 1,
      drawing: 0,
      position: 0,
    });
  });
});

describe('AR06-AC09 no callee: the five earlier factors are those of v1', () => {
  it('measures the procedure alone', () => {
    const { inventory, reports } = programOf([
      bas(
        'M',
        ...sub(
          'Root',
          print,
          ...branches(6),
          '    s = "SELECT A FROM T1"',
          '    s = "SELECT A FROM T2"',
        ),
      ),
    ]);
    const analysis = inventory.files[1]?.analysis;
    if (analysis?.status !== 'analyzed') throw new Error('not analyzed');
    const procedure = analysis.procedures[0];
    const row = printRows(reports)[0];
    expect(row?.complexity.factors.slice(0, 5)).toEqual([
      { factor: 'decisionPoints', value: procedure?.decisionPoints, points: 1 },
      {
        factor: 'executableLines',
        value: procedure?.executableLines,
        points: 0,
      },
      { factor: 'tables', value: 2, points: 1 },
      { factor: 'dynamicSql', value: 0, points: 0 },
      { factor: 'calls', value: 0, points: 0 },
    ]);
  });
});

describe('AR06-AC10 a Crystal report keeps the Medium floor', () => {
  it('floors a low score to Medium with the reason, whatever it calls', () => {
    const { reports } = programOf(
      [
        bas(
          'M',
          ...sub('Root', '    rpt.ReportFileName = "a.rpt"', '    Call Small'),
          ...sub('Small', '    x = 1'),
        ),
      ],
      { knownPaths: ['a.rpt'] },
    );
    expect(reports[0]?.complexity).toMatchObject({
      level: 'medium',
      reason: 'DESIGN_NOT_ANALYZED_FLOOR',
    });
    expect(factor(reports[0], 'design-not-analyzed')).toBeDefined();
  });
});

describe('AR06 scoring constants', () => {
  it('uses the thresholds decided for the first run', () => {
    const { printDensity } = DEFAULT_REPORT_COMPLEXITY_CONFIG;
    expect(printDensity.content).toEqual([
      [20, 1],
      [60, 2],
      [120, 3],
    ]);
    expect(printDensity.drawing).toEqual([
      [10, 1],
      [30, 2],
      [60, 3],
    ]);
    expect(printDensity.cap).toBe(3);
  });

  it('changes the print points by changing only the constants', () => {
    const none = {
      decisionPoints: 0,
      executableLines: 0,
      tables: 0,
      dynamicSql: 0,
      calls: 0,
    };
    const printOps = { content: 20, drawing: 0, position: 0 };
    const base = scoreReportComplexity(none, undefined, { printOps });
    const looser = scoreReportComplexity(
      none,
      {
        ...DEFAULT_REPORT_COMPLEXITY_CONFIG,
        printDensity: {
          ...DEFAULT_REPORT_COMPLEXITY_CONFIG.printDensity,
          content: [[10, 3]],
        },
      },
      { printOps },
    );
    expect(base.score).toBe(1);
    expect(looser.score).toBe(3);
  });
});

describe('AR06 compatibility with an inventory stored by v1', () => {
  it('validates an inventory with the scope of a report, and the same one without it', () => {
    const { inventory } = programOf([bas('M', ...sub('Root', print))]);
    const document = { ...inventory, skipped: [] };
    expect(Check(SourceInventorySchema, document)).toBe(true);
    expect(JSON.stringify(document).includes('"scope":{"procedures"')).toBe(
      true,
    );
    const v1 = JSON.parse(JSON.stringify(document)) as typeof document;
    for (const program of v1.programs)
      for (const report of program.reports ?? [])
        delete (report.complexity as { scope?: unknown }).scope;
    for (const item of v1.totals.screenReport?.reportItems ?? [])
      delete (item.complexity as { scope?: unknown }).scope;
    expect(Check(SourceInventorySchema, v1)).toBe(true);
  });
});

describe('AR06 review 2 — AC04: an edge below tier 2 does not score', () => {
  const chain = (withTier3: boolean) =>
    programOf([
      bas(
        'M',
        ...sub('Root', print, '    Call L1'),
        ...sub('L1', '    Call L2'),
        ...sub('L2', ...(withTier3 ? ['    Call L3'] : ['    x = 1'])),
        ...sub('L3'),
      ),
    ]);

  it('counts only the calls whose callee is in the scored set', () => {
    const [row] = printRows(chain(true).reports);
    expect(scopeOf(row)).toEqual(['Root:0', 'L1:1', 'L2:2']);
    // Root->L1 and L1->L2; L2->L3 leaves the scope.
    expect(factor(row, 'calls')?.value).toBe(2);
  });

  it('gives the same score with or without the call to tier 3', () => {
    const [withIt] = printRows(chain(true).reports);
    const [without] = printRows(chain(false).reports);
    expect(withIt?.complexity.factors).toEqual(without?.complexity.factors);
    expect(withIt?.complexity.score).toBe(without?.complexity.score);
  });
});

describe('AR06 review 2 — AC06: one template used in several programs is scored once', () => {
  const user = (name: string, callee: string) =>
    bas(
      name,
      ...sub(
        `Use${name}`,
        '    rpt.ReportFileName = "invoice.rpt"',
        `    Call ${callee}`,
      ),
      ...sub(callee, ...branches(3)),
    );
  const inventoryOf = (split: boolean) =>
    buildSourceInventory({
      profile,
      files: split
        ? [
            file('a/A.vbp', 'Type=Exe', 'Module=M1; M1.bas'),
            file('a/B.vbp', 'Type=Exe', 'Module=M2; M2.bas'),
            user('M1', 'Load1'),
            user('M2', 'Load2'),
          ]
        : [
            file(
              'a/A.vbp',
              'Type=Exe',
              'Module=M1; M1.bas',
              'Module=M2; M2.bas',
            ),
            user('M1', 'Load1'),
            user('M2', 'Load2'),
          ],
      knownPaths: ['invoice.rpt'],
    });
  const itemOf = (inventory: ReturnType<typeof inventoryOf>) =>
    (inventory.totals.screenReport?.reportItems ?? []).filter(
      (i) => i.kind === 'crystal',
    );

  it('gives a template the same score whether its uses share a program or not', () => {
    const together = inventoryOf(false).programs[0]?.reports?.[0];
    const split = inventoryOf(true);
    // 3 + 3 branches over both uses: 6, over the threshold of 5.
    expect(factor(together, 'decisionPoints')?.value).toBe(6);
    for (const item of itemOf(split))
      expect(factor(item, 'decisionPoints')?.value).toBe(6);
    for (const program of split.programs)
      for (const row of program.reports ?? [])
        expect(row.complexity.score).toBe(together?.complexity.score);
  });

  it('resolves the calls of each use in the program of that use', () => {
    const split = inventoryOf(true);
    const item = itemOf(split)[0];
    expect(scopeOf(item).sort()).toEqual([
      'Load1:1',
      'Load2:1',
      'UseM1:0',
      'UseM2:0',
    ]);
  });
});

describe('AR06 review 2 — AC08: a declaration in a procedure hides the module name', () => {
  const previews = (parameter: string, ...inside: string[]) =>
    programOf([
      bas(
        'M',
        'Private target As Printer',
        `Public Sub Preview(${parameter})`,
        '    Printer.EndDoc',
        ...inside,
        ...repeat(21, '    target.Print "x"'),
        'End Sub',
      ),
    ]);

  it('does not count a parameter of another type with the name of a module printer', () => {
    const { reports } = previews('target As PictureBox');
    expect(printRows(reports)[0]?.complexity.scope?.printOps.content).toBe(0);
  });

  it('does not count a Dim of any type, typed or not, with that name', () => {
    for (const dim of ['    Dim target As Long', '    Dim target'])
      expect(
        printRows(previews('', dim).reports)[0]?.complexity.scope?.printOps
          .content,
      ).toBe(0);
  });

  it('still counts the module printer where no procedure declares the name', () => {
    expect(
      printRows(previews('').reports)[0]?.complexity.scope?.printOps.content,
    ).toBe(21);
  });
});
