import type {
  CodeFileAnalysis,
  CodeReference,
  DynamicSqlFact,
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
const DECLARE =
  /^(?:(public|private|global)\s+)?declare\s+(?:sub|function)\s+([A-Za-z][A-Za-z0-9_]*)\s+lib\s+"([^"]*)"/i;

const FORM_VERSION = /^version\s+\d/i;
const CLASS_VERSION = /^version\s+\d+\.\d+\s+class$/i;
// A class header opens with a bare BEGIN; form controls name a type.
const DESIGNER_BEGIN = /^(?:begin|beginproperty)(?:\s|$)/i;
const DESIGNER_END = /^(?:end|endproperty)$/i;
const FORM_NAME_ATTRIBUTE = /^attribute\s+vb_name\s*=/i;

const HEADERS: Record<
  Exclude<Vb6ModuleKind, 'standard'>,
  { version: RegExp; notFound: string }
> = {
  form: { version: FORM_VERSION, notFound: 'FORM_DESIGNER_BOUNDARY_NOT_FOUND' },
  class: {
    version: CLASS_VERSION,
    notFound: 'CLASS_HEADER_BOUNDARY_NOT_FOUND',
  },
};

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

// The designer of an exported form, or the header of an exported class, runs
// from VERSION to the line before the top-level `Attribute VB_Name`;
// Begin/End nesting must be balanced there.
function findDesignerEnd(lines: string[], version: RegExp): number | null {
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first < 0 || !version.test(lines[first]?.trim() ?? '')) return null;
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
  if (options.module !== 'standard') {
    const header = HEADERS[options.module];
    const designerEnd = findDesignerEnd(lines, header.version);
    if (designerEnd === null) return unsupported(header.notFound, null);
    counters.designerLines = designerEnd;
    codeStart = designerEnd;
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

  for (let index = codeStart; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const lexed = lexVb6Line(lines[index] ?? '', incoming);
    const isMetadata: boolean =
      (metadataContinues && incoming === 'code') ||
      (lexed.kind === 'code' && ATTRIBUTE.test(lexed.firstStatement ?? ''));
    metadataContinues = isMetadata && lexed.continuation === 'code';
    incoming = lexed.continuation;

    if (isMetadata) {
      counters.metadataLines += 1;
      continue;
    }
    if (lexed.kind === 'blank') counters.blankLines += 1;
    else if (lexed.kind === 'comment') counters.commentOnlyLines += 1;
    else if (lexed.kind === 'unclassified') counters.unclassifiedLines += 1;
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
          codeLines: 0,
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
    if (owner) {
      owner.codeLines += 1;
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
  // A value inlined into another (strSQL = strSELECT & strFROM) is also
  // emitted on its own; the same fact is kept once.
  const seen = new Set<string>();
  const once = (key: string) => !seen.has(key) && Boolean(seen.add(key));
  for (const [procedureId, units] of sqlByOwner)
    for (const segments of units) {
      const detected = detectSqlAccess(segments);
      for (const t of detected.tables)
        if (once(`${procedureId}|${t.table}|${t.operation}|${t.line}`))
          sqlTables.push({ ...t, procedureId });
      for (const d of detected.dynamic)
        if (once(`${procedureId}|*|${d.operation}|${d.line}`))
          dynamicSql.push({ ...d, procedureId });
    }
  const procedures = closed.map((procedure): ProcedureMetrics => ({
    id: procedure.id,
    kind: procedure.kind,
    name: procedure.name,
    visibility: procedure.visibility,
    startLine: procedure.startLine,
    endLine: procedure.endLine,
    codeLines: procedure.codeLines,
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
      externalDeclarations,
      labels,
    },
    references,
  };
}
