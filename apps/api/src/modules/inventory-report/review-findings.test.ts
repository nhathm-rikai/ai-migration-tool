import { readFileSync } from 'node:fs';
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
    expect(ids).toEqual(['A/X.vbp#1', 'A/X.VBP#2']);
  });
});

// Second review, finding 2: IDs are unique without regard to case.
describe('second review finding 2: unique program IDs', () => {
  const idsOf = (paths: string[]) =>
    buildInventoryReport(
      inventoryOf(paths.map((path) => text(path, ['Type=Exe']))),
      ALL_PROGRAMS,
    ).programs.map((p) => p.id);
  const unique = (ids: string[]) =>
    new Set(ids.map((id) => id.toUpperCase())).size === ids.length;

  it('keeps X.vbp, X.VBP and X.vbp.vbp apart', () => {
    const ids = idsOf(['X.vbp', 'X.VBP', 'X.vbp.vbp']);
    expect(unique(ids)).toBe(true);
    // The short ID of the third file equals the full path of the first.
    expect(ids).toEqual(['X.vbp#1', 'X.VBP#2', 'X.vbp.vbp']);
  });

  it('keeps the file name when it is unique and the path otherwise', () => {
    expect(idsOf(['A/X.vbp', 'B/X.vbp', 'C/Y.vbp'])).toEqual([
      'A/X',
      'B/X',
      'Y',
    ]);
  });

  it('uses full paths when a short ID equals another path-based ID', () => {
    const ids = idsOf(['A/X.vbp', 'B/X.vbp', 'A/X.vbp.vbp', 'B/A/X.vbp']);
    expect(unique(ids)).toBe(true);
    expect(ids[2]).toBe('X.vbp');
  });

  it('never repeats an ID that differs only by case', () => {
    expect(unique(idsOf(['a/p.vbp', 'b/P.vbp', 'A/p.VBP', 'P.vbp']))).toBe(
      true,
    );
  });
});

// Second review, finding 3: spec, acceptance and code say the same.
describe('second review finding 3: sheet count in the spec', () => {
  const SHEETS_IN_SPEC_ORDER = [
    'README',
    'Summary',
    'Totals',
    'Programs',
    'Screens',
    'Reports',
    'Members',
    'ExternalRefs',
    'ExternalAPIs',
    'Files',
    'Procedures',
    'Calls',
    'CRUD',
    'DynamicSQL',
    'ConcatenatedSQL',
    'Warnings',
  ];

  it('builds exactly 16 sheets in the order the spec names', () => {
    const report = buildInventoryReport(
      inventoryOf([text('P.vbp', ['Type=Exe'])]),
      ALL_PROGRAMS,
    );
    expect(inventoryReportSheets(report).map((s) => s.name)).toEqual(
      SHEETS_IN_SPEC_ORDER,
    );
    const spec = readFileSync(
      new URL(
        '../../../../../docs/engineering/specs/inventory-report.md',
        import.meta.url,
      ),
      'utf8',
    );
    for (const name of SHEETS_IN_SPEC_ORDER.slice(1))
      expect(spec).toContain(`\`${name}\``);
    const counts = [...spec.matchAll(/(\d+) sheet/g)].map((m) => m[1]);
    expect(counts.length).toBeGreaterThan(0);
    expect(new Set(counts)).toEqual(new Set(['16']));
  });
});

// Third review, finding 3: a generated suffix never meets an existing ID.
describe('third review finding 3: suffix cannot collide', () => {
  const idsOf = (paths: string[]) =>
    buildInventoryReport(
      inventoryOf(paths.map((path) => text(path, ['Type=Exe']))),
      ALL_PROGRAMS,
    ).programs.map((p) => p.id);
  const lowered = (ids: string[]) => new Set(ids.map((id) => id.toLowerCase()));

  it('keeps X.vbp, X.VBP and X.vbp#1.vbp apart', () => {
    const ids = idsOf(['X.vbp', 'X.VBP', 'X.vbp#1.vbp']);
    expect(lowered(ids).size).toBe(3);
    // The ID of the third file is its file name; it keeps it.
    expect(ids[2]).toBe('X.vbp#1');
  });

  it('never throws and never repeats an ID for random paths', () => {
    let seed = 12345;
    const next = (limit: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % limit;
    };
    const tokens = ['x', 'X', '.vbp', '.VBP', '#1', '/'];
    const randomPath = () => {
      let path = '';
      for (let i = 0, n = 1 + next(4); i < n; i++)
        path += tokens[next(tokens.length)];
      path = path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
      return path === '' || path.endsWith('/') ? 'x.vbp' : `${path}.vbp`;
    };
    let total = 0;
    for (let round = 0; round < 100; round++) {
      const paths = [...new Set(Array.from({ length: 40 }, randomPath))];
      total += paths.length;
      const ids = idsOf(paths);
      expect(lowered(ids).size).toBe(paths.length);
    }
    expect(total).toBeGreaterThan(200);
  });
});
