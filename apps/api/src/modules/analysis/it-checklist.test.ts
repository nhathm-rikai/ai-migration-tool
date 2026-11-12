import { describe, expect, it } from 'vitest';
import type { SourceInventoryDocument } from '@portal/contracts';
import { buildItChecklist, IT_CHECKLIST_VERSION } from './it-checklist.js';
import { buildSourceInventory } from './source-inventory.js';
import { findSourceProfile } from './source-profiles.js';

// TC02-AC01: the deterministic integration checklist. Fixtures are written
// for this test; nothing comes from customer source.
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
const form = (name: string, ...body: string[]) => [
  'VERSION 5.00',
  `Begin VB.Form ${name}`,
  'End',
  `Attribute VB_Name = "${name}"`,
  ...body,
];

const files: TestFile[] = [
  file(
    'a/A.vbp',
    'Type=Exe',
    'Form=F1.frm',
    'Form=F2.frm',
    'Module=Common; ..\\cmn\\Common.bas',
    'Name="A"',
  ),
  file(
    'a/F1.frm',
    ...form(
      'F1',
      ...sub(
        'Command1_Click',
        '    s = "INSERT INTO ORDERS (A) VALUES (1)"',
        '    t = "UPDATE STOCK SET Q = 1"',
        '    F2.ShowOrder',
        '    F2.Show',
        '    WriteLog',
      ),
    ),
  ),
  file(
    'a/F2.frm',
    ...form(
      'F2',
      ...sub('ShowOrder', '    s = "SELECT A FROM ORDERS"'),
      ...sub('Command2_Click', '    Printer.Print "x"'),
    ),
  ),
  file(
    'cmn/Common.bas',
    'Attribute VB_Name = "Common"',
    ...sub('WriteLog', '    x = 1'),
  ),
  file(
    'b/B.vbp',
    'Type=Exe',
    'Module=MB; MB.bas',
    'Module=Common; ..\\cmn\\Common.bas',
    'Name="B"',
  ),
  file(
    'b/MB.bas',
    'Attribute VB_Name = "MB"',
    ...sub('Main', '    s = "SELECT Q FROM STOCK"', '    WriteLog'),
  ),
  // A third program on the same table: still one item for the table.
  file('c/C.vbp', 'Type=Exe', 'Module=MC; MC.bas', 'Name="C"'),
  file(
    'c/MC.bas',
    'Attribute VB_Name = "MC"',
    ...sub('Main', '    s = "SELECT Q FROM STOCK"'),
  ),
];

const inventory = buildSourceInventory({
  profile,
  files,
  knownPaths: [],
}) as SourceInventoryDocument;
const checklist = buildItChecklist(inventory, 'a/A.vbp');
const ofKind = (kind: string) =>
  checklist.items.filter((item) => item.kind === kind);

describe('TC02-AC01 checklist', () => {
  it('lists each kind the inventory has data for, with stable IDs', () => {
    expect(checklist.version).toBe(IT_CHECKLIST_VERSION);
    expect(checklist.program).toBe('A');
    expect(checklist.items.map((item) => item.id)).toEqual([
      'IT-A-shared-module-1',
      'IT-A-db-chain-1',
      'IT-A-report-1',
      'IT-A-cross-program-1',
    ]);
    expect(buildItChecklist(inventory, 'a/A.vbp')).toEqual(checklist);
  });

  // call-graph-v2 has no call from one form to another (a form's procedures
  // are not global), so there is nothing to build screen pairs from. When
  // this starts failing the analyzer records them and `screen-flow` can be
  // added.
  it('has no screen-flow kind: the inventory records no form to form call', () => {
    const program = inventory.programs.find((p) => p.projectPath === 'a/A.vbp');
    expect(
      program?.analysis?.calls.filter((call) =>
        call.targets.some((target) => target.startsWith('a/F2.frm')),
      ),
    ).toEqual([]);
    expect(checklist.items.map((item) => item.kind)).not.toContain(
      'screen-flow',
    );
  });

  it('groups the calls into a shared module by module', () => {
    const [shared] = ofKind('shared-module');
    expect(shared?.detail).toBe('A → Common.bas (WriteLog)');
    expect(shared?.file).toBe('a/F1.frm');
  });

  it('takes a table written in one procedure and used in another, not one touched once', () => {
    const chains = ofKind('db-chain');
    expect(chains).toHaveLength(1);
    expect(chains[0]?.detail).toBe('ORDERS (CR, 2 procedures)');
    expect(chains[0]?.file).toBe('a/F1.frm');
  });

  it('lists every report of the program', () => {
    expect(ofKind('report')).toHaveLength(1);
    expect(ofKind('report')[0]?.file).toBe('a/F2.frm');
  });

  // it-checklist-v2: one item per shared table, however many programs use
  // it (v1 had one per pair, which made checklists of dozens of items).
  it('has one item per shared table, naming every other program of it', () => {
    const cross = ofKind('cross-program');
    expect(cross).toHaveLength(1);
    expect(cross[0]?.counterparts).toEqual(['B', 'C']);
    expect(cross[0]?.detail).toBe('STOCK: A U / B R, C R');
    // Seen from the other side: B reads what A writes; C only reads too, so
    // B and C share nothing to test between them.
    const other = buildItChecklist(inventory, 'b/B.vbp');
    expect(other.items.map((item) => [item.kind, item.counterparts])).toEqual([
      ['shared-module', []],
      ['cross-program', ['A']],
    ]);
  });

  it('keeps every item evidence inside the program', () => {
    const own = new Set(['a/F1.frm', 'a/F2.frm', 'cmn/Common.bas']);
    for (const item of checklist.items) {
      expect(own.has(item.file)).toBe(true);
      expect(item.line).toBeGreaterThanOrEqual(1);
    }
  });

  it('is empty for a program that is not in the inventory', () => {
    expect(buildItChecklist(inventory, 'x/X.vbp').items).toEqual([]);
  });
});
