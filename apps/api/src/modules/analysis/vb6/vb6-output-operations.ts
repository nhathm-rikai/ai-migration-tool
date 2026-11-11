import type { OutputOperation } from '../language-analyzer.js';
import type { Vb6ModuleKind } from './vb6-code-file.js';
import { maskStrings, vb6Statements } from './vb6-report-signals.js';

// Lexical count of the statements that print or draw on a printer or a report
// object, and of calls by name (AR06). One statement is one operation: a
// statement in a loop is counted once, never by how often it runs.
//
// What is a printer or a report object here:
//  - the global `Printer` object, and `Printers(...)` items;
//  - a variable declared As Printer, As DataReport or As a Crystal report
//    (CRAXDRT.Report, CRAXDDRT.Report), or set from Printer / Printers(...);
//  - the object of a With block on one of these.
// Everything else that has a Print, Line, Circle, PSet or CurrentX of the same
// name draws on the screen or writes a file and is NOT counted: Debug.Print,
// Me.Print, Picture1.Print, a bare Print / Line (a form's own), Print #n.

const PRINT_TYPE = /^(?:Printer|DataReport|(?:CRAXD?DRT\.)?Report)$/i;
const DECLARING =
  /^\s*(?:Dim|ReDim|Static|Public|Private|Global|Friend|Sub|Function|Property)\b/i;
const PROCEDURE_START =
  /^(?:(?:public|private|friend|static)\s+)*(?:sub|function|property\s+(?:get|let|set))\b/i;
const END_PROCEDURE = /^\s*End\s+(?:Sub|Function|Property)\b/i;
const SET_FROM_PRINTER =
  /^\s*Set\s+([A-Za-z_]\w*)\s*=\s*(?:Printer\b|Printers\s*\()/i;

const MEMBER_GROUP: Record<string, OutputOperation['group']> = {
  print: 'content',
  line: 'drawing',
  circle: 'drawing',
  pset: 'drawing',
  currentx: 'position',
  currenty: 'position',
  textwidth: 'position',
  textheight: 'position',
};
const MEMBERS = 'Print|Line|Circle|PSet|CurrentX|CurrentY|TextWidth|TextHeight';

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

const countOf = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].length;

export function findVb6OutputOperations(
  lines: string[],
  options: { module: Vb6ModuleKind },
): OutputOperation[] {
  const operations: OutputOperation[] = [];
  const modules = new Set<string>();
  let locals = new Set<string>();
  let inProcedure = false;
  const withs: boolean[] = [];
  const isPrinter = (name: string) =>
    name.toLowerCase() === 'printer' ||
    locals.has(name.toLowerCase()) ||
    modules.has(name.toLowerCase());
  const add = (
    line: number,
    group: OutputOperation['group'],
    count: number,
  ) => {
    for (let n = 0; n < count; n += 1) operations.push({ line, group });
  };
  const declare = (name: string) =>
    (inProcedure ? locals : modules).add(name.toLowerCase());

  for (const { text, line } of vb6Statements(lines, options)) {
    const masked = maskStrings(text);
    if (END_PROCEDURE.test(masked)) {
      locals = new Set();
      withs.length = 0;
      inProcedure = false;
      continue;
    }
    if (PROCEDURE_START.test(masked.trim())) {
      locals = new Set();
      withs.length = 0;
      inProcedure = true;
    }
    // Declarations and parameters: a name typed as a printer / report object.
    if (DECLARING.test(masked)) {
      let list: string;
      if (PROCEDURE_START.test(masked.trim())) {
        const open = masked.indexOf('(');
        const close = masked.lastIndexOf(')');
        list =
          open < 0 ? '' : masked.slice(open + 1, close < 0 ? undefined : close);
      } else
        list = masked.replace(
          /^\s*(?:(?:Public|Private|Friend|Static|Global)\s+)*(?:Dim|ReDim|Static|Public|Private|Global)\s+/i,
          '',
        );
      for (const item of listItems(list)) {
        const match =
          /^\s*(?:Optional\s+|ByVal\s+|ByRef\s+|ParamArray\s+|WithEvents\s+)*([A-Za-z_]\w*)(?:\(\s*\d*\s*\))?\s+As\s+(?:New\s+)?([A-Za-z_][\w.]*)/i.exec(
            item,
          );
        if (match && PRINT_TYPE.test(match[2] ?? '')) declare(match[1] ?? '');
      }
      continue;
    }
    const withBlock = /^\s*With\s+(.+?)\s*$/i.exec(masked);
    if (withBlock) {
      const target = withBlock[1] ?? '';
      withs.push(
        /^Printer$/i.test(target) ||
          /^Printers\s*\(/i.test(target) ||
          (/^[A-Za-z_]\w*$/.test(target) && isPrinter(target)),
      );
      continue;
    }
    if (/^\s*End\s+With\b/i.test(masked)) {
      withs.pop();
      continue;
    }
    const aliased = SET_FROM_PRINTER.exec(masked)?.[1];
    if (aliased !== undefined) declare(aliased);

    // PrintForm prints the form on the printer.
    add(line, 'content', countOf(masked, /(?<!\w)PrintForm\b/gi));
    // Printer.Print / p.Line ...: the object is a printer or report object.
    const member = new RegExp(
      `(?<![\\w.])([A-Za-z_]\\w*)\\s*\\.\\s*(${MEMBERS})\\b`,
      'gi',
    );
    for (const match of masked.matchAll(member)) {
      if (!isPrinter(match[1] ?? '')) continue;
      const group = MEMBER_GROUP[(match[2] ?? '').toLowerCase()];
      if (group) operations.push({ line, group });
    }
    // Inside With Printer: the statement starts with ".Print", ".Line" ...
    if (withs.at(-1) === true) {
      const lead = new RegExp(`^\\s*\\.\\s*(${MEMBERS})\\b`, 'i').exec(masked);
      const group = MEMBER_GROUP[(lead?.[1] ?? '').toLowerCase()];
      if (group) operations.push({ line, group });
    }
    add(line, 'dynamic-call', countOf(masked, /(?<![\w.])CallByName\b/gi));
  }
  return operations;
}
