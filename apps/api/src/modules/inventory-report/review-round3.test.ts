import {
  SourceInventorySchema,
  normalizeScreenReportTotals,
  type SourceInventoryDocument,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { buildSourceInventory } from '../analysis/source-inventory.js';
import { findSourceProfile } from '../analysis/source-profiles.js';
import { unzip } from '../../testing/zip-reader.js';
import { ALL_PROGRAMS, buildInventoryReport } from './inventory-report.js';
import { inventoryReportSheets } from './inventory-report-workbook.js';
import { writeXlsx } from './xlsx-writer.js';

// Independent review of AR04 at 240bde5, round 3. Fixtures are written for
// this test; nothing comes from customer source.

const profile = findSourceProfile('vb6-cp932-v1');
if (!profile) throw new Error('profile missing');
type TestFile = { relativePath: string; bytes: Uint8Array };
const file = (relativePath: string, ...lines: string[]): TestFile => ({
  relativePath,
  bytes: new TextEncoder().encode(lines.join('\r\n') + '\r\n'),
});
const vbp = (path: string, ...entries: string[]) =>
  file(path, 'Type=Exe', ...entries, 'Name="P"');
const bas = (path: string, ...code: string[]) =>
  file(path, 'Attribute VB_Name = "M"', ...code);
const sub = (name: string, ...body: string[]) => [
  `Public Sub ${name}()`,
  ...body,
  'End Sub',
];

const PRIVATE = 'PrivateCustomer';

describe('finding 1: an inventory stored before reportItems existed', () => {
  const fresh = buildSourceInventory({
    profile,
    files: [
      vbp('a/A.vbp', 'Module=M; ../s/M.bas'),
      vbp('b/B.vbp', 'Module=M; ../s/M.bas'),
      bas('s/M.bas', ...sub('Show1', '    r.ReportFileName = "r.rpt"')),
    ],
    knownPaths: ['r.rpt'],
  });
  const stored = (): SourceInventoryDocument => {
    const old = JSON.parse(
      JSON.stringify({ ...fresh, skipped: [] }),
    ) as SourceInventoryDocument;
    delete old.totals.screenReport?.reportItems;
    return old;
  };

  it('still validates against the schema', () => {
    expect(Check(SourceInventorySchema, { ...fresh, skipped: [] })).toBe(true);
    expect(Check(SourceInventorySchema, stored())).toBe(true);
  });

  it('derives the same project-level entries with the one shared function', () => {
    const old = stored();
    const derived = normalizeScreenReportTotals(old);
    expect(derived?.reportItems).toEqual(
      fresh.totals.screenReport?.reportItems,
    );
    expect(derived?.reports).toEqual(fresh.totals.screenReport?.reports);
  });

  it('exports the same technical report as a freshly built inventory', () => {
    const a = buildInventoryReport(stored(), ALL_PROGRAMS);
    const b = buildInventoryReport(
      JSON.parse(
        JSON.stringify({ ...fresh, skipped: [] }),
      ) as SourceInventoryDocument,
      ALL_PROGRAMS,
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('finding 2: paths declared by the customer never reach an export', () => {
  const inventory = buildSourceInventory({
    profile,
    files: [
      vbp(
        'a/A.vbp',
        'Object={00025600-0000-0000-C000-000000000046}#4.6#0; C:/PrivateCustomer/Legacy/crystl32.ocx',
        'Form=C:\\PrivateCustomer\\Legacy\\Gone.frm',
        'Module=M; M.bas',
      ),
      bas(
        'a/M.bas',
        ...sub(
          'S',
          '    r.ReportFileName = "C:\\PrivateCustomer\\Legacy\\x.rpt"',
        ),
      ),
    ],
  });
  const withLeakingName = (): SourceInventoryDocument => {
    const doc = JSON.parse(
      JSON.stringify({ ...inventory, skipped: [] }),
    ) as SourceInventoryDocument;
    const row = doc.programs[0]?.reports?.[0];
    if (!row) throw new Error('report row');
    // What an inventory stored by an older build may hold.
    row.name = 'C:/PrivateCustomer/Legacy/crystl32.ocx';
    return doc;
  };

  it('does not put a declared path in the screens or reports the analyzer writes', () => {
    const program = inventory.programs[0];
    expect(JSON.stringify([program?.screens, program?.reports])).not.toContain(
      PRIVATE,
    );
  });

  it('is redacted in every warning of the technical report JSON and workbook', () => {
    const report = buildInventoryReport(withLeakingName(), ALL_PROGRAMS);
    expect(JSON.stringify(report)).not.toContain(PRIVATE);
    const parts = unzip(writeXlsx(inventoryReportSheets(report)));
    for (const [name, xml] of parts)
      expect({ name, leak: xml.includes(PRIVATE) }).toEqual({
        name,
        leak: false,
      });
  });
});

describe('review round 4: redaction is display only, never an identity', () => {
  const build = (...forms: string[]) =>
    buildSourceInventory({
      profile,
      files: [
        vbp('a/A.vbp', ...forms, 'Module=M; M.bas'),
        bas('a/M.bas', ...sub('S', '    x = 1')),
      ],
    });
  it('counts two different absolute paths with the same file name as two screens', () => {
    const inventory = build('Form=C:/one/Main.frm', 'Form=D:/two/Main.frm');
    expect(inventory.programs[0]?.screens).toHaveLength(2);
    expect(inventory.totals.screenReport?.screens).toBe(2);
  });
  it('counts the same declared path once, in a program and across programs', () => {
    const once = build('Form=C:/one/Main.frm', 'Form=C:/one/Main.frm');
    expect(once.programs[0]?.screens).toHaveLength(1);
    const two = buildSourceInventory({
      profile,
      files: [
        vbp('a/A.vbp', 'Form=C:/one/Main.frm'),
        vbp('b/B.vbp', 'Form=C:/one/Main.frm'),
      ],
    });
    expect(two.totals.screenReport?.screens).toBe(1);
  });
  it('lists both screens in the exports without showing the original paths', () => {
    const inventory = build(
      'Form=C:/one/PrivateCustomer/Main.frm',
      'Form=D:/two/PrivateCustomer/Main.frm',
    );
    const doc = JSON.parse(
      JSON.stringify({ ...inventory, skipped: [] }),
    ) as SourceInventoryDocument;
    const report = buildInventoryReport(doc, ALL_PROGRAMS);
    expect(report.screens).toHaveLength(2);
    expect(report.totals.screenReport?.screens).toBe(2);
    expect(JSON.stringify(report)).not.toContain(PRIVATE);
    const parts = unzip(writeXlsx(inventoryReportSheets(report)));
    for (const [, xml] of parts) expect(xml).not.toContain(PRIVATE);
    expect(JSON.stringify(doc.programs[0]?.screens)).not.toContain(PRIVATE);
  });
});
