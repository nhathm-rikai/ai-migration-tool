import { describe, expect, it } from 'vitest';
import { deriveReportSummary } from './report-templates.js';
import type { SourceInventoryDocument } from './source-inventory.schema.js';

// Reports counted once each: Crystal / DataReport templates, files that print
// in code, files that export CSV or Excel; other file output is listed apart.
// Hand-written rows; nothing here comes from customer source.

type Row = NonNullable<
  SourceInventoryDocument['programs'][number]['reports']
>[number];

const unrated = {
  version: 'report-complexity-v1-draft',
  level: 'unrated' as const,
  score: null,
  factors: [],
};
const rated = (level: Row['complexity']['level'], score: number) => ({
  version: 'report-complexity-v1-draft',
  level,
  score,
  factors: [],
});
const row = (over: Partial<Row> & Pick<Row, 'kind' | 'name'>): Row => ({
  file: 'a/Main.bas',
  line: 1,
  confidence: 'suspected',
  shared: false,
  procedureId: null,
  warnings: [],
  complexity: unrated,
  ...over,
});

function inventory(
  programs: Record<string, Row[]>,
): Parameters<typeof deriveReportSummary>[0] {
  return {
    programs: Object.entries(programs).map(([projectPath, reports]) => ({
      projectPath,
      reports,
    })) as never,
    totals: {
      screenReport: {
        screens: 0,
        sharedScreens: 0,
        batches: 0,
        reports: {
          rows: 0,
          counted: 0,
          suspected: 0,
          byKind: {} as never,
          byLevel: {} as never,
        },
        suspectedPrograms: 0,
      },
    },
  };
}

const crystal = (name: string, over: Partial<Row> = {}): Row =>
  row({
    kind: 'crystal',
    name,
    confidence: 'referenced',
    warnings: ['REPORT_FILE_MISSING'],
    ...over,
  });
const print = (line: number, procedureId: string, file = 'a/Form1.frm') =>
  row({ kind: 'print', name: 'Printer', line, procedureId, file });
const csv = (line: number, procedureId: string, file = 'a/Form1.frm') =>
  row({
    kind: 'file-output',
    name: 'Open For Output',
    subkind: 'csv',
    line,
    procedureId,
    file,
  });

describe('Crystal / DataReport reports (one per template name)', () => {
  it('counts one report when the same .rpt is named in two procedures and two programs', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          crystal('reports/Invoice.rpt', { procedureId: 'Main.Print1' }),
          crystal('reports/Invoice.rpt', {
            procedureId: 'Main.Print2',
            line: 20,
          }),
        ],
        'p/B.vbp': [
          crystal('Invoice.RPT', {
            file: 'b/Other.bas',
            procedureId: 'Other.X',
          }),
        ],
      }),
    );
    expect(summary?.counts.crystal).toBe(1);
    const [report] = summary?.reports ?? [];
    expect(report?.name).toBe('Invoice.rpt');
    expect(report?.usages.length).toBe(3);
    expect(report?.programs).toEqual(['p/A.vbp', 'p/B.vbp']);
  });

  it('has the design file, or it is missing', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          crystal('Found.rpt', { confidence: 'detected', warnings: [] }),
          crystal('Gone.rpt'),
          row({
            kind: 'data-report',
            name: 'rptSales',
            file: 'a/rptSales.dsr',
            confidence: 'detected',
          }),
        ],
      }),
    );
    expect(summary?.counts).toMatchObject({
      crystal: 3,
      designFile: 2,
      missingFile: 1,
    });
    const by = (name: string) => summary?.reports.find((r) => r.name === name);
    expect(by('Found.rpt')).toMatchObject({
      status: 'design-file',
      designFile: 'Found.rpt',
    });
    expect(by('Gone.rpt')).toMatchObject({
      status: 'missing-file',
      designFile: null,
    });
    expect(by('rptSales')).toMatchObject({
      kind: 'data-report',
      designFile: 'a/rptSales.dsr',
    });
  });

  it('a template found for one program and only named for another has its design file', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [crystal('X.rpt', { confidence: 'detected', warnings: [] })],
        'p/B.vbp': [crystal('X.rpt', { file: 'b/B.bas' })],
      }),
    );
    expect(summary?.counts).toMatchObject({ crystal: 1, designFile: 1 });
  });
});

describe('reports made by print in code (one per form)', () => {
  it('prn_ALL and prn_HEDA in the same form are one report', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          print(10, 'a/Form1.frm#Function:prn_ALL'),
          print(11, 'a/Form1.frm#Function:prn_ALL'),
          print(40, 'a/Form1.frm#Function:prn_HEDA'),
          print(5, 'a/Other.frm#Sub:Go', 'a/Other.frm'),
        ],
      }),
    );
    expect(summary?.counts.print).toBe(2);
    const form = summary?.reports.find((r) => r.name === 'Form1');
    expect(form).toMatchObject({ origin: 'print', file: 'a/Form1.frm' });
    // Both procedures and their lines are the evidence.
    expect(form?.usages.map((u) => u.line)).toEqual([10, 11, 40]);
  });

  it('a form shared by two programs is one report, with both programs', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [print(10, 'x#Sub:P')],
        'p/B.vbp': [print(10, 'x#Sub:P')],
      }),
    );
    expect(summary?.counts.print).toBe(1);
    expect(summary?.reports[0]?.programs).toEqual(['p/A.vbp', 'p/B.vbp']);
  });
});

describe('reports made by CSV or Excel export (one per form)', () => {
  it('CSV in two procedures of one form is one report; Excel in another form is another', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          csv(10, 'a/Form1.frm#Sub:Save1'),
          csv(30, 'a/Form1.frm#Sub:Save2'),
          row({
            kind: 'excel',
            name: 'Excel.Application',
            file: 'a/Form2.frm',
            procedureId: 'a/Form2.frm#Sub:Xl',
            line: 3,
          }),
        ],
      }),
    );
    expect(summary?.counts.export).toBe(2);
  });

  it('a form that both prints and exports is a print report and an export report', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [print(5, 'f#Sub:P'), csv(9, 'f#Sub:C')],
      }),
    );
    expect(summary?.counts).toMatchObject({ print: 1, export: 1, total: 2 });
  });
});

describe('what is not a report', () => {
  it('other file output is listed apart and not counted', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          row({
            kind: 'file-output',
            name: 'Open For Output',
            procedureId: 'f#Sub:Dump',
            line: 7,
          }),
        ],
      }),
    );
    expect(summary?.counts.total).toBe(0);
    expect(summary?.counts.dataFiles).toBe(1);
    expect(summary?.dataFiles[0]).toMatchObject({
      file: 'a/Main.bas',
      procedure: 'f#Sub:Dump',
      kinds: ['file-output'],
    });
  });

  it('a log file is left out and counted as excluded', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          row({
            kind: 'file-output',
            name: 'Open For Append',
            excludeReason: 'log',
            procedureId: 'f#Sub:Log',
          }),
          print(3, 'f#Sub:P'),
        ],
      }),
    );
    expect(summary?.counts).toMatchObject({
      total: 1,
      dataFiles: 0,
      excluded: 1,
    });
  });

  it('a report runtime without a template is listed apart, not counted', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          row({
            kind: 'unknown',
            name: 'crystl32.ocx',
            file: 'p/A.vbp',
            line: null,
          }),
        ],
      }),
    );
    expect(summary?.counts.total).toBe(0);
    expect(summary?.dataFiles[0]?.kinds).toEqual(['unknown']);
  });
});

describe('totals', () => {
  it('the total is the three kinds added up, and the levels add up to it', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          crystal('A.rpt', { complexity: rated('high', 7) }),
          row({
            kind: 'print',
            name: 'Printer',
            procedureId: 'f#Sub:P',
            file: 'a/F.frm',
            complexity: rated('medium', 4),
          }),
          csv(9, 'g#Sub:C', 'a/G.frm'),
        ],
      }),
    );
    const c = summary?.counts;
    expect(c?.total).toBe(
      (c?.crystal ?? 0) + (c?.print ?? 0) + (c?.export ?? 0),
    );
    expect(c?.total).toBe(3);
    expect(Object.values(c?.byLevel ?? {}).reduce((n, v) => n + v, 0)).toBe(3);
    expect(c?.byLevel).toMatchObject({ high: 1, medium: 1, unrated: 1 });
  });

  it('keeps the highest complexity of the places that make a report', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          row({
            kind: 'print',
            name: 'Printer',
            procedureId: 'f#Sub:A',
            line: 1,
            complexity: rated('low', 1),
          }),
          row({
            kind: 'print',
            name: 'Printer',
            procedureId: 'f#Sub:B',
            line: 9,
            complexity: rated('high', 7),
          }),
        ],
      }),
    );
    expect(summary?.reports[0]?.complexity).toMatchObject({
      level: 'high',
      score: 7,
    });
  });

  it('is undefined for an inventory without screen/report data', () => {
    expect(
      deriveReportSummary({ programs: [] as never, totals: {} }),
    ).toBeUndefined();
  });
});

describe('identity of a Crystal template: path when the code gives one', () => {
  const total = (names: string[], file = 'a/Main.bas') =>
    deriveReportSummary(
      inventory({
        'p/A.vbp': names.map((name, index) =>
          crystal(name, { file, line: index + 1 }),
        ),
      }),
    );

  it('keeps sales/Detail.rpt and stock/Detail.rpt apart', () => {
    const summary = total(['sales/Detail.rpt', 'stock/Detail.rpt']);
    expect(summary?.counts.crystal).toBe(2);
    expect(summary?.counts.identityPath).toBe(2);
    expect(summary?.reports.map((r) => r.file)).toEqual([
      'sales/Detail.rpt',
      'stock/Detail.rpt',
    ]);
  });

  it('merges slash, case and ./ variants of the same path', () => {
    const summary = total(['sales\\Detail.rpt', './Sales/DETAIL.rpt']);
    expect(summary?.counts.crystal).toBe(1);
  });

  it('counts a name written without folder in two files once (same name, same template)', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [crystal('Detail.rpt', { file: 'a/F1.frm' })],
        'p/B.vbp': [crystal('Detail.rpt', { file: 'b/F2.frm' })],
      }),
    );
    expect(summary?.counts.crystal).toBe(1);
    expect(summary?.counts.identityName).toBe(1);
    expect(summary?.reports[0]?.identity).toBe('name');
  });

  it('joins a bare name to the only path with that file name', () => {
    const summary = total(['sales/Detail.rpt', 'Detail.rpt']);
    expect(summary?.counts.crystal).toBe(1);
    expect(summary?.counts.identityPath).toBe(1);
    expect(summary?.counts.identityName).toBe(0);
  });

  it('keeps a bare name apart when two paths share its file name', () => {
    const summary = total([
      'sales/Detail.rpt',
      'stock/Detail.rpt',
      'Detail.rpt',
    ]);
    expect(summary?.counts.crystal).toBe(3);
    expect(summary?.counts.identityName).toBe(1);
  });
});

describe('one file that makes output in several ways', () => {
  it('counts each way on its own, up to three units for one file', () => {
    const file = 'a/Form1.frm';
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          crystal('Invoice.rpt', { file, procedureId: 'F.A' }),
          print(10, 'F.B', file),
          csv(20, 'F.C', file),
          print(30, 'a/Other.bas#P', 'a/Other.bas'),
        ],
      }),
    );
    expect(summary?.counts).toMatchObject({
      total: 4,
      crystal: 1,
      print: 2,
      export: 1,
      overlapFiles: 1,
    });
  });
});
