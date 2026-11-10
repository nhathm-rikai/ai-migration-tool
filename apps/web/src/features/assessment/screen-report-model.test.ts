import {
  deriveReportSummary,
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
      reportVersion: 'screen-report-v1',
      complexityVersion: 'report-complexity-v1-draft',
    });
  });

  it('counts report templates and print/export functions apart', () => {
    const summary = deriveReportSummary(inventory);
    expect(summary?.counts).toMatchObject({
      templates: 3,
      functions: 2,
      functionPrograms: 2,
      excludedFunctions: 0,
    });
    // A shared template is one template, with every program that uses it.
    const common = summary?.templates.find((t) => t.name === 'common.rpt');
    expect(common?.programs).toEqual([
      'programs/Invoice/Invoice.vbp',
      'programs/Order/Order.vbp',
    ]);
  });

  it('keeps the level distribution over the templates only', () => {
    const summary = deriveReportSummary(inventory);
    if (!summary) throw new Error('summary');
    const levels = Object.values(summary.counts.byLevel).reduce(
      (a, b) => a + b,
      0,
    );
    expect(levels).toBe(summary.counts.templates);
    for (const level of ['medium', 'high', 'very-high', 'unrated'] as const)
      expect(
        summary.templates.filter((t) => t.complexity.level === level),
      ).toHaveLength(summary.counts.byLevel[level]);
  });

  it('puts the counts on each program row, null when absent', () => {
    const summary = summarizeInventory(inventory);
    expect(
      summary.programs.map((row) => [
        row.screens,
        row.reports,
        row.suspectedReports,
        row.programType,
      ]),
    ).toEqual([
      [2, 2, 0, 'screen'],
      [2, 2, 1, 'screen'],
      [0, 0, 1, 'batch'],
    ]);
    const old = summarizeInventory(mappedInventoryFixture);
    expect(old.programs[0]).toMatchObject({
      screens: null,
      reports: null,
      suspectedReports: null,
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
