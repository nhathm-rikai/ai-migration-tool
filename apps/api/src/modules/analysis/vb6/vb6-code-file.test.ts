import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LineCounters } from '../language-analyzer.js';
import { decodeSourceBytes } from '../source-decoder.js';
import { splitSourceLines } from '../source-text.js';
import { analyzeVb6CodeFile, findVb6References } from './vb6-code-file.js';

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
    { module: 'standard' },
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
        visibility: 'global',
        startLine: 13,
        endLine: 20,
        codeLines: 6,
        physicalLines: 8,
        commentOnlyLines: 2,
        blankLines: 0,
        metadataLines: 0,
        unclassifiedLines: 0,
        sqlLines: 0,
        decisionPoints: 1,
      },
      {
        id: 'programs/SAMPLE/SAMPLE.BAS#sub:ShowMessage',
        kind: 'sub',
        name: 'ShowMessage',
        visibility: 'private',
        startLine: 22,
        endLine: 29,
        codeLines: 5,
        physicalLines: 8,
        commentOnlyLines: 2,
        blankLines: 0,
        metadataLines: 1,
        unclassifiedLines: 0,
        sqlLines: 0,
        decisionPoints: 0,
      },
      {
        id: 'programs/SAMPLE/SAMPLE.BAS#property-get:Count',
        kind: 'property-get',
        name: 'Count',
        visibility: 'global',
        startLine: 31,
        endLine: 33,
        codeLines: 3,
        physicalLines: 3,
        commentOnlyLines: 0,
        blankLines: 0,
        metadataLines: 0,
        unclassifiedLines: 0,
        sqlLines: 0,
        decisionPoints: 0,
      },
      {
        id: 'programs/SAMPLE/SAMPLE.BAS#property-let:Count',
        kind: 'property-let',
        name: 'Count',
        visibility: 'global',
        startLine: 34,
        endLine: 36,
        codeLines: 3,
        physicalLines: 3,
        commentOnlyLines: 0,
        blankLines: 0,
        metadataLines: 0,
        unclassifiedLines: 0,
        sqlLines: 0,
        decisionPoints: 0,
      },
    ]);
  });
});

describe('fixture SAMPLEFORM.FRM (designer, no final newline)', () => {
  it('excludes the designer and keeps line numbers of the whole file', () => {
    const result = analyzeVb6CodeFile(
      'programs/SAMPLE/SAMPLEFORM.FRM',
      fixtureLines('programs/SAMPLE/SAMPLEFORM.FRM'),
      { module: 'form' },
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

describe('fixture LEGACY.CLS (class header, CP932)', () => {
  const lines = fixtureLines('programs/SAMPLE/LEGACY.CLS');
  const result = analyzeVb6CodeFile('programs/SAMPLE/LEGACY.CLS', lines, {
    module: 'class',
  });

  it('excludes the class header and matches the hand labels exactly', () => {
    expect(result).toMatchObject({
      status: 'analyzed',
      counters: countersFromLabels('DDDDDDDDMMMMMCKCCCBCCCBCCCCCCCCCC'),
      fileLevelCodeLines: 4,
    });
  });

  it('keeps class members reachable only through the object', () => {
    expect(result.status === 'analyzed' && result.procedures).toEqual([
      {
        id: 'programs/SAMPLE/LEGACY.CLS#sub:Class_Initialize',
        kind: 'sub',
        name: 'Class_Initialize',
        visibility: 'private',
        startLine: 20,
        endLine: 22,
        codeLines: 3,
        physicalLines: 3,
        commentOnlyLines: 0,
        blankLines: 0,
        metadataLines: 0,
        unclassifiedLines: 0,
        sqlLines: 0,
        decisionPoints: 0,
      },
      {
        id: 'programs/SAMPLE/LEGACY.CLS#property-get:Name',
        kind: 'property-get',
        name: 'Name',
        visibility: 'public',
        startLine: 24,
        endLine: 26,
        codeLines: 3,
        physicalLines: 3,
        commentOnlyLines: 0,
        blankLines: 0,
        metadataLines: 0,
        unclassifiedLines: 0,
        sqlLines: 0,
        decisionPoints: 0,
      },
      {
        id: 'programs/SAMPLE/LEGACY.CLS#property-let:Name',
        kind: 'property-let',
        name: 'Name',
        visibility: 'public',
        startLine: 27,
        endLine: 30,
        codeLines: 4,
        physicalLines: 4,
        commentOnlyLines: 0,
        blankLines: 0,
        metadataLines: 0,
        unclassifiedLines: 0,
        sqlLines: 0,
        decisionPoints: 1,
      },
      {
        id: 'programs/SAMPLE/LEGACY.CLS#function:Load',
        kind: 'function',
        name: 'Load',
        visibility: 'public',
        startLine: 31,
        endLine: 33,
        codeLines: 3,
        physicalLines: 3,
        commentOnlyLines: 0,
        blankLines: 0,
        metadataLines: 0,
        unclassifiedLines: 0,
        sqlLines: 0,
        decisionPoints: 0,
      },
    ]);
    expect(result.status === 'analyzed' && result.externalDeclarations).toEqual(
      [
        {
          name: 'GetTickCount',
          library: 'kernel32',
          visibility: 'private',
          line: 17,
        },
      ],
    );
  });

  it('finds uses inside class members', () => {
    expect(
      findVb6References('programs/SAMPLE/LEGACY.CLS', lines, {
        module: 'class',
        names: new Set(['gettickcount']),
      }).map((r) => [r.name, r.line, r.procedureId]),
    ).toEqual([
      ['GetTickCount', 32, 'programs/SAMPLE/LEGACY.CLS#function:Load'],
    ]);
  });
});

describe('structure errors are unsupported, never zero LoC', () => {
  it.each([
    [['BEGIN', 'END', 'Attribute VB_Name = "c"'], 'no VERSION'],
    [
      ['VERSION 5.00', 'BEGIN', 'END', 'Attribute VB_Name = "c"'],
      'form VERSION',
    ],
    [['VERSION 1.0 CLASS', 'BEGIN', 'Attribute VB_Name = "c"'], 'unbalanced'],
    [['VERSION 1.0 CLASS', 'BEGIN', 'END', 'Option Explicit'], 'no VB_Name'],
    [['VERSION 1.0 CLASS', 'Attribute VB_Name = "c"'], 'no BEGIN'],
    [
      [
        'VERSION 1.0 CLASS',
        'BEGIN',
        'END',
        'Sub Load()',
        '    s = "DELETE FROM T1"',
        'End Sub',
        'Attribute VB_Name = "c"',
        'Sub After()',
        'End Sub',
      ],
      'code between END and VB_Name',
    ],
    [
      [
        'VERSION 1.0 CLASS',
        'BEGIN',
        '  MultiUse = -1',
        '  Begin VB.Label l',
        '  End',
        'END',
        'Attribute VB_Name = "c"',
      ],
      'nested block',
    ],
    [
      [
        'VERSION 1.0 CLASS',
        'BEGIN',
        '  MultiUse = -1',
        'ENDPROPERTY',
        'Attribute VB_Name = "c"',
      ],
      'ENDPROPERTY terminator',
    ],
    [
      [
        'VERSION 1.0 CLASS',
        'BEGIN',
        '  MultiUse = -1',
        'Public Sub Hidden()',
        '    s = "DELETE FROM T1"',
        'End Sub',
        'END',
        'Attribute VB_Name = "c"',
      ],
      'procedure inside BEGIN',
    ],
    [
      [
        'VERSION 1.0 CLASS',
        'BEGIN',
        '  s = "DELETE FROM T1"',
        'END',
        'Attribute VB_Name = "c"',
      ],
      'statement inside BEGIN',
    ],
  ])('class %j (%s)', (lines) => {
    expect(analyzeVb6CodeFile('C.CLS', lines, { module: 'class' })).toEqual({
      status: 'unsupported',
      reason: 'CLASS_HEADER_BOUNDARY_NOT_FOUND',
      line: null,
    });
  });

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
    expect(analyzeVb6CodeFile('F.FRM', lines, { module: 'form' })).toEqual({
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
    expect(analyzeVb6CodeFile('M.BAS', lines, { module: 'standard' })).toEqual({
      status: 'unsupported',
      reason,
      line,
    });
  });

  it('counts a keyword statement before a comment as code', () => {
    expect(
      analyzeVb6CodeFile('M.BAS', ['Sub A()', "    Stop: ' pause", 'End Sub'], {
        module: 'standard',
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
        module: 'standard',
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
        module: 'standard',
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
      { module: 'standard' },
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
        { module: 'standard' },
      ),
    ).toMatchObject({ procedures: [], fileLevelCodeLines: 2 });
  });
});

describe('static facts', () => {
  const lines = [
    'Private Declare Function GetTickCount Lib "kernel32" () As Long',
    'Public Sub Load(ByVal tableName As String)',
    '    Dim strSQL As String',
    '    strSQL = "SELECT A.F001, B.F002 FROM HAN01.KMTANT A, KMBUMON B "',
    '    strSQL = strSQL & " WHERE A.F001 = :F001"',
    '    strSQL = "INSERT INTO WKTABLE (F001) SELECT F001 FROM DUAL"',
    '    strSQL = "UPDATE " & tableName & " SET F001 = 1"',
    '    strSQL = "DELETE FROM HAN01.KMTANT WHERE F001 = 1"',
    'Retry:',
    '    If GetTickCount() > 0 Then Call LogText("UPDATE done")',
    '    Select Case 1',
    '    Case 1: x = 1',
    '    Case Else: x = 2',
    '    End Select',
    'End Sub',
  ];
  const result = analyzeVb6CodeFile('m/LOAD.BAS', lines, {
    module: 'standard',
  });
  if (result.status !== 'analyzed') throw new Error(result.status);

  it('extracts tables per operation and flags a runtime table name', () => {
    expect(result.sqlTables.map((t) => [t.table, t.operation, t.line])).toEqual(
      [
        ['HAN01.KMTANT', 'R', 4],
        ['KMBUMON', 'R', 4],
        ['WKTABLE', 'C', 6],
        ['HAN01.KMTANT', 'D', 8],
      ],
    );
    expect(result.dynamicSql).toEqual([
      { operation: 'U', line: 7, procedureId: 'm/LOAD.BAS#sub:Load' },
    ]);
  });

  it('records Declare, labels and decision points', () => {
    expect(result.externalDeclarations).toEqual([
      {
        name: 'GetTickCount',
        library: 'kernel32',
        visibility: 'private',
        line: 1,
      },
    ]);
    expect(result.labels).toEqual([{ name: 'Retry', line: 9 }]);
    // If + Case 1; Case Else and Select Case are not counted.
    expect(result.procedures[0]?.decisionPoints).toBe(2);
  });

  it('finds identifier uses outside strings, comments and declarations', () => {
    const references = findVb6References('m/LOAD.BAS', lines, {
      module: 'standard',
      names: new Set(['gettickcount', 'logtext', 'update']),
    });
    expect(references.map((r) => [r.name, r.line, r.procedureId])).toEqual([
      ['GetTickCount', 10, 'm/LOAD.BAS#sub:Load'],
      ['LogText', 10, 'm/LOAD.BAS#sub:Load'],
    ]);
  });
});

describe('SQL built across statements', () => {
  const facts = (body: string[]) => {
    const result = analyzeVb6CodeFile(
      'M.BAS',
      ['Sub P()', ...body, 'End Sub'],
      { module: 'standard' },
    );
    if (result.status !== 'analyzed') throw new Error(result.status);
    return {
      tables: result.sqlTables.map(
        (t) => `${t.table}:${t.operation}:${t.line}`,
      ),
      dynamic: result.dynamicSql.map((d) => `${d.operation}:${d.line}`),
    };
  };

  it.each([
    [
      'joined literals',
      ['s = "SELECT * FROM ORD" & "ERS"'],
      ['ORDERS:R:2'],
      [],
    ],
    [
      'a name joined to a runtime value',
      ['s = "SELECT * FROM ORD_" & tenant'],
      [],
      ['R:2'],
    ],
    [
      'an unrelated literal after the SQL',
      ['s = "SELECT * FROM "', 'MsgBox "HELLO"'],
      [],
      [],
    ],
    [
      'a runtime value appended later',
      ['s = "SELECT * FROM "', 's = s & tableName'],
      [],
      ['R:3'],
    ],
    [
      'pieces across lines and continuations',
      [
        'strSQL = "SELECT A "',
        'strSQL = strSQL & "FROM T1, " & _',
        '    "T2 WHERE B = 1"',
        'Call Exec(strSQL)',
      ],
      ['T1:R:3', 'T2:R:4'],
      [],
    ],
    [
      'a reused variable',
      ['s = "DELETE FROM T1"', 'Exec s', 's = "UPDATE T2 SET A = 1"'],
      ['T1:D:2', 'T2:U:4'],
      [],
    ],
    [
      'a literal passed to a call',
      ['db.ExecuteSQL ("DROP TABLE W1")'],
      ['W1:X:2'],
      [],
    ],
    [
      'parts kept in other variables',
      ['f = " FROM T1"', 's = "SELECT A" & f'],
      ['T1:R:2'],
      [],
    ],
  ])('handles %s', (_label, body, tables, dynamic) => {
    expect(facts(body)).toEqual({ tables, dynamic });
  });
});

describe('recursive calls', () => {
  const uses = (lines: string[]) =>
    findVb6References('M.BAS', lines, {
      module: 'standard',
      names: new Set(['recur', 'walk']),
    }).map((r) => `${r.name}:${r.line}`);

  it('keeps a recursive call but not the return-value assignment', () => {
    expect(
      uses([
        'Function Recur(n As Long) As Long',
        '    If n > 0 Then Recur = Recur(n - 1)',
        '    Recur = Recur + 1',
        'End Function',
      ]),
    ).toEqual(['Recur:2']);
  });

  it('keeps Sub recursion written as a statement or with Call', () => {
    expect(
      uses(['Sub Walk(n)', '    Walk n - 1', '    Call Walk(0)', 'End Sub']),
    ).toEqual(['Walk:2', 'Walk:3']);
  });
});

describe('SQL built in branches and properties', () => {
  const facts = (body: string[]) => {
    const result = analyzeVb6CodeFile(
      'M.BAS',
      ['Sub P()', ...body, 'End Sub'],
      {
        module: 'standard',
      },
    );
    if (result.status !== 'analyzed') throw new Error(result.status);
    return {
      tables: result.sqlTables.map((t) => `${t.table}:${t.operation}`).sort(),
      dynamic: result.dynamicSql.length,
    };
  };

  it.each([
    [
      'If/Else appending different words',
      [
        's = "SELECT * FROM "',
        'If flag Then',
        '    s = s & "ORD"',
        'Else',
        '    s = s & "ERS"',
        'End If',
      ],
      ['ERS:R', 'ORD:R'],
      0,
    ],
    [
      'a single-line If/Else',
      ['s = "SELECT * FROM "', 'If f Then s = s & "ORD" Else s = s & "ERS"'],
      ['ERS:R', 'ORD:R'],
      0,
    ],
    [
      'nested single-line Ifs, all closed before the next line',
      [
        's = "SELECT * FROM T"',
        'If f Then If g Then s = s & "A" Else s = s & "B"',
        's = s & "Z"',
      ],
      ['TAZ:R', 'TBZ:R', 'TZ:R'],
      0,
    ],
    [
      'a second Else on the line, belonging to the outer single-line If',
      [
        's = "SELECT * FROM T"',
        'If f Then If g Then s = s & "A" Else s = s & "B" Else s = s & "C"',
        's = s & "Z"',
      ],
      ['TAZ:R', 'TBZ:R', 'TCZ:R'],
      0,
    ],
    [
      'two Else on a single line inside a multi-line If block',
      [
        's = "SELECT * FROM T"',
        'If h Then',
        '    If f Then If g Then s = s & "A" Else s = s & "B" Else s = s & "C"',
        'Else',
        '    s = s & "Y"',
        'End If',
        's = s & "Z"',
      ],
      ['TAZ:R', 'TBZ:R', 'TCZ:R', 'TYZ:R'],
      0,
    ],
    [
      'nested single-line Ifs inside a multi-line If block',
      [
        's = "SELECT * FROM T"',
        'If h Then',
        '    If f Then If g Then s = s & "A" Else s = s & "B"',
        '    s = s & "Z"',
        'Else',
        '    s = s & "Y"',
        'End If',
      ],
      ['TAZ:R', 'TBZ:R', 'TY:R', 'TZ:R'],
      0,
    ],
    [
      'Select Case branches',
      [
        's = "DELETE FROM T"',
        'Select Case k',
        'Case 1: s = s & "1"',
        'Case Else: s = s & "2"',
        'End Select',
      ],
      ['T1:D', 'T2:D'],
      0,
    ],
    [
      'an optional clause after the table',
      [
        's = "SELECT A FROM T1"',
        'If f Then',
        '    s = s & " WHERE B = 1"',
        'End If',
        's = s & " ORDER BY A"',
      ],
      ['T1:R'],
      0,
    ],
    [
      'an optional suffix that could join the table name',
      [
        's = "SELECT A FROM T"',
        'If f Then s = s & " WHERE B = 1"',
        's = s & "X ORDER BY A"',
      ],
      ['T:R', 'TX:R'],
      0,
    ],
    [
      'more branches than paths kept apart',
      [
        's = "SELECT A FROM T1 WHERE 1 = 1"',
        ...[1, 2, 3, 4].map((n) => `If f${n} Then s = s & " AND C${n} = 1"`),
        's = s & " ORDER BY A"',
      ],
      ['T1:R'],
      0,
    ],
    [
      'merged paths that leave the table name open',
      [
        's = "SELECT A FROM "',
        ...[1, 2, 3, 4].map((n) => `If f${n} Then s = s & "T${n}"`),
        's = s & " ORDER BY A"',
      ],
      null,
      1,
    ],
    [
      'a property built by appending',
      ['obj.SQL = "SELECT * FROM ORD"', 'obj.SQL = obj.SQL & "ERS"'],
      ['ORDERS:R'],
      0,
    ],
  ])('handles %s', (_label, body, tables, dynamic) => {
    const result = facts(body);
    // null: tables of single paths may be reported, only dynamic is checked.
    if (tables) expect(result.tables).toEqual(tables);
    expect(result.dynamic).toBe(dynamic);
  });
});

it('links calls written with the $ type character', () => {
  expect(
    findVb6References(
      'M.BAS',
      [
        'Function F$()',
        '    F$ = F$()',
        'End Function',
        'Sub Main()',
        '    x = F$()',
        'End Sub',
      ],
      { module: 'standard', names: new Set(['f']) },
    ).map((r) => `${r.name}:${r.line}`),
  ).toEqual(['F:2', 'F:5']);
});
