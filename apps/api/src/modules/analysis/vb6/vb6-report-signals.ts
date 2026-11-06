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

function fileName(literal: string): string {
  const body = literal.slice(1, -1).replaceAll('""', '"').trim();
  return body.split(/[\\/]/).at(-1) ?? body;
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
    if (RPT_FILE.test(body))
      found.push({ kind: 'crystal', name: fileName(literal) });
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
const REPORT_DESIGNER =
  /^\s*Begin\s+\{[0-9A-Fa-f-]+\}\s+(?:DataReport|ActiveReport\d*)\s+(\S+)/i;

export function detectVb6ReportDesigner(
  lines: string[],
): { line: number; name: string } | null {
  for (const [index, text] of lines.entries()) {
    const match = REPORT_DESIGNER.exec(text);
    if (match) return { line: index + 1, name: match[1] ?? '' };
  }
  return null;
}
