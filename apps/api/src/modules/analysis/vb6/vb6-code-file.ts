import type {
  CodeFileAnalysis,
  CodeReference,
  DynamicSqlFact,
  SqlUseFact,
  ExternalDeclaration,
  LineCounters,
  ProcedureMetrics,
  SourceLabel,
  SqlTableFact,
} from '../language-analyzer.js';
import { detectSqlAccess, type SqlSegment } from '../sql-access.js';
import {
  findNameUses,
  splitStatements,
  tokenizeVb6,
  Vb6StringTracker,
  type CodePiece,
} from './vb6-statement.js';
import { lexVb6Line, type Vb6Continuation } from './vb6-line-lexer.js';

// Counts metric vb6-physical-code-v1 for one .bas/.frm/.cls, splits
// procedures (specs/source-analysis.md §4) and collects static facts: SQL
// table access, Declare (Win32 API), labels, decision points, identifier uses.

// standard: .bas; form: .frm; class: .cls. Forms and classes are object
// modules: they start with an exported header and their members are reached
// through an object.
export type Vb6ModuleKind = 'standard' | 'form' | 'class';

const ATTRIBUTE = /^attribute\s/i;
const PROCEDURE_START =
  /^((?:(?:public|private|friend|static)\s+)*)(sub|function|property\s+(?:get|let|set))\s+([A-Za-z][A-Za-z0-9_]*)/i;
const PROCEDURE_END = /^end\s+(sub|function|property)\b/i;
const DECISION = /^(?:if|elseif|case(?!\s+else\b)|for|do|while)\b/i;
// Statements that only declare (no processing): Dim/Static/Const, module
// variables, Declare/Type/Enum/Event, Option/Implements/Def<type> and #
// directives. ReDim allocates at runtime and stays executable.
const DECLARATION =
  /^(?:#|(?:dim|static|const|option|implements|declare|type|enum|event|def(?:bool|byte|int|lng|lnglng|longptr|cur|sng|dbl|dec|date|str|obj|var))\b|(?:public|private|global|friend)\s+(?!sub\b|function\b|property\b))/i;

// Executable: a statement that processes, i.e. neither a declaration nor
// the signature or End line of a procedure.
function isExecutable(statement: string): boolean {
  return (
    !DECLARATION.test(statement) &&
    !PROCEDURE_START.test(statement) &&
    !PROCEDURE_END.test(statement)
  );
}
const DECLARE =
  /^(?:(public|private|global)\s+)?declare\s+(?:sub|function)\s+([A-Za-z][A-Za-z0-9_]*)\s+lib\s+"([^"]*)"/i;

const FORM_VERSION = /^version\s+\d/i;
const CLASS_VERSION = /^version\s+\d+\.\d+\s+class$/i;
const CLASS_BEGIN = /^begin$/i;
const CLASS_END = /^end$/i;
// Class header properties are numeric, e.g. `MultiUse = -1  'True`.
const CLASS_PROPERTY = /^[A-Za-z][A-Za-z0-9_]*\s*=\s*-?\d+\s*(?:'.*)?$/;
const DESIGNER_BEGIN = /^(?:begin|beginproperty)\s/i;
const DESIGNER_END = /^(?:end|endproperty)$/i;
const FORM_NAME_ATTRIBUTE = /^attribute\s+vb_name\s*=/i;

type OpenProcedure = ProcedureMetrics & { block: string };

function emptyCounters(physicalLines: number): LineCounters {
  return {
    physicalLines,
    designerLines: 0,
    metadataLines: 0,
    blankLines: 0,
    commentOnlyLines: 0,
    codeLines: 0,
    unclassifiedLines: 0,
  };
}

// The header of an exported class is exactly `VERSION x.y CLASS`, one bare
// BEGIN ... END block of numeric class properties, then `Attribute VB_Name`.
// Any other line (e.g. code inside the block or before VB_Name) makes it
// unknown.
function findClassHeaderEnd(lines: string[]): number | null {
  const expected = [CLASS_VERSION, CLASS_BEGIN];
  let inBlock = false;
  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    if (text === '') continue;
    const next = expected.shift();
    if (next) {
      if (!next.test(text)) return null;
      inBlock = next === CLASS_BEGIN;
    } else if (inBlock) {
      if (CLASS_END.test(text)) inBlock = false;
      else if (!CLASS_PROPERTY.test(text) && !text.startsWith("'")) return null;
    } else return FORM_NAME_ATTRIBUTE.test(text) ? index : null;
  }
  return null;
}

// The designer of an exported form runs from VERSION to the line before the
// top-level `Attribute VB_Name`; Begin/End nesting must be balanced there.
function findDesignerEnd(lines: string[]): number | null {
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first < 0 || !FORM_VERSION.test(lines[first]?.trim() ?? '')) return null;
  let depth = 0;
  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    if (DESIGNER_BEGIN.test(text)) depth += 1;
    else if (DESIGNER_END.test(text)) {
      depth -= 1;
      if (depth < 0) return null;
    } else if (depth === 0 && FORM_NAME_ATTRIBUTE.test(text)) return index;
  }
  return null;
}

function procedureKind(keyword: string): string {
  return keyword.toLowerCase().replace(/\s+/, '-');
}

export function analyzeVb6CodeFile(
  relativePath: string,
  lines: string[],
  options: { module: Vb6ModuleKind },
): CodeFileAnalysis {
  return scanVb6CodeFile(relativePath, lines, options).analysis;
}

export function findVb6References(
  relativePath: string,
  lines: string[],
  options: { module: Vb6ModuleKind; names: ReadonlySet<string> },
): CodeReference[] {
  return scanVb6CodeFile(relativePath, lines, options).references;
}

function scanVb6CodeFile(
  relativePath: string,
  lines: string[],
  options: { module: Vb6ModuleKind; names?: ReadonlySet<string> },
): { analysis: CodeFileAnalysis; references: CodeReference[] } {
  const unsupported = (reason: string, line: number | null) => ({
    analysis: { status: 'unsupported' as const, reason, line },
    references: [],
  });
  const counters = emptyCounters(lines.length);
  const objectModule = options.module !== 'standard';
  let codeStart = 0;
  if (options.module === 'form') {
    const designerEnd = findDesignerEnd(lines);
    if (designerEnd === null)
      return unsupported('FORM_DESIGNER_BOUNDARY_NOT_FOUND', null);
    counters.designerLines = designerEnd;
    codeStart = designerEnd;
  } else if (options.module === 'class') {
    const headerEnd = findClassHeaderEnd(lines);
    if (headerEnd === null)
      return unsupported('CLASS_HEADER_BOUNDARY_NOT_FOUND', null);
    counters.designerLines = headerEnd;
    codeStart = headerEnd;
  }

  const closed: OpenProcedure[] = [];
  const sqlByOwner = new Map<string | null, SqlSegment[][]>();
  const trackers = new Map<string | null, Vb6StringTracker>();
  const trackerFor = (ownerId: string | null) => {
    let tracker = trackers.get(ownerId);
    if (!tracker) {
      tracker = new Vb6StringTracker((segments) => {
        const units = sqlByOwner.get(ownerId) ?? [];
        units.push(segments);
        sqlByOwner.set(ownerId, units);
      });
      trackers.set(ownerId, tracker);
    }
    return tracker;
  };
  // A logical statement: physical pieces joined across ` _` continuations.
  let pending: { pieces: CodePiece[]; owner: OpenProcedure | null } | null =
    null;
  const finishStatement = () => {
    if (!pending) return;
    const ownerId = pending.owner?.id ?? null;
    const ownerName = pending.owner?.name.toLowerCase() ?? null;
    const statements = splitStatements(tokenizeVb6(pending.pieces));
    trackerFor(ownerId).line(statements);
    for (const statement of statements) {
      if (options.names)
        for (const use of findNameUses(statement, options.names, ownerName))
          references.push({ procedureId: ownerId, ...use });
    }
    pending = null;
  };
  const externalDeclarations: ExternalDeclaration[] = [];
  const labels: SourceLabel[] = [];
  const references: CodeReference[] = [];
  let open: OpenProcedure | null = null;
  let incoming: Vb6Continuation = 'none';
  let metadataContinues = false;
  let continuesExecutable = false;

  for (let index = codeStart; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const lexed = lexVb6Line(lines[index] ?? '', incoming);
    const isMetadata: boolean =
      (metadataContinues && incoming === 'code') ||
      (lexed.kind === 'code' && ATTRIBUTE.test(lexed.firstStatement ?? ''));
    metadataContinues = isMetadata && lexed.continuation === 'code';
    const continued = incoming === 'code';
    incoming = lexed.continuation;

    // Non-code lines belong to the procedure open around them.
    const lineOwner: OpenProcedure | null = open;
    if (isMetadata) {
      counters.metadataLines += 1;
      if (lineOwner) lineOwner.metadataLines += 1;
      continue;
    }
    const nonCode =
      lexed.kind === 'blank'
        ? 'blankLines'
        : lexed.kind === 'comment'
          ? 'commentOnlyLines'
          : lexed.kind === 'unclassified'
            ? 'unclassifiedLines'
            : null;
    if (nonCode) {
      counters[nonCode] += 1;
      if (lineOwner) lineOwner[nonCode] += 1;
    }
    if (lexed.label) labels.push({ name: lexed.label, line: lineNumber });
    if (lexed.kind !== 'code') {
      finishStatement();
      continue;
    }

    counters.codeLines += 1;
    // A physical line counts once, for the procedure open at its start or
    // the first one opened on it; `x = 1: End Sub` still closes the block.
    let owner: OpenProcedure | null = open;
    let decisions = 0;
    const closedHere: OpenProcedure[] = [];
    for (const text of lexed.statementStarts) {
      const start = PROCEDURE_START.exec(text);
      const end = PROCEDURE_END.exec(text);
      if (DECISION.test(text)) decisions += 1;
      const declare = DECLARE.exec(text);
      if (declare)
        externalDeclarations.push({
          name: declare[2] ?? '',
          library: declare[3] ?? '',
          visibility:
            declare[1]?.toLowerCase() === 'private' || objectModule
              ? 'private'
              : 'global',
          line: lineNumber,
        });
      if (start) {
        if (open) return unsupported('PROCEDURE_NOT_CLOSED', lineNumber);
        const kind = procedureKind(start[2] ?? '');
        const name = start[3] ?? '';
        open = {
          id: `${relativePath}#${kind}:${name}`,
          kind,
          name,
          visibility: /\bprivate\b/i.test(start[1] ?? '')
            ? 'private'
            : objectModule
              ? 'public'
              : 'global',
          startLine: lineNumber,
          endLine: lineNumber,
          physicalLines: 0,
          codeLines: 0,
          executableLines: 0,
          commentOnlyLines: 0,
          blankLines: 0,
          metadataLines: 0,
          unclassifiedLines: 0,
          sqlLines: 0,
          decisionPoints: 0,
          block: kind.split('-')[0] ?? kind,
        };
        owner ??= open;
      } else if (end) {
        if (!open || open.block !== end[1]?.toLowerCase())
          return unsupported('PROCEDURE_END_UNMATCHED', lineNumber);
        open.endLine = lineNumber;
        closed.push(open);
        closedHere.push(open);
        open = null;
      }
    }
    // A continued line takes the kind of the statement it continues; the
    // line is executable if any statement on it is.
    const kinds = lexed.statementStarts.map(isExecutable);
    const executable =
      (continued && continuesExecutable) || kinds.includes(true);
    if (lexed.continuation === 'code')
      continuesExecutable = kinds.at(-1) ?? (continued && continuesExecutable);
    if (owner) {
      owner.codeLines += 1;
      if (executable) owner.executableLines += 1;
      owner.decisionPoints += decisions;
    }
    pending ??= { pieces: [], owner };
    pending.pieces.push({
      text:
        lexed.continuation === 'code'
          ? lexed.code.replace(/_\s*$/, '')
          : lexed.code,
      line: lineNumber,
    });
    if (lexed.continuation !== 'code') finishStatement();
    for (const procedure of closedHere) trackers.get(procedure.id)?.flush();
  }
  if (open) return unsupported('PROCEDURE_NOT_CLOSED', open.startLine);
  finishStatement();
  trackers.get(null)?.flush();

  const sqlTables: SqlTableFact[] = [];
  const dynamicSql: DynamicSqlFact[] = [];
  const concatenatedSql: SqlUseFact[] = [];
  const parameterizedSql: SqlUseFact[] = [];
  // A value inlined into another (strSQL = strSELECT & strFROM) is also
  // emitted on its own; the same fact is kept once.
  const seen = new Set<string>();
  const once = (key: string) => !seen.has(key) && Boolean(seen.add(key));
  const sqlLinesByOwner = new Map<string | null, Set<number>>();
  for (const [procedureId, units] of sqlByOwner)
    for (const segments of units) {
      const detected = detectSqlAccess(segments);
      const sqlLines = sqlLinesByOwner.get(procedureId) ?? new Set<number>();
      for (const line of detected.lines) sqlLines.add(line);
      sqlLinesByOwner.set(procedureId, sqlLines);
      for (const t of detected.tables)
        if (once(`${procedureId}|${t.table}|${t.operation}|${t.line}`))
          sqlTables.push({ ...t, procedureId });
      for (const d of detected.dynamic)
        if (once(`${procedureId}|*|${d.operation}|${d.line}`))
          dynamicSql.push({ ...d, procedureId });
      const { concatenated, parameterized } = detected;
      if (concatenated && once(`${procedureId}|&|${concatenated.line}`))
        concatenatedSql.push({ ...concatenated, procedureId });
      if (parameterized && once(`${procedureId}|:|${parameterized.line}`))
        parameterizedSql.push({ ...parameterized, procedureId });
    }
  const procedures = closed.map((procedure): ProcedureMetrics => ({
    id: procedure.id,
    kind: procedure.kind,
    name: procedure.name,
    visibility: procedure.visibility,
    startLine: procedure.startLine,
    endLine: procedure.endLine,
    physicalLines: procedure.endLine - procedure.startLine + 1,
    codeLines: procedure.codeLines,
    executableLines: procedure.executableLines,
    commentOnlyLines: procedure.commentOnlyLines,
    blankLines: procedure.blankLines,
    metadataLines: procedure.metadataLines,
    unclassifiedLines: procedure.unclassifiedLines,
    // A line counts once however many SQL texts it writes into; a piece
    // inlined from another variable counts where that literal is written.
    sqlLines: [...(sqlLinesByOwner.get(procedure.id) ?? [])].filter(
      (line) => line >= procedure.startLine && line <= procedure.endLine,
    ).length,
    decisionPoints: procedure.decisionPoints,
  }));
  const procedureCodeLines = procedures.reduce(
    (sum, procedure) => sum + procedure.codeLines,
    0,
  );
  return {
    analysis: {
      status: 'analyzed',
      counters,
      procedures,
      fileLevelCodeLines: counters.codeLines - procedureCodeLines,
      sqlTables,
      dynamicSql,
      concatenatedSql,
      parameterizedSql,
      externalDeclarations,
      labels,
    },
    references,
  };
}
