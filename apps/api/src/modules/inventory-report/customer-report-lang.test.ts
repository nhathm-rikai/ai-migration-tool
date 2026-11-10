import { CustomerReportSchema, REPORT_COUNTING_BASIS } from '@portal/contracts';
import { Check } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { demoInventory } from '../../adapters/fake/demo-inventory.js';
import { buildCustomerReport } from './customer-report.js';
import { reportText } from './customer-report-text.js';
import { RISK_CATALOG, RISK_CATALOG_VI } from './customer-risk-catalog.js';
import { customerReportSheets } from './customer-report-workbook.js';
import { customerReportFileName } from './report-download.service.js';
import type { CellValue } from './xlsx-writer.js';

// The customer report in Vietnamese (lang=vi) next to the Japanese one:
// same figures, every fixed sentence translated, no internal version id.

const origin = {
  mode: 'demo' as const,
  projectId: 'p1',
  projectName: 'Demo',
  runId: 'r1',
  artifactId: 'a1',
  artifactVersion: 1,
  createdAt: '2026-11-06T00:00:00.000Z',
};
const ja = buildCustomerReport(demoInventory, origin, 'ja');
const vi = buildCustomerReport(demoInventory, origin, 'vi');
const jaSheets = customerReportSheets(ja);
const viSheets = customerReportSheets(vi);
const CJK = /[぀-ヿ一-鿿＀-￯]/;

describe('customer report language', () => {
  it('the language is in the JSON and both documents match the contract', () => {
    expect(ja.language).toBe('ja');
    expect(vi.language).toBe('vi');
    for (const report of [ja, vi])
      expect(
        Check(CustomerReportSchema, JSON.parse(JSON.stringify(report))),
      ).toBe(true);
  });

  it('has the same keys in both languages (text and risk catalog)', () => {
    const shape = (value: unknown): unknown =>
      typeof value === 'function'
        ? 'fn'
        : Array.isArray(value)
          ? value.map(shape)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value).map(([k, v]) => [k, shape(v)]),
              )
            : typeof value;
    const keys = (value: unknown): unknown => {
      const s = shape(value);
      return JSON.stringify(s, (_k, v: unknown) =>
        Array.isArray(v) ? v.length : v,
      );
    };
    expect(keys(reportText('vi'))).toBe(keys(reportText('ja')));
    expect(Object.keys(RISK_CATALOG_VI).sort()).toEqual(
      Object.keys(RISK_CATALOG).sort(),
    );
    for (const item of REPORT_COUNTING_BASIS) {
      expect(item.vi.text.length).toBeGreaterThan(0);
      expect(item.ja.text.length).toBeGreaterThan(0);
    }
  });

  it('gives the same sheets, rows and every number', () => {
    expect(viSheets.length).toBe(jaSheets.length);
    viSheets.forEach((sheet, index) => {
      const other = jaSheets[index];
      expect(sheet.rows.length).toBe(other?.rows.length);
      sheet.rows.forEach((row, r) =>
        row.forEach((cell, c) => {
          const jaCell: CellValue | undefined = other?.rows[r]?.[c];
          if (typeof cell === 'number' || typeof jaCell === 'number')
            expect(cell).toBe(jaCell);
        }),
      );
    });
  });

  it('translates every fixed sentence: no Japanese is left where the text differs', () => {
    viSheets.forEach((sheet, index) => {
      const other = jaSheets[index];
      const left: string[] = [];
      sheet.rows.forEach((row, r) =>
        row.forEach((cell, c) => {
          if (
            typeof cell === 'string' &&
            cell !== other?.rows[r]?.[c] &&
            CJK.test(cell)
          )
            left.push(cell);
        }),
      );
      expect(left).toEqual([]);
      for (const text of [
        sheet.name,
        sheet.title,
        ...sheet.columns.map((c) => c.header),
        ...(sheet.notes ?? []),
      ])
        expect(text).not.toMatch(CJK);
    });
  });

  it('has valid Excel sheet names in Vietnamese', () => {
    for (const sheet of viSheets) {
      expect(sheet.name.length).toBeLessThanOrEqual(31);
      expect(sheet.name).not.toMatch(/[[\]:*?/\\]/);
    }
    expect(new Set(viSheets.map((s) => s.name)).size).toBe(6);
  });

  it('names the report in Vietnamese by the shared counting basis', () => {
    const rows = viSheets[0]?.rows.map((r) => String(r[0] ?? '')) ?? [];
    expect(rows).toContain('Cơ sở tính');
    const text = rows.join('\n');
    expect(text).toContain('Report theo quy ước Assessment');
    for (const item of REPORT_COUNTING_BASIS)
      expect(text).toContain(item.vi.text);
  });

  it('writes no internal id, model version or hash into either language', () => {
    for (const sheets of [jaSheets, viSheets]) {
      const text = JSON.stringify(
        sheets.flatMap((s) => [s.name, s.title, s.notes ?? [], s.rows]),
      );
      for (const word of [
        '-v1',
        '-draft',
        'customer-assessment-report',
        'complexity-v',
        'screen-report',
        'artifact',
        'run-',
        ja.source.snapshotHash.slice(0, 12),
      ])
        expect(text).not.toContain(word);
    }
  });

  it('names the file by language', () => {
    const day = new Date('2026-11-06T00:00:00.000Z');
    expect(customerReportFileName('Demo', day, 'xlsx')).toBe(
      'アセスメント報告書_Demo_20261106.xlsx',
    );
    expect(customerReportFileName('Demo', day, 'xlsx', 'vi')).toBe(
      'Bao-cao-Assessment_Demo_20261106.xlsx',
    );
  });
});
