import type { ItChecklist } from '../analysis/it-checklist.js';
import type {
  CellValue,
  Sheet,
  SheetColumn,
} from '../inventory-report/xlsx-writer.js';
import type { ItScenario } from './it-spec.js';

// The integration test specification as the Japanese Excel (結合テスト仕様書):
// a cover sheet, the scenarios (12 columns, the last three for the tester)
// and a coverage sheet (checklist item × scenarios, with the テスト/対象外
// counts). Same writer and style as the unit test specification
// (ut-spec-workbook.ts); text that looks like a formula stays text.

export type ItSpecMeta = {
  // Project path of the program.
  program: string;
  runId: string;
  sha256: string;
  specPack: string;
  createdAt: string;
  model: string;
  runner: string;
  review: 'approved' | 'pending';
  scenarios: readonly ItScenario[];
  checklist: ItChecklist;
};

const col = (header: string, width: number, wrap = false): SheetColumn => ({
  header,
  width,
  ...(wrap ? { wrap } : {}),
});

const KIND_LABELS: Record<string, string> = {
  'shared-module': '共通モジュール連携',
  'db-chain': 'DB連携',
  report: '帳票',
  'cross-program': 'プログラム間連携',
};

export const IT_SHEET_NAMES = ['表紙', 'テストシナリオ', 'カバレッジ'] as const;

export function itSpecSheets(meta: ItSpecMeta): Sheet[] {
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
  const kinds = new Map(meta.checklist.items.map((item) => [item.id, item]));
  const rows: CellValue[][] = meta.scenarios.map((s): CellValue[] => {
    // The kind of the checklist item, not the cell the agent wrote.
    const kind = kinds.get(s.itemId)?.kind ?? s.kind;
    return [
      s.no,
      s.itemId,
      KIND_LABELS[kind] ?? kind,
      s.scenario,
      s.related,
      s.precondition,
      s.excluded ? `対象外: ${s.reason}` : s.steps,
      s.excluded ? null : s.expected,
      s.evidence,
      null,
      null,
      null,
    ];
  });
  const byItem = new Map<string, ItScenario[]>();
  for (const s of meta.scenarios)
    byItem.set(s.itemId, [...(byItem.get(s.itemId) ?? []), s]);
  const coverage: CellValue[][] = meta.checklist.items.map((item) => {
    const scenarios = byItem.get(item.id) ?? [];
    const excluded = scenarios.filter((s) => s.excluded);
    const reasons = [
      ...new Set(excluded.map((s) => s.reason).filter((r) => r !== '')),
    ];
    return [
      item.id,
      KIND_LABELS[item.kind] ?? item.kind,
      item.detail,
      `${item.file}:${item.line}`,
      scenarios.length,
      scenarios.length - excluded.length,
      excluded.length,
      reasons.length > 0 ? reasons.join('\n') : null,
    ];
  });
  const none = (width: number): CellValue[] => [
    '該当なし',
    ...Array<CellValue>(width - 1).fill(null),
  ];
  return [
    {
      name: IT_SHEET_NAMES[0],
      title: '結合テスト仕様書',
      tabColor: 'FF1F3864',
      columns: [col('項目', 22), col('内容', 90, true)],
      rows: cover,
      boldFirstColumn: true,
      filter: false,
    },
    {
      name: IT_SHEET_NAMES[1],
      tabColor: 'FF2E75B6',
      columns: [
        col('No', 6),
        col('ID', 24),
        col('種別', 20),
        col('シナリオ', 36, true),
        col('関連要素', 30, true),
        col('前提条件', 30, true),
        col('手順', 40, true),
        col('期待結果', 40, true),
        col('根拠(file:行)', 28),
        col('実施日', 12),
        col('結果', 10),
        col('確認者', 12),
      ],
      rows: rows.length > 0 ? rows : [none(12)],
    },
    {
      name: IT_SHEET_NAMES[2],
      tabColor: 'FF548235',
      columns: [
        col('ID', 24),
        col('種別', 20),
        col('対象', 40, true),
        col('根拠(file:行)', 28),
        col('シナリオ数', 12),
        col('テスト', 10),
        col('対象外', 10),
        col('対象外理由', 36, true),
      ],
      rows: coverage.length > 0 ? coverage : [none(8)],
    },
  ];
}
