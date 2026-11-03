import { describe, expect, it } from 'vitest';
import {
  computeQuote,
  DEFAULT_QUOTE_PARAMS,
  type QuoteProgram,
} from './quote-model';
import { buildQuoteSheets } from './quote-workbook';
import { buildWorkbook } from './xlsx';

const program = (path: string, lines: number): QuoteProgram => ({
  projectPath: path,
  name: path.split('/').pop() ?? path,
  codeLines: lines,
  metrics: {
    decisionPoints: 100,
    tables: 2,
    concatenatedSql: 1,
    dynamicSql: 0,
    components: 0,
    externalApis: 0,
  },
  level: 'medium',
  score: 50,
});

describe('buildQuoteSheets', () => {
  const programs = [
    program('kousyosr/ksho/KSHO1010', 2000),
    program('kousyosr/ksho/KSHO0010', 1000),
    program('kousyosr/kuno/KUNO0040', 500),
  ];
  const result = computeQuote(programs, DEFAULT_QUOTE_PARAMS, undefined, 300);
  const sheets = buildQuoteSheets({
    projectName: 'KOUSYO',
    quoteNumber: 'QT-2026-1103-1',
    params: DEFAULT_QUOTE_PARAMS,
    result,
  });

  it('has a summary and a WBS sheet in Japanese', () => {
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      '見積サマリー',
      '工数一覧（WBS）',
    ]);
  });

  it('lists every program and the shared code in the WBS, summing to the total', () => {
    const wbs = sheets[1];
    // title, blank, header, total, then one row per program + shared code
    expect(wbs?.rows.length).toBe(4 + programs.length + 1);
    const total = (cell: unknown) =>
      typeof cell === 'object' && cell !== null && 'v' in cell
        ? Number(cell.v)
        : 0;
    const rows = wbs?.rows.slice(4) ?? [];
    const sum = rows.reduce((acc, row) => acc + total(row[13]), 0);
    expect(sum).toBeCloseTo(result.totalMM, 1);
    const cost = rows.reduce((acc, row) => acc + total(row[14]), 0);
    expect(cost).toBeCloseTo(result.totalCost, -1);
  });

  it('writes formulas with their values and styles into the file', () => {
    const text = new TextDecoder().decode(buildWorkbook(sheets));
    expect(text).toContain('<f>SUM(F5:F8)</f>');
    expect(text).toContain('xl/styles.xml');
    expect(text).toContain('見積');
    expect(text).toContain('<pane');
  });
});
