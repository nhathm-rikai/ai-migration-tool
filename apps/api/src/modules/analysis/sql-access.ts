// Language-neutral, lexical SQL table access detection over one SQL text
// built by the language analyzer (metric `sql-access-v3`). It never guesses
// a table: when a table name touches a runtime value the access is reported
// as dynamic instead. SQL string literals and comments are skipped.

export const SQL_ACCESS_VERSION = 'sql-access-v3';

// CRUD, plus X for DDL on a table (CREATE/DROP/TRUNCATE/ALTER TABLE),
// common for work tables built at runtime.
export type SqlOperation = 'C' | 'R' | 'U' | 'D' | 'X';

// The pieces of one SQL text, concatenated exactly as written: a literal
// fragment, or null where a runtime value was concatenated.
// `boundary`: the runtime part is either empty or starts a new word, so the
// literal text before it is complete.
export type SqlSegment = {
  text: string | null;
  line: number;
  boundary?: boolean;
};

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
const GAP = '\u0002';
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
    text += segment.text ?? (segment.boundary ? GAP : DYNAMIC);
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

// Blanks SQL string literals ('...' with '' escapes) and comments, keeping
// offsets, so keywords inside them are not read as statements.
function maskLiteralsAndComments(text: string): string {
  let masked = '';
  let i = 0;
  const blank = (end: number) => {
    masked += text.slice(i, end).replace(/[^\n]/g, ' ');
    i = end;
  };
  while (i < text.length) {
    if (text[i] === "'") {
      let end = i + 1;
      for (; end < text.length; end += 1)
        if (text[end] === "'") {
          if (text[end + 1] !== "'") break;
          end += 1;
        }
      blank(Math.min(end + 1, text.length));
    } else if (text.startsWith('--', i)) {
      const end = text.indexOf('\n', i);
      blank(end < 0 ? text.length : end);
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      blank(end < 0 ? text.length : end + 2);
    } else {
      masked += text[i];
      i += 1;
    }
  }
  return masked;
}

export function detectSqlAccess(segments: readonly SqlSegment[]): {
  tables: SqlTableAccess[];
  dynamic: DynamicSqlUse[];
} {
  const stream = buildStream(segments);
  const text = maskLiteralsAndComments(stream.text);
  const { lineAt } = stream;
  const tables: SqlTableAccess[] = [];
  const dynamic: DynamicSqlUse[] = [];

  // Reads the table (or table list for FROM) starting at `index`.
  function readTables(
    index: number,
    operation: SqlOperation,
    list: boolean,
  ): void {
    let rest = text.slice(index);
    // Each table is reported at the line where its own name is written.
    const line = () => lineAt(text.length - rest.length);
    for (;;) {
      rest = rest.replace(/^\s+/, '');
      if (rest.startsWith(DYNAMIC) || rest.startsWith(GAP)) {
        dynamic.push({ operation, line: line() });
        return;
      }
      const match = new RegExp(`^(${IDENT})`).exec(rest);
      const name = match?.[1];
      if (!match || !name || STOP_WORDS.has(name.toLowerCase())) return;
      // `ORD_` & tenant: the real name is only known at runtime. A gap may
      // also be empty, so a word right after it could join the name.
      const next = rest.slice(match[0].length, match[0].length + 2);
      if (
        next.startsWith(DYNAMIC) ||
        next === `.${DYNAMIC}` ||
        next === `.${GAP}` ||
        (next[0] === GAP && /[A-Za-z0-9_$#.]/.test(next[1] ?? ''))
      ) {
        dynamic.push({ operation, line: line() });
        return;
      }
      if (!PSEUDO_TABLES.has(name.toLowerCase()))
        tables.push({ table: name.toUpperCase(), operation, line: line() });
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
        regex: new RegExp(
          `\\bupdate\\s+(?=\\S+\\s+set\\b|${DYNAMIC}|${GAP})`,
          'gi',
        ),
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
