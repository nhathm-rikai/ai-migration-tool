import type { ItChecklist } from '../analysis/it-checklist.js';
import { isExcludedKind, isProgramEvidence, itemTableRows } from './ut-spec.js';

// The integration test specification (it-test-spec.md, TC02) as the agent
// writes it, and its validator: the same contract as the unit test
// specification (ut-spec.ts) with scenario columns. The agent writes the
// scenarios from the source; the Portal checks them against the
// deterministic checklist: every item has a scenario or an exclusion with a
// reason, every scenario has file:line evidence inside the program, none
// points at an item outside the checklist, and a scenario of a
// `cross-program` item names the other program.
//
// Fixed columns (positions, not labels):
//   0 No · 1 対象ID (checklist item) · 2 種別 · 3 シナリオ · 4 関連要素 ·
//   5 前提条件 · 6 手順 · 7 期待結果 · 8 根拠 (file:line) ·
//   9 区分 (テスト / 対象外) · 10 対象外理由

export const IT_SPEC_COLUMNS = 11;

export type ItScenario = {
  no: string;
  itemId: string;
  kind: string;
  scenario: string;
  related: string;
  precondition: string;
  steps: string;
  expected: string;
  evidence: string;
  excluded: boolean;
  reason: string;
  // The row has fewer cells than the table has columns.
  malformed: boolean;
};

export type ItSpecError = {
  code:
    | 'TABLE_MISSING'
    | 'ROW_MALFORMED'
    | 'UNKNOWN_ITEM'
    | 'NO_EVIDENCE'
    | 'EXCLUDED_NO_REASON'
    | 'EMPTY_FIELD'
    | 'NO_COUNTERPART'
    | 'MISSING_ITEM';
  id: string | null;
  detail: string;
};

export type ItSpecResult =
  { ok: true; scenarios: ItScenario[] } | { ok: false; errors: ItSpecError[] };

export function parseItSpec(
  markdown: string,
): { scenarios: ItScenario[] } | null {
  const rows = itemTableRows(markdown);
  if (rows === null) return null;
  return {
    scenarios: rows.map((cells) => ({
      no: cells[0] ?? '',
      itemId: cells[1] ?? '',
      kind: cells[2] ?? '',
      scenario: cells[3] ?? '',
      related: cells[4] ?? '',
      precondition: cells[5] ?? '',
      steps: cells[6] ?? '',
      expected: cells[7] ?? '',
      evidence: cells[8] ?? '',
      excluded: isExcludedKind(cells[9] ?? ''),
      reason: cells[10] ?? '',
      malformed: cells.length < IT_SPEC_COLUMNS,
    })),
  };
}

// The cell names the program as a word of its own, without case: a program
// called "C" is not named by the table "STOCK". Japanese text next to the
// name ("プログラムC") still counts, only Latin letters, digits and "_" do
// not.
function namesProgram(cell: string, program: string): boolean {
  const name = program.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'i').test(cell);
}

export function validateItSpec(
  markdown: string,
  checklist: ItChecklist,
  programFiles: ReadonlySet<string>,
): ItSpecResult {
  const parsed = parseItSpec(markdown);
  // A program with nothing to integrate (no shared module, chained table,
  // report or shared table) has an empty checklist: an empty table is then
  // the right answer, unlike a unit test checklist, which is never empty for
  // a program with code.
  if (checklist.items.length === 0 && (parsed?.scenarios.length ?? 0) === 0)
    return { ok: true, scenarios: [] };
  if (!parsed || parsed.scenarios.length === 0)
    return {
      ok: false,
      errors: [
        {
          code: 'TABLE_MISSING',
          id: null,
          detail: 'The scenario table (target ID column) was not found.',
        },
      ],
    };
  const errors: ItSpecError[] = [];
  const items = new Map(checklist.items.map((item) => [item.id, item]));
  const covered = new Set<string>();
  for (const scenario of parsed.scenarios) {
    const id = scenario.itemId;
    if (scenario.malformed) {
      errors.push({
        code: 'ROW_MALFORMED',
        id: id || null,
        detail: `Row ${scenario.no} has fewer than ${IT_SPEC_COLUMNS} columns.`,
      });
      continue;
    }
    const item = items.get(id);
    if (!item) {
      errors.push({
        code: 'UNKNOWN_ITEM',
        id,
        detail: `${id || '(empty)'} is not an item of this program's checklist.`,
      });
      continue;
    }
    if (!isProgramEvidence(scenario.evidence, programFiles))
      errors.push({
        code: 'NO_EVIDENCE',
        id,
        detail: `Evidence "${scenario.evidence}" is not a file:line of a file of this program.`,
      });
    // Which program the data is shared with is the whole point of the item:
    // a scenario that names none of them cannot be run by a tester. One is
    // enough (the item lists every program of the table). Excluded rows too:
    // the reason is about those programs.
    if (
      item.counterparts.length > 0 &&
      !item.counterparts.some((name) => namesProgram(scenario.related, name))
    )
      errors.push({
        code: 'NO_COUNTERPART',
        id,
        detail: `Related elements "${scenario.related}" name none of the other programs (${item.counterparts.join(', ')}).`,
      });
    if (scenario.excluded) {
      if (scenario.reason === '')
        errors.push({
          code: 'EXCLUDED_NO_REASON',
          id,
          detail: 'An excluded item needs a reason.',
        });
    } else if (scenario.steps === '' || scenario.expected === '')
      errors.push({
        code: 'EMPTY_FIELD',
        id,
        detail: 'A scenario needs steps and an expected result.',
      });
    covered.add(id);
  }
  for (const item of checklist.items)
    if (!covered.has(item.id))
      errors.push({
        code: 'MISSING_ITEM',
        id: item.id,
        detail: `${item.id} (${item.detail}, ${item.file}:${item.line}) has no scenario and no exclusion.`,
      });
  return errors.length === 0
    ? { ok: true, scenarios: parsed.scenarios }
    : { ok: false, errors };
}
