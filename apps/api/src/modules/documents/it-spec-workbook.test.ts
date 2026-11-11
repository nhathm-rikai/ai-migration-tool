import { describe, expect, it } from 'vitest';
import type { ItChecklist } from '../analysis/it-checklist.js';
import { unzip } from '../../testing/zip-reader.js';
import { writeXlsx } from '../inventory-report/xlsx-writer.js';
import { parseItSpec } from './it-spec.js';
import { itSpecSheets } from './it-spec-workbook.js';

// TC02-AC04: the Japanese Excel of one integration test specification.
const checklist: ItChecklist = {
  version: 'it-checklist-v1',
  program: 'A',
  items: [
    {
      id: 'IT-A-db-chain-1',
      kind: 'db-chain',
      file: 'a/F1.frm',
      line: 6,
      detail: 'ORDERS (CR, 2 procedures)',
      counterpart: null,
    },
    {
      id: 'IT-A-cross-program-1',
      kind: 'cross-program',
      file: 'a/F1.frm',
      line: 7,
      detail: 'STOCK: A U / B R',
      counterpart: 'B',
    },
  ],
};
const markdown = [
  '| No | 対象ID | 種別 | シナリオ | 関連要素 | 前提条件 | 手順 | 期待結果 | 根拠 | 区分 | 対象外理由 |',
  '| -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |',
  '| 1 | IT-A-db-chain-1 | db-chain | =cmd+calc | ORDERS | 前提 | 手順 | 期待 | a/F1.frm:6 | テスト |  |',
  '| 2 | IT-A-db-chain-1 | db-chain | 印刷 | ORDERS | 前提 |  |  | a/F1.frm:9 | 対象外 | プリンタなし |',
  '| 3 | IT-A-cross-program-1 | cross-program | 在庫 | STOCK, B | 前提 |  |  | a/F1.frm:7 | 対象外 | B の環境なし |',
].join('\n');

const parsed = parseItSpec(markdown);
if (!parsed) throw new Error('fixture');
const sheets = itSpecSheets({
  program: 'programs/A/A.vbp',
  runId: 'run-0001-abcdef',
  sha256: 'ab12cd34'.repeat(8),
  specPack: 'spec-design-rules-x + spec-design-templates-y',
  createdAt: '2026-11-10T04:00:00.000Z',
  model: 'haiku',
  runner: 'fake',
  review: 'pending',
  scenarios: parsed.scenarios,
  checklist,
});

describe('TC02-AC04 workbook', () => {
  it('has exactly the three sheets of the Japanese template, in order', () => {
    expect(sheets.map((s) => s.name)).toEqual([
      '表紙',
      'テストシナリオ',
      'カバレッジ',
    ]);
  });

  it('has the scenario columns, the last three left for the tester', () => {
    const scenarios = sheets[1];
    expect(scenarios?.columns.map((c) => c.header)).toEqual([
      'No',
      'ID',
      '種別',
      'シナリオ',
      '関連要素',
      '前提条件',
      '手順',
      '期待結果',
      '根拠(file:行)',
      '実施日',
      '結果',
      '確認者',
    ]);
    expect(scenarios?.rows).toHaveLength(3);
    for (const row of scenarios?.rows ?? []) {
      expect(row).toHaveLength(12);
      expect(row.slice(-3)).toEqual([null, null, null]);
    }
  });

  it('shows the kind of the checklist item, and the reason of an exclusion in 手順', () => {
    const [test, excluded] = sheets[1]?.rows ?? [];
    expect(test?.[2]).toBe('DB連携');
    expect(test?.[6]).toBe('手順');
    expect(test?.[7]).toBe('期待');
    expect(excluded?.[6]).toBe('対象外: プリンタなし');
    expect(excluded?.[7]).toBeNull();
  });

  it('lists every checklist ID on the coverage sheet with テスト and 対象外 counts', () => {
    const coverage = sheets[2];
    expect(coverage?.rows.map((row) => row[0])).toEqual(
      checklist.items.map((item) => item.id),
    );
    // シナリオ数, テスト, 対象外, 対象外理由.
    expect(coverage?.rows[0]?.slice(4, 8)).toEqual([2, 1, 1, 'プリンタなし']);
    expect(coverage?.rows[1]?.slice(4, 8)).toEqual([1, 0, 1, 'B の環境なし']);
    expect(coverage?.rows[1]?.[1]).toBe('プログラム間連携');
  });

  it('shows program, document version, date, author and review state on the cover', () => {
    const text = JSON.stringify(sheets[0]?.rows);
    expect(sheets[0]?.title).toBe('結合テスト仕様書');
    expect(text).toContain('programs/A/A.vbp');
    expect(text).toContain('run-0001');
    expect(text).toContain('ab12cd34');
    expect(text).toContain('2026-11-10');
    expect(text).toContain('AI');
    expect(text).toContain('未承認');
    expect(text).toContain('it-checklist-v1');
  });

  it('keeps formula-like text as text and has no absolute path in the xlsx', () => {
    const parts = unzip(writeXlsx(sheets));
    const sheet2 = parts.get('xl/worksheets/sheet2.xml') ?? '';
    expect(sheet2).toContain('=cmd+calc');
    expect(sheet2).not.toContain('<f>');
    for (const [name, xml] of parts) {
      // Namespaces are URLs; the cells are in the worksheets.
      if (!name.startsWith('xl/worksheets/')) continue;
      expect(xml.replaceAll('http://', '')).not.toMatch(/[A-Za-z]:[/\\]/);
      expect(xml).not.toContain('/Users/');
    }
  });

  it('writes a placeholder row when the checklist is empty', () => {
    const empty = itSpecSheets({
      program: 'p',
      runId: 'r',
      sha256: 's',
      specPack: 'x',
      createdAt: '2026-11-10T00:00:00.000Z',
      model: 'haiku',
      runner: 'fake',
      review: 'approved',
      scenarios: [],
      checklist: { ...checklist, items: [] },
    });
    expect(empty[1]?.rows).toEqual([
      ['該当なし', ...Array<null>(11).fill(null)],
    ]);
    expect(empty[2]?.rows).toEqual([
      ['該当なし', ...Array<null>(7).fill(null)],
    ]);
    expect(JSON.stringify(empty[0]?.rows)).toContain('承認済み');
  });
});
