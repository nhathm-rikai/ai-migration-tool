import { expect, it } from 'vitest';
import { lexVb6Line } from './vb6-line-lexer.js';

it.each([
  ["x = 1 ' note", 'code'],
  ["    ' only a comment", 'comment'],
  ['Rem note', 'comment'],
  ['  REM', 'comment'],
  ['Remove x', 'code'],
  ['x = 1: Rem note', 'code'],
  ['s = "it\'s: Rem ""x"""', 'code'],
  ['Label1:', 'code'],
  ["Label1: ' note", 'comment'],
  ['100 Rem note', 'comment'],
  ['100', 'code'],
  ['Foo a:=1', 'code'],
  // Keyword statements followed by ':' are statements, not labels.
  ["    Stop: ' pause", 'code'],
  ["End: ' quit", 'code'],
  ["Return: ' back", 'code'],
  ["Resume: ' retry", 'code'],
  ["Stopper: ' a real label", 'comment'],
  ['   ', 'blank'],
  ['s = "never closed', 'unclassified'],
] as const)('classifies %j as %s', (text, kind) => {
  expect(lexVb6Line(text, 'none').kind).toBe(kind);
});

it('returns the first statement without label for structure detection', () => {
  expect(lexVb6Line('Exit_Point: End Sub', 'none').firstStatement).toBe(
    'End Sub',
  );
  expect(lexVb6Line("Private Sub A(): x = 1 ' c", 'none').firstStatement).toBe(
    'Private Sub A()',
  );
});

it('lists every statement start, excluding a continued head', () => {
  expect(lexVb6Line("Lbl: x = 1: End Sub ' c", 'none').statementStarts).toEqual(
    ['x = 1', 'End Sub'],
  );
  expect(lexVb6Line('  b): End Function', 'code').statementStarts).toEqual([
    'End Function',
  ]);
});

it('tracks code and comment continuation across physical lines', () => {
  const first = lexVb6Line('x = "a" & _', 'none');
  expect(first).toMatchObject({ kind: 'code', continuation: 'code' });
  // A continued line does not start a statement: no label/Rem detection.
  expect(lexVb6Line('Rem_Value', 'code')).toMatchObject({
    kind: 'code',
    firstStatement: null,
  });
  expect(lexVb6Line("' note _", 'none').continuation).toBe('comment');
  expect(lexVb6Line('still comment', 'comment')).toMatchObject({
    kind: 'comment',
    continuation: 'none',
  });
  expect(lexVb6Line('Dim a_', 'none').continuation).toBe('none');
});
