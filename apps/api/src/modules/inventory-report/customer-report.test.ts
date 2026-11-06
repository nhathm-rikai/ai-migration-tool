import type { SourceInventoryDocument } from '@portal/contracts';
import { describe, expect, it } from 'vitest';
import { demoInventory } from '../../adapters/fake/demo-inventory.js';
import {
  buildCustomerReport,
  buildRisks,
  type CustomerReport,
} from './customer-report.js';
import {
  CUSTOMER_REPORT_VERSION,
  NOT_ANALYZED,
  SHEET_NAMES,
} from './customer-report-constants.js';
import { customerReportSheets } from './customer-report-workbook.js';
import { ALL_PROGRAMS, buildInventoryReport } from './inventory-report.js';
import { writeXlsx, type Sheet } from './xlsx-writer.js';

// Fixtures: the invented demo inventory (hand-written AR04 data included).
// Nothing here comes from customer source.

const origin = {
  mode: 'demo' as const,
  projectId: 'p1',
  projectName: 'Demo',
  runId: 'r1',
  artifactId: 'a1',
  artifactVersion: 1,
  createdAt: '2026-11-06T00:00:00.000Z',
};
const report = buildCustomerReport(demoInventory, origin);

const clone = (): SourceInventoryDocument =>
  JSON.parse(JSON.stringify(demoInventory)) as SourceInventoryDocument;
function legacy(): SourceInventoryDocument {
  const old = clone();
  delete old.screenReportVersion;
  delete old.reportComplexityVersion;
  delete old.totals.screenReport;
  for (const program of old.programs) {
    delete program.programType;
    delete program.screens;
    delete program.reports;
  }
  return old;
}

const cells = (sheet: Sheet | undefined) =>
  (sheet?.rows ?? []).flatMap((row) => row.map((cell) => cell));
const sheetOf = (name: string, from: CustomerReport = report) => {
  const found = customerReportSheets(from).find((s) => s.name === name);
  if (!found) throw new Error(name);
  return found;
};

describe('AR02-AC01 figures equal the assessment step and AR04', () => {
  it('uses the inventory totals the step 2 cards use', () => {
    const { scale } = report;
    expect(report.reportVersion).toBe(CUSTOMER_REPORT_VERSION);
    expect(scale.programs).toBe(demoInventory.programs.length);
    expect(scale.codeLines).toBe(demoInventory.totals.uniqueCounters.codeLines);
    expect(scale.physicalLines).toBe(
      demoInventory.totals.uniqueCounters.physicalLines,
    );
    // Step 2 e2e shows 655 unique code lines for the demo inventory.
    expect(scale.codeLines).toBe(655);
    expect(scale.procedures).toBe(6);
    // Mapped table view: AUDIT_LOG, ORDER_LINES, ORDERS, CUSTOMERS.
    expect(scale.tables).toBe(4);
    expect(scale.tablesView).toBe('normalized');
    expect(scale.screenReport).toEqual(demoInventory.totals.screenReport);
    expect(scale.screenReport).toMatchObject({
      screens: 3,
      sharedScreens: 1,
      batches: 1,
      reports: { counted: 3, suspected: 2 },
    });
    // The core report of the same inventory agrees.
    const core = buildInventoryReport(demoInventory, ALL_PROGRAMS);
    expect(scale.codeLines).toBe(core.totals.unique.codeLines);
    expect(scale.procedures).toBe(core.totals.unique.procedures);
  });
});

describe('AR02-AC02 module table', () => {
  it('adds up to the unique totals, shared code on its own row', () => {
    const sum = (pick: (m: CustomerReport['modules'][number]) => number) =>
      report.modules.reduce((total, m) => total + pick(m), 0);
    expect(sum((m) => m.codeLines)).toBe(report.scale.codeLines);
    expect(sum((m) => m.screens)).toBe(report.scale.screenReport?.screens);
    expect(sum((m) => m.reports)).toBe(
      report.scale.screenReport?.reports.counted,
    );
    expect(sum((m) => m.suspectedReports)).toBe(
      report.scale.screenReport?.reports.suspected,
    );
    expect(sum((m) => m.batches)).toBe(report.scale.screenReport?.batches);
    expect(sum((m) => m.programs)).toBe(report.scale.programs);
    const shared = report.modules.filter((m) => m.kind === 'shared');
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ module: '共通', screens: 1 });
    // Module = the folder of the project file, like the quote's moduleOf.
    expect(
      report.modules.filter((m) => m.kind === 'module').map((m) => m.module),
    ).toEqual(['programs/CUSTOMER', 'programs/ORDER', 'programs/REPORT']);
  });
});

describe('AR02-AC03 risks', () => {
  it('puts every source warning in exactly one row; counts add up', () => {
    const core = buildInventoryReport(demoInventory, ALL_PROGRAMS);
    const fromWarnings = report.risks.filter((r) => r.source === 'warning');
    expect(fromWarnings.reduce((n, r) => n + r.count, 0)).toBe(
      core.warnings.length,
    );
    expect(new Set(fromWarnings.map((r) => r.code)).size).toBe(
      fromWarnings.length,
    );
  });

  it('turns unknown codes into one その他 row and keeps them', () => {
    const risks = buildRisks(
      [
        {
          code: 'NEW_UNKNOWN_A',
          programId: 'X',
          relativePath: null,
          line: null,
          detail: '',
        },
        {
          code: 'NEW_UNKNOWN_B',
          programId: null,
          relativePath: null,
          line: null,
          detail: '',
        },
        {
          code: 'DYNAMIC_SQL',
          programId: 'X',
          relativePath: null,
          line: 3,
          detail: '',
        },
      ],
      [],
      [],
    );
    const other = risks.find((r) => r.category === 'その他');
    expect(other).toMatchObject({ count: 2, code: 'OTHER' });
    expect(risks.reduce((n, r) => n + r.count, 0)).toBe(3);
  });

  it('rates missing .rpt as 高 with the request, suspected output as 中, sorted high first', () => {
    const missing = report.risks.find((r) => r.code === 'REPORT_FILE_MISSING');
    expect(missing).toMatchObject({ severity: '高' });
    expect(missing?.confirmation).toContain('帳票定義ファイル(.rpt)のご提供');
    const suspected = report.risks.find((r) => r.code === 'REPORT_SUSPECTED');
    expect(suspected).toMatchObject({ severity: '中' });
    const order = report.risks.map((r) =>
      ['高', '中', '低'].indexOf(r.severity),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('lists at most 10 affected programs and counts the rest', () => {
    const warnings = Array.from({ length: 13 }, (_, i) => ({
      code: 'DYNAMIC_SQL',
      programId: `P${i}`,
      relativePath: null,
      line: 1,
      detail: '',
    }));
    const [row] = buildRisks(warnings, [], []);
    expect(row?.programs).toHaveLength(10);
    expect(row?.otherPrograms).toBe(3);
  });
});

describe('AR02-AC04/AC09 screen and report list', () => {
  const totals = demoInventory.totals.screenReport;
  it('has one row per screen, report (every confidence) and batch', () => {
    const screens = report.items.filter((i) => i.type === '画面');
    const reports = report.items.filter((i) => i.type === '帳票');
    const batches = report.items.filter((i) => i.type === 'バッチ');
    expect(screens).toHaveLength(totals?.screens ?? -1);
    expect(reports).toHaveLength(totals?.reports.rows ?? -1);
    expect(batches).toHaveLength(totals?.batches ?? -1);
    expect(report.items.every((i) => i.file !== '')).toBe(true);
    expect(
      reports.filter((i) => i.confidenceLabel.includes('疑い')),
    ).toHaveLength(totals?.reports.suspected ?? -1);
  });

  it('rows of reports equal the total by kind and by level; unrated is 未評価 with a reason', () => {
    const reports = report.items.filter((i) => i.type === '帳票');
    const byKind = totals?.reports.byKind ?? {};
    const byLevel = totals?.reports.byLevel ?? {};
    const sum = (r: Record<string, number>) =>
      Object.values(r).reduce((a, b) => a + b, 0);
    expect(reports.length).toBe(sum(byKind));
    expect(reports.length).toBe(sum(byLevel));
    for (const row of reports.filter((r) => r.level === 'unrated')) {
      expect(row.levelLabel).toBe('未評価');
      expect(row.note).not.toBe('');
      expect(row.score).toBeNull();
    }
    const crystal = reports.find((r) => r.name === 'summary.rpt');
    expect(crystal).toMatchObject({
      levelLabel: '中',
      modelVersion: 'report-complexity-v1-draft',
    });
    expect(crystal?.factors).toContain('定義ファイル未解析');
    // Sheet 6 shows the same rows plus the reference note.
    const sheet = sheetOf('6_画面・帳票一覧');
    expect(sheet.rows).toHaveLength(report.items.length);
    expect(sheet.columns.map((c) => c.header)).toEqual(
      expect.arrayContaining(['複雑度', '点数', 'モデル版', '評価要因']),
    );
    expect(sheet.notes?.join('')).toContain('参考値');
  });

  it('shows the report counts by kind and level on sheet 1 and the level split on sheet 2', () => {
    const sheet1 = cells(sheetOf('1_規模概要'));
    for (const label of [
      'Crystal Reports',
      'DataReport / ActiveReports',
      '未評価',
    ])
      expect(sheet1).toContain(label);
    const sheet2 = cells(sheetOf('2_複雑度'));
    expect(sheet2).toContain('未評価');
    expect(sheet2).toContain('report-complexity-v1-draft');
  });
});

describe('AR02-AC05 inventory without AR04 data', () => {
  const old = buildCustomerReport(legacy(), origin);

  it('says 未解析 for screens, reports and batches, never 0', () => {
    expect(old.scale.screenReport).toBeNull();
    expect(old.items).toEqual([]);
    const sheet1 = sheetOf('1_規模概要', old);
    const lines = sheet1.rows.filter((row) =>
      ['画面', '帳票（検出）', 'バッチ'].some((label) => row[0] === label),
    );
    expect(lines).toHaveLength(3);
    for (const row of lines) expect(row[1]).toBe(NOT_ANALYZED);
    const sheet6 = sheetOf('6_画面・帳票一覧', old);
    expect(cells(sheet6)).toContain(NOT_ANALYZED);
  });

  it('keeps a v0 complexity model apart: no very-high level is invented', () => {
    expect(demoInventory.complexityVersion).toBe('complexity-v0');
    expect(report.complexity.version).toBe('complexity-v0');
    expect(report.complexity.levels['very-high']).toBeNull();
    expect(report.complexity.levels.low).toBeGreaterThanOrEqual(0);
  });
});

describe('AR02-AC06 workbook', () => {
  const sheets = customerReportSheets(report);

  it('has exactly the six sheets in order', () => {
    expect(sheets.map((s) => s.name)).toEqual([...SHEET_NAMES]);
    expect(SHEET_NAMES).toHaveLength(6);
  });

  it('writes a valid xlsx and puts 該当なし in an empty table', () => {
    expect(writeXlsx(sheets).byteLength).toBeGreaterThan(1000);
    const none = clone();
    none.files = [];
    none.programs = [];
    none.totals.screenReport = {
      screens: 0,
      sharedScreens: 0,
      batches: 0,
      reports: {
        rows: 0,
        counted: 0,
        suspected: 0,
        byKind: {
          'data-report': 0,
          crystal: 0,
          excel: 0,
          print: 0,
          'file-output': 0,
          unknown: 0,
        },
        byLevel: { low: 0, medium: 0, high: 0, 'very-high': 0, unrated: 0 },
      },
      suspectedPrograms: 0,
    };
    const empty = buildCustomerReport(none, origin);
    for (const name of [
      SHEET_NAMES[1],
      SHEET_NAMES[2],
      SHEET_NAMES[3],
      SHEET_NAMES[5],
    ])
      expect(cells(sheetOf(name, empty))).toContain('該当なし');
  });

  it('carries provenance and the DEMO label on sheet 1', () => {
    const text = cells(sheetOf('1_規模概要')).join('\n');
    expect(text).toContain('DEMO');
    expect(text).toContain('a1');
    expect(text).toContain(report.source.snapshotHash.slice(0, 12));
    expect(text).toContain('お客様提示数：未入力');
  });

  it('keeps absolute paths out and formula text as text', () => {
    const inv = clone();
    const program = inv.programs[0];
    if (!program) throw new Error('program');
    program.name = '=HYPERLINK("x")';
    program.members.push({
      kind: 'Module',
      name: null,
      declaredPath: 'C:\\Users\\someone\\secret\\X.BAS',
      relativePath: null,
      resolution: 'absolute-path',
      fileStatus: null,
      shared: false,
    });
    const built = buildCustomerReport(inv, origin);
    const json = JSON.stringify(built);
    expect(json).not.toContain('someone');
    const sheetsText = JSON.stringify(customerReportSheets(built));
    expect(sheetsText).not.toContain('someone');
    expect(writeXlsx(customerReportSheets(built)).byteLength).toBeGreaterThan(
      1000,
    );
  });
});
