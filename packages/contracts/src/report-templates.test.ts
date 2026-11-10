import { describe, expect, it } from 'vitest';
import { deriveReportSummary } from './report-templates.js';
import type { SourceInventoryDocument } from './source-inventory.schema.js';

// Report templates and output functions, derived from the stored report rows.
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
    file: 'a/Main.bas',
    confidence: 'referenced',
    warnings: ['REPORT_FILE_MISSING'],
    ...over,
  });

describe('report templates (counted by template)', () => {
  it('counts one template when the same .rpt is named in two procedures and two programs', () => {
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
    expect(summary?.counts.templates).toBe(1);
    const [template] = summary?.templates ?? [];
    expect(template?.name).toBe('Invoice.rpt');
    expect(template?.usages.length).toBe(3);
    expect(template?.programs).toEqual(['p/A.vbp', 'p/B.vbp']);
  });

  it('is design-file when the design file was found, missing-file when only named', () => {
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
      templates: 3,
      designFile: 2,
      missingFile: 1,
    });
    const by = (name: string) =>
      summary?.templates.find((t) => t.name === name);
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

  it('a template found for one program and only named for another is design-file', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [crystal('X.rpt', { confidence: 'detected', warnings: [] })],
        'p/B.vbp': [crystal('X.rpt', { file: 'b/B.bas' })],
      }),
    );
    expect(summary?.counts).toMatchObject({ templates: 1, designFile: 1 });
  });

  it('keeps the highest complexity of the places that use a template', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          crystal('X.rpt', { complexity: rated('low', 1), procedureId: 'a' }),
          crystal('X.rpt', {
            complexity: rated('high', 7),
            procedureId: 'b',
            line: 9,
          }),
        ],
      }),
    );
    expect(summary?.templates[0]?.complexity).toMatchObject({
      level: 'high',
      score: 7,
    });
    expect(summary?.counts.byLevel.high).toBe(1);
    // The distribution is over templates only.
    expect(
      Object.values(summary?.counts.byLevel ?? {}).reduce((n, v) => n + v, 0),
    ).toBe(summary?.counts.templates);
  });
});

describe('output functions (need confirmation, never added to templates)', () => {
  it('groups signs of one procedure into one function', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          row({ kind: 'print', name: 'Printer', procedureId: 'M.P', line: 3 }),
          row({ kind: 'print', name: 'Printer', procedureId: 'M.P', line: 4 }),
          row({
            kind: 'print',
            name: 'PrintForm',
            procedureId: 'M.P',
            line: 5,
          }),
          row({ kind: 'print', name: 'Printer', procedureId: 'M.Q', line: 30 }),
        ],
      }),
    );
    expect(summary?.counts.functions).toBe(2);
    expect(summary?.counts.templates).toBe(0);
    expect(summary?.functions[0]?.evidence.length).toBeGreaterThanOrEqual(2);
    expect(summary?.counts.functionPrograms).toBe(1);
  });

  it('names csv and excel, and leaves log files out of the count', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          row({
            kind: 'file-output',
            name: 'Open For Output',
            subkind: 'csv',
            procedureId: 'M.Csv',
            line: 11,
          }),
          row({
            kind: 'excel',
            name: 'EXCEL.EXE',
            procedureId: 'M.Xl',
            line: 21,
          }),
          row({
            kind: 'file-output',
            name: 'Open For Append',
            excludeReason: 'log',
            procedureId: 'M.Log',
            line: 31,
          }),
          row({
            kind: 'file-output',
            name: 'Open For Output',
            procedureId: 'M.Other',
            line: 41,
          }),
        ],
      }),
    );
    expect(summary?.counts.functions).toBe(3);
    expect(summary?.counts.excludedFunctions).toBe(1);
    const kinds = summary?.functions.flatMap((f) => f.kinds);
    expect(kinds).toEqual(
      expect.arrayContaining(['csv', 'excel', 'file-output']),
    );
    const excluded = summary?.functions.find((f) => f.excluded);
    expect(excluded?.excludeReason).toBe('log');
    expect(excluded?.procedure).toBe('M.Log');
  });

  it('a log in the same procedure as a print does not remove the print function', () => {
    const summary = deriveReportSummary(
      inventory({
        'p/A.vbp': [
          row({ kind: 'print', name: 'Printer', procedureId: 'M.P' }),
          row({
            kind: 'file-output',
            name: 'Open For Append',
            excludeReason: 'log',
            procedureId: 'M.P',
            line: 8,
          }),
        ],
      }),
    );
    expect(summary?.counts.functions).toBe(1);
    expect(summary?.counts.excludedFunctions).toBe(1);
  });

  it('a report runtime without a template is one unknown function of its program', () => {
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
    expect(summary?.functions).toHaveLength(1);
    expect(summary?.functions[0]?.kinds).toEqual(['unknown']);
  });

  it('is undefined for an inventory without screen/report data', () => {
    expect(
      deriveReportSummary({
        programs: [] as never,
        totals: {},
      }),
    ).toBeUndefined();
  });
});
