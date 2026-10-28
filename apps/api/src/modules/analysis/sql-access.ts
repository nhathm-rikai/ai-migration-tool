// Language-neutral, lexical SQL table access detection over one SQL text
// built by the language analyzer (metric `sql-access-v5`). It never guesses
// a table: when a table name touches a runtime value the access is reported
// as dynamic instead. SQL string literals and comments are skipped.
// Apart from that, a text whose other parts are runtime values
// (`WHERE A = " & x`) is concatenated, and one using bind parameters
// (`:name`) is parameterized.

export const SQL_ACCESS_VERSION = 'sql-access-v5';

// CRUD, plus X for DDL on a table (CREATE/DROP/TRUNCATE/ALTER TABLE),
// common for work tables built at runtime.
export type SqlOperation = 'C' | 'R' | 'U' | 'D' | 'X';

// The pieces of one SQL text, concatenated exactly as written: a literal
// fragment, or null where a runtime value was concatenated.
// `boundary`: the runtime part is either empty or starts a new word, so the
// literal text before it is complete.
// `branch`: the runtime part stands for literal text that differs between
// exclusive branches (each analyzed on its own), not for a runtime value.
export type SqlSegment = {
  text: string | null;
  line: number;
  boundary?: boolean;
  branch?: boolean;
};

export type SqlTableAccess = {
  table: string;
  operation: SqlOperation;
  line: number;
};

// The statement keyword before the piece found, and that piece's line.
export type SqlUse = {
  operation: SqlOperation;
  line: number;
};

export type DynamicSqlUse = SqlUse;

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
// `:name` outside literals and comments (`'HH24:MI'` is a literal).
const BIND = /(?<![A-Za-z0-9_$#:]):[A-Za-z_][A-Za-z0-9_$#]*/;

function buildStream(segments: readonly SqlSegment[]) {
  let text = '';
  const starts: { offset: number; line: number }[] = [];
  // Offsets of runtime parts that hold a value, not a branch difference.
  const values: number[] = [];
  for (const segment of segments) {
    starts.push({ offset: text.length, line: segment.line });
    if (segment.text === null && !segment.branch) values.push(text.length);
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
  return { text, lineAt, values };
}

// Blanks SQL string literals ('...' with '' escapes) and comments, keeping
// offsets, so keywords inside them are not read as statements. `comment`
// tells whether an offset is inside a comment, where a value never runs.
function maskLiteralsAndComments(text: string): {
  masked: string;
  comment: (offset: number) => boolean;
} {
  let masked = '';
  let i = 0;
  const comments: { start: number; end: number }[] = [];
  const blank = (end: number) => {
    masked += text.slice(i, end).replace(/[^\n]/g, ' ');
    i = end;
  };
  const blankComment = (end: number) => {
    comments.push({ start: i, end });
    blank(end);
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
      blankComment(end < 0 ? text.length : end);
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      blankComment(end < 0 ? text.length : end + 2);
    } else {
      masked += text[i];
      i += 1;
    }
  }
  const comment = (offset: number) =>
    comments.some(({ start, end }) => offset >= start && offset < end);
  return { masked, comment };
}

// `lines`: when the text holds at least one statement whose table part this
// detector read, every line that wrote a literal piece of it; else empty.
// `concatenated` (first runtime value outside a table name, also inside a
// literal: `'" & x & "'`) and `parameterized` (first bind parameter) are
// reported once per text, and only when it holds such a statement.
export function detectSqlAccess(segments: readonly SqlSegment[]): {
  tables: SqlTableAccess[];
  dynamic: DynamicSqlUse[];
  concatenated: SqlUse | null;
  parameterized: SqlUse | null;
  lines: number[];
} {
  const stream = buildStream(segments);
  const { masked: text, comment } = maskLiteralsAndComments(stream.text);
  const { lineAt } = stream;
  const tables: SqlTableAccess[] = [];
  const dynamic: DynamicSqlUse[] = [];
  // Statement keywords by offset, and runtime parts read as a table name.
  const keywords: { offset: number; operation: SqlOperation }[] = [];
  const tableValues = new Set<number>();
  // Set once a statement keyword is followed by a table, a pseudo table or
  // a runtime value; a keyword alone (`"DELETE "`) is not SQL.
  let statement = false;

  // Reads the table (or table list for FROM) starting at `index`.
  function readTables(
    index: number,
    operation: SqlOperation,
    list: boolean,
  ): void {
    let rest = text.slice(index);
    const offset = () => text.length - rest.length;
    // Each table is reported at the line where its own name is written.
    const line = () => lineAt(offset());
    for (;;) {
      rest = rest.replace(/^\s+/, '');
      if (rest.startsWith(DYNAMIC) || rest.startsWith(GAP)) {
        statement = true;
        tableValues.add(offset());
        dynamic.push({ operation, line: line() });
        return;
      }
      const match = new RegExp(`^(${IDENT})`).exec(rest);
      const name = match?.[1];
      if (!match || !name || STOP_WORDS.has(name.toLowerCase())) return;
      // A keyword followed by a table (pseudo tables included) is SQL.
      statement = true;
      // `ORD_` & tenant: the real name is only known at runtime. A gap may
      // also be empty, so a word right after it could join the name.
      const next = rest.slice(match[0].length, match[0].length + 2);
      if (
        next.startsWith(DYNAMIC) ||
        next === `.${DYNAMIC}` ||
        next === `.${GAP}` ||
        (next[0] === GAP && /[A-Za-z0-9_$#.]/.test(next[1] ?? ''))
      ) {
        const after = offset() + match[0].length;
        tableValues.add(next[0] === '.' ? after + 1 : after);
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
    for (const match of text.matchAll(regex)) {
      keywords.push({ offset: match.index, operation });
      readTables(match.index + match[0].length, operation, list);
    }

  // SELECT ... FROM: the FROM that follows each SELECT keyword.
  for (const select of text.matchAll(/\bselect\b/gi)) {
    keywords.push({ offset: select.index, operation: 'R' });
    const from = /\bfrom\s+/i.exec(text.slice(select.index));
    if (from) readTables(select.index + from.index + from[0].length, 'R', true);
  }
  const lines = statement
    ? [
        ...new Set(
          segments
            .filter((segment) => segment.text !== null)
            .map((segment) => segment.line),
        ),
      ]
    : [];
  // The statement a piece belongs to: the last keyword before it, or the
  // first keyword for a piece written before any.
  keywords.sort((a, b) => a.offset - b.offset);
  const useAt = (offset: number): SqlUse => {
    let operation = keywords[0]?.operation ?? 'R';
    for (const keyword of keywords)
      if (keyword.offset < offset) operation = keyword.operation;
    return { operation, line: lineAt(offset) };
  };
  const value = stream.values.find(
    (offset) => !tableValues.has(offset) && !comment(offset),
  );
  const bind = BIND.exec(text);
  return {
    tables,
    dynamic,
    concatenated: statement && value !== undefined ? useAt(value) : null,
    parameterized: statement && bind ? useAt(bind.index) : null,
    lines,
  };
}
