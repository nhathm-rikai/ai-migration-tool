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

// Words that make an output file a log or a temporary file, not a report.
// Matched on whole words of the path expression (camelCase and non-letters
// split it), so "catalog" and "template" are not excluded.
const NOT_A_REPORT_WORDS = new Set([
  'log',
  'logs',
  'logfile',
  'tmp',
  'temp',
  'debug',
  'err',
  'error',
  'trace',
]);
// Ordinary words that end with "log" and are not log files.
const NOT_LOG_WORDS = new Set([
  'catalog',
  'dialog',
  'analog',
  'backlog',
  'blog',
  'prolog',
  'epilog',
  'monolog',
  'travelog',
]);
function excludeReasonOf(pathExpression: string): string | undefined {
  const words = pathExpression
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word !== '');
  const word = words.find(
    (word) =>
      NOT_A_REPORT_WORDS.has(word) ||
      // A file name that ends with the word: "syslog", "errlog", "worktmp".
      (/(?:log|tmp|temp)$/.test(word) &&
        ![...NOT_LOG_WORDS].some((plain) => word.endsWith(plain))),
  );
  if (word === undefined) return undefined;
  // The reason is a category, never the matched name.
  if (/log|trace/.test(word)) return 'log';
  if (/tmp|temp/.test(word)) return 'temp';
  if (/debug/.test(word)) return 'debug';
  return 'error';
}

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
    // The path expression is what the statement writes between Open and For
    // (read from the unmasked text: its strings carry the file name).
    const expression =
      /^\s*Open\s+(.+?)\s+For\s+(?:Output|Append)\b/i.exec(statement)?.[1] ??
      '';
    const excludeReason = excludeReasonOf(expression);
    found.push({
      kind: 'file-output',
      name: `Open For ${mode[0]?.toUpperCase()}${mode.slice(1).toLowerCase()}`,
      ...(/\.csv\b/i.test(expression) ? { subkind: 'csv' as const } : {}),
      ...(excludeReason ? { excludeReason } : {}),
    });
  }
  // Excel started as a program: Shell "...EXCEL.EXE ...".
  if (
    /(?<![\w.])Shell\b/i.test(masked) &&
    literals.some((text) => /excel/i.test(text))
  )
    found.push({ kind: 'excel', name: 'EXCEL.EXE' });
  // Excel through its object model, a workbook file, or an ADO Excel source.
  if (/(?<!\w)Workbooks\s*\.\s*(?:Add|Open)\b/i.test(masked))
    found.push({ kind: 'excel', name: 'Workbooks' });
  if (literals.some((text) => /\.xls[xmb]?\s*"$/i.test(text)))
    found.push({ kind: 'excel', name: 'Excel file' });
  if (literals.some((text) => /\bExcel\s+\d+\.\d+/i.test(text)))
    found.push({ kind: 'excel', name: 'Excel (ADO)' });
  return found;
}

// A one-line If holds statements of its own after Then / Else: those are read
// as statements. Any other statement is read as it is.
function statementsOf(statement: string): string[] {
  const masked = maskStrings(statement);
  const head = /^\s*(?:If|ElseIf)\b.*?\bThen\b/i.exec(masked);
  if (!head) return [statement];
  const rest = statement.slice(head[0].length);
  const maskedRest = masked.slice(head[0].length);
  const at = maskedRest.search(/\bElse\b/i);
  const parts = at < 0 ? [rest] : [rest.slice(0, at), rest.slice(at + 4)];
  return parts.flatMap((part) =>
    part.trim() === '' ? [] : statementsOf(part),
  );
}

// Evidence that code WRITES to Excel (opening or reading it is not an output).
// Only a write on an object known to be Excel counts: a variable declared As
// Excel.* or set from CreateObject/GetObject("Excel.Application"), New
// Excel.Application, Workbooks.Add/Open, or from another Excel object; the
// block of a With on such an object; INSERT / UPDATE only when the file has an
// Excel ADO source (file level). So rs.Save, Text1.Value = 1, a grid's Cells or
// an UPDATE on an ordinary database are not Excel writes.
const EXCEL_DECLARED =
  /([A-Za-z_]\w*)(?:\s*\([^)]*\))?\s+As\s+(?:New\s+)?(?:Excel\s*\.\s*(?:Application|Workbooks?|Worksheets?|Range)|Workbooks?|Worksheets?)\b/gi;
const STATEMENT_ROOT = /^\s*(?:Call\s+)?(\.|[A-Za-z_]\w*)/i;
const CELL_TARGET = /\.\s*(?:Cells|Range|Item|Value2?|Formula)\b/i;

class ExcelWrites {
  private readonly objects = new Set<string>();
  private readonly withs: boolean[] = [];
  private adoSource = false;
  private sqlWrite = false;
  private written = false;

  get any(): boolean {
    return this.written || (this.adoSource && this.sqlWrite);
  }

  private isExcel(expression: string): boolean {
    const root = STATEMENT_ROOT.exec(expression)?.[1];
    if (root === undefined) return false;
    return root === '.'
      ? this.withs[this.withs.length - 1] === true
      : this.objects.has(root.toLowerCase());
  }

  read(statement: string): void {
    const masked = maskStrings(statement);
    for (const match of masked.matchAll(EXCEL_DECLARED))
      this.objects.add((match[1] ?? '').toLowerCase());
    for (const literal of statement.matchAll(STRING_LITERAL)) {
      const text = literal[0];
      if (
        /\bExcel\s+\d+\.\d+/i.test(text) ||
        /Extended\s+Properties\s*=\s*"?\s*Excel/i.test(text)
      )
        this.adoSource = true;
      if (/^"\s*(?:insert\s+into|update\s+\S+\s+set)\b/i.test(text))
        this.sqlWrite = true;
    }
    const withBlock = /^\s*With\s+(.+)$/i.exec(masked);
    if (withBlock) {
      this.withs.push(this.isExcel(withBlock[1] ?? ''));
      return;
    }
    if (/^\s*End\s+With\b/i.test(masked)) {
      this.withs.pop();
      return;
    }
    const set = /^\s*Set\s+([A-Za-z_]\w*)\s*=\s*(.+)$/i.exec(masked);
    if (set) {
      const rhs = set[2] ?? '';
      if (
        signalsOf(statement).some((s) => s.name === 'Excel.Application') ||
        this.isExcel(rhs) ||
        /(?<!\w)Workbooks\s*\.\s*(?:Add|Open)\b/i.test(rhs)
      )
        this.objects.add((set[1] ?? '').toLowerCase());
    }
    if (/(?<!\w)Workbooks\s*\.\s*Add\b/i.test(masked)) this.written = true;
    if (/^\s*Set\b/i.test(masked)) return;
    if (
      /\.\s*(?:SaveAs|SaveCopyAs|Save)\b/i.test(masked) &&
      this.isExcel(masked)
    )
      this.written = true;
    // A cell, range or value assigned (the first "=" of the statement).
    const equals = masked.search(/(?<![<>=!])=(?!=)/);
    if (equals > 0) {
      const target = masked.slice(0, equals);
      if (CELL_TARGET.test(target) && this.isExcel(target)) this.written = true;
    }
  }
}

// A write that makes the file comma separated: Write # (the statement
// separates the fields with commas) or Print # with a "," between values.
function writesCsv(statement: string): boolean {
  const masked = maskStrings(statement);
  if (/^\s*Write\s+#/i.test(masked)) return true;
  if (!/^\s*Print\s+#/i.test(masked)) return false;
  return [...statement.matchAll(STRING_LITERAL)].some(
    (match) => match[0].slice(1, -1).trim() === ',',
  );
}
const ENDS_PROCEDURE = /^\s*End\s+(?:Sub|Function|Property)\b/i;
// Write # / Print # to a handle, and Open ... As #handle (a number or a variable).
const HANDLE_WRITE = /^\s*(?:Write|Print)\s+#\s*([A-Za-z_]\w*|\d+)/i;
const HANDLE_OPEN = /^\s*Open\b.*?\bAs\s+#?\s*([A-Za-z_]\w*|\d+)/i;

export function findVb6ReportSignals(
  lines: string[],
  options: { module: Vb6ModuleKind },
): ReportSignal[] {
  const signals: ReportSignal[] = [];
  // The files the procedure being read has open For Output / Append, by file
  // handle (#1, or a variable from FreeFile): a Write # or a comma separated
  // Print # makes the file of ITS handle CSV, whichever file was opened last.
  const opens = new Map<string, ReportSignal>();
  // Excel signals count only when the file writes to an Excel object.
  const excel = new ExcelWrites();
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
      for (const part of buffer.text.split(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
        // A one-line If holds statements of its own after Then / Else.
        let handle: string | undefined;
        for (const body of statementsOf(part)) {
          excel.read(body);
          const masked = maskStrings(body);
          if (/^\s*Close\b/i.test(masked)) {
            // Close #1, #2 closes those; a bare Close closes every file.
            const handles = masked
              .replace(/^\s*Close\b/i, '')
              .split(',')
              .map((token) => token.replace(/#/g, '').trim().toLowerCase())
              .filter(Boolean);
            if (handles.length === 0) opens.clear();
            for (const closed of handles) opens.delete(closed);
          } else if (
            ENDS_PROCEDURE.test(masked) ||
            DECLARATION.test(masked.trim()) ||
            /^\s*Reset\b/i.test(masked)
          )
            opens.clear();
          else {
            const target = HANDLE_WRITE.exec(masked)?.[1]?.toLowerCase();
            const open = target === undefined ? undefined : opens.get(target);
            if (open && !open.excludeReason && writesCsv(body))
              open.subkind = 'csv';
          }
          const opened = HANDLE_OPEN.exec(masked)?.[1]?.toLowerCase();
          // Reopening a handle for anything else forgets the old file.
          if (opened !== undefined) {
            opens.delete(opened);
            handle = opened;
          }
        }
        for (const signal of signalsOf(part)) {
          const found: ReportSignal = { ...signal, line: buffer.line };
          signals.push(found);
          if (found.kind === 'file-output' && handle !== undefined)
            opens.set(handle, found);
        }
      }
      buffer = null;
    }
  }
  // Opening, starting or reading Excel is not an output.
  return excel.any
    ? signals
    : signals.filter((signal) => signal.kind !== 'excel');
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
