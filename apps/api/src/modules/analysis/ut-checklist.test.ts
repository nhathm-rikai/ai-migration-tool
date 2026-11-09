import { describe, expect, it } from 'vitest';
import { buildSourceInventory } from './source-inventory.js';
import { findSourceProfile } from './source-profiles.js';
import { buildUtChecklist, UT_CHECKLIST_VERSION } from './ut-checklist.js';

// TC01-AC01: the deterministic checklist the agent must cover. Fixtures are
// written for this test; nothing comes from customer source.
const profile = findSourceProfile('vb6-cp932-v1');
if (!profile) throw new Error('profile missing');

type TestFile = { relativePath: string; bytes: Uint8Array };
const file = (relativePath: string, ...lines: string[]): TestFile => ({
  relativePath,
  bytes: new TextEncoder().encode(lines.join('\r\n') + '\r\n'),
});
const sub = (name: string, ...body: string[]) => [
  `Public Sub ${name}()`,
  ...body,
  'End Sub',
];

const files: TestFile[] = [
  file('a/A.vbp', 'Type=Exe', 'Module=M; M.bas', 'Form=F1.frm', 'Name="P"'),
  file(
    'a/M.bas',
    'Attribute VB_Name = "M"',
    ...sub(
      'Calc',
      '    If a Then',
      '    End If',
      '    If b Then',
      '    End If',
      '    If c Then',
      '    End If',
      '    Select Case n',
      '        Case 1',
      '        Case 2',
      '        Case 3',
      '    End Select',
    ),
    ...sub(
      'Save',
      '    s = "SELECT A FROM ORDERS"',
      '    t = "UPDATE ORDERS SET A = 1"',
      '    r.ReportFileName = "x.rpt"',
    ),
  ),
  file(
    'a/F1.frm',
    'VERSION 5.00',
    'Begin VB.Form F1',
    'End',
    'Attribute VB_Name = "F1"',
    ...sub('Form_Load', '    x = 1'),
    ...sub('Command1_Click', '    Printer.Print "x"'),
  ),
];

const inventory = buildSourceInventory({ profile, files, knownPaths: [] });
const program = inventory.programs[0];
if (!program) throw new Error('program');
const checklist = buildUtChecklist(inventory, program.projectPath);

describe('TC01-AC01 checklist', () => {
  it('has one item per procedure, event handler, SQL statement and report', () => {
    expect(checklist.version).toBe(UT_CHECKLIST_VERSION);
    const kinds = checklist.items.map((item) => item.kind).sort();
    expect(kinds).toEqual([
      'event',
      'event',
      'procedure',
      'procedure',
      'report',
      'report',
      'sql',
      'sql',
    ]);
    // 2 plain procedures + 2 events + SELECT + UPDATE + 2 reports
    // (the .rpt call and the Printer in an event handler).
    expect(checklist.items).toHaveLength(8);
    expect(program.utPoints).toBe(8);
  });

  it('does not list branches: the agent enumerates them from the source', () => {
    const calc = checklist.items.filter((i) => i.procedure === 'Calc');
    expect(calc).toHaveLength(1);
    expect(calc[0]?.kind).toBe('procedure');
  });

  it('gives stable IDs, with evidence file:line', () => {
    const ids = checklist.items.map((i) => i.id);
    expect(ids).toContain('UT-A-Calc-1');
    expect(ids).toContain('UT-A-Save-1');
    expect(ids).toContain('UT-A-Save-2');
    expect(ids).toContain('UT-A-Save-3');
    expect(ids).toContain('UT-A-Form_Load-1');
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of checklist.items) {
      expect(item.file).toMatch(/^a\/(M\.bas|F1\.frm)$/);
      expect(item.line).toBeGreaterThan(0);
    }
    const again = buildUtChecklist(inventory, program.projectPath);
    expect(JSON.stringify(again)).toBe(JSON.stringify(checklist));
  });

  it('marks event handlers of a form', () => {
    expect(
      checklist.items
        .filter((i) => i.kind === 'event')
        .map((i) => i.procedure)
        .sort(),
    ).toEqual(['Command1_Click', 'Form_Load']);
  });

  it('is empty for a program that was not analyzed', () => {
    expect(buildUtChecklist(inventory, 'missing/X.vbp').items).toEqual([]);
  });
});
