// Classifies one physical VB6 line. Strings ("" escapes), ' comments, Rem at
// a statement start, ':' separators, labels/line numbers and the " _"
// continuation are handled lexically, never by substring search.

export type Vb6Continuation = 'none' | 'code' | 'comment';

export type Vb6LineKind = 'blank' | 'comment' | 'code' | 'unclassified';

export type Vb6Line = {
  kind: Vb6LineKind;
  // First statement without label/line number; null on continuation lines.
  firstStatement: string | null;
  // Every statement that starts on this line (after a label or ':'),
  // trimmed and non-empty; the continued head of a statement is excluded.
  statementStarts: string[];
  continuation: Vb6Continuation;
};

const LABEL = /^\s*(?:\d+(?=\s|:|$)|([A-Za-z][A-Za-z0-9_]*):(?!=))/;
// Reserved words that form a statement on their own: `Stop: ' x` is a
// statement followed by a separator, not a label.
const STATEMENT_KEYWORDS = new Set([
  'beep',
  'close',
  'do',
  'else',
  'end',
  'exit',
  'loop',
  'next',
  'randomize',
  'rem',
  'reset',
  'resume',
  'return',
  'stop',
  'wend',
]);
const REM = /^rem(?:\s|$)/i;
const CONTINUATION = /(?:^|\s)_$/;

function stripLabel(text: string): string {
  const match = LABEL.exec(text);
  if (!match || STATEMENT_KEYWORDS.has(match[1]?.toLowerCase() ?? ''))
    return text;
  return text.slice(match[0].length);
}

// Returns the index where a comment starts (or -1), whether a string is left
// open, and the ':'-separated statements before the comment.
function scan(text: string): {
  commentStart: number;
  openString: boolean;
  statements: string[];
} {
  const statements: string[] = [];
  let statementStart = 0;
  let inString = false;
  let i = 0;
  const isRemAt = (index: number) => REM.test(text.slice(index).trimStart());
  if (isRemAt(0)) return { commentStart: 0, openString: false, statements };
  for (; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (char === '"') {
        if (text[i + 1] === '"') i += 1;
        else inString = false;
      }
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "'") break;
    else if (char === ':') {
      statements.push(text.slice(statementStart, i));
      statementStart = i + 1;
      if (isRemAt(statementStart)) {
        i = statementStart + text.slice(statementStart).search(/\S/);
        break;
      }
    }
  }
  if (inString) return { commentStart: -1, openString: true, statements };
  statements.push(text.slice(statementStart, i));
  return {
    commentStart: i < text.length ? i : -1,
    openString: false,
    statements,
  };
}

export function lexVb6Line(text: string, incoming: Vb6Continuation): Vb6Line {
  if (text.trim() === '')
    return {
      kind: 'blank',
      firstStatement: null,
      statementStarts: [],
      continuation: 'none',
    };
  if (incoming === 'comment')
    return {
      kind: 'comment',
      firstStatement: null,
      statementStarts: [],
      continuation: CONTINUATION.test(text.trimEnd()) ? 'comment' : 'none',
    };

  const rest = incoming === 'none' ? stripLabel(text) : text;
  const { commentStart, openString, statements } = scan(rest);
  if (openString)
    return {
      kind: 'unclassified',
      firstStatement: null,
      statementStarts: [],
      continuation: 'none',
    };

  const hasCode = statements.some((statement) => statement.trim() !== '');
  const hasComment = commentStart >= 0;
  // Label/line number + comment is comment-only; a label standing alone has
  // no comment and therefore stays code (metric vb6-physical-code-v1).
  const kind: Vb6LineKind = hasComment && !hasCode ? 'comment' : 'code';
  const continuation: Vb6Continuation = hasComment
    ? CONTINUATION.test(rest.slice(commentStart).trimEnd())
      ? 'comment'
      : 'none'
    : CONTINUATION.test(rest.trimEnd())
      ? 'code'
      : 'none';
  return {
    kind,
    firstStatement:
      incoming === 'none' ? (statements[0]?.trim() ?? null) : null,
    statementStarts: statements
      .slice(incoming === 'none' ? 0 : 1)
      .map((statement) => statement.trim())
      .filter((statement) => statement !== ''),
    continuation,
  };
}
