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

// Shared with the integration test specification (it-spec.ts), which has the
// same contract with other columns: the data rows of the first table whose
// second header cell is the item ID column, null when there is none.
export function itemTableRows(markdown: string): string[][] | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const cells = cellsOf(line);
    return cells !== null && ID_HEADERS.has((cells[1] ?? '').toLowerCase());
  });
  if (start < 0) return null;
  const rows: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    const cells = cellsOf(line);
    if (cells === null) break;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows;
}

// The 区分 cell marks an exclusion, in the languages of the pack.
export const isExcludedKind = (cell: string) =>
  EXCLUDED.some((word) => cell.toLowerCase().startsWith(word));

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

const EVIDENCE = /^(.+?):(\d+)(?:\s*-\s*\d+)?$/;

// Agents write the location with Japanese punctuation, a suffix or a note
// that says nothing about where the code is ("M.bas：１２０", "M.bas:120行",
// "M.bas:120〜134", "M.bas:120 (Calc)", or two references in one cell). Those
// are normalized away before matching, so a run is not lost over the shape of
// the string; what must still hold is checked at the call site - a file of
// this program and a real line.
export function normalizeEvidence(raw: string): string {
  // Only the first reference when the cell holds several.
  const [first = ''] = raw.replaceAll('\\', '/').split(/[,;、]/);
  return (
    first
      .replace(/[０-９]/g, (digit) =>
        String.fromCharCode(digit.charCodeAt(0) - 0xfee0),
      )
      .replaceAll('：', ':')
      .replace(/[〜～–—]/g, '-')
      // "M.bas (120)": the line in parentheses instead of after a colon. Only
      // when the parentheses hold the number itself, so the note stripped
      // below ("M.bas:120 (Calc)") still reaches that rule.
      .replace(/^(.*?)\s*[(（](\d+(?:\s*-\s*\d+)?)[)）]\s*$/, '$1:$2')
      // A note appended to the location: "(Calc)", "行", "行目", "line".
      .replace(/\s*[(（][^)）]*[)）]\s*$/, '')
      .replace(/\s*(?:行目|行|lines?)\s*$/i, '')
      // "M.bas:L120", "M.bas: line 120".
      .replace(/:\s*(?:lines?|L)\s*(?=\d)/i, ':')
      .trim()
  );
}

// The file of this program the evidence points at, or null. The source is
// Windows VB6, so the comparison ignores case; a bare file name is accepted
// when exactly one file of the program carries that name, because agents
// often drop the directory.
function evidenceFileOf(
  path: string,
  programFiles: ReadonlySet<string>,
): string | null {
  // The agent sees the program under source/: accept that prefix.
  const wanted = path
    .trim()
    .replace(/^source\//, '')
    .toLowerCase();
  if (wanted === '') return null;
  const exact = [...programFiles].find((file) => file.toLowerCase() === wanted);
  if (exact !== undefined) return exact;
  const name = wanted.split('/').pop() ?? wanted;
  const named = [...programFiles].filter(
    (file) => (file.toLowerCase().split('/').pop() ?? '') === name,
  );
  return named.length === 1 ? (named[0] as string) : null;
}

// True when the cell is a file:line of a file of the program, line >= 1.
export function isProgramEvidence(
  raw: string,
  programFiles: ReadonlySet<string>,
): boolean {
  const match = EVIDENCE.exec(normalizeEvidence(raw));
  return (
    match?.[1] !== undefined &&
    evidenceFileOf(match[1], programFiles) !== null &&
    Number(match[2]) >= 1
  );
}

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
    const match = EVIDENCE.exec(normalizeEvidence(testCase.evidence));
    const evidenceFile =
      match?.[1] === undefined ? null : evidenceFileOf(match[1], programFiles);
    if (!match || evidenceFile === null || Number(match[2]) < 1)
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
