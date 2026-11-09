import type { UtChecklist } from '../analysis/ut-checklist.js';

// The unit test specification (ut-test-spec.md, TC01) as the agent writes it,
// and its validator. The agent enumerates branch-level cases itself from the
// source; the Portal only checks them against the deterministic checklist:
// every checklist item has at least one case or an exclusion with a reason,
// every case has file:line evidence inside the program, and no case points at
// an item outside the program.
//
// The case table has fixed columns (positions, not labels, so the document
// language may change the header text):
//   0 No · 1 対象ID (checklist item) · 2 大項目 · 3 中項目 · 4 小項目 ·
//   5 前提条件 · 6 入力データ · 7 手順 · 8 期待結果 · 9 確認観点 ·
//   10 根拠 (file:line) · 11 区分 (テスト / 対象外) · 12 対象外理由

export const UT_SPEC_COLUMNS = 13;

export type UtCase = {
  no: string;
  itemId: string;
  major: string;
  middle: string;
  minor: string;
  precondition: string;
  input: string;
  steps: string;
  expected: string;
  viewpoint: string;
  evidence: string;
  excluded: boolean;
  reason: string;
};

export type UtSpecError = {
  code:
    | 'TABLE_MISSING'
    | 'ROW_MALFORMED'
    | 'UNKNOWN_ITEM'
    | 'NO_EVIDENCE'
    | 'EXCLUDED_NO_REASON'
    | 'EMPTY_FIELD'
    | 'MISSING_ITEM';
  id: string | null;
  detail: string;
};

export type UtSpecResult =
  { ok: true; cases: UtCase[] } | { ok: false; errors: UtSpecError[] };

// Header labels of the "item ID" column in the languages of the pack.
const ID_HEADERS = new Set([
  '対象id',
  'target id',
  'id mục tiêu',
  'id hạng mục',
]);
const EXCLUDED = ['対象外', 'excluded', 'loại trừ', 'ngoài phạm vi'];
const ESCAPED_BAR = '\u0001';

const clean = (cell: string | undefined) =>
  (cell ?? '').replaceAll(ESCAPED_BAR, '|').replace(/[`*]/g, '').trim();

function cellsOf(line: string): string[] | null {
  const text = line.trim();
  if (!text.startsWith('|')) return null;
  const inner = text
    .replaceAll('\\|', ESCAPED_BAR)
    .replace(/^\|/, '')
    .replace(/\|$/, '');
  return inner.split('|').map((cell) => clean(cell));
}

// The case rows of the first table whose second header cell is the item ID
// column; null when there is none.
export function parseUtSpec(markdown: string): { cases: UtCase[] } | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const cells = cellsOf(line);
    return cells !== null && ID_HEADERS.has((cells[1] ?? '').toLowerCase());
  });
  if (start < 0) return null;
  const cases: UtCase[] = [];
  for (const line of lines.slice(start + 1)) {
    const cells = cellsOf(line);
    if (cells === null) break;
    // The separator row (| --- | --- |).
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const kind = (cells[11] ?? '').toLowerCase();
    cases.push({
      no: cells[0] ?? '',
      itemId: cells[1] ?? '',
      major: cells[2] ?? '',
      middle: cells[3] ?? '',
      minor: cells[4] ?? '',
      precondition: cells[5] ?? '',
      input: cells[6] ?? '',
      steps: cells[7] ?? '',
      expected: cells[8] ?? '',
      viewpoint: cells[9] ?? '',
      evidence: cells[10] ?? '',
      excluded: EXCLUDED.some((word) => kind.startsWith(word)),
      reason: cells[12] ?? '',
    });
    if (cells.length < UT_SPEC_COLUMNS)
      cases[cases.length - 1] = {
        ...(cases[cases.length - 1] as UtCase),
        // Marked below as malformed.
        no: `${cells[0] ?? ''}\u0000malformed`,
      };
  }
  return { cases };
}

const EVIDENCE = /^(.+?):(\d+)(?:\s*[-–]\s*\d+)?$/;

export function validateUtSpec(
  markdown: string,
  checklist: UtChecklist,
  programFiles: ReadonlySet<string>,
): UtSpecResult {
  const parsed = parseUtSpec(markdown);
  if (!parsed || parsed.cases.length === 0)
    return {
      ok: false,
      errors: [
        {
          code: 'TABLE_MISSING',
          id: null,
          detail: 'The test case table (target ID column) was not found.',
        },
      ],
    };
  const errors: UtSpecError[] = [];
  const known = new Set(checklist.items.map((item) => item.id));
  const covered = new Set<string>();
  for (const testCase of parsed.cases) {
    const id = testCase.itemId;
    if (testCase.no.endsWith('malformed')) {
      errors.push({
        code: 'ROW_MALFORMED',
        id: id || null,
        detail: `Row ${testCase.no.split('\u0000')[0]} has fewer than ${UT_SPEC_COLUMNS} columns.`,
      });
      continue;
    }
    if (!known.has(id)) {
      errors.push({
        code: 'UNKNOWN_ITEM',
        id,
        detail: `${id || '(empty)'} is not an item of this program's checklist.`,
      });
      continue;
    }
    const match = EVIDENCE.exec(testCase.evidence.replaceAll('\\', '/'));
    // The agent sees the program under source/: accept that prefix.
    const evidenceFile = match?.[1]?.trim().replace(/^source\//, '');
    if (
      !match ||
      evidenceFile === undefined ||
      !programFiles.has(evidenceFile) ||
      Number(match[2]) < 1
    )
      errors.push({
        code: 'NO_EVIDENCE',
        id,
        detail: `Evidence "${testCase.evidence}" is not a file:line of a file of this program.`,
      });
    if (testCase.excluded) {
      if (testCase.reason === '')
        errors.push({
          code: 'EXCLUDED_NO_REASON',
          id,
          detail: 'An excluded item needs a reason.',
        });
    } else if (testCase.steps === '' || testCase.expected === '')
      errors.push({
        code: 'EMPTY_FIELD',
        id,
        detail: 'A test case needs steps and an expected result.',
      });
    covered.add(id);
  }
  for (const item of checklist.items)
    if (!covered.has(item.id))
      errors.push({
        code: 'MISSING_ITEM',
        id: item.id,
        detail: `${item.id} (${item.detail}, ${item.file}:${item.line}) has no case and no exclusion.`,
      });
  return errors.length === 0
    ? { ok: true, cases: parsed.cases }
    : { ok: false, errors };
}
