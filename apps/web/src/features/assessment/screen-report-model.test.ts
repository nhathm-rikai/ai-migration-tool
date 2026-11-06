import { mappedInventoryFixture } from '@portal/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import { summarizeInventory } from './assessment-summary';
import {
  EMPTY_REPORT_FILTER,
  filterReports,
  programScreenReport,
  reportListRows,
  screenReportView,
  sortReports,
} from './screen-report-model';
import { screenReportCorpus } from '../../testing/inventory-fixtures';

describe('AR04-AC06/AC11 screen and report model', () => {
  const inventory = screenReportCorpus();

  it('reads the project figures from the inventory totals', () => {
    expect(screenReportView(inventory)).toMatchObject({
      available: true,
      screens: 3,
      sharedScreens: 1,
      batches: 1,
      counted: 3,
      suspected: 2,
      suspectedPrograms: 2,
      rows: 5,
      reportVersion: 'screen-report-v1',
      complexityVersion: 'report-complexity-v1-draft',
    });
  });

  it('lists a shared report once, with every program that declares it', () => {
    const rows = reportListRows(inventory);
    expect(rows).toHaveLength(5);
    const common = rows?.find((row) => row.name === 'common.rpt');
    expect(common?.programs.map((program) => program.label)).toEqual([
      'Order',
      'Invoice',
    ]);
    expect(common?.module).toBe('programs/Order');
  });

  it('keeps the total by kind, by level and the list rows equal', () => {
    const view = screenReportView(inventory);
    const rows = reportListRows(inventory) ?? [];
    if (!view.available) throw new Error('available');
    const sum = (record: Record<string, number>) =>
      Object.values(record).reduce((a, b) => a + b, 0);
    expect(sum(view.byKind)).toBe(rows.length);
    expect(sum(view.byLevel)).toBe(rows.length);
    for (const level of ['medium', 'high', 'very-high', 'unrated'] as const)
      expect(rows.filter((row) => row.level === level)).toHaveLength(
        view.byLevel[level],
      );
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

  it('filters by level, kind, confidence and text; sorts unrated last', () => {
    const rows = reportListRows(inventory) ?? [];
    const by = (filter: Partial<typeof EMPTY_REPORT_FILTER>) =>
      filterReports(rows, { ...EMPTY_REPORT_FILTER, ...filter }).map(
        (row) => row.name,
      );
    expect(by({ level: 'high' })).toEqual(['order.rpt']);
    expect(by({ level: 'unrated' })).toEqual(['Excel.Application', 'Printer']);
    expect(by({ kind: 'crystal' })).toHaveLength(3);
    expect(by({ confidence: 'counted' })).toHaveLength(3);
    expect(by({ confidence: 'suspected' })).toHaveLength(2);
    expect(by({ query: 'BATCH' })).toEqual(['Printer']);
    const sorted = sortReports(rows, { key: 'complexity', direction: 'desc' });
    expect(sorted.map((row) => row.name)).toEqual([
      'common.rpt',
      'order.rpt',
      'bill.rpt',
      'Excel.Application',
      'Printer',
    ]);
    // Ascending keeps unrated after the rated rows too.
    expect(
      sortReports(rows, { key: 'complexity', direction: 'asc' })
        .slice(-2)
        .map((row) => row.level),
    ).toEqual(['unrated', 'unrated']);
  });

  it('reports no data for an inventory written before AR04', () => {
    expect(screenReportView(mappedInventoryFixture)).toEqual({
      available: false,
    });
    expect(reportListRows(mappedInventoryFixture)).toBeNull();
    const [program] = mappedInventoryFixture.programs;
    if (!program) throw new Error('program');
    expect(programScreenReport(program)).toEqual({ available: false });
  });
});
