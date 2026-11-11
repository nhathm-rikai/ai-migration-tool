import type { ReportSignal } from '../language-analyzer.js';
import { vb6CodeStart, type Vb6ModuleKind } from './vb6-code-file.js';
import { lexVb6Line, type Vb6Continuation } from './vb6-line-lexer.js';

// Lexical detection of report outputs in VB6 code (AR04). A hit
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
export const maskStrings = (code: string) =>
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

// A one-line If is read as its condition and the statements after Then / Else,
// each a statement of its own. Any other statement is read as it is.
function statementsOf(statement: string): string[] {
  const masked = maskStrings(statement);
  const head = /^\s*(?:If|ElseIf)\b.*?\bThen\b/i.exec(masked);
  if (!head) return [statement];
  const rest = statement.slice(head[0].length);
  const maskedRest = masked.slice(head[0].length);
  const at = maskedRest.search(/\bElse\b/i);
  const parts = at < 0 ? [rest] : [rest.slice(0, at), rest.slice(at + 4)];
  return [
    statement.slice(0, head[0].length),
    ...parts.flatMap((part) => (part.trim() === '' ? [] : statementsOf(part))),
  ];
}

// Evidence that code WRITES to Excel (opening or reading it is not an output).
// One pass over the split statements with a symbol table per procedure:
//  - a variable declared in a procedure (Dim/Static, a parameter with or
//    without a type) is that procedure's own: it hides a module variable of
//    the same name and is forgotten at End Sub; an undeclared name that a
//    module declares is the module's variable;
//  - what a name holds is what it was last declared or set to before the
//    statement: Set again, Set ... = Nothing, a connection opened again with
//    another connection string, a recordset or command tied to another
//    connection all change it.
// A write counts only as a CALL that writes:
//  - on an Excel object (declared As Excel.*, or set from CreateObject /
//    GetObject("Excel.Application"), New Excel.Application, Workbooks.Add/Open
//    or another Excel object, or a With on one): Save/SaveAs, a cell, range or
//    Value assigned, Workbooks.Add;
//  - on an Excel ADO connection (its connection string has an Excel source):
//    Execute / Open of an INSERT, UPDATE or DELETE run on that connection or
//    on a recordset or command tied to it (a command by its CommandText), and
//    AddNew / Update / Delete / UpdateBatch of a recordset opened on it.
// Printing a SQL text, or a variable next to a connection, is not a call.
type Kind =
  | 'excel'
  | 'conn'
  | 'excel-conn'
  | 'excel-rs'
  | 'excel-string'
  | 'sql'
  | 'other';
const EXCEL_TYPE =
  /^(?:Excel\.(?:Application|Workbooks?|Worksheets?|Range)|Workbooks?|Worksheets?)$/i;
const CONNECTION_TYPE = /^(?:ADODB\.)?Connection$/i;
const DECLARING =
  /^\s*(?:Dim|ReDim|Static|Public|Private|Global|Friend|Sub|Function|Property)\b/i;
const PROCEDURE_START =
  /^(?:(?:public|private|friend|static)\s+)*(?:sub|function|property\s+(?:get|let|set))\b/i;
const STATEMENT_ROOT = /^\s*(?:Call\s+)?(\.|[A-Za-z_]\w*)/i;
// What is assigned must BE a cell, a range or a value: the target ends with
// Cells(..), Range(..), Item(..), Offset(..), .Value or .Formula, so a format
// (.Interior.Color, .Font.Bold, .ColumnWidth) is not a write.
const CELL_TARGET =
  /(?:\.\s*(?:Cells|Range|Item|Offset)\s*\(.*\)|\.\s*(?:Value2?|Formula\w*))\s*$/i;
// A call that puts data into Excel from an Excel object.
const FILLS_EXCEL = /\.\s*(?:CopyFromRecordset|PasteSpecial|Paste)\b/i;
const EXCEL_SOURCE =
  /\bExcel\s+\d+\.\d+|Extended\s+Properties\s*=\s*"?\s*Excel|\.xls[xmb]?\b/i;
const SQL_WRITE = /^"\s*(?:insert\s+into|update\s+\S+\s+set|delete\s+from)\b/i;

// The comma separated items of the first level of a list.
function listItems(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      items.push(text.slice(start, at));
      start = at + 1;
    }
  }
  items.push(text.slice(start));
  return items;
}

// The position of the "=" that assigns, at parenthesis depth 0 (strings are
// already blanked); -1 when the statement assigns nothing.
function assignmentAt(masked: string): number {
  let depth = 0;
  for (let at = 0; at < masked.length; at += 1) {
    const char = masked[at];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (
      char === '=' &&
      depth === 0 &&
      !'<>=!'.includes(masked[at - 1] ?? ' ') &&
      masked[at + 1] !== '='
    )
      return at;
  }
  return -1;
}

class ExcelWrites {
  private readonly modules = new Map<string, Kind>();
  private locals = new Map<string, Kind>();
  private readonly commandText = new Set<string>();
  private inProcedure = false;
  private readonly withs: boolean[] = [];
  private written = false;

  get any(): boolean {
    return this.written;
  }

  private kindOf(name: string): Kind | undefined {
    const key = name.toLowerCase();
    return this.locals.get(key) ?? this.modules.get(key);
  }

  private declare(name: string, kind: Kind): void {
    (this.inProcedure ? this.locals : this.modules).set(
      name.toLowerCase(),
      kind,
    );
  }

  // An assignment changes the variable the name means here: the procedure's
  // own, else the module's, else a new procedure variable.
  private assign(name: string, kind: Kind): void {
    const key = name.toLowerCase();
    if (this.locals.has(key) || !this.modules.has(key))
      (this.inProcedure ? this.locals : this.modules).set(key, kind);
    else this.modules.set(key, kind);
  }

  private isExcel(expression: string): boolean {
    const root = STATEMENT_ROOT.exec(expression)?.[1];
    if (root === undefined) return false;
    return root === '.'
      ? this.withs[this.withs.length - 1] === true
      : this.kindOf(root) === 'excel';
  }

  // Dim / Static / module declarations and the parameters of a procedure:
  // every name is declared, typed or not (an untyped one is unknown).
  private declareNames(masked: string): void {
    let list: string;
    if (PROCEDURE_START.test(masked.trim())) {
      const open = masked.indexOf('(');
      if (open < 0) return;
      let depth = 0;
      let end = masked.length;
      for (let at = open; at < masked.length; at += 1) {
        if (masked[at] === '(') depth += 1;
        else if (masked[at] === ')') {
          depth -= 1;
          if (depth === 0) {
            end = at;
            break;
          }
        }
      }
      list = masked.slice(open + 1, end);
    } else
      list = masked.replace(
        /^\s*(?:(?:Public|Private|Friend|Static|Global)\s+)*(?:Dim|ReDim|Static|Public|Private|Global)\s+/i,
        '',
      );
    for (const item of listItems(list)) {
      const match =
        /^\s*(?:Optional\s+|ByVal\s+|ByRef\s+|ParamArray\s+|WithEvents\s+)*([A-Za-z_]\w*)(?:\(\s*\d*\s*\))?(?:\s+As\s+(?:New\s+)?([A-Za-z_][\w.]*))?/i.exec(
          item,
        );
      if (!match) continue;
      const type = match[2] ?? '';
      this.declare(
        match[1] ?? '',
        EXCEL_TYPE.test(type)
          ? 'excel'
          : CONNECTION_TYPE.test(type)
            ? 'conn'
            : 'other',
      );
    }
  }

  // True when the statement is a write to Excel.
  read(statement: string): boolean {
    const masked = maskStrings(statement);
    if (/^\s*End\s+(?:Sub|Function|Property)\b/i.test(masked)) {
      this.locals = new Map();
      this.commandText.clear();
      this.withs.length = 0;
      this.inProcedure = false;
      return false;
    }
    if (PROCEDURE_START.test(masked.trim())) {
      this.locals = new Map();
      this.commandText.clear();
      this.withs.length = 0;
      this.inProcedure = true;
    }
    if (DECLARING.test(masked)) this.declareNames(masked);
    const literals = [...statement.matchAll(STRING_LITERAL)].map((m) => m[0]);
    const identifiers = (masked.match(/[A-Za-z_]\w*/g) ?? []).map((word) =>
      word.toLowerCase(),
    );
    const kinds = (list: string[]) => list.map((word) => this.kindOf(word));
    const excelSource =
      literals.some((text) => EXCEL_SOURCE.test(text)) ||
      kinds(identifiers).includes('excel-string');
    const sqlWrite =
      literals.some((text) => SQL_WRITE.test(text)) ||
      kinds(identifiers).includes('sql');
    const onExcelConnection = (list: string[]) =>
      kinds(list).some((kind) => kind === 'excel-conn' || kind === 'excel-rs');
    const withBlock = /^\s*With\s+(.+)$/i.exec(masked);
    if (withBlock) {
      this.withs.push(this.isExcel(withBlock[1] ?? ''));
      return false;
    }
    if (/^\s*End\s+With\b/i.test(masked)) {
      this.withs.pop();
      return false;
    }
    let wrote = /(?<!\w)Workbooks\s*\.\s*Add\b/i.test(masked);
    const set = /^\s*Set\s+([A-Za-z_]\w*)\s*=\s*(.+)$/i.exec(masked);
    if (set) {
      const rhs = set[2] ?? '';
      const alias = /^\s*([A-Za-z_]\w*)\s*$/.exec(rhs)?.[1];
      const aliased = alias === undefined ? undefined : this.kindOf(alias);
      this.assign(
        set[1] ?? '',
        signalsOf(statement).some((s) => s.name === 'Excel.Application') ||
          this.isExcel(rhs) ||
          /(?<!\w)Workbooks\s*\.\s*(?:Add|Open)\b/i.test(rhs)
          ? 'excel'
          : /\bADODB\s*\.\s*Connection\b/i.test(rhs)
            ? 'conn'
            : aliased === 'conn' ||
                aliased === 'excel-conn' ||
                aliased === 'excel-rs'
              ? aliased
              : 'other',
      );
    }
    // A string that holds an Excel connection string or an INSERT / UPDATE.
    const text =
      /^\s*(?:(?:Let|Public|Private|Global|Static|Dim|Const)\s+)*([A-Za-z_]\w*)(?:\s+As\s+\w+)?\s*=(?!=)\s*(.+)$/i.exec(
        masked,
      );
    if (text)
      this.assign(
        text[1] ?? '',
        excelSource
          ? 'excel-string'
          : SQL_WRITE.test(literals[0] ?? '') ||
              kinds(identifiers.slice(1)).includes('sql')
            ? 'sql'
            : 'other',
      );
    // A connection, recordset or command configured: its kind is what the
    // LAST configuration before a statement made it.
    const configured =
      /^\s*(?:Call\s+|Set\s+)?([A-Za-z_]\w*)\s*\.\s*(Open|ConnectionString|ActiveConnection)\b/i.exec(
        masked,
      );
    if (configured) {
      const name = configured[1] ?? '';
      const member = (configured[2] ?? '').toLowerCase();
      const others = identifiers.filter((word) => word !== name.toLowerCase());
      const now = this.kindOf(name);
      if (member === 'activeconnection')
        this.assign(
          name,
          onExcelConnection(others) || excelSource ? 'excel-rs' : 'other',
        );
      else if (excelSource && !onExcelConnection(others))
        this.assign(name, 'excel-conn');
      else if (member === 'open' && onExcelConnection(others))
        this.assign(name, 'excel-rs');
      else if (member === 'open' && kinds(others).includes('conn'))
        this.assign(name, 'other');
      else if (now === 'excel-conn') this.assign(name, 'conn');
    }
    const commandText = /^\s*([A-Za-z_]\w*)\s*\.\s*CommandText\s*=/i.exec(
      masked,
    )?.[1];
    if (commandText !== undefined) {
      if (sqlWrite) this.commandText.add(commandText.toLowerCase());
      else this.commandText.delete(commandText.toLowerCase());
    }
    // A call that runs an INSERT / UPDATE / DELETE on an Excel connection.
    const call =
      /(?<![\w.])([A-Za-z_]\w*)\s*\.\s*(Execute|Open|UpdateBatch|AddNew|Update|Delete)\b/i.exec(
        masked,
      );
    if (call) {
      const root = call[1] ?? '';
      const method = (call[2] ?? '').toLowerCase();
      const others = identifiers.filter((word) => word !== root.toLowerCase());
      const rootKind = this.kindOf(root);
      const tied =
        rootKind === 'excel-conn' ||
        rootKind === 'excel-rs' ||
        onExcelConnection(others);
      if (
        (method === 'execute' || method === 'open') &&
        tied &&
        (sqlWrite ||
          (method === 'execute' && this.commandText.has(root.toLowerCase())))
      )
        wrote = true;
      if (
        (method === 'updatebatch' ||
          method === 'addnew' ||
          method === 'update' ||
          method === 'delete') &&
        rootKind === 'excel-rs'
      )
        wrote = true;
    }
    if (/^\s*Set\b/i.test(masked)) {
      if (wrote) this.written = true;
      return wrote;
    }
    if (
      /\.\s*(?:SaveAs|SaveCopyAs|Save)\b/i.test(masked) &&
      this.isExcel(masked)
    )
      wrote = true;
    // Data pasted or copied in from a recordset (a template filled, no SaveAs).
    if (FILLS_EXCEL.test(masked) && this.isExcel(masked)) wrote = true;
    // A cell, range or value assigned (the "=" of the statement, outside any
    // parentheses: Cells(IIf(a = 1, 2, 3), 1).Value = x).
    const equals = assignmentAt(masked);
    if (equals > 0) {
      const target = masked.slice(0, equals);
      if (CELL_TARGET.test(target) && this.isExcel(target)) wrote = true;
    }
    if (wrote) this.written = true;
    return wrote;
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

// The statements of a code file in order, each with the line it starts on. A
// statement may hold several ':'-separated statements, and a one-line If is its
// condition and the statements after Then / Else, each of its own. Shared by
// every lexical reading of VB6 code that works statement by statement.
export function* vb6Statements(
  lines: string[],
  options: { module: Vb6ModuleKind },
): Generator<{ text: string; line: number }> {
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
      for (const part of buffer.text.split(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/))
        for (const body of statementsOf(part))
          yield { text: body, line: buffer.line };
      buffer = null;
    }
  }
}

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
  // The first line that writes to a known Excel object or connection.
  let firstWrite: number | undefined;
  for (const statement of vb6Statements(lines, options)) {
    const body = statement.text;
    if (excel.read(body)) firstWrite ??= statement.line;
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
      if (open && !open.excludeReason && writesCsv(body)) open.subkind = 'csv';
    }
    const handle = HANDLE_OPEN.exec(masked)?.[1]?.toLowerCase();
    // Reopening a handle for anything else forgets the old file.
    if (handle !== undefined) opens.delete(handle);
    for (const signal of signalsOf(body)) {
      const found: ReportSignal = { ...signal, line: statement.line };
      signals.push(found);
      if (found.kind === 'file-output' && handle !== undefined)
        opens.set(handle, found);
    }
  }
  // Opening, starting or reading Excel is not an output.
  if (!excel.any) return signals.filter((signal) => signal.kind !== 'excel');
  // A write on an Excel object known only by its declaration (a parameter
  // As Excel.Workbook) is a signal where it is written.
  if (firstWrite !== undefined && !signals.some((s) => s.kind === 'excel'))
    signals.push({ kind: 'excel', name: 'Excel', line: firstWrite });
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
