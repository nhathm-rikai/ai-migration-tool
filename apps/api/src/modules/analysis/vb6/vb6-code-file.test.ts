import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LineCounters } from '../language-analyzer.js';
import { decodeSourceBytes } from '../source-decoder.js';
import { splitSourceLines } from '../source-text.js';
import { analyzeVb6CodeFile } from './vb6-code-file.js';

const FIXTURE = new URL(
  '../../../../../../tests/fixtures/vb6-sample/',
  import.meta.url,
);

function fixtureLines(path: string): string[] {
  const decoded = decodeSourceBytes(readFileSync(new URL(path, FIXTURE)), {
    profileEncoding: 'cp932',
  });
  if (!decoded.ok) throw new Error(decoded.code);
  return splitSourceLines(decoded.text).lines;
}

// Hand-written labels, one letter per physical line (not produced by the
// counter): D designer, M metadata, B blank, K comment-only, C code.
function countersFromLabels(labels: string): LineCounters {
  const count = (letter: string) =>
    [...labels].filter((l) => l === letter).length;
  return {
    physicalLines: labels.length,
    designerLines: count('D'),
    metadataLines: count('M'),
    blankLines: count('B'),
    commentOnlyLines: count('K'),
    codeLines: count('C'),
    unclassifiedLines: 0,
  };
}

describe('fixture SAMPLE.BAS (CP932, CRLF)', () => {
  const result = analyzeVb6CodeFile(
    'programs/SAMPLE/SAMPLE.BAS',
    fixtureLines('programs/SAMPLE/SAMPLE.BAS'),
    { form: false },
  );

  it('matches the hand labels exactly', () => {
    expect(result).toMatchObject({
      status: 'analyzed',
      counters: countersFromLabels('MCKBCCCCCKCBCCCKKCCCBCMCKKCCCBCCCCCC'),
      fileLevelCodeLines: 7,
    });
  });

  it('splits Sub/Function/Property Get/Let with distinct IDs', () => {
    expect(result.status === 'analyzed' && result.procedures).toEqual([
      {
        id: 'programs/SAMPLE/SAMPLE.BAS#function:CalcTotal',
        kind: 'function',
        name: 'CalcTotal',
        startLine: 13,
        endLine: 20,
        codeLines: 6,
      },
      {
        id: 'programs/SAMPLE/SAMPLE.BAS#sub:ShowMessage',
        kind: 'sub',
        name: 'ShowMessage',
        startLine: 22,
        endLine: 29,
        codeLines: 5,
      },
      {
        id: 'programs/SAMPLE/SAMPLE.BAS#property-get:Count',
        kind: 'property-get',
        name: 'Count',
        startLine: 31,
        endLine: 33,
        codeLines: 3,
      },
      {
        id: 'programs/SAMPLE/SAMPLE.BAS#property-let:Count',
        kind: 'property-let',
        name: 'Count',
        startLine: 34,
        endLine: 36,
        codeLines: 3,
      },
    ]);
  });
});

describe('fixture SAMPLEFORM.FRM (designer, no final newline)', () => {
  it('excludes the designer and keeps line numbers of the whole file', () => {
    const result = analyzeVb6CodeFile(
      'programs/SAMPLE/SAMPLEFORM.FRM',
      fixtureLines('programs/SAMPLE/SAMPLEFORM.FRM'),
      { form: true },
    );
    expect(result).toMatchObject({
      status: 'analyzed',
      counters: countersFromLabels('DDDDDDDDDDDDDMMMCBCCCCKCC'),
      fileLevelCodeLines: 1,
      procedures: [
        { name: 'cmdOk_Click', startLine: 19, endLine: 25, codeLines: 6 },
      ],
    });
  });
});

describe('structure errors are unsupported, never zero LoC', () => {
  it.each([
    [['Begin VB.Form f', 'End', 'Attribute VB_Name = "f"'], 'no VERSION'],
    [
      ['VERSION 5.00', 'Begin VB.Form f', 'Attribute VB_Name = "f"'],
      'unbalanced',
    ],
    [
      ['VERSION 5.00', 'Begin VB.Form f', 'End', 'Option Explicit'],
      'no VB_Name',
    ],
  ])('form %j (%s)', (lines) => {
    expect(analyzeVb6CodeFile('F.FRM', lines, { form: true })).toEqual({
      status: 'unsupported',
      reason: 'FORM_DESIGNER_BOUNDARY_NOT_FOUND',
      line: null,
    });
  });

  it.each([
    [['Sub A()', 'x = 1'], 'PROCEDURE_NOT_CLOSED', 1],
    [['Sub A()', 'Sub B()', 'End Sub'], 'PROCEDURE_NOT_CLOSED', 2],
    [['Sub A()', 'End Function'], 'PROCEDURE_END_UNMATCHED', 2],
    [['x = 1', 'End Sub'], 'PROCEDURE_END_UNMATCHED', 2],
  ])('module %j', (lines, reason, line) => {
    expect(analyzeVb6CodeFile('M.BAS', lines, { form: false })).toEqual({
      status: 'unsupported',
      reason,
      line,
    });
  });

  it('counts a keyword statement before a comment as code', () => {
    expect(
      analyzeVb6CodeFile('M.BAS', ['Sub A()', "    Stop: ' pause", 'End Sub'], {
        form: false,
      }),
    ).toMatchObject({
      counters: { codeLines: 3, commentOnlyLines: 0 },
      procedures: [{ codeLines: 3 }],
    });
  });

  it.each([
    ['Sub A()', 'End Sub', 'sub'],
    ['Function A()', 'End Function', 'function'],
    ['Property Get A()', 'End Property', 'property-get'],
  ])('closes %s on a line ending with ": %s"', (signature, end, kind) => {
    expect(
      analyzeVb6CodeFile('M.BAS', [signature, `    x = 1: ${end}`, 'y = 2'], {
        form: false,
      }),
    ).toMatchObject({
      status: 'analyzed',
      counters: { codeLines: 3 },
      procedures: [{ kind, startLine: 1, endLine: 2, codeLines: 2 }],
      fileLevelCodeLines: 1,
    });
  });

  it('counts a one-line procedure once', () => {
    expect(
      analyzeVb6CodeFile('M.BAS', ['Private Sub A(): End Sub'], {
        form: false,
      }),
    ).toMatchObject({
      counters: { codeLines: 1 },
      procedures: [{ startLine: 1, endLine: 1, codeLines: 1 }],
      fileLevelCodeLines: 0,
    });
  });

  it('reports unclassified lines separately instead of counting them as code', () => {
    const result = analyzeVb6CodeFile(
      'M.BAS',
      ['Sub A()', 's = "open', 'End Sub'],
      { form: false },
    );
    expect(result).toMatchObject({
      counters: { codeLines: 2, unclassifiedLines: 1, physicalLines: 3 },
      procedures: [{ codeLines: 2 }],
    });
  });

  it('treats Declare and End-statement lines as file-level code', () => {
    expect(
      analyzeVb6CodeFile(
        'M.BAS',
        ['Public Declare Sub Sleep Lib "kernel32" (ByVal ms As Long)', 'End'],
        { form: false },
      ),
    ).toMatchObject({ procedures: [], fileLevelCodeLines: 2 });
  });
});
