import { describe, expect, it } from 'vitest';
import type { ItChecklist } from '../analysis/it-checklist.js';
import { parseItSpec, validateItSpec } from './it-spec.js';

// TC02-AC02: the validator of the integration test specification.
const checklist: ItChecklist = {
  version: 'it-checklist-v2',
  program: 'A',
  items: [
    {
      id: 'IT-A-shared-module-1',
      kind: 'shared-module',
      file: 'a/F1.frm',
      line: 10,
      detail: 'A → Common.bas (WriteLog)',
      counterparts: [],
    },
    {
      id: 'IT-A-cross-program-1',
      kind: 'cross-program',
      file: 'a/F1.frm',
      line: 7,
      detail: 'STOCK: A U / B R, C R',
      counterparts: ['B', 'C'],
    },
  ],
};
const files = new Set(['a/A.vbp', 'a/F1.frm', 'cmn/Common.bas']);
const HEAD = [
  '| No | 対象ID | 種別 | シナリオ | 関連要素 | 前提条件 | 手順 | 期待結果 | 根拠 | 区分 | 対象外理由 |',
  '| -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |',
];
const SHARED =
  '| 1 | IT-A-shared-module-1 | shared-module | ログ出力 | F1, Common.bas | 前提 | 手順 | 期待 | a/F1.frm:10 | テスト |  |';
const CROSS =
  '| 2 | IT-A-cross-program-1 | cross-program | 在庫更新 | STOCK、プログラム B | 前提 | 手順 | 期待 | a/F1.frm:7 | テスト |  |';
const doc = (...rows: string[]) =>
  ['# x', '', ...HEAD, ...rows, '', '## 3'].join('\n');
const codes = (markdown: string, list = checklist) => {
  const result = validateItSpec(markdown, list, files);
  return result.ok ? [] : result.errors.map((error) => error.code);
};

describe('TC02-AC02 validator', () => {
  it('accepts one scenario per item, with evidence inside the program', () => {
    const result = validateItSpec(doc(SHARED, CROSS), checklist, files);
    expect(result).toMatchObject({ ok: true });
    expect(parseItSpec(doc(SHARED, CROSS))?.scenarios[1]).toMatchObject({
      itemId: 'IT-A-cross-program-1',
      kind: 'cross-program',
      related: 'STOCK、プログラム B',
      excluded: false,
    });
  });

  it('rejects a checklist item without a scenario', () => {
    expect(codes(doc(SHARED))).toEqual(['MISSING_ITEM']);
  });

  it('rejects a scenario for an ID outside the checklist', () => {
    expect(
      codes(doc(SHARED, CROSS, SHARED.replace('module-1', 'module-9'))),
    ).toEqual(['UNKNOWN_ITEM']);
  });

  it('rejects a scenario without evidence, or with evidence outside the program', () => {
    const withEvidence = (evidence: string) =>
      codes(doc(SHARED.replace('a/F1.frm:10', evidence), CROSS));
    expect(withEvidence('')).toEqual(['NO_EVIDENCE']);
    expect(withEvidence('b/MB.bas:3')).toEqual(['NO_EVIDENCE']);
    expect(withEvidence('a/F1.frm:0')).toEqual(['NO_EVIDENCE']);
  });

  it('reads evidence the way the unit test specification does', () => {
    expect(
      codes(
        doc(
          SHARED.replace('a/F1.frm:10', 'source/a/F1.frm：１０〜１２行'),
          CROSS,
        ),
      ),
    ).toEqual([]);
  });

  it('rejects an exclusion without a reason, and accepts one with a reason', () => {
    const excluded = (reason: string) =>
      `| 1 | IT-A-shared-module-1 | shared-module | ログ出力 | Common.bas | 前提 |  |  | a/F1.frm:10 | 対象外 | ${reason} |`;
    expect(codes(doc(excluded(''), CROSS))).toEqual(['EXCLUDED_NO_REASON']);
    expect(codes(doc(excluded('ログ基盤なし'), CROSS))).toEqual([]);
  });

  it('rejects a real scenario without steps or an expected result', () => {
    expect(codes(doc(SHARED.replace('| 手順 |', '|  |'), CROSS))).toEqual([
      'EMPTY_FIELD',
    ]);
  });

  it('rejects a cross-program scenario that does not name the other program', () => {
    const result = validateItSpec(
      doc(SHARED, CROSS.replace('STOCK、プログラム B', 'STOCK')),
      checklist,
      files,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'NO_COUNTERPART',
      id: 'IT-A-cross-program-1',
    });
    expect(result.errors[0]?.detail).toContain('"STOCK"');
    expect(result.errors[0]?.detail).toContain('B, C');
    // The name is matched without case; an exclusion has to name one too.
    expect(
      codes(doc(SHARED, CROSS.replace('プログラム B', 'program b'))),
    ).toEqual([]);
    // A name is a word of its own: "C" is not named by "STOCK" or "ABC",
    // but Japanese text may touch it.
    expect(
      codes(doc(SHARED, CROSS.replace('STOCK、プログラム B', 'STOCK, ABC'))),
    ).toEqual(['NO_COUNTERPART']);
    expect(
      codes(doc(SHARED, CROSS.replace('プログラム B', 'プログラムB'))),
    ).toEqual([]);
    // One of the programs of the table is enough.
    expect(
      codes(doc(SHARED, CROSS.replace('プログラム B', 'プログラム C'))),
    ).toEqual([]);
    expect(
      codes(
        doc(
          SHARED,
          '| 2 | IT-A-cross-program-1 | cross-program | 在庫 | STOCK | 前提 |  |  | a/F1.frm:7 | 対象外 | 環境なし |',
        ),
      ),
    ).toEqual(['NO_COUNTERPART']);
  });

  it('rejects a row with fewer than 11 cells and a document without the table', () => {
    expect(codes(doc('| 1 | IT-A-shared-module-1 | x |', CROSS))).toEqual([
      'ROW_MALFORMED',
      'MISSING_ITEM',
    ]);
    expect(codes('# x')).toEqual(['TABLE_MISSING']);
    expect(codes(doc())).toEqual(['TABLE_MISSING']);
  });

  it.each([
    ['ID hạng mục', 'Kiểm thử', 'Loại trừ'],
    ['対象ID', 'テスト', '対象外'],
    ['Target ID', 'Test', 'Excluded'],
  ])('reads the header and 区分 of the pack: %s', (header, test, excluded) => {
    const markdown = [
      `| No | ${header} | a | b | c | d | e | f | g | h | i |`,
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      `| 1 | IT-A-shared-module-1 | shared-module | s | Common.bas | p | steps | expected | a/F1.frm:10 | ${test} |  |`,
      `| 2 | IT-A-cross-program-1 | cross-program | s | STOCK, B | p |  |  | a/F1.frm:7 | ${excluded} | no environment |`,
    ].join('\n');
    expect(validateItSpec(markdown, checklist, files)).toMatchObject({
      ok: true,
    });
    expect(parseItSpec(markdown)?.scenarios.map((s) => s.excluded)).toEqual([
      false,
      true,
    ]);
  });

  // A program with nothing to integrate: an empty table is the answer.
  it('accepts an empty table, or none, when the checklist is empty', () => {
    const empty: ItChecklist = { ...checklist, items: [] };
    expect(validateItSpec(doc(), empty, files)).toEqual({
      ok: true,
      scenarios: [],
    });
    expect(validateItSpec('# x', empty, files)).toMatchObject({ ok: true });
    expect(codes(doc(SHARED), empty)).toEqual(['UNKNOWN_ITEM']);
  });
});
