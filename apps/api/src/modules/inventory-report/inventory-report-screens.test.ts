import {
  REPORT_COMPLEXITY_VERSION,
  type SourceInventoryDocument,
} from '@portal/contracts';
import { describe, expect, it } from 'vitest';
import { demoInventory } from '../../adapters/fake/demo-inventory.js';
import { ALL_PROGRAMS, buildInventoryReport } from './inventory-report.js';
import { inventoryReportSheets } from './inventory-report-workbook.js';

// AR04: the technical report carries screens and reports of the inventory.
// Fixtures are the invented demo inventory; nothing comes from customer source.

const report = buildInventoryReport(demoInventory, ALL_PROGRAMS);

describe('AR04 technical report: Screens and Reports', () => {
  it('lists every screen and report row with evidence', () => {
    expect(report.screens.map((s) => [s.programId, s.file, s.shared])).toEqual([
      ['ORDER', 'programs/ORDER/ORDERFORM.FRM', false],
      ['ORDER', 'cmn/LOGIN.FRM', true],
      ['REPORT', 'cmn/LOGIN.FRM', true],
      ['REPORT', 'programs/REPORT/PREVIEW.FRM', false],
    ]);
    expect(
      report.reports.map((r) => [r.programId, r.kind, r.confidence, r.line]),
    ).toEqual([
      ['ORDER', 'crystal', 'detected', 130],
      // The same template in a second procedure: a second SIGN in the
      // technical report (the customer report counts templates).
      ['ORDER', 'crystal', 'detected', 160],
      ['CUSTOMER', 'print', 'suspected', 70],
      ['CUSTOMER', 'file-output', 'suspected', 90],
      ['CUSTOMER', 'file-output', 'suspected', 95],
      ['REPORT', 'crystal', 'referenced', 40],
      ['REPORT', 'data-report', 'detected', 2],
      ['REPORT', 'excel', 'suspected', 60],
      ['REPORT', 'file-output', 'suspected', 80],
    ]);
    const high = report.reports[0];
    expect(high).toMatchObject({
      complexityLevel: 'high',
      complexityScore: 6,
      complexityVersion: REPORT_COMPLEXITY_VERSION,
    });
    expect(high?.complexityFactors).toContain('decisionPoints=28:2');
  });

  it('adds screens, reports and type columns to Programs and totals to Summary', () => {
    const order = report.programs.find((p) => p.id === 'ORDER');
    expect(order).toMatchObject({
      programType: 'screen',
      screens: 2,
      reports: 2,
      suspectedReports: 0,
    });
    expect(report.programs.find((p) => p.id === 'CUSTOMER')).toMatchObject({
      programType: 'batch',
      screens: 0,
      reports: 0,
      suspectedReports: 3,
    });
    // 3 distinct screens (LOGIN counted once); 4 report signs counted, 4
    // suspected (print, csv, log, excel).
    expect(report.totals.screenReport).toMatchObject({
      screens: 3,
      sharedScreens: 1,
      batches: 1,
      suspectedPrograms: 2,
      reports: { rows: 9, counted: 4, suspected: 5 },
    });
    const sheets = inventoryReportSheets(report);
    const names = sheets.map((s) => s.name);
    expect(names).toContain('Screens');
    expect(names).toContain('Reports');
    const summary = sheets.find((s) => s.name === 'Summary');
    expect(summary?.rows.map((r) => r[0])).toEqual(
      expect.arrayContaining(['screens', 'reportsFound', 'reportsSuspected']),
    );
    const readme = sheets.find((s) => s.name === 'README');
    expect(readme?.rows.map((r) => r[0])).toEqual(
      expect.arrayContaining(['Screens', 'Reports']),
    );
  });

  it('keeps the missing-file warnings and the suspected-output note', () => {
    const codes = report.warnings.map((w) => w.code);
    expect(codes).toContain('REPORT_FILE_MISSING');
    expect(codes).toContain('SCREEN_FILE_MISSING');
    expect(codes).toContain('REPORT_SUSPECTED');
    expect(codes).not.toContain('SCREEN_REPORT_MISSING');
  });
});

describe('AR04-AC05 inventory without screen/report data', () => {
  const legacy: SourceInventoryDocument = JSON.parse(
    JSON.stringify(demoInventory),
  ) as SourceInventoryDocument;
  delete legacy.screenReportVersion;
  delete legacy.reportComplexityVersion;
  delete legacy.totals.screenReport;
  for (const program of legacy.programs) {
    delete program.programType;
    delete program.screens;
    delete program.reports;
  }
  const old = buildInventoryReport(legacy, ALL_PROGRAMS);

  it('reports unknown values, never zero, and says to analyze again', () => {
    expect(old.totals.screenReport).toBeNull();
    expect(old.programs.every((p) => p.screens === null)).toBe(true);
    expect(old.programs.every((p) => p.reports === null)).toBe(true);
    expect(old.screens).toEqual([]);
    expect(old.reports).toEqual([]);
    expect(old.warnings.map((w) => w.code)).toContain('SCREEN_REPORT_MISSING');
    const summary = inventoryReportSheets(old).find(
      (s) => s.name === 'Summary',
    );
    expect(JSON.stringify(summary?.rows)).toContain('not analyzed');
    const programs = inventoryReportSheets(old).find(
      (s) => s.name === 'Programs',
    );
    const column = programs?.columns.findIndex((c) => c.header === 'screens');
    expect(column).toBeGreaterThan(-1);
    expect(programs?.rows.every((row) => row[column ?? 0] === null)).toBe(true);
  });
});

describe('review finding 6: old inventory whose programs are all unsupported', () => {
  const old: SourceInventoryDocument = JSON.parse(
    JSON.stringify(demoInventory),
  ) as SourceInventoryDocument;
  delete old.screenReportVersion;
  delete old.reportComplexityVersion;
  delete old.totals.screenReport;
  for (const program of old.programs) {
    delete program.programType;
    delete program.screens;
    delete program.reports;
    program.status = 'unsupported';
    program.issue = { reason: 'PROJECT_TYPE_MISSING', line: null };
    program.analysis = null;
  }
  it('is still "no data", not zero', () => {
    const report = buildInventoryReport(old, ALL_PROGRAMS);
    expect(report.totals.screenReport).toBeNull();
    expect(report.warnings.map((w) => w.code)).toContain(
      'SCREEN_REPORT_MISSING',
    );
  });
});
