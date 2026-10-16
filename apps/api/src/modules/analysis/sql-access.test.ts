import { describe, expect, it } from 'vitest';
import { detectSqlAccess } from './sql-access.js';

const at = (...texts: (string | null)[]) =>
  detectSqlAccess(texts.map((text, index) => ({ text, line: index + 1 })));

describe('detectSqlAccess', () => {
  it('reads FROM lists with aliases and skips DUAL', () => {
    expect(
      at('SELECT * FROM S.A x, B AS y WHERE 1=1 UNION SELECT 1 FROM DUAL')
        .tables,
    ).toEqual([
      { table: 'S.A', operation: 'R', line: 1 },
      { table: 'B', operation: 'R', line: 1 },
    ]);
  });

  it('detects DDL on work tables as X', () => {
    expect(
      at('CREATE TABLE W1 (A NUMBER)', 'DROP TABLE W1').tables.map(
        (t) => `${t.table}:${t.operation}`,
      ),
    ).toEqual(['W1:X', 'W1:X']);
  });

  it('reports a runtime table name as dynamic, never as a guessed table', () => {
    expect(at('DELETE FROM ', null, ' WHERE A = 1')).toEqual({
      tables: [],
      dynamic: [{ operation: 'D', line: 2 }],
    });
  });

  it('ignores the word UPDATE outside an UPDATE statement', () => {
    expect(at('UPDATE done').tables).toEqual([]);
  });
});
