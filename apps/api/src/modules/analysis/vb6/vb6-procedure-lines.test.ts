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
// produced by the counter): M metadata, B blank, K comment-only, C code,
// S code that writes SQL text. Digits group the lines by owner: 0 file
// level, 1..3 the procedures in order.
const LABELS = [
  ['0', 'MCCBK'],
  ['1', 'CMCBKSSSSCCKCC'],
  ['0', 'B'],
  ['2', 'CCSCSC'],
  ['3', 'C'],
] as const;

function expectedFor(owner: string) {
  const labels = LABELS.filter(([o]) => o === owner)
    .map(([, l]) => l)
    .join('');
  const count = (...letters: string[]) =>
    [...labels].filter((l) => letters.includes(l)).length;
  return {
    physicalLines: labels.length,
    codeLines: count('C', 'S'),
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
  const sum = (key: keyof typeof file) =>
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

it('counts SQL lines as a subset of code lines, never as a class of its own', () => {
  for (const procedure of result.procedures) {
    expect(procedure.sqlLines).toBeLessThanOrEqual(procedure.codeLines);
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
