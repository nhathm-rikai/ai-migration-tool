// Language-neutral, lexical SQL table access detection over the string
// literals of one procedure (metric `sql-access-v0`). It never guesses a
// table: when a table position is filled by a runtime expression the access
// is reported as dynamic instead.

export const SQL_ACCESS_VERSION = 'sql-access-v0';

// CRUD, plus X for DDL on a table (CREATE/DROP/TRUNCATE/ALTER TABLE),
// common for work tables built at runtime.
export type SqlOperation = 'C' | 'R' | 'U' | 'D' | 'X';

// A literal fragment, or null where a non-literal expression was
// concatenated into the string.
export type SqlSegment = { text: string | null; line: number };

export type SqlTableAccess = {
  table: string;
  operation: SqlOperation;
  line: number;
};

export type DynamicSqlUse = {
  operation: SqlOperation;
  line: number;
};

const DYNAMIC = '\u0001';
const IDENT = '[A-Za-z_][A-Za-z0-9_$#]*(?:\\.[A-Za-z_][A-Za-z0-9_$#]*)?';
const STOP_WORDS = new Set([
  'where',
  'group',
  'order',
  'having',
  'union',
  'connect',
  'start',
  'for',
  'set',
  'values',
  'select',
  'on',
  'inner',
  'left',
  'right',
  'full',
  'outer',
  'cross',
  'join',
  'natural',
  'minus',
  'intersect',
]);
const PSEUDO_TABLES = new Set(['dual']);

function buildStream(segments: readonly SqlSegment[]) {
  let text = '';
  const starts: { offset: number; line: number }[] = [];
  for (const segment of segments) {
    starts.push({ offset: text.length, line: segment.line });
    text += (segment.text ?? DYNAMIC) + ' ';
  }
  const lineAt = (offset: number) => {
    let line = starts[0]?.line ?? 0;
    for (const start of starts) {
      if (start.offset > offset) break;
      line = start.line;
    }
    return line;
  };
  return { text, lineAt };
}

export function detectSqlAccess(segments: readonly SqlSegment[]): {
  tables: SqlTableAccess[];
  dynamic: DynamicSqlUse[];
} {
  const { text, lineAt } = buildStream(segments);
  const tables: SqlTableAccess[] = [];
  const dynamic: DynamicSqlUse[] = [];

  // Reads the table (or table list for FROM) starting at `index`.
  function readTables(
    index: number,
    operation: SqlOperation,
    list: boolean,
  ): void {
    const line = lineAt(index);
    let rest = text.slice(index);
    for (;;) {
      rest = rest.replace(/^\s+/, '');
      if (rest.startsWith(DYNAMIC)) {
        dynamic.push({ operation, line });
        return;
      }
      const match = new RegExp(`^(${IDENT})`).exec(rest);
      const name = match?.[1];
      if (!match || !name || STOP_WORDS.has(name.toLowerCase())) return;
      if (!PSEUDO_TABLES.has(name.toLowerCase()))
        tables.push({ table: name.toUpperCase(), operation, line });
      rest = rest.slice(match[0].length);
      if (!list) return;
      // Optional alias, then a comma continues the FROM list.
      const alias = new RegExp(`^\\s+(?:as\\s+)?(${IDENT})`, 'i').exec(rest);
      if (alias?.[1] && !STOP_WORDS.has(alias[1].toLowerCase()))
        rest = rest.slice(alias[0].length);
      const comma = /^\s*,/.exec(rest);
      if (!comma) return;
      rest = rest.slice(comma[0].length);
    }
  }

  const patterns: { regex: RegExp; operation: SqlOperation; list: boolean }[] =
    [
      { regex: /\binsert\s+into\s+/gi, operation: 'C', list: false },
      {
        // The table may be followed by SET or be a dynamic placeholder.
        regex: new RegExp(`\\bupdate\\s+(?=\\S+\\s+set\\b|${DYNAMIC})`, 'gi'),
        operation: 'U',
        list: false,
      },
      { regex: /\bdelete\s+(?:from\s+)?/gi, operation: 'D', list: false },
      { regex: /\bjoin\s+/gi, operation: 'R', list: false },
      {
        regex: /\b(?:create|drop|truncate|alter)\s+table\s+/gi,
        operation: 'X',
        list: false,
      },
    ];
  for (const { regex, operation, list } of patterns)
    for (const match of text.matchAll(regex))
      readTables(match.index + match[0].length, operation, list);

  // SELECT ... FROM: the FROM that follows each SELECT keyword.
  for (const select of text.matchAll(/\bselect\b/gi)) {
    const from = /\bfrom\s+/i.exec(text.slice(select.index));
    if (from) readTables(select.index + from.index + from[0].length, 'R', true);
  }
  return { tables, dynamic };
}
