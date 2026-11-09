import type { ReportSignal } from '../language-analyzer.js';
import { vb6CodeStart, type Vb6ModuleKind } from './vb6-code-file.js';
import { lexVb6Line, type Vb6Continuation } from './vb6-line-lexer.js';

// Lexical detection of report outputs in VB6 code (screen-report-v1). A hit
// is evidence that code can produce a report, never proof of how many
// templates exist: comments and string contents are ignored by lexing, not
// by substring search.

const STRING_LITERAL = /"(?:[^"]|"")*"/g;
const RPT_FILE = /^(?:[^"]|"")*\.rpt\s*$/i;
const EXCEL_PROG_ID = /^excel\.application$/i;
const DECLARATION =
  /^(?:(?:public|private|friend|static)\s+)*(?:sub|function)\b/i;

// Keeps the quotes but blanks string contents, so patterns only see code.
const maskStrings = (code: string) =>
  code.replace(STRING_LITERAL, (text) => `"${' '.repeat(text.length - 2)}"`);

// The path of a .rpt literal as written, "/" separated.
function designPath(literal: string): {
  path: string;
  absolute: boolean;
  name: string;
} {
  const body = literal.slice(1, -1).replaceAll('""', '"').trim();
  // A leading single separator is what follows `App.Path &`: relative to the
  // application folder. A drive or UNC path is the author's machine.
  const path = body
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/(?!\/)/, '');
  const absolute = /^(?:[A-Za-z]:|\/\/)/.test(path);
  return {
    path,
    absolute,
    name: absolute ? (path.split('/').at(-1) ?? path) : path,
  };
}

function signalsOf(statement: string): Omit<ReportSignal, 'line'>[] {
  const masked = maskStrings(statement);
  if (DECLARATION.test(masked.trim())) return [];
  const found: Omit<ReportSignal, 'line'>[] = [];
  const literals = [...statement.matchAll(STRING_LITERAL)].map(
    (match) => match[0],
  );
  for (const literal of literals) {
    const body = literal.slice(1, -1);
    if (RPT_FILE.test(body)) {
      const design = designPath(literal);
      found.push({
        kind: 'crystal',
        name: design.name,
        path: design.path,
        absolute: design.absolute,
      });
    }
  }
  const excel =
    /(?<![\w.])(?:CreateObject|GetObject)\s*\([^)]*\)/gi.exec(masked) ??
    /(?<![\w.])New\s+Excel\s*\.\s*Application\b/i.exec(masked);
  if (excel) {
    const isNew = /New\s+Excel/i.test(excel[0]);
    const start = excel.index;
    const literal = literals.find((text) => {
      const at = statement.indexOf(text, start);
      return at >= start && at < start + excel[0].length;
    });
    if (isNew || (literal && EXCEL_PROG_ID.test(literal.slice(1, -1).trim())))
      found.push({ kind: 'excel', name: 'Excel.Application' });
  }
  if (/(?<![\w.])Printer\s*\.\s*(?:Print|EndDoc)\b/i.test(masked))
    found.push({ kind: 'print', name: 'Printer' });
  if (/(?<!\w)PrintForm\b/i.test(masked))
    found.push({ kind: 'print', name: 'PrintForm' });
  const open = /^\s*Open\b.*?\bFor\s+(Output|Append)\b/i.exec(masked);
  if (open) {
    const mode = open[1] ?? 'Output';
    found.push({
      kind: 'file-output',
      name: `Open For ${mode[0]?.toUpperCase()}${mode.slice(1).toLowerCase()}`,
    });
  }
  return found;
}

export function findVb6ReportSignals(
  lines: string[],
  options: { module: Vb6ModuleKind },
): ReportSignal[] {
  const signals: ReportSignal[] = [];
  let incoming: Vb6Continuation = 'none';
  let buffer: { text: string; line: number } | null = null;
  for (
    let index = vb6CodeStart(lines, options.module);
    index < lines.length;
    index += 1
  ) {
    const line = lexVb6Line(lines[index] ?? '', incoming);
    incoming = line.continuation;
    if (line.kind === 'code') {
      const text = line.code.replace(/\s_\s*$/, ' ');
      buffer = buffer
        ? { text: buffer.text + text, line: buffer.line }
        : { text, line: index + 1 };
    }
    if (buffer && line.continuation !== 'code') {
      // A statement may hold several ':'-separated statements; only the
      // whole text is matched, which is enough for the signals above.
      for (const part of buffer.text.split(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/))
        for (const signal of signalsOf(part))
          signals.push({ ...signal, line: buffer.line });
      buffer = null;
    }
  }
  return signals;
}

// A DataReport / ActiveReports designer (.dsr) starts a top-level
// `Begin {guid} DataReport <name>`; a DataEnvironment .dsr is not a report.
// Designer GUIDs of the report designers a .dsr can start with. The
// instance name that follows is the user's own (`Begin {guid} rptSales`).
const REPORT_DESIGNER_GUIDS = new Set(['78e93846-85fd-11d0-8487-00a0c90dc8a9']);
const DESIGNER_BEGIN = /^\s*Begin\s+\{([0-9A-Fa-f-]+)\}\s+(\S+)(?:\s+(\S+))?/;
// Older/other exports write the designer type before the instance name.
const REPORT_WORD = /^(?:DataReport|ActiveReport\d*)$/i;

export function detectVb6ReportDesigner(
  lines: string[],
): { line: number; name: string } | null {
  for (const [index, text] of lines.entries()) {
    const match = DESIGNER_BEGIN.exec(text);
    if (!match) continue;
    const [, guid = '', first = '', second] = match;
    // `Begin {guid} <Type> <Name>`: the type word names the designer.
    if (second !== undefined && REPORT_WORD.test(first))
      return { line: index + 1, name: second };
    // `Begin {guid} <Name>`: the designer type is the GUID.
    if (second === undefined && REPORT_DESIGNER_GUIDS.has(guid.toLowerCase()))
      return { line: index + 1, name: first };
  }
  return null;
}
