import { describe, expect, it } from 'vitest';
import type { UtChecklist } from '../analysis/ut-checklist.js';
import { unzip } from '../../testing/zip-reader.js';
import { writeXlsx } from '../inventory-report/xlsx-writer.js';
import { parseUtSpec } from './ut-spec.js';
import { utSpecSheets } from './ut-spec-workbook.js';

// TC01-AC04: the Japanese Excel of one unit test specification.
const checklist: UtChecklist = {
  version: 'ut-checklist-v1',
  program: 'A',
  items: [
    {
      id: 'UT-A-Calc-1',
      kind: 'procedure',
      procedure: 'Calc',
      file: 'a/M.bas',
      line: 2,
      detail: 'sub Calc',
    },
    {
      id: 'UT-A-Save-2',
      kind: 'sql',
      procedure: 'Save',
      file: 'a/M.bas',
      line: 21,
      detail: 'UPDATE ORDERS',
    },
  ],
};
const HEAD =
  '| No | 対象ID | 大項目 | 中項目 | 小項目 | 前提条件 | 入力データ | 手順 | 期待結果 | 確認観点 | 根拠 | 区分 | 対象外理由 |\n| -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |';
const markdown = `# x\n\n| 生成状態 | 完了 |\n| -- | -- |\n\n## テストケース\n\n${HEAD}\n| 1 | UT-A-Calc-1 | 計算 | 分岐 | =cmd+calc | 前提 | 入力 | 手順 | 期待 | 観点 | a/M.bas:5 | テスト |  |\n| 2 | UT-A-Save-2 | 保存 | DB | 更新 | - | - | - | - | - | a/M.bas:21 | 対象外 | テスト用DBなし |\n`;

const meta = {
  program: 'programs/A/A.vbp',
  runId: 'run-0001-abcdef',
  sha256: 'ab12cd34'.repeat(8),
  specPack: 'spec-design-rules-x + spec-design-templates-y',
  createdAt: '2026-11-09T04:00:00.000Z',
  model: 'haiku',
  runner: 'fake',
  review: 'pending' as const,
};

describe('TC01-AC04 workbook', () => {
  const parsed = parseUtSpec(markdown);
  if (!parsed) throw new Error('fixture');
  const sheets = utSpecSheets({ ...meta, cases: parsed.cases, checklist });

  it('has exactly the three sheets of the Japanese template, in order', () => {
    expect(sheets.map((s) => s.name)).toEqual([
      '表紙',
      'テストケース',
      'カバレッジ',
    ]);
  });

  it('has the columns of the template, the last three left for the tester', () => {
    const cases = sheets[1];
    expect(cases?.columns.map((c) => c.header)).toEqual([
      'No',
      'ID',
      '大項目',
      '中項目',
      '小項目',
      '前提条件',
      '入力',
      '手順',
      '期待結果',
      '根拠(file:行)',
      '実施日',
      '結果',
      '確認者',
    ]);
    for (const row of cases?.rows ?? [])
      expect(row.slice(-3)).toEqual([null, null, null]);
    expect(cases?.rows).toHaveLength(2);
  });

  it('lists every checklist ID on the coverage sheet with its case count', () => {
    const coverage = sheets[2];
    const ids = coverage?.rows.map((row) => row[0]);
    expect(ids).toEqual(checklist.items.map((item) => item.id));
    expect(coverage?.rows.map((row) => row[5])).toEqual([1, 1]);
    expect(JSON.stringify(coverage?.rows[1])).toContain('対象外');
  });

  it('shows program, document version, date, author and review state on the cover', () => {
    const text = JSON.stringify(sheets[0]?.rows);
    expect(text).toContain('programs/A/A.vbp');
    expect(text).toContain('run-0001');
    expect(text).toContain('ab12cd34');
    expect(text).toContain('2026-11-09');
    expect(text).toContain('AI');
    expect(text).toContain('未承認');
  });

  it('keeps formula-like text as text in the xlsx', () => {
    const parts = unzip(writeXlsx(sheets));
    const sheet2 = parts.get('xl/worksheets/sheet2.xml') ?? '';
    expect(sheet2).toContain('=cmd+calc');
    expect(sheet2).not.toContain('<f>');
    expect(sheet2).toMatch(/s="2"><is><t[^>]*>=cmd\+calc/);
  });
});
