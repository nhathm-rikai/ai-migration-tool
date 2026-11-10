import { describe, expect, it } from 'vitest';
import type { UtChecklist } from '../analysis/ut-checklist.js';
import { parseUtSpec, validateUtSpec } from './ut-spec.js';

// TC01-AC02: the validator of the agent's unit test specification.
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
      id: 'UT-A-Save-1',
      kind: 'procedure',
      procedure: 'Save',
      file: 'a/M.bas',
      line: 20,
      detail: 'sub Save',
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
const files = new Set(['a/M.bas', 'a/F1.frm']);

const HEAD =
  '| No | 対象ID | 大項目 | 中項目 | 小項目 | 前提条件 | 入力データ | 手順 | 期待結果 | 確認観点 | 根拠 | 区分 | 対象外理由 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
const row = (
  no: number,
  id: string,
  evidence = 'a/M.bas:5',
  kind = 'テスト',
  reason = '',
  steps = 'Calc を呼ぶ',
  expected = '戻り値が 1',
) =>
  `| ${no} | ${id} | 計算 | 分岐 | 正常 | 前提 | 入力 | ${steps} | ${expected} | 確認 | ${evidence} | ${kind} | ${reason} |`;
const doc = (...rows: string[]) =>
  `# 単体テスト仕様書\n\n| 生成状態 | 完了 |\n| --- | --- |\n\n## テストケース\n\n${HEAD}\n${rows.join('\n')}\n\n## 未確定事項\n\nなし\n`;

const ok = doc(
  row(1, 'UT-A-Calc-1'),
  row(2, 'UT-A-Calc-1', 'a/M.bas:7'),
  row(3, 'UT-A-Save-1', 'a/M.bas:22'),
  row(4, 'UT-A-Save-2', 'a/M.bas:21', '対象外', 'テスト用DBが無いため'),
);

describe('TC01-AC02 validator', () => {
  it('accepts a document where every item has a case or an exclusion with a reason', () => {
    const result = validateUtSpec(ok, checklist, files);
    expect(result).toMatchObject({ ok: true });
    expect(parseUtSpec(ok)?.cases).toHaveLength(4);
  });

  it('rejects a missing checklist item with its ID', () => {
    const result = validateUtSpec(
      doc(row(1, 'UT-A-Calc-1'), row(2, 'UT-A-Save-1')),
      checklist,
      files,
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_ITEM', id: 'UT-A-Save-2' }),
    );
  });

  it('rejects a case that refers to an item outside the program checklist', () => {
    const result = validateUtSpec(
      doc(
        row(1, 'UT-A-Calc-1'),
        row(2, 'UT-A-Save-1'),
        row(3, 'UT-A-Save-2'),
        row(4, 'UT-A-Other-1'),
      ),
      checklist,
      files,
    );
    expect(result.ok ? [] : result.errors).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_ITEM', id: 'UT-A-Other-1' }),
    );
  });

  it.each([
    ['empty', ''],
    ['no line number', 'a/M.bas'],
    ['a file outside the program', 'b/Other.bas:3'],
  ])('rejects a case with evidence that is %s', (_name, evidence) => {
    const result = validateUtSpec(
      doc(
        row(1, 'UT-A-Calc-1', evidence),
        row(2, 'UT-A-Save-1'),
        row(3, 'UT-A-Save-2'),
      ),
      checklist,
      files,
    );
    expect(result.ok ? [] : result.errors).toContainEqual(
      expect.objectContaining({ code: 'NO_EVIDENCE', id: 'UT-A-Calc-1' }),
    );
  });

  it('rejects an exclusion without a reason', () => {
    const result = validateUtSpec(
      doc(
        row(1, 'UT-A-Calc-1'),
        row(2, 'UT-A-Save-1'),
        row(3, 'UT-A-Save-2', 'a/M.bas:21', '対象外', ''),
      ),
      checklist,
      files,
    );
    expect(result.ok ? [] : result.errors).toContainEqual(
      expect.objectContaining({
        code: 'EXCLUDED_NO_REASON',
        id: 'UT-A-Save-2',
      }),
    );
  });

  it('rejects a test case without steps or expected result', () => {
    const result = validateUtSpec(
      doc(
        row(1, 'UT-A-Calc-1', 'a/M.bas:5', 'テスト', '', '', ''),
        row(2, 'UT-A-Save-1'),
        row(3, 'UT-A-Save-2'),
      ),
      checklist,
      files,
    );
    expect(result.ok ? [] : result.errors).toContainEqual(
      expect.objectContaining({ code: 'EMPTY_FIELD', id: 'UT-A-Calc-1' }),
    );
  });

  it('rejects a document without the case table', () => {
    const result = validateUtSpec('# x\n\nnothing\n', checklist, files);
    expect(result.ok ? [] : result.errors).toContainEqual(
      expect.objectContaining({ code: 'TABLE_MISSING' }),
    );
  });

  it('reads the same table with Vietnamese or English labels', () => {
    const vi = ok
      .replace('対象ID', 'ID mục tiêu')
      .replace('対象外', 'Loại trừ')
      .replace('対象外', 'Loại trừ');
    expect(validateUtSpec(vi, checklist, files)).toMatchObject({ ok: true });
  });

  it.each([
    ['ID hạng mục', 'Loại trừ'],
    ['ID mục tiêu', 'Ngoài phạm vi'],
    ['Target ID', 'Excluded'],
  ])(
    'reads the table and the exclusion written as "%s" / "%s"',
    (idHeader, excluded) => {
      const document = ok
        .replaceAll('対象ID', idHeader)
        .replaceAll('対象外', excluded);
      expect(validateUtSpec(document, checklist, files)).toMatchObject({
        ok: true,
      });
    },
  );

  it('rejects the table when the ID header is translated to something else', () => {
    const document = ok.replace('対象ID', 'ID đối tượng');
    expect(validateUtSpec(document, checklist, files)).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'TABLE_MISSING' })],
    });
  });

  // A failed run is a lost run: the document is not kept and the agent's
  // quota is spent. So the location is accepted in the shapes agents really
  // write, as long as it still names a file of this program and a real line.
  it.each([
    ['the full path', 'a/M.bas:5'],
    ['the source/ prefix the agent sees', 'source/a/M.bas:5'],
    ['a line range', 'a/M.bas:5-9'],
    ['a line range with a wave dash', 'a/M.bas:5〜9'],
    ['only the file name', 'M.bas:5'],
    ['a full-width colon', 'a/M.bas：5'],
    ['full-width digits', 'a/M.bas:５'],
    ['a 行 suffix', 'a/M.bas:5行'],
    ['a 行目 suffix', 'a/M.bas:5行目'],
    ['an L before the line', 'a/M.bas:L5'],
    ['a trailing note', 'a/M.bas:5 (Calc)'],
    ['the line in parentheses', 'a/M.bas (5)'],
    ['a line range in parentheses', 'a/M.bas (5-9)'],
    ['a second reference in the cell', 'a/M.bas:5, a/M.bas:7'],
    ['a Windows separator', 'a\\M.bas:5'],
    ['a different case', 'A/m.BAS:5'],
  ])('accepts evidence written with %s', (_name, evidence) => {
    const result = validateUtSpec(
      doc(
        row(1, 'UT-A-Calc-1', evidence),
        row(2, 'UT-A-Save-1'),
        row(3, 'UT-A-Save-2'),
      ),
      checklist,
      files,
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('still rejects a bare file name shared by several files of the program', () => {
    const result = validateUtSpec(
      doc(
        row(1, 'UT-A-Calc-1', 'M.bas:5'),
        row(2, 'UT-A-Save-1'),
        row(3, 'UT-A-Save-2'),
      ),
      checklist,
      new Set(['a/M.bas', 'b/M.bas']),
    );
    expect(result.ok ? [] : result.errors).toContainEqual(
      expect.objectContaining({ code: 'NO_EVIDENCE', id: 'UT-A-Calc-1' }),
    );
  });

  it('names the offending string in the error detail', () => {
    const result = validateUtSpec(
      doc(
        row(1, 'UT-A-Calc-1', 'b/Other.bas:3'),
        row(2, 'UT-A-Save-1'),
        row(3, 'UT-A-Save-2'),
      ),
      checklist,
      files,
    );
    const details = (result.ok ? [] : result.errors)
      .filter((error) => error.code === 'NO_EVIDENCE')
      .map((error) => error.detail);
    expect(details).toHaveLength(1);
    expect(details[0]).toContain('b/Other.bas:3');
  });
});
