import type { SqlSegment } from '../sql-access.js';

// Token-level reading of one logical VB6 statement (continuations joined):
// rebuilds the strings it concatenates for SQL detection and finds the
// identifiers it uses for the call graph. Lexical only; no type inference.

export type CodePiece = { text: string; line: number };

type Token = {
  kind: 'string' | 'name' | 'symbol' | 'other';
  text: string;
  line: number;
  // A name written right after `.` (member of an object/With block).
  member: boolean;
};

const NAME = /^[A-Za-z_][A-Za-z0-9_]*\$?/;
const NUMBER =
  /^(?:&[HhOo][0-9A-Fa-f]+&?|\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?[%&!#@]?)/;
const DATE = /^#[^#]*#/;
const CONCAT = new Set(['&', '+']);

export function tokenizeVb6(pieces: readonly CodePiece[]): Token[] {
  const tokens: Token[] = [];
  for (const { text, line } of pieces) {
    let i = 0;
    while (i < text.length) {
      const rest = text.slice(i);
      const space = /^\s+/.exec(rest);
      if (space) {
        i += space[0].length;
        continue;
      }
      if (rest[0] === '"') {
        let value = '';
        let end = 1;
        for (; end < rest.length; end += 1) {
          if (rest[end] === '"') {
            if (rest[end + 1] !== '"') break;
            end += 1;
          }
          value += rest[end];
        }
        tokens.push({ kind: 'string', text: value, line, member: false });
        i += end + 1;
        continue;
      }
      const number = NUMBER.exec(rest) ?? DATE.exec(rest);
      const name = NAME.exec(rest);
      if (name) {
        const previous = tokens.at(-1);
        tokens.push({
          kind: 'name',
          text: name[0],
          line,
          member: previous?.kind === 'symbol' && previous.text === '.',
        });
        i += name[0].length;
      } else if (number) {
        tokens.push({ kind: 'other', text: number[0], line, member: false });
        i += number[0].length;
      } else {
        tokens.push({
          kind: 'symbol',
          text: rest[0] ?? '',
          line,
          member: false,
        });
        i += 1;
      }
    }
  }
  return tokens;
}

// VB identifiers ignore case and the `$` type character: `F$` is `F`.
export const nameKey = (text: string) => text.toLowerCase().replace(/\$$/, '');

const isWord = (token: Token | undefined, word: string) =>
  token?.kind === 'name' && token.text.toLowerCase() === word;
const isSymbol = (token: Token | undefined, symbol: string) =>
  token?.kind === 'symbol' && token.text === symbol;

// Splits on `:`, after `Then` and around `Else` (not `Case Else`), so each
// part starts at a statement position and `Else` stands alone.
export function splitStatements(tokens: readonly Token[]): Token[][] {
  const statements: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (isSymbol(token, '(')) depth += 1;
    if (isSymbol(token, ')')) depth = Math.max(0, depth - 1);
    if (depth === 0 && isSymbol(token, ':')) {
      statements.push(current);
      current = [];
      continue;
    }
    if (
      depth === 0 &&
      isWord(token, 'else') &&
      !(current.length === 1 && isWord(current[0], 'case'))
    ) {
      if (current.length > 0) statements.push(current);
      statements.push([token]);
      current = [];
      continue;
    }
    current.push(token);
    if (depth === 0 && isWord(token, 'then')) {
      statements.push(current);
      current = [];
    }
  }
  statements.push(current);
  return statements.filter((statement) => statement.length > 0);
}

// Index after the parenthesis group that opens at `start`.
function closeParen(tokens: readonly Token[], start: number): number {
  let depth = 0;
  for (let i = start; i < tokens.length; i += 1) {
    if (isSymbol(tokens[i], '(')) depth += 1;
    if (isSymbol(tokens[i], ')')) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return tokens.length;
}

type Value = { segments: SqlSegment[]; hasLiteral: boolean };
type Chain = { end: number; value: Value; names: Set<string> };
type Variables = Map<string, Value>;
// One open If/Select block: the paths before it and those of each finished
// branch.
type Frame = {
  base: Variables[];
  branches: Variables[];
  started: boolean;
  hasElse: boolean;
};

// Paths kept apart after branches before they are merged conservatively.
const MAX_PATHS = 8;

const startsWithSpace = (segments: readonly SqlSegment[]) => {
  const [first] = segments;
  return first?.text === null
    ? first.boundary === true
    : /^\s/.test(first?.text ?? '');
};

const samePath = (a: Variables, b: Variables) =>
  a.size === b.size && [...a].every(([name, value]) => b.get(name) === value);

// Rebuilds string values per procedure. A variable assigned a concatenation
// keeps its pieces; `x = x & ...` appends. Each finished value, and each
// concatenation not stored in a variable, is emitted once as one SQL text.
// If/ElseIf/Else and Select Case branches are followed as separate paths
// (each with its own variables), so text of exclusive branches is never
// joined. Past MAX_PATHS the paths are merged: the part where they differ
// becomes a runtime gap. Loops are read once, in order.
export class Vb6StringTracker {
  private paths: Variables[] = [new Map<string, Value>()];
  // The path a statement is being applied to.
  private variables: Variables = new Map();
  private readonly frames: Frame[] = [];

  constructor(private readonly emit: (segments: SqlSegment[]) => void) {}

  // One logical line, already split into statements.
  line(statements: readonly (readonly Token[])[]): void {
    // Depth before the first single-line If; every frame opened above it
    // (nested `If a Then If b Then ...`) ends with this line, while frames
    // of an enclosing multi-line block stay open.
    let singleLineBase: number | null = null;
    statements.forEach((tokens, index) => {
      const [first, second] = tokens;
      if (isWord(first, 'if') && isWord(tokens.at(-1), 'then')) {
        this.onEachPath(() => this.scan(tokens));
        if (singleLineBase === null && index < statements.length - 1)
          singleLineBase = this.frames.length;
        this.open(true);
      } else if (isWord(first, 'elseif')) {
        this.branch(false);
        this.onEachPath(() => this.scan(tokens));
      } else if (tokens.length === 1 && isWord(first, 'else'))
        this.branch(true);
      else if (isWord(first, 'select') && isWord(second, 'case')) {
        this.onEachPath(() => this.scan(tokens));
        this.open(false);
      } else if (isWord(first, 'case')) {
        this.branch(isWord(second, 'else'));
        this.onEachPath(() => this.scan(tokens));
      } else if (
        isWord(first, 'end') &&
        (isWord(second, 'if') || isWord(second, 'select'))
      )
        this.close();
      else this.onEachPath(() => this.statement(tokens));
    });
    if (singleLineBase !== null)
      while (this.frames.length > singleLineBase) this.close();
  }

  // Emits every value still held, e.g. at the end of a procedure.
  flush(): void {
    while (this.frames.length > 0) this.close();
    for (const path of this.paths)
      for (const value of path.values())
        if (value.hasLiteral) this.emit(value.segments);
    this.paths = [new Map<string, Value>()];
  }

  private onEachPath(apply: () => void): void {
    for (const path of this.paths) {
      this.variables = path;
      apply();
    }
  }

  private statement(tokens: readonly Token[]): void {
    let start = 0;
    if (isWord(tokens[0], 'set') || isWord(tokens[0], 'let')) start = 1;
    const target = tokens[start];
    if (target?.kind === 'name' && !target.member) {
      // Dotted targets (obj.Prop) are read as one name before the `=`.
      let name = nameKey(target.text);
      let i = start + 1;
      for (; isSymbol(tokens[i], '.') && tokens[i + 1]?.kind === 'name'; i += 2)
        name += `.${nameKey(tokens[i + 1]?.text ?? '')}`;
      if (isSymbol(tokens[i], '=')) {
        this.assign(name, tokens.slice(i + 1));
        return;
      }
    }
    this.scan(tokens.slice(start));
  }

  private open(started: boolean): void {
    this.frames.push({
      base: this.paths,
      branches: [],
      started,
      hasElse: false,
    });
    this.paths = this.paths.map((path) => new Map(path));
  }

  private branch(isElse: boolean): void {
    const frame = this.frames.at(-1);
    if (!frame) return;
    if (frame.started) frame.branches.push(...this.paths);
    frame.started = true;
    frame.hasElse ||= isElse;
    this.paths = frame.base.map((path) => new Map(path));
  }

  private close(): void {
    const frame = this.frames.pop();
    if (!frame) return;
    const all = [...frame.branches];
    if (frame.started) all.push(...this.paths);
    // Without Else/Case Else the block may run no branch at all.
    if (!frame.hasElse) all.push(...frame.base);
    const distinct: Variables[] = [];
    for (const path of all)
      if (!distinct.some((kept) => samePath(kept, path))) distinct.push(path);
    this.paths =
      distinct.length > MAX_PATHS ? [this.merge(distinct)] : distinct;
  }

  private merge(branches: readonly Variables[]): Variables {
    const merged: Variables = new Map();
    const names = new Set(branches.flatMap((branch) => [...branch.keys()]));
    for (const name of names) {
      const values = branches.map((branch) => branch.get(name));
      const [first] = values;
      if (values.every((value) => value === first)) {
        if (first) merged.set(name, first);
        continue;
      }
      const known = values.filter((value) => value !== undefined);
      // Each branch's own value is a SQL text that can really run.
      for (const value of new Set(known))
        if (value.hasLiteral) this.emit(value.segments);
      if (known.length < values.length) continue;
      let prefix = 0;
      const shortest = Math.min(...known.map((v) => v.segments.length));
      while (
        prefix < shortest &&
        known.every(
          (value) => value.segments[prefix] === known[0]?.segments[prefix],
        )
      )
        prefix += 1;
      const tails = known
        .map((value) => value.segments.slice(prefix))
        .filter((tail) => tail.length > 0);
      merged.set(name, {
        segments: [
          ...(known[0]?.segments.slice(0, prefix) ?? []),
          {
            text: null,
            line: tails[0]?.[0]?.line ?? 0,
            // Every branch adds a separate word (or nothing): the text
            // before the gap is complete.
            boundary: tails.every(startsWithSpace),
          },
        ],
        hasLiteral: known.some((value) => value.hasLiteral),
      });
    }
    return merged;
  }

  private assign(name: string, expression: readonly Token[]): void {
    const chain = this.readChain(expression, 0);
    const whole = chain?.end === expression.length ? chain : null;
    // `x = x & ...` extends the value; any other assignment ends it.
    const extending = whole?.names.has(name) ?? false;
    const previous = this.variables.get(name);
    if (previous && !extending) {
      if (previous.hasLiteral) this.emit(previous.segments);
      this.variables.delete(name);
    }
    if (whole && (whole.value.hasLiteral || extending)) {
      this.variables.set(name, whole.value);
      return;
    }
    // Facts found twice here are de-duplicated by the caller.
    this.scan(expression);
  }

  // Emits the concatenations found anywhere in an expression or call.
  private scan(tokens: readonly Token[]): void {
    let i = 0;
    while (i < tokens.length) {
      const chain = this.readChain(tokens, i);
      if (!chain) {
        i += 1;
        continue;
      }
      if (chain.value.hasLiteral) this.emit(chain.value.segments);
      i = chain.end;
    }
  }

  // Reads `term (& term)*` starting at `start`; null when no term starts
  // there. Arguments of calls are scanned as their own expressions.
  private readChain(tokens: readonly Token[], start: number): Chain | null {
    const segments: SqlSegment[] = [];
    const names = new Set<string>();
    let hasLiteral = false;
    let i = start;
    for (;;) {
      const token = tokens[i];
      if (!token) break;
      if (token.kind === 'string') {
        segments.push({ text: token.text, line: token.line });
        hasLiteral = true;
        i += 1;
      } else if (isSymbol(token, '(')) {
        const end = closeParen(tokens, i);
        const inner = tokens.slice(i + 1, end - 1);
        const nested = this.readChain(inner, 0);
        if (nested && nested.end === inner.length) {
          segments.push(...nested.value.segments);
          hasLiteral ||= nested.value.hasLiteral;
          for (const name of nested.names) names.add(name);
        } else {
          this.scan(inner);
          segments.push({ text: null, line: token.line });
        }
        i = end;
      } else if (token.kind === 'name' || token.kind === 'other') {
        let name = nameKey(token.text);
        let end = i + 1;
        while (isSymbol(tokens[end], '.') && tokens[end + 1]?.kind === 'name') {
          name += `.${nameKey(tokens[end + 1]?.text ?? '')}`;
          end += 2;
        }
        if (isSymbol(tokens[end], '(')) {
          // A call or array element: its value is only known at runtime.
          const close = closeParen(tokens, end);
          this.scan(tokens.slice(end + 1, close - 1));
          segments.push({ text: null, line: token.line });
          end = close;
        } else {
          const known = token.member ? undefined : this.variables.get(name);
          if (known) {
            segments.push(...known.segments);
            hasLiteral ||= known.hasLiteral;
          } else segments.push({ text: null, line: token.line });
          names.add(name);
        }
        i = end;
      } else break;
      const operator = tokens[i];
      if (!operator || operator.kind !== 'symbol' || !CONCAT.has(operator.text))
        break;
      i += 1;
    }
    if (i === start) return null;
    return { end: i, value: { segments, hasLiteral }, names };
  }
}

const MODIFIERS = new Set(['public', 'private', 'friend', 'static', 'global']);
const DECLARATIONS = new Set([
  'sub',
  'function',
  'property',
  'declare',
  'event',
]);

// Uses of `names` (lower case) in one statement. Inside procedure `owner`,
// its own name is a call only in call position (`Owner(...)`, `Call Owner`,
// or `Owner args` as a statement); `Owner = x` and a bare `Owner` in an
// expression are its return value.
export function findNameUses(
  statement: readonly Token[],
  names: ReadonlySet<string>,
  owner: string | null,
): { name: string; line: number }[] {
  const uses: { name: string; line: number }[] = [];
  // A declaration (`Public Function Foo(...)`, `Declare Sub ...`) names a
  // procedure, it does not call one.
  const head = statement.find(
    (token) =>
      !(token.kind === 'name' && MODIFIERS.has(token.text.toLowerCase())),
  );
  if (head?.kind === 'name' && DECLARATIONS.has(head.text.toLowerCase()))
    return uses;
  const first = isWord(statement[0], 'call') ? 1 : 0;
  statement.forEach((token, index) => {
    if (token.kind !== 'name' || token.member) return;
    const key = nameKey(token.text);
    if (!names.has(key)) return;
    if (owner !== null && key === owner) {
      const next = statement[index + 1];
      const atStart = index === first;
      const call =
        isSymbol(next, '(') ||
        (atStart && first === 1) ||
        (atStart && !isSymbol(next, '=') && !isSymbol(next, '.'));
      if (!call) return;
    }
    uses.push({ name: token.text.replace(/\$$/, ''), line: token.line });
  });
  return uses;
}
