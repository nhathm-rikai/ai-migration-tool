import type { UtChecklist } from '../analysis/ut-checklist.js';
import type {
  CellValue,
  Sheet,
  SheetColumn,
} from '../inventory-report/xlsx-writer.js';
import type { UtCase } from './ut-spec.js';

// The unit test specification as the Japanese Excel (単体テスト仕様書): a cover
// sheet, the test cases (14 columns, the last three for the tester) and a
// coverage sheet (checklist item × cases, with the テスト/対象外 counts so an
// item whose real output cannot be verified is visible). Written with the
// writer and style of the other reports; text that looks like a formula
// stays text.

export type UtSpecMeta = {
  // Project path of the program.
  program: string;
  runId: string;
  sha256: string;
  specPack: string;
  createdAt: string;
  model: string;
  runner: string;
  review: 'approved' | 'pending';
  cases: readonly UtCase[];
  checklist: UtChecklist;
};

const col = (header: string, width: number, wrap = false): SheetColumn => ({
  header,
  width,
  ...(wrap ? { wrap } : {}),
});

const KIND_LABELS: Record<string, string> = {
  procedure: 'プロシージャ',
  event: 'イベントハンドラ',
  sql: 'SQL文',
  report: '帳票',
};

export const UT_SHEET_NAMES = ['表紙', 'テストケース', 'カバレッジ'] as const;

export function utSpecSheets(meta: UtSpecMeta): Sheet[] {
  const cover: CellValue[][] = [
    ['プログラム', meta.program],
    [
      '文書バージョン',
      `実行 ${meta.runId.slice(0, 8)}／ハッシュ ${meta.sha256.slice(0, 8)}／${meta.specPack}`,
    ],
    ['作成日', meta.createdAt.slice(0, 10)],
    ['作成者', `AI（${meta.model}・${meta.runner}）`],
    ['レビュー状態', meta.review === 'approved' ? '承認済み' : '未承認'],
    [
      '注意',
      'AIが作成した草案です。人による確認が必要です。「実施日」「結果」「確認者」はテスト実施者が記入します。',
    ],
    [
      'チェックリスト',
      `${meta.checklist.version}（${meta.checklist.items.length} 件）`,
    ],
  ];
  const rows: CellValue[][] = meta.cases.map((c): CellValue[] => [
    c.no,
    c.itemId,
    c.major,
    c.middle,
    c.minor,
    c.precondition,
    c.input,
    c.excluded ? `対象外: ${c.reason}` : c.steps,
    c.excluded ? null : c.expected,
    // Its own column: the tester reads and filters it, and an empty one is a
    // hole in the handover, so it must not hide inside 期待結果.
    c.excluded ? null : c.viewpoint,
    c.evidence,
    null,
    null,
    null,
  ]);
  const byItem = new Map<string, UtCase[]>();
  for (const c of meta.cases)
    byItem.set(c.itemId, [...(byItem.get(c.itemId) ?? []), c]);
  const coverage: CellValue[][] = meta.checklist.items.map((item) => {
    const cases = byItem.get(item.id) ?? [];
    const excludedCases = cases.filter((c) => c.excluded);
    // Counts, not one label: an item with a testable branch and an untestable
    // one (a report that needs a real printer) used to read as "テスト" with
    // no reason, so the coverage sheet hid what cannot be verified.
    const reasons = [
      ...new Set(excludedCases.map((c) => c.reason).filter((r) => r !== '')),
    ];
    return [
      item.id,
      KIND_LABELS[item.kind] ?? item.kind,
      item.procedure,
      item.detail,
      `${item.file}:${item.line}`,
      cases.length,
      cases.length - excludedCases.length,
      excludedCases.length,
      reasons.length > 0 ? reasons.join('\n') : null,
    ];
  });
  const none = (width: number): CellValue[] => [
    '該当なし',
    ...Array<CellValue>(width - 1).fill(null),
  ];
  return [
    {
      name: UT_SHEET_NAMES[0],
      title: '単体テスト仕様書',
      tabColor: 'FF1F3864',
      columns: [col('項目', 22), col('内容', 90, true)],
      rows: cover,
      boldFirstColumn: true,
      filter: false,
    },
    {
      name: UT_SHEET_NAMES[1],
      tabColor: 'FF2E75B6',
      columns: [
        col('No', 6),
        col('ID', 20),
        col('大項目', 20),
        col('中項目', 22),
        col('小項目', 26, true),
        col('前提条件', 30, true),
        col('入力', 30, true),
        col('手順', 36, true),
        col('期待結果', 36, true),
        col('確認観点', 28, true),
        col('根拠(file:行)', 28),
        col('実施日', 12),
        col('結果', 10),
        col('確認者', 12),
      ],
      rows: rows.length > 0 ? rows : [none(14)],
    },
    {
      name: UT_SHEET_NAMES[2],
      tabColor: 'FF548235',
      columns: [
        col('ID', 20),
        col('種別', 16),
        col('手続き', 22),
        col('対象', 30),
        col('根拠(file:行)', 28),
        col('ケース数', 10),
        col('テスト', 10),
        col('対象外', 10),
        col('対象外理由', 36, true),
      ],
      rows: coverage.length > 0 ? coverage : [none(9)],
    },
  ];
}
