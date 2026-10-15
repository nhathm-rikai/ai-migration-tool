import type {
  CodeFileAnalysis,
  LineCounters,
  ProcedureMetrics,
} from '../language-analyzer.js';
import { lexVb6Line, type Vb6Continuation } from './vb6-line-lexer.js';

// Counts metric vb6-physical-code-v1 for one .bas/.frm and splits procedures
// (specs/source-analysis.md §4).

const ATTRIBUTE = /^attribute\s/i;
const PROCEDURE_START =
  /^(?:(?:public|private|friend|static)\s+)*(sub|function|property\s+(?:get|let|set))\s+([A-Za-z][A-Za-z0-9_]*)/i;
const PROCEDURE_END = /^end\s+(sub|function|property)\b/i;

const FORM_VERSION = /^version\s+\d/i;
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
  options: { form: boolean },
): CodeFileAnalysis {
  const counters = emptyCounters(lines.length);
  let codeStart = 0;
  if (options.form) {
    const designerEnd = findDesignerEnd(lines);
    if (designerEnd === null)
      return {
        status: 'unsupported',
        reason: 'FORM_DESIGNER_BOUNDARY_NOT_FOUND',
        line: null,
      };
    counters.designerLines = designerEnd;
    codeStart = designerEnd;
  }

  const closed: OpenProcedure[] = [];
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
    if (lexed.kind !== 'code') continue;

    counters.codeLines += 1;
    // A physical line counts once, for the procedure open at its start or
    // the first one opened on it; `x = 1: End Sub` still closes the block.
    let owner: OpenProcedure | null = open;
    for (const text of lexed.statementStarts) {
      const start = PROCEDURE_START.exec(text);
      const end = PROCEDURE_END.exec(text);
      if (start) {
        if (open)
          return {
            status: 'unsupported',
            reason: 'PROCEDURE_NOT_CLOSED',
            line: lineNumber,
          };
        const kind = procedureKind(start[1] ?? '');
        const name = start[2] ?? '';
        open = {
          id: `${relativePath}#${kind}:${name}`,
          kind,
          name,
          startLine: lineNumber,
          endLine: lineNumber,
          codeLines: 0,
          block: kind.split('-')[0] ?? kind,
        };
        owner ??= open;
      } else if (end) {
        if (!open || open.block !== end[1]?.toLowerCase())
          return {
            status: 'unsupported',
            reason: 'PROCEDURE_END_UNMATCHED',
            line: lineNumber,
          };
        open.endLine = lineNumber;
        closed.push(open);
        open = null;
      }
    }
    if (owner) owner.codeLines += 1;
  }
  if (open)
    return {
      status: 'unsupported',
      reason: 'PROCEDURE_NOT_CLOSED',
      line: open.startLine,
    };

  const procedures = closed.map(
    ({ id, kind, name, startLine, endLine, codeLines }): ProcedureMetrics => ({
      id,
      kind,
      name,
      startLine,
      endLine,
      codeLines,
    }),
  );
  const procedureCodeLines = procedures.reduce(
    (sum, procedure) => sum + procedure.codeLines,
    0,
  );
  return {
    status: 'analyzed',
    counters,
    procedures,
    fileLevelCodeLines: counters.codeLines - procedureCodeLines,
  };
}
