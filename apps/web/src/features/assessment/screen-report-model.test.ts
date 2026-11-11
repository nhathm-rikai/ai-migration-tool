import {
  deriveReportSummary,
  REPORT_COMPLEXITY_VERSION,
  type SourceInventoryDocument,
} from '@portal/contracts';
import { mappedInventoryFixture } from '@portal/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import { summarizeInventory } from './assessment-summary';
import { programScreenReport, screenReportView } from './screen-report-model';
import { screenReportCorpus } from '../../testing/inventory-fixtures';

describe('AR04-AC06/AC11 screen and report model', () => {
  const inventory = screenReportCorpus();

  it('reads the project figures from the inventory totals', () => {
    expect(screenReportView(inventory)).toMatchObject({
      available: true,
      screens: 3,
      sharedScreens: 1,
      batches: 1,
      reportVersion: 'screen-report-v4',
      complexityVersion: REPORT_COMPLEXITY_VERSION,
    });
  });

  it('counts one total over Crystal, code print and CSV/Excel export', () => {
    const summary = deriveReportSummary(inventory);
    expect(summary?.counts).toMatchObject({
      total: 5,
      crystal: 3,
      print: 1,
      export: 1,
      dataFiles: 0,
      excluded: 0,
    });
    // A shared template is one report, with every program that uses it.
    const common = summary?.reports.find((r) => r.name === 'common.rpt');
    expect(common?.programs).toEqual([
      'programs/Invoice/Invoice.vbp',
      'programs/Order/Order.vbp',
    ]);
  });

  it('keeps the level distribution over all reports', () => {
    const summary = deriveReportSummary(inventory);
    if (!summary) throw new Error('summary');
    const levels = Object.values(summary.counts.byLevel).reduce(
      (a, b) => a + b,
      0,
    );
    expect(levels).toBe(summary.counts.total);
    for (const level of ['medium', 'high', 'very-high', 'unrated'] as const)
      expect(
        summary.reports.filter((r) => r.complexity.level === level),
      ).toHaveLength(summary.counts.byLevel[level]);
  });

  it('puts the counts on each program row, null when absent', () => {
    const summary = summarizeInventory(inventory);
    expect(
      summary.programs.map((row) => [
        row.screens,
        row.reports,
        row.programType,
      ]),
    ).toEqual([
      [2, 2, 'screen'],
      [2, 3, 'screen'],
      [0, 1, 'batch'],
    ]);
    const old = summarizeInventory(mappedInventoryFixture);
    expect(old.programs[0]).toMatchObject({
      screens: null,
      reports: null,
      programType: null,
    });
  });

  it('reports no data for an inventory written before AR04', () => {
    expect(screenReportView(mappedInventoryFixture)).toEqual({
      available: false,
    });
    expect(deriveReportSummary(mappedInventoryFixture)).toBeUndefined();
    const [program] = mappedInventoryFixture.programs;
    if (!program) throw new Error('program');
    expect(programScreenReport(program)).toEqual({ available: false });
  });
});

describe('an inventory stored before reportItems existed', () => {
  it('reads the same templates and counts as a freshly written one', () => {
    const fresh = screenReportCorpus();
    const stored: SourceInventoryDocument = structuredClone(fresh);
    delete stored.totals.screenReport?.reportItems;
    expect(deriveReportSummary(stored)).toEqual(deriveReportSummary(fresh));
    expect(screenReportView(stored)).toEqual(screenReportView(fresh));
  });
});

describe('AR06-AC01 an inventory scored by an older complexity model', () => {
  it('warns in step 2 even when only reportComplexityVersion is old', () => {
    const old = structuredClone(screenReportCorpus());
    old.reportComplexityVersion = 'report-complexity-v1-draft';
    expect(old.screenReportVersion).toBe('screen-report-v4');
    expect(summarizeInventory(old).warnings).toContain(
      'SCREEN_REPORT_OUTDATED',
    );
  });
});

describe('an inventory counted by an older report counting', () => {
  it('warns in step 2 that it needs an analysis again', () => {
    const old = structuredClone(screenReportCorpus());
    old.screenReportVersion = 'screen-report-v2';
    expect(summarizeInventory(old).warnings).toContain(
      'SCREEN_REPORT_OUTDATED',
    );
    expect(summarizeInventory(screenReportCorpus()).warnings).not.toContain(
      'SCREEN_REPORT_OUTDATED',
    );
  });
});
