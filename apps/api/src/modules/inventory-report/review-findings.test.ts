import type { SourceInventoryDocument } from '@portal/contracts';
import { describe, expect, it } from 'vitest';
import { unzip } from '../../testing/zip-reader.js';
import { buildSourceInventory } from '../analysis/source-inventory.js';
import { findSourceProfile } from '../analysis/source-profiles.js';
import { createTableNameMapping } from '../analysis/table-names.js';
import {
  ALL_PROGRAMS,
  buildInventoryReport,
  redactAbsolutePath,
} from './inventory-report.js';
import { inventoryReportSheets } from './inventory-report-workbook.js';
import { writeXlsx } from './xlsx-writer.js';

// Independent review of AR01 (06/11/2026): each finding is reproduced here.

const text = (relativePath: string, lines: string[]) => ({
  relativePath,
  bytes: Buffer.from(`${lines.join('\r\n')}\r\n`),
});

function inventoryOf(
  files: ReturnType<typeof text>[],
): SourceInventoryDocument {
  const profile = findSourceProfile('vb6-cp932-v1');
  const tableNames = createTableNameMapping('HAN01');
  if (!profile || !tableNames) throw new Error('setup');
  const built: unknown = JSON.parse(
    JSON.stringify(buildSourceInventory({ profile, files, tableNames })),
  );
  return built as SourceInventoryDocument;
}

const SECRET = 'PrivateCustomerRoot';

describe('review finding 1: quoted absolute paths', () => {
  it.each([
    ['"C:\\PrivateCustomerRoot\\Legacy\\Shared.bas"'],
    ["'C:\\PrivateCustomerRoot\\Legacy\\Shared.bas'"],
    ['  "  C:\\PrivateCustomerRoot\\Legacy\\Shared.bas  "  '],
    ['"\\\\server\\PrivateCustomerRoot\\Shared.bas"'],
    ['"/PrivateCustomerRoot/Shared.bas"'],
  ])('redacts %s down to the file name', (path) => {
    const redacted = redactAbsolutePath(path);
    expect(redacted).not.toContain(SECRET);
    expect(redacted).toMatch(/^<absolute path>\/Shared\.bas$/);
  });

  it('keeps a relative quoted path as it is', () => {
    expect(redactAbsolutePath('"Legacy\\Shared.bas"')).toBe(
      '"Legacy\\Shared.bas"',
    );
  });

  it('keeps the root out of the JSON report and every sheet', () => {
    const doc = inventoryOf([
      text('a/P.VBP', [
        'Type=Exe',
        'Module=Shared; "C:\\PrivateCustomerRoot\\Legacy\\Shared.bas"',
        'Reference=*\\G{00000000-0000-0000-0000-000000000000}#1.0#0#"C:\\PrivateCustomerRoot\\X.DLL"#X',
        'Object={00000000-0000-0000-0000-000000000000}#1.0#0; "C:\\PrivateCustomerRoot\\Y.OCX"',
      ]),
    ]);
    const report = buildInventoryReport(doc, ALL_PROGRAMS);
    expect(JSON.stringify(report)).not.toContain(SECRET);
    const parts = unzip(writeXlsx(inventoryReportSheets(report)));
    expect([...parts.values()].join('\n')).not.toContain(SECRET);
    // The member is still reported, by file name.
    expect(
      report.members.some((m) => m.declaredPath.endsWith('Shared.bas')),
    ).toBe(true);
  });
});

describe('review finding 2: provenance of the file', () => {
  const origin = {
    mode: 'demo' as const,
    projectId: 'project-1',
    projectName: 'Demo project',
    runId: 'run-1',
    artifactId: 'artifact-1',
    artifactVersion: 3,
    createdAt: '2026-11-06T00:00:00.000Z',
  };
  it('puts the origin in the JSON and in the Summary sheet', () => {
    const doc = inventoryOf([
      text('a/P.VBP', ['Type=Exe', 'Module=M; M.BAS']),
      text('a/M.BAS', ['Sub Main()', 'End Sub']),
    ]);
    const report = buildInventoryReport(doc, ALL_PROGRAMS, origin);
    expect(report.source.origin).toEqual(origin);
    const parts = unzip(writeXlsx(inventoryReportSheets(report)));
    // README is sheet 1, Summary sheet 2.
    for (const index of [1, 2]) {
      const xml = parts.get(`xl/worksheets/sheet${index}.xml`) ?? '';
      expect(xml).toContain('DEMO: bundled sample data');
      expect(xml).toContain('Demo project');
    }
    const summary = parts.get('xl/worksheets/sheet2.xml') ?? '';
    for (const value of ['project-1', 'run-1', 'artifact-1', '2026-11-06T'])
      expect(summary).toContain(value);
    expect(buildInventoryReport(doc, ALL_PROGRAMS).source.origin).toBeNull();
  });
});

describe('review finding 4: program ID collisions', () => {
  it('tells A/X.vbp and A/X.VBP apart', () => {
    const doc = inventoryOf([
      text('A/X.vbp', ['Type=Exe']),
      text('A/X.VBP', ['Type=Exe']),
    ]);
    const report = buildInventoryReport(doc, ALL_PROGRAMS);
    expect(report.programs).toHaveLength(2);
    const ids = report.programs.map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(['A/X.vbp', 'A/X.VBP']);
  });
});
