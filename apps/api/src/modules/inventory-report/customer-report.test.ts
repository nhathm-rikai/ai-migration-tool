import {
  CustomerReportSchema,
  inventoryKpis,
  type SourceInventoryDocument,
} from '@portal/contracts';
import {
  UNOWNED_SQL_EXPECTED,
  unownedSqlInventoryFixture,
} from '@portal/contracts/fixtures';
import { Check } from 'typebox/value';
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
import { unzip } from '../../testing/zip-reader.js';
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

describe('customer report JSON contract (AR03 reads it)', () => {
  it('matches CustomerReportSchema, with and without AR04 data', () => {
    const json = JSON.parse(JSON.stringify(report)) as unknown;
    expect(Check(CustomerReportSchema, json)).toBe(true);
    const old = JSON.parse(
      JSON.stringify(buildCustomerReport(legacy(), origin)),
    ) as unknown;
    expect(Check(CustomerReportSchema, old)).toBe(true);
  });
});

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
    expect(scale.screenReport).not.toHaveProperty('reportItems');
    // Reports are counted by template: order.rpt is named in two procedures
    // (two signs in the stored rows) and is one template. Print and export
    // functions are counted apart: print, CSV and Excel (the log file is left
    // out).
    expect(scale.screenReport).toMatchObject({
      screens: 3,
      sharedScreens: 1,
      batches: 1,
      reports: { rows: 3, counted: 3, suspected: 3 },
      suspectedPrograms: 2,
    });
    expect(scale.reportTemplates).toEqual({
      templates: 3,
      designFile: 2,
      missingFile: 1,
    });
    expect(scale.outputFunctions).toEqual({
      functions: 3,
      programs: 2,
      excluded: 1,
      // Excel/CSV export (CSV and Excel) and the rest (print).
      groups: {
        export: { functions: 2, programs: 2 },
        print: { functions: 1, programs: 1 },
      },
    });
    expect(demoInventory.totals.screenReport?.reports.counted).toBe(4);
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
    // The technical report warns once per sign; the customer report once per
    // missing template and per output function to confirm.
    const perSign = core.warnings.filter(
      (w) => w.code === 'REPORT_FILE_MISSING' || w.code === 'REPORT_SUSPECTED',
    ).length;
    expect(perSign).toBeGreaterThan(0);
    expect(fromWarnings.reduce((n, r) => n + r.count, 0)).toBe(
      core.warnings.length -
        perSign +
        (report.scale.reportTemplates?.missingFile ?? 0) +
        (report.scale.outputFunctions?.functions ?? 0),
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

  it('rates missing .rpt as 高 without asking the customer for the file, suspected output as 中, sorted high first', () => {
    const missing = report.risks.find((r) => r.code === 'REPORT_FILE_MISSING');
    expect(missing).toMatchObject({ severity: '高' });
    // The file is reported as missing; the report does not ask for it.
    expect(missing?.content).toContain('設計ファイルなし');
    expect(missing?.confirmation).not.toContain('ご提供');
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
    const functions = report.items.filter((i) => i.type === '出力機能');
    expect(screens).toHaveLength(totals?.screens ?? -1);
    // One row per report TEMPLATE; the output functions are listed apart.
    expect(reports).toHaveLength(report.scale.reportTemplates?.templates ?? -1);
    expect(batches).toHaveLength(totals?.batches ?? -1);
    expect(functions).toHaveLength(4);
    expect(
      functions.filter((i) => i.confidenceLabel === '要確認'),
    ).toHaveLength(report.scale.outputFunctions?.functions ?? -1);
    expect(report.items.every((i) => i.file !== '')).toBe(true);
    const order = reports.find((r) => r.name === 'order.rpt');
    expect(order?.note).toContain('使用箇所 2 か所');
  });

  it('rows of reports equal the total by kind and by level; unrated is 未評価 with a reason', () => {
    const reports = report.items.filter((i) => i.type === '帳票');
    const byLevel = report.scale.screenReport?.reports.byLevel ?? {};
    const sum = (r: Record<string, number>) =>
      Object.values(r).reduce((a, b) => a + b, 0);
    // The level distribution is over templates only.
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
      ['画面', '帳票（種類）', 'バッチ'].some((label) => row[0] === label),
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
      reportItems: [],
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

describe('customer report keeps files that differ only in case apart (AR04 review)', () => {
  it('counts both screens and lists both rows', () => {
    const inv = clone();
    const program = inv.programs[0];
    if (!program?.screens || !program.reports?.[0]) throw new Error('fixture');
    const [report] = program.reports;
    program.screens = [
      { name: 'A', file: 'x/Main.frm', shared: false, warnings: [] },
      { name: 'B', file: 'x/main.frm', shared: false, warnings: [] },
    ];
    program.reports = [
      { ...report, file: 'x/Main.frm', shared: false },
      { ...report, file: 'x/main.frm', shared: false },
    ];
    const sr = inv.totals.screenReport;
    if (!sr) throw new Error('fixture');
    sr.reportItems = program.reports.map((row) => ({
      ...row,
      programs: [
        { program: program.projectPath, level: 'unrated', score: null },
      ],
    }));
    const built = buildCustomerReport(inv, origin);
    expect(
      built.items.filter((i) => i.type === '画面' && i.file.startsWith('x/')),
    ).toHaveLength(2);
    // Reports are one row per template, whatever the case of the file that
    // names them.
    expect(built.items.filter((i) => i.type === '帳票')).toHaveLength(
      built.scale.reportTemplates?.templates ?? -1,
    );
  });
});

describe('customer report reads the project-level entry of a shared report (AR04 review round 2)', () => {
  it('shows the highest score, not a program row', () => {
    const inv = clone();
    const sr = inv.totals.screenReport;
    const item = sr?.reportItems?.find((entry) => entry.kind === 'crystal');
    if (!sr || !item) throw new Error('fixture');
    item.complexity = { ...item.complexity, level: 'very-high', score: 12 };
    const built = buildCustomerReport(inv, origin);
    const row = built.items.find(
      (i) => i.type === '帳票' && i.name === item.name,
    );
    expect(row).toMatchObject({ level: 'very-high', score: 12 });
  });
});

describe('customer report never carries a declared absolute path (AR04 review round 3)', () => {
  const leaking = () => {
    const inv = clone();
    const row = inv.programs.flatMap((p) => p.reports ?? [])[0];
    const item = inv.totals.screenReport?.reportItems?.[0];
    if (!row || !item) throw new Error('fixture');
    row.name = 'C:/PrivateCustomer/Legacy/crystl32.ocx';
    item.name = 'C:/PrivateCustomer/Legacy/crystl32.ocx';
    item.file = 'C:/PrivateCustomer/Legacy/X.BAS';
    return inv;
  };
  it('keeps it out of the JSON the PDF is drawn from and out of every sheet', () => {
    const built = buildCustomerReport(leaking(), origin);
    expect(JSON.stringify(built)).not.toContain('PrivateCustomer');
    const parts = unzip(writeXlsx(customerReportSheets(built)));
    for (const [, xml] of parts) expect(xml).not.toContain('PrivateCustomer');
  });
  it('reads an inventory stored before reportItems existed like a new one', () => {
    const stored = clone();
    delete stored.totals.screenReport?.reportItems;
    expect(JSON.stringify(buildCustomerReport(stored, origin))).toBe(
      JSON.stringify(buildCustomerReport(demoInventory, origin)),
    );
  });
});

describe('customer report keeps two absolute-path screens apart (AR04 review round 4)', () => {
  it('lists both screens on sheet 6 and shows no original path', () => {
    const inv = clone();
    const program = inv.programs[0];
    if (!program) throw new Error('fixture');
    program.screens = [
      {
        name: null,
        file: '<absolute path>/Main.frm [e0e001a3]',
        shared: false,
        warnings: ['SCREEN_FILE_MISSING'],
      },
      {
        name: null,
        file: '<absolute path>/Main.frm [61c6ddad]',
        shared: false,
        warnings: ['SCREEN_FILE_MISSING'],
      },
    ];
    const built = buildCustomerReport(inv, origin);
    const screens = built.items.filter((i) =>
      i.file.startsWith('<absolute path>/Main.frm'),
    );
    expect(screens).toHaveLength(2);
    expect(new Set(screens.map((s) => s.file)).size).toBe(2);
    expect(JSON.stringify(built)).not.toContain('PrivateCustomer');
  });
});

// ---- AR02 review round 1 (aebc2bf): six P2 findings -------------------------

type InvFile = SourceInventoryDocument['files'][number];
const firstAnalyzed = (inventory: SourceInventoryDocument) => {
  const file = inventory.files.find((f) => f.analysis?.status === 'analyzed');
  if (!file) throw new Error('no analyzed file');
  return file;
};
// An analyzed file that no VBP lists, with its lines in the unique totals,
// as a real inventory stores it (totals count every analyzed file).
function withUnlistedFile(
  inventory: SourceInventoryDocument,
  path = 'loose/EXTRA.BAS',
) {
  const source = firstAnalyzed(inventory);
  const extra = JSON.parse(JSON.stringify(source)) as InvFile;
  extra.manifest.relativePath = path;
  inventory.files.push(extra);
  const analysis = extra.analysis;
  if (analysis?.status !== 'analyzed') throw new Error('fixture');
  const keys = Object.keys(
    analysis.counters,
  ) as (keyof typeof analysis.counters)[];
  for (const key of keys)
    inventory.totals.uniqueCounters[key] += analysis.counters[key];
  inventory.totals.files += 1;
  inventory.totals.codeFiles += 1;
  inventory.totals.analyzedCodeFiles += 1;
  return {
    lines: analysis.counters.codeLines,
    procedures: analysis.procedures.length,
  };
}
const analyzedProcedures = (inventory: SourceInventoryDocument) =>
  inventory.files.reduce(
    (sum, f) =>
      sum +
      (f.analysis?.status === 'analyzed' ? f.analysis.procedures.length : 0),
    0,
  );
const moduleSum = (
  r: CustomerReport,
  pick: (m: CustomerReport['modules'][number]) => number,
) => r.modules.reduce((total, m) => total + pick(m), 0);

describe('AR02 review 1 — finding 1: files no VBP lists are in the totals', () => {
  it('counts the lines and procedures of every analyzed file, like step 2', () => {
    const inventory = clone();
    const extra = withUnlistedFile(inventory);
    const built = buildCustomerReport(inventory, origin);
    expect(built.scale.codeLines).toBe(
      inventory.totals.uniqueCounters.codeLines,
    );
    expect(built.scale.codeLines).toBe(655 + extra.lines);
    expect(built.scale.procedures).toBe(analyzedProcedures(inventory));
    expect(built.scale.procedures).toBe(6 + extra.procedures);
    expect(built.scale.analyzedFiles).toBe(inventory.totals.analyzedCodeFiles);
  });

  it('puts them on the unowned row, and the module rows still add up', () => {
    const inventory = clone();
    const extra = withUnlistedFile(inventory);
    const built = buildCustomerReport(inventory, origin);
    const rest = built.modules.find((m) => m.kind === 'unassigned');
    expect(rest).toMatchObject({ codeLines: extra.lines, files: 1 });
    expect(moduleSum(built, (m) => m.codeLines)).toBe(built.scale.codeLines);
    expect(moduleSum(built, (m) => m.files)).toBe(built.scale.analyzedFiles);
  });
});

describe('AR02 review 1 — finding 2: Reference= libraries are dependencies', () => {
  it('lists reference and component entries, with their kind, and counts both as risk', () => {
    const inventory = clone();
    const [first] = inventory.programs;
    if (!first) throw new Error('fixture');
    first.externalReferences = [
      {
        kind: 'reference',
        identifier: '{00000205-0000-0010-8000-00AA006D2EA4}',
        fileName: 'msado15.dll',
        description: 'Microsoft ActiveX Data Objects 2.5 Library',
      },
      {
        kind: 'component',
        identifier: 'MSCOMCTL.OCX',
        fileName: 'MSCOMCTL.OCX',
        description: null,
      },
    ];
    const built = buildCustomerReport(inventory, origin);
    const listed = built.dependencies.components;
    expect(listed.map((c) => [c.kind, c.fileName])).toEqual(
      expect.arrayContaining([
        ['reference', 'msado15.dll'],
        ['component', 'MSCOMCTL.OCX'],
      ]),
    );
    const risk = built.risks.find((r) => r.code === 'EXTERNAL_COMPONENT');
    expect(risk?.count).toBe(2);
    const text = JSON.stringify(
      customerReportSheets(built).flatMap((s) => s.rows),
    );
    expect(text).toContain('msado15.dll');
  });
});

describe('AR02 review 1 — finding 3: the table count is the one step 2 shows', () => {
  it('merges HAN01.ORDERS and ORDERS when no schema is configured, and says assumed', () => {
    const inventory = clone();
    inventory.tableNames = {
      version: 'table-name-v1',
      defaultSchema: null,
      status: 'unconfigured',
    };
    // The source writes the schema prefix, so step 2 assumes it (HAN01).
    const sqlFile = firstAnalyzed(inventory);
    if (sqlFile.analysis?.status !== 'analyzed') throw new Error('fixture');
    sqlFile.analysis.sqlTables = [
      { table: 'HAN01.ORDERS', operation: 'R', line: 3, procedureId: null },
      { table: 'HAN01.ORDERS', operation: 'U', line: 4, procedureId: null },
    ];
    const target = inventory.programs.find((p) => p.analysis);
    if (!target?.analysis) throw new Error('fixture');
    const evidence = { relativePath: 'programs/ORDER/ORDERFORM.FRM', line: 3 };
    target.analysis.crud = [
      {
        table: 'HAN01.ORDERS',
        operations: ['R'],
        evidence,
        viaSharedOnly: false,
      },
      { table: 'ORDERS', operations: ['U'], evidence, viaSharedOnly: false },
    ] as typeof target.analysis.crud;
    for (const other of inventory.programs)
      if (other !== target && other.analysis) other.analysis.crud = [];
    const built = buildCustomerReport(inventory, origin);
    expect(built.database.tables.map((t) => t.table)).toEqual(['ORDERS']);
    expect(built.scale.tables).toBe(1);
    expect(built.scale.tablesView).toBe('normalized');
    expect(built.scale.tablesAssumed).toBe(true);
    expect(built.database.tables[0]?.operations).toBe('RU');
  });
});

describe('AR02 review 1 — finding 4: analyzed with no SQL is 0, not 未解析', () => {
  const noSql = () => {
    const inventory = clone();
    for (const program of inventory.programs) {
      if (!program.analysis) continue;
      program.analysis.crud = [];
      program.analysis.normalizedCrud = [];
    }
    return inventory;
  };
  it('shows 0 tables for fully analyzed programs without SQL', () => {
    const built = buildCustomerReport(noSql(), origin);
    expect(built.scale.tables).toBe(0);
    expect(built.scale.tablesView).not.toBeNull();
    const row = sheetOf('1_規模概要', built).rows.find(
      (r) => r[0] === 'DBテーブル数',
    );
    expect(row?.[1]).toBe(0);
  });
  it('still says 未解析 when no program has analysis data', () => {
    const inventory = clone();
    for (const program of inventory.programs)
      (program as { analysis?: unknown }).analysis = undefined;
    const built = buildCustomerReport(inventory, origin);
    expect(built.scale.tablesView).toBeNull();
  });
});

describe('AR02 review 1 — finding 5: concatenated SQL is a risk', () => {
  it('adds a risk row when concatenated SQL exists and dynamic SQL is 0', () => {
    const inventory = clone();
    const file = firstAnalyzed(inventory);
    if (file.analysis?.status !== 'analyzed') throw new Error('fixture');
    for (const other of inventory.files)
      if (other.analysis?.status === 'analyzed') {
        other.analysis.dynamicSql = [];
        other.analysis.concatenatedSql = [];
      }
    file.analysis.concatenatedSql = [
      { procedureId: null, operation: 'R', line: 4 },
    ];
    const built = buildCustomerReport(inventory, origin);
    expect(built.database.dynamicSql).toBe(0);
    expect(built.database.concatenatedSql).toBe(1);
    const risk = built.risks.find((r) => r.code === 'CONCATENATED_SQL');
    expect(risk).toMatchObject({ count: 1, source: 'data' });
    expect(risk?.confirmation).not.toBe('');
  });
  it('has no such row without concatenated SQL', () => {
    const inventory = clone();
    for (const f of inventory.files)
      if (f.analysis?.status === 'analyzed') f.analysis.concatenatedSql = [];
    const built = buildCustomerReport(inventory, origin);
    expect(built.risks.some((r) => r.code === 'CONCATENATED_SQL')).toBe(false);
  });
});

describe('AR02 review 1 — finding 6: a folder named like the unowned row', () => {
  it('keeps the folder row apart from the special row; module sums equal the totals', () => {
    const inventory = clone();
    const extra = withUnlistedFile(inventory, 'loose/EXTRA.BAS');
    const [first] = inventory.programs;
    if (!first) throw new Error('fixture');
    first.projectPath = 'プログラム未所属/ORDER.VBP';
    const built = buildCustomerReport(inventory, origin);
    const folder = built.modules.filter(
      (m) => m.kind === 'module' && m.module === 'プログラム未所属',
    );
    expect(folder).toHaveLength(1);
    const special = built.modules.filter((m) => m.kind === 'unassigned');
    expect(special).toHaveLength(1);
    expect(special[0]?.codeLines).toBe(extra.lines);
    expect(folder[0]?.codeLines).toBeGreaterThan(0);
    expect(moduleSum(built, (m) => m.codeLines)).toBe(built.scale.codeLines);
    expect(moduleSum(built, (m) => m.files)).toBe(built.scale.analyzedFiles);
  });
});

describe('AR02 review 2 — SQL of a file no VBP lists', () => {
  function withUnlistedSql() {
    const inventory = clone();
    for (const f of inventory.files)
      if (f.analysis?.status === 'analyzed') {
        f.analysis.dynamicSql = [];
        f.analysis.concatenatedSql = [];
      }
    withUnlistedFile(inventory);
    const extra = inventory.files.find(
      (f) => f.manifest.relativePath === 'loose/EXTRA.BAS',
    );
    if (extra?.analysis?.status !== 'analyzed') throw new Error('fixture');
    extra.analysis.dynamicSql = [
      { procedureId: null, operation: 'R', line: 7 },
    ];
    extra.analysis.concatenatedSql = [
      { procedureId: null, operation: 'U', line: 9 },
    ];
    return inventory;
  }
  it('counts both kinds once per location, like step 2', () => {
    const built = buildCustomerReport(withUnlistedSql(), origin);
    expect(built.database.dynamicSql).toBe(1);
    expect(built.database.concatenatedSql).toBe(1);
    const rest = built.database.sqlByModule.filter(
      (m) => m.module === 'プログラム未所属',
    );
    expect(rest).toEqual([
      { module: 'プログラム未所属', dynamicSql: 1, concatenatedSql: 1 },
    ]);
  });
  it('shows both as risks', () => {
    const built = buildCustomerReport(withUnlistedSql(), origin);
    expect(built.risks.find((r) => r.code === 'DYNAMIC_SQL')?.count).toBe(1);
    expect(built.risks.find((r) => r.code === 'CONCATENATED_SQL')?.count).toBe(
      1,
    );
  });
});

// AR02 review 2 cross-check: the same fixture as the step 2 test in
// analysis-dashboard.test.ts. Every KPI both show must be equal; scopes of
// the others are listed in progress.md.
describe('AR02 review 2 — cross-check with step 2 on an inventory with an unowned file', () => {
  const inventory = unownedSqlInventoryFixture();
  const built = buildCustomerReport(inventory, origin);
  const shared = inventoryKpis(inventory);

  it('shows the KPIs step 2 shows', () => {
    expect(built.scale.programs).toBe(inventory.programs.length);
    expect(built.scale.files).toBe(inventory.totals.files);
    expect(built.scale.analyzedFiles).toBe(shared.analyzedFiles);
    expect(built.scale.codeLines).toBe(
      inventory.totals.uniqueCounters.codeLines,
    );
    expect(built.scale.physicalLines).toBe(
      inventory.totals.uniqueCounters.physicalLines,
    );
    expect(built.scale.procedures).toBe(shared.procedures);
    expect(built.scale.tables).toBe(shared.tables);
    expect(built.database.dynamicSql).toBe(shared.dynamicSql);
    expect(built.database.dynamicSql).toBe(UNOWNED_SQL_EXPECTED.dynamicSql);
    expect(built.database.concatenatedSql).toBe(shared.concatenatedSql);
    expect(built.database.concatenatedSql).toBe(
      UNOWNED_SQL_EXPECTED.concatenatedSql,
    );
  });

  it('puts the unowned file on the unowned row (lines, files, SQL)', () => {
    const rest = built.modules.find((m) => m.kind === 'unassigned');
    expect(rest?.files).toBe(1);
    expect(built.database.sqlByModule).toContainEqual({
      module: 'プログラム未所属',
      dynamicSql: UNOWNED_SQL_EXPECTED.dynamicSql,
      concatenatedSql: UNOWNED_SQL_EXPECTED.concatenatedSql,
    });
    expect(moduleSum(built, (m) => m.codeLines)).toBe(built.scale.codeLines);
  });

  it('raises the risks step 2 warns about', () => {
    const codes = built.risks.map((r) => r.code);
    expect(codes).toContain('DYNAMIC_SQL');
    expect(codes).toContain('CONCATENATED_SQL');
    expect(codes).toContain('UNCLASSIFIED_LINES');
  });

  it('keeps program-scope figures to the programs (apis, references)', () => {
    const fromPrograms = new Set(
      inventory.programs.flatMap((p) =>
        (p.analysis?.externalApis ?? []).map((a) => `${a.library}|${a.name}`),
      ),
    );
    expect(built.dependencies.apis).toHaveLength(fromPrograms.size);
  });
});

// ---- AR02 review 3 (5d8e7da): three P2 findings -----------------------------

describe('AR02 review 3 — finding 1: an unsupported file no VBP lists is a risk', () => {
  function withUnsupportedFile() {
    const inventory = clone();
    const source = firstAnalyzed(inventory);
    const extra = JSON.parse(JSON.stringify(source)) as InvFile;
    extra.manifest.relativePath = 'loose/EXTRA.CTL';
    extra.manifest.role = 'unsupported';
    (extra as { analysis?: unknown }).analysis = undefined;
    inventory.files.push(extra);
    inventory.totals.files += 1;
    inventory.totals.unsupportedFiles += 1;
    return inventory;
  }
  it('raises FILE_UNSUPPORTED as many times as step 2 counts unsupported files', () => {
    const inventory = withUnsupportedFile();
    const built = buildCustomerReport(inventory, origin);
    const risk = built.risks.find((r) => r.code === 'FILE_UNSUPPORTED');
    expect(risk?.count).toBe(inventory.totals.unsupportedFiles);
  });
  it('still counts a file whose analysis says unsupported', () => {
    const inventory = clone();
    const extra = JSON.parse(
      JSON.stringify(firstAnalyzed(inventory)),
    ) as InvFile;
    extra.manifest.relativePath = 'loose/EXTRA2.CTL';
    extra.analysis = { status: 'unsupported', reason: 'user-control' } as never;
    inventory.files.push(extra);
    inventory.totals.files += 1;
    inventory.totals.unsupportedFiles += 1;
    const built = buildCustomerReport(inventory, origin);
    expect(built.risks.find((r) => r.code === 'FILE_UNSUPPORTED')?.count).toBe(
      inventory.totals.unsupportedFiles,
    );
  });
});

describe('AR02 review 3 — finding 2: shared dynamic SQL names every program', () => {
  it('counts the location once and lists both programs', () => {
    const inventory = clone();
    for (const f of inventory.files)
      if (f.analysis?.status === 'analyzed') {
        f.analysis.dynamicSql = [];
        f.analysis.concatenatedSql = [];
      }
    const shared = buildInventoryReport(inventory, ALL_PROGRAMS).files.find(
      (f) => f.usedBy.length > 1 && f.analysisStatus === 'analyzed',
    );
    if (!shared) throw new Error('fixture has no shared file');
    const file = inventory.files.find(
      (f) => f.manifest.relativePath === shared.relativePath,
    );
    if (file?.analysis?.status !== 'analyzed') throw new Error('fixture');
    file.analysis.dynamicSql = [{ procedureId: null, operation: 'R', line: 3 }];
    const built = buildCustomerReport(inventory, origin);
    const risk = built.risks.find((r) => r.code === 'DYNAMIC_SQL');
    expect(built.database.dynamicSql).toBe(1);
    expect(risk?.count).toBe(1);
    expect(risk?.programs.length).toBe(shared.usedBy.length);
    expect(risk?.programs.length).toBeGreaterThan(1);
  });
});

describe('AR02 review 3 — finding 3: unknown concatenated SQL is not 0', () => {
  const legacySql = () => {
    const inventory = clone();
    for (const f of inventory.files)
      if (f.analysis?.status === 'analyzed')
        (f.analysis as { concatenatedSql?: unknown }).concatenatedSql =
          undefined;
    return inventory;
  };
  it('keeps null in the JSON, never 0, and no risk row', () => {
    const built = buildCustomerReport(legacySql(), origin);
    expect(inventoryKpis(legacySql()).concatenatedSql).toBeNull();
    expect(built.database.concatenatedSql).toBeNull();
    for (const row of built.database.sqlByModule)
      expect(row.concatenatedSql).toBeNull();
    expect(built.risks.some((r) => r.code === 'CONCATENATED_SQL')).toBe(false);
  });
  it('stays valid for CustomerReportSchema (null is allowed)', () => {
    const built = buildCustomerReport(legacySql(), origin);
    expect(Check(CustomerReportSchema, JSON.parse(JSON.stringify(built)))).toBe(
      true,
    );
  });
  it('says 未解析 in the workbook instead of 0', () => {
    const built = buildCustomerReport(legacySql(), origin);
    const sheet = sheetOf('4_データベース', built);
    const text = JSON.stringify(sheet.rows);
    expect(text).toContain(NOT_ANALYZED);
    expect(text).toContain('連結 ' + NOT_ANALYZED);
  });
});

// ---- AR03 review 2: the statement about table names (sheet 4 note) ---------

describe('AR03 review 2 — sheet 4 note about the schema follows the report state', () => {
  const noteOf = (inventory: SourceInventoryDocument) => {
    const built = buildCustomerReport(inventory, origin);
    return (sheetOf('4_データベース', built).notes ?? []).join('\n');
  };
  it('assumed: asks the database administrator to confirm', () => {
    const inventory = clone();
    inventory.tableNames = {
      version: 'table-name-v1',
      defaultSchema: 'APP',
      status: 'assumed',
    };
    expect(noteOf(inventory)).toContain('仮定');
  });
  it('confirmed with tables: says confirmed, not assumed', () => {
    const inventory = clone();
    inventory.tableNames = {
      version: 'table-name-v1',
      defaultSchema: 'APP',
      status: 'confirmed',
    };
    const text = noteOf(inventory);
    expect(text).toContain('確認済み');
    expect(text).not.toContain('仮定');
  });
  it('no table found: claims neither', () => {
    const inventory = clone();
    inventory.tableNames = {
      version: 'table-name-v1',
      defaultSchema: 'APP',
      status: 'confirmed',
    };
    for (const program of inventory.programs)
      if (program.analysis) {
        program.analysis.crud = [];
        program.analysis.normalizedCrud = [];
      }
    const text = noteOf(inventory);
    expect(text).toContain('検出されませんでした');
    expect(text).not.toContain('確認済み');
    expect(text).not.toContain('仮定');
  });
  it('not analyzed: says there is no data', () => {
    const inventory = clone();
    for (const program of inventory.programs)
      (program as { analysis?: unknown }).analysis = undefined;
    const text = noteOf(inventory);
    expect(text).toContain('解析データがない');
    expect(text).not.toContain('仮定');
  });
});

// ---- Report templates and output functions in the customer report ---------

describe('report template count (customer report)', () => {
  it('lists a missing template once in the risks, and every function to confirm', () => {
    const missing = report.risks.find((r) => r.code === 'REPORT_FILE_MISSING');
    expect(missing).toMatchObject({ count: 1, source: 'warning' });
    const confirm = report.risks.find((r) => r.code === 'REPORT_SUSPECTED');
    // print, CSV, Excel; the log file is not a function to confirm.
    expect(confirm?.count).toBe(3);
    expect(confirm?.content).toContain('帳票の種類には含みません');
  });

  it('sheet 1 says how many templates, with and without the design file, and how many functions', () => {
    const rows = sheetOf('1_規模概要').rows;
    const templates = rows.find((r) => r[0] === '帳票（種類）');
    expect(templates?.[1]).toBe(3);
    expect(templates?.[2]).toBe('設計ファイルあり 2／なし 1');
    const exports = rows.find((r) => r[0] === 'Excel/CSV出力（要確認）');
    expect(exports?.[1]).toBe(2);
    expect(String(exports?.[2])).toContain('2 プログラム');
    const prints = rows.find((r) => r[0] === '印刷・その他出力（要確認）');
    expect(prints?.[1]).toBe(1);
    expect(String(prints?.[2])).toContain('ログ・一時ファイル 1 件は除外');
    // Nothing is called a suspected report any more.
    expect(JSON.stringify(sheetOf('1_規模概要').rows)).not.toContain(
      '帳票（疑い）',
    );
  });

  it('sheet 6: one row per template with its programs and uses, functions apart, log excluded', () => {
    const items = report.items;
    const order = items.find(
      (i) => i.type === '帳票' && i.name === 'order.rpt',
    );
    expect(order).toMatchObject({
      confidenceLabel: '設計ファイルあり',
      level: 'high',
    });
    expect(order?.note).toContain('使用箇所 2 か所');
    const summary = items.find((i) => i.name === 'summary.rpt');
    expect(summary?.confidenceLabel).toBe('設計ファイルなし');
    const functions = items.filter((i) => i.type === '出力機能');
    expect(functions.map((f) => f.kindLabel).sort()).toEqual(
      ['CSV出力', 'Excel出力', 'ファイル出力', '印刷'].sort(),
    );
    const log = functions.find((f) => f.confidenceLabel.startsWith('対象外'));
    expect(log?.note).toContain('ログ');
  });

  it('the level distribution and the module table count templates and functions', () => {
    expect(report.complexity.reportLevels).toMatchObject({
      high: 1,
      medium: 1,
      unrated: 1,
    });
    const sum = (pick: (m: CustomerReport['modules'][number]) => number) =>
      report.modules.reduce((n, m) => n + pick(m), 0);
    expect(sum((m) => m.reports)).toBe(3);
    expect(sum((m) => m.suspectedReports)).toBe(3);
  });

  it('an inventory without screen/report data has no template numbers (not 0)', () => {
    const old = buildCustomerReport(legacy(), origin);
    expect(old.scale.reportTemplates).toBeNull();
    expect(old.scale.outputFunctions).toBeNull();
  });
});
