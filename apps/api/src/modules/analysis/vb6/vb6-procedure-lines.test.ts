import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { decodeSourceBytes } from '../source-decoder.js';
import { splitSourceLines } from '../source-text.js';
import { analyzeVb6CodeFile } from './vb6-code-file.js';

const FIXTURE = new URL(
  '../../../../../../tests/fixtures/vb6-procedure-lines/ORDERS.BAS',
  import.meta.url,
);

// Hand-written labels for ORDERS.BAS, one letter per physical line (not
// produced by the counter): M metadata, B blank, K comment-only; code lines
// are C (declaration, signature or End only), E (executable) or S
// (executable and writes SQL text). Digits group the lines by owner: 0 file
// level, 1..3 the procedures in order.
const LABELS = [
  ['0', 'MCCBK'],
  ['1', 'CMCBKSSSSEEKEC'],
  ['0', 'B'],
  ['2', 'CCSESC'],
  ['3', 'E'],
] as const;

function expectedFor(owner: string) {
  const labels = LABELS.filter(([o]) => o === owner)
    .map(([, l]) => l)
    .join('');
  const count = (...letters: string[]) =>
    [...labels].filter((l) => letters.includes(l)).length;
  return {
    physicalLines: labels.length,
    codeLines: count('C', 'E', 'S'),
    executableLines: count('E', 'S'),
    commentOnlyLines: count('K'),
    blankLines: count('B'),
    metadataLines: count('M'),
    unclassifiedLines: 0,
    sqlLines: count('S'),
  };
}

function fixtureLines(): string[] {
  const decoded = decodeSourceBytes(readFileSync(FIXTURE), {
    profileEncoding: 'cp932',
  });
  if (!decoded.ok) throw new Error(decoded.code);
  return splitSourceLines(decoded.text).lines;
}

const result = analyzeVb6CodeFile('ORDERS.BAS', fixtureLines(), {
  module: 'standard',
});
if (result.status !== 'analyzed') throw new Error(result.status);

it('breaks each procedure down to match the hand labels exactly', () => {
  expect(
    result.procedures.map(({ name, startLine, endLine, ...lines }) => ({
      name,
      startLine,
      endLine,
      physicalLines: lines.physicalLines,
      codeLines: lines.codeLines,
      executableLines: lines.executableLines,
      commentOnlyLines: lines.commentOnlyLines,
      blankLines: lines.blankLines,
      metadataLines: lines.metadataLines,
      unclassifiedLines: lines.unclassifiedLines,
      sqlLines: lines.sqlLines,
    })),
  ).toEqual([
    { name: 'LoadOrders', startLine: 6, endLine: 19, ...expectedFor('1') },
    { name: 'Purge', startLine: 21, endLine: 26, ...expectedFor('2') },
    { name: 'Ping', startLine: 27, endLine: 27, ...expectedFor('3') },
  ]);
});

it('keeps file-level lines out of every procedure and sums to the file', () => {
  const file = expectedFor('0');
  expect(result.fileLevelCodeLines).toBe(file.codeLines);
  const sum = (key: Exclude<keyof typeof file, 'executableLines'>) =>
    file[key] + result.procedures.reduce((s, p) => s + p[key], 0);
  expect(result.counters).toEqual({
    physicalLines: sum('physicalLines'),
    designerLines: 0,
    metadataLines: sum('metadataLines'),
    blankLines: sum('blankLines'),
    commentOnlyLines: sum('commentOnlyLines'),
    codeLines: sum('codeLines'),
    unclassifiedLines: 0,
  });
});

it('counts SQL and executable lines as subsets of code lines, not classes', () => {
  for (const procedure of result.procedures) {
    expect(procedure.sqlLines).toBeLessThanOrEqual(procedure.codeLines);
    expect(procedure.executableLines).toBeLessThanOrEqual(procedure.codeLines);
    expect(
      procedure.codeLines +
        procedure.commentOnlyLines +
        procedure.blankLines +
        procedure.metadataLines +
        procedure.unclassifiedLines,
    ).toBe(procedure.physicalLines);
  }
});

it.each([
  [
    'a literal shared by two SQL texts counts once',
    ['s = "DELETE FROM T1"', 'Exec s', 's = s & " WHERE A = 1"'],
    2,
  ],
  ['a SELECT without FROM is not SQL', ['MsgBox "SELECT one"'], 0],
  ['a DELETE keyword alone is not SQL', ['MsgBox "DELETE "'], 0],
  ['SELECT FROM without a table is not SQL', ['MsgBox "SELECT FROM "'], 0],
  [
    'a FROM followed by a clause word is not SQL',
    ['MsgBox "SELECT FROM WHERE"'],
    0,
  ],
  ['a pseudo table is still SQL', ['s = "SELECT 1 FROM DUAL"'], 1],
  [
    'a constant holding SQL is SQL though not executable',
    ['Const Q = "DELETE FROM T1"'],
    1,
  ],
  [
    'a runtime table still makes the line SQL',
    ['s = "UPDATE " & t & " SET A = 1"'],
    1,
  ],
  [
    'a piece kept in another variable counts where it is written',
    ['f = " FROM T1"', 'x = 1', 's = "SELECT A" & f'],
    2,
  ],
])('%s', (_label, body, sqlLines) => {
  const analysis = analyzeVb6CodeFile(
    'M.BAS',
    ['Sub P()', ...body, 'End Sub'],
    {
      module: 'standard',
    },
  );
  expect(analysis).toMatchObject({ procedures: [{ sqlLines }] });
});

it.each([
  ['declarations only', ['Sub P()', '    Dim x As Long', 'End Sub'], 0],
  [
    'Static/Const/ReDim',
    [
      'Sub P()',
      '    Static n As Long',
      '    Const K = 1',
      '    ReDim a(9)',
      'End Sub',
    ],
    1,
  ],
  [
    'a declaration and a statement on one line',
    ['Sub P()', '    Dim t As Long: t = 1', 'End Sub'],
    1,
  ],
  [
    'a signature and End continued over lines, a label, a directive',
    [
      'Function F(a, _',
      '    b) As Long',
      'Retry:',
      '#If DEBUG Then',
      '    F = a',
      '#End If',
      'End Function',
    ],
    1,
  ],
  [
    'an executable statement continued over lines',
    ['Sub P()', '    x = 1 + _', '        2', 'End Sub'],
    2,
  ],
  ['a one-line procedure with a statement', ['Sub P(): Beep: End Sub'], 1],
])('counts executable lines: %s', (_label, lines, executableLines) => {
  expect(
    analyzeVb6CodeFile('M.BAS', lines, { module: 'standard' }),
  ).toMatchObject({ procedures: [{ executableLines }] });
});
