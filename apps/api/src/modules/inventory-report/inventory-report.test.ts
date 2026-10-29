import type { SourceInventoryDocument } from '@portal/contracts';
import { describe, expect, it } from 'vitest';
import { unzip } from '../../testing/zip-reader.js';
import { buildSourceInventory } from '../analysis/source-inventory.js';
import { findSourceProfile } from '../analysis/source-profiles.js';
import { createTableNameMapping } from '../analysis/table-names.js';
import {
  buildInventoryReport,
  programId,
  ReportSelectionError,
} from './inventory-report.js';
import { inventoryReportSheets } from './inventory-report-workbook.js';
import { writeXlsx } from './xlsx-writer.js';

const text = (relativePath: string, lines: string[]) => ({
  relativePath,
  bytes: Buffer.from(`${lines.join('\r\n')}\r\n`),
});

// Two programs sharing cmn/C.BAS, a third one not selected, a missing
// member, an ambiguous call and a runtime table name.
const FILES = [
  text('a/PA.VBP', [
    'Type=Exe',
    'Name="=cmd|calc"',
    'Module=A; A.BAS',
    'Module=C; ..\\cmn\\C.BAS',
    'Module=D; ..\\cmn\\D.BAS',
    'Module=Gone; GONE.BAS',
  ]),
  text('b/PB.VBP', ['Type=Exe', 'Module=B; B.BAS', 'Module=C; ..\\cmn\\C.BAS']),
  text('z/PZ.VBP', ['Type=Exe', 'Module=Z; Z.BAS']),
  text('a/A.BAS', [
    "' header comment",
    'Sub Main()',
    '    Dim s As String',
    '    s = "SELECT * FROM ORDERS"',
    '    LogIt',
    '    Twice',
    'End Sub',
  ]),
  text('b/B.BAS', [
    'Sub Main()',
    '    s = "DELETE FROM " & t & " WHERE A = " & k',
    '    LogIt',
    'End Sub',
  ]),
  text('cmn/C.BAS', [
    'Public Sub LogIt()',
    '    x = "UPDATE HAN01.LOGS SET A = 1"',
    'End Sub',
    'Public Sub Twice()',
    'End Sub',
  ]),
  text('cmn/D.BAS', ['Public Sub Twice()', 'End Sub']),
  text('z/Z.BAS', ['Sub Main()', 'End Sub']),
];

function inventory(): SourceInventoryDocument {
  const profile = findSourceProfile('vb6-cp932-v1');
  const tableNames = createTableNameMapping('HAN01');
  if (!profile || !tableNames) throw new Error('setup');
  // Through JSON, as the CLI reads it from a file.
  const built: unknown = JSON.parse(
    JSON.stringify(buildSourceInventory({ profile, files: FILES, tableNames })),
  );
  return built as SourceInventoryDocument;
}

describe('buildInventoryReport', () => {
  const report = buildInventoryReport(inventory(), ['pa', 'PB']);

  it('selects exactly the requested programs by project file name', () => {
    expect(report.selection.programs).toEqual([
      { id: 'PA', projectPath: 'a/PA.VBP' },
      { id: 'PB', projectPath: 'b/PB.VBP' },
    ]);
    expect(report.files.map((f) => [f.relativePath, f.usedBy])).toEqual([
      ['a/A.BAS', ['PA']],
      ['a/PA.VBP', ['PA']],
      ['b/B.BAS', ['PB']],
      ['b/PB.VBP', ['PB']],
      ['cmn/C.BAS', ['PA', 'PB']],
      ['cmn/D.BAS', ['PA']],
    ]);
  });

  it.each([
    [['PA', 'PX'], 'PX matches 0'],
    [['PA', 'pa'], 'repeated'],
    [[''], 'empty'],
  ])('refuses the selection %j', (ids, message) => {
    expect(() => buildInventoryReport(inventory(), ids)).toThrow(
      ReportSelectionError,
    );
    expect(() => buildInventoryReport(inventory(), ids)).toThrow(message);
  });

  it('refuses an ID that matches two project files', () => {
    const doc = inventory();
    const [first] = doc.programs;
    if (!first) throw new Error('setup');
    doc.programs.push({ ...first, projectPath: 'other/PA.vbp' });
    expect(() => buildInventoryReport(doc, ['PA'])).toThrow('matches 2');
  });

  it('counts a shared file once in unique totals, per program otherwise', () => {
    const { perProgramSum, unique } = report.totals;
    // A.BAS 6 + C.BAS 5 + D.BAS 2 (PA), B.BAS 4 + C.BAS 5 (PB).
    expect(perProgramSum.codeLines).toBe(22);
    expect(unique.codeLines).toBe(17);
    expect(unique).toMatchObject({
      files: 6,
      analyzedFiles: 4,
      sharedFiles: 1,
    });
    expect(unique.procedureCodeLines + unique.fileLevelCodeLines).toBe(
      unique.codeLines,
    );
    expect(
      report.procedures.reduce((sum, p) => sum + (p.executableLines ?? 0), 0),
    ).toBe(unique.executableLines);
    expect(report.programs.map((p) => p.procedureLines)).toEqual([
      { procedurePhysicalLines: 13, executableLines: 4, sqlLines: 2 },
      { procedurePhysicalLines: 9, executableLines: 3, sqlLines: 2 },
    ]);
  });

  it('keeps file, procedure and line on every traced row', () => {
    expect(report.procedures[0]).toMatchObject({
      relativePath: 'a/A.BAS',
      id: 'a/A.BAS#sub:Main',
      startLine: 2,
      endLine: 7,
      physicalLines: 6,
      codeLines: 6,
      executableLines: 3,
      sqlLines: 1,
    });
    expect(report.crud).toContainEqual({
      programId: 'PA',
      view: 'normalized',
      table: 'LOGS',
      operations: 'U',
      names: ['HAN01.LOGS'],
      relativePath: 'cmn/C.BAS',
      line: 2,
      viaSharedOnly: true,
    });
    expect(report.dynamicSql).toEqual([
      {
        relativePath: 'b/B.BAS',
        procedureId: 'b/B.BAS#sub:Main',
        operation: 'D',
        line: 2,
        usedBy: ['PB'],
      },
    ]);
    expect(report.concatenatedSql).toEqual([
      {
        relativePath: 'b/B.BAS',
        procedureId: 'b/B.BAS#sub:Main',
        operation: 'D',
        line: 2,
        usedBy: ['PB'],
      },
    ]);
  });

  it('lists every warning of the selection', () => {
    expect(
      report.warnings.map((w) => [w.code, w.programId, w.relativePath, w.line]),
    ).toEqual([
      ['TABLE_NAMES_NOT_CONFIRMED', null, null, null],
      ['COMPLEXITY_REFERENCE_ONLY', null, null, null],
      ['PROGRAM_INCOMPLETE', 'PA', 'a/PA.VBP', null],
      ['MEMBER_MISSING', 'PA', 'GONE.BAS', null],
      ['CALL_AMBIGUOUS', 'PA', 'a/A.BAS', 6],
      ['DYNAMIC_SQL', null, 'b/B.BAS', 2],
    ]);
  });

  it('leaves review flags of an old inventory out of the JSON report', () => {
    const doc = inventory();
    doc.complexityVersion = 'complexity-v0';
    for (const program of doc.programs)
      if (program.analysis) {
        program.analysis.complexity.reviewFlags = ['high', 'near-threshold'];
        if (program.analysis.normalizedComplexity)
          program.analysis.normalizedComplexity.reviewFlags = ['high'];
      }
    const before = JSON.stringify(doc);
    const report = buildInventoryReport(doc, ['PA', 'PB']);
    const exported = JSON.stringify(report);
    expect(exported).not.toContain('reviewFlags');
    expect(exported).not.toContain('near-threshold');
    const [first] = report.programs;
    const source = doc.programs.find((p) => p.projectPath === 'a/PA.VBP');
    expect(first?.complexity).toEqual({
      version: source?.analysis?.complexity.version,
      score: source?.analysis?.complexity.score,
      level: source?.analysis?.complexity.level,
      parts: source?.analysis?.complexity.parts,
    });
    expect(first?.normalizedComplexity).not.toHaveProperty('reviewFlags');
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('warns about a draft model, not about review flags of old inventories', () => {
    const doc = inventory();
    doc.complexityVersion = 'complexity-v0-draft';
    const program = doc.programs.find((p) => p.projectPath === 'a/PA.VBP');
    if (!program?.analysis) throw new Error('setup');
    program.analysis.complexity.reviewFlags = ['high', 'near-threshold'];
    expect(
      buildInventoryReport(doc, ['PA'])
        .warnings.filter((w) => w.code.startsWith('COMPLEXITY'))
        .map((w) => [w.code, w.programId]),
    ).toEqual([['COMPLEXITY_DRAFT', null]]);
  });

  it('names a program after its project file', () => {
    expect(programId('KUN/KUNO0020.vbp')).toBe('KUNO0020');
    expect(programId('NOEXT')).toBe('NOEXT');
  });
});

it('keeps absolute paths out of the JSON and the workbook', () => {
  const profile = findSourceProfile('vb6-cp932-v1');
  if (!profile) throw new Error('setup');
  const doc: unknown = JSON.parse(
    JSON.stringify(
      buildSourceInventory({
        profile,
        files: [
          text('p/P.VBP', [
            'Type=Exe',
            'Module=M; M.BAS',
            'Module=S; C:\\review-private\\SECRET.BAS',
            'Module=U; \\\\server\\share\\U.BAS',
            'Form=/home/someone/F.FRM',
            'Object={00000000-0000-0000-0000-000000000001}#1.0#0; C:\\review-private\\SECRET.OCX',
            'Object={00000000-0000-0000-0000-000000000002}#1.0#0; \\\\server\\share\\U.OCX',
            'Object={00000000-0000-0000-0000-000000000003}#1.0#0; "/home/someone/X.OCX"',
          ]),
          text('p/M.BAS', [
            'Private Declare Function A1 Lib "C:\\review-private\\SECRET.DLL" () As Long',
            'Private Declare Function A2 Lib "\\\\server\\share\\U.DLL" () As Long',
            'Private Declare Function A3 Lib "/home/someone/libx.so" () As Long',
            'Sub Main()',
            '    x = A1(): y = A2(): z = A3()',
            'End Sub',
          ]),
        ],
      }),
    ),
  );
  const report = buildInventoryReport(doc as SourceInventoryDocument, ['P']);
  expect(
    report.members
      .filter((m) => m.resolution === 'absolute-path')
      .map((m) => m.declaredPath),
  ).toEqual([
    '<absolute path>/SECRET.BAS',
    '<absolute path>/U.BAS',
    '<absolute path>/F.FRM',
  ]);
  expect(
    report.externalReferences.map((r) => [r.identifier, r.fileName]),
  ).toEqual([
    ['{00000000-0000-0000-0000-000000000001}', '<absolute path>/SECRET.OCX'],
    ['{00000000-0000-0000-0000-000000000002}', '<absolute path>/U.OCX'],
    ['{00000000-0000-0000-0000-000000000003}', '<absolute path>/X.OCX'],
  ]);
  expect(report.externalApis.map((a) => [a.name, a.library])).toEqual([
    ['A1', '<absolute path>/SECRET.DLL'],
    ['A2', '<absolute path>/U.DLL'],
    ['A3', '<absolute path>/libx.so'],
  ]);
  expect(
    report.warnings
      .filter((w) => w.code === 'MEMBER_ABSOLUTE_PATH')
      .map((w) => w.relativePath),
  ).toEqual([
    '<absolute path>/SECRET.BAS',
    '<absolute path>/U.BAS',
    '<absolute path>/F.FRM',
  ]);
  const exported = [
    JSON.stringify(report),
    ...unzip(writeXlsx(inventoryReportSheets(report))).values(),
  ].join('\n');
  for (const secret of ['review-private', 'server', 'someone', 'C:\\'])
    expect(exported).not.toContain(secret);
});

describe('inventory report workbook', () => {
  const report = buildInventoryReport(inventory(), ['PA', 'PB']);
  const parts = unzip(writeXlsx(inventoryReportSheets(report)));
  const sheetXml = (index: number) =>
    parts.get(`xl/worksheets/sheet${index}.xml`) ?? '';

  it('has one sheet per report table, in order', () => {
    const names = [
      ...(parts.get('xl/workbook.xml') ?? '').matchAll(
        /<sheet name="([^"]+)"/g,
      ),
    ].map((match) => match[1]);
    expect(names).toEqual([
      'Summary',
      'Programs',
      'Members',
      'Files',
      'Procedures',
      'Calls',
      'CRUD',
      'DynamicSQL',
      'ConcatenatedSQL',
      'ExternalRefs',
      'ExternalAPIs',
      'Totals',
      'Warnings',
    ]);
  });

  it('writes one row per record under the header', () => {
    const rowCount = (xml: string) => [...xml.matchAll(/<row /g)].length;
    expect(rowCount(sheetXml(2))).toBe(1 + report.programs.length);
    expect(rowCount(sheetXml(5))).toBe(1 + report.procedures.length);
    expect(rowCount(sheetXml(13))).toBe(1 + report.warnings.length);
  });

  it('keeps a formula-like program name as quoted text', () => {
    expect(sheetXml(2)).toContain(
      '<c r="C2" t="inlineStr" s="2"><is><t xml:space="preserve">=cmd|calc</t>',
    );
    expect(sheetXml(2)).not.toContain('<f>');
  });

  it('leaves an empty list as an empty cell', () => {
    // PA and PB have no complexity review flag.
    for (let index = 1; index <= 12; index += 1)
      expect(sheetXml(index)).not.toContain('<t xml:space="preserve"></t>');
  });
});
