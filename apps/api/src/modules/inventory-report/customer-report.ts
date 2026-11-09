import type { SourceInventoryDocument } from '@portal/contracts';
import {
  CONFIDENCE_LABELS,
  CUSTOMER_REPORT_VERSION,
  FACTOR_LABELS,
  LEVEL_LABELS,
  REASON_LABELS,
  RECOMMENDATIONS,
  REPORT_KIND_LABELS,
  SHARED_MODULE,
  UNASSIGNED_MODULE,
} from './customer-report-constants.js';
import {
  OTHER_RISK_CODE,
  RISK_CATALOG,
  type RiskSeverity,
} from './customer-risk-catalog.js';
import {
  ALL_PROGRAMS,
  buildInventoryReport,
  redactAbsolutePath,
  type InventoryReport,
  type ReportOrigin,
  type ReportWarning,
} from './inventory-report.js';

// Customer assessment report (AR02): the same inventory, read for a
// customer. It reuses the technical report for everything it can (unique
// totals, warnings, files, CRUD, references) and the screen/report counts of
// AR04 as they are, so no figure is counted a second way here. All customer
// wording is in customer-report-constants.ts and customer-risk-catalog.ts.

type Inventory = SourceInventoryDocument;
type ScreenReportTotals = NonNullable<Inventory['totals']['screenReport']>;
type Level = 'low' | 'medium' | 'high' | 'very-high';

export type ModuleRow = {
  module: string;
  kind: 'module' | 'shared' | 'unassigned';
  programs: number;
  screens: number;
  reports: number;
  suspectedReports: number;
  batches: number;
  files: number;
  codeLines: number;
};

export type RiskRow = {
  code: string;
  // Where the count comes from: warnings of the technical report, or a group
  // taken from the data (external components, native APIs).
  source: 'warning' | 'data';
  category: string;
  severity: RiskSeverity;
  count: number;
  content: string;
  programs: string[];
  otherPrograms: number;
  confirmation: string;
};

export type ItemRow = {
  type: '画面' | '帳票' | 'バッチ';
  kindLabel: string;
  programs: string;
  module: string;
  name: string;
  file: string;
  line: number | null;
  shared: boolean;
  confidence: string;
  confidenceLabel: string;
  level: string | null;
  levelLabel: string | null;
  score: number | null;
  modelVersion: string | null;
  factors: string;
  note: string;
};

export type CustomerReport = {
  reportVersion: typeof CUSTOMER_REPORT_VERSION;
  language: 'ja';
  source: InventoryReport['source'];
  scale: {
    programs: number;
    completePrograms: number;
    files: number;
    analyzedFiles: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
    physicalLines: number;
    procedures: number;
    tables: number;
    tablesView: 'normalized' | 'raw' | null;
    // null: the inventory has no screen/report data (not zero).
    screenReport: ScreenReportTotals | null;
  };
  modules: ModuleRow[];
  complexity: {
    version: string;
    // null: the model of this inventory has no such level.
    levels: Record<Level, number | null>;
    notAnalyzed: number;
    reportModelVersion: string | null;
    reportLevels: ScreenReportTotals['reports']['byLevel'] | null;
    top: {
      program: string;
      module: string;
      level: Level;
      score: number;
      codeLines: number;
      screens: number | null;
      reports: number | null;
    }[];
  };
  dependencies: {
    shared: {
      file: string;
      programs: number;
      procedures: number;
      codeLines: number;
    }[];
    components: {
      identifier: string;
      fileName: string | null;
      description: string | null;
      programs: number;
    }[];
    apis: { name: string; library: string; programs: number }[];
  };
  database: {
    tables: { table: string; programs: number; operations: string }[];
    sqlByModule: {
      module: string;
      dynamicSql: number;
      concatenatedSql: number;
    }[];
    dynamicSql: number;
    concatenatedSql: number;
  };
  risks: RiskRow[];
  items: ItemRow[];
  recommendations: readonly string[];
};

const TOP_PROGRAMS = 20;
const TOP_SHARED = 15;
const TOP_TABLES = 30;
const MAX_LISTED_PROGRAMS = 10;
const SEVERITY_ORDER: RiskSeverity[] = ['高', '中', '低'];
const OPERATION_ORDER = 'CRUDX';

const moduleOf = (projectPath: string) => {
  const parts = projectPath.split(/[\\/]/);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
};
const programLabel = (projectPath: string) => {
  const file = projectPath.split(/[\\/]/).pop() ?? projectPath;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
};
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ---- Risks -----------------------------------------------------------------

export function buildRisks(
  warnings: readonly ReportWarning[],
  components: readonly { programIds: readonly string[] }[],
  apis: readonly { programIds: readonly string[] }[],
): RiskRow[] {
  type Group = { count: number; programs: Set<string>; known: boolean };
  const groups = new Map<string, Group>();
  const add = (
    code: string,
    programId: string | null,
    by: number,
    known: boolean,
  ) => {
    const group = groups.get(code) ?? {
      count: 0,
      programs: new Set<string>(),
      known,
    };
    group.count += by;
    if (programId) group.programs.add(programId);
    groups.set(code, group);
  };
  for (const warning of warnings) {
    const known =
      warning.code in RISK_CATALOG && warning.code !== OTHER_RISK_CODE;
    add(known ? warning.code : OTHER_RISK_CODE, warning.programId, 1, known);
  }
  const data = new Map<string, Set<string>>();
  for (const [code, rows] of [
    ['EXTERNAL_COMPONENT', components],
    ['EXTERNAL_API', apis],
  ] as const)
    for (const row of rows) {
      const programs = data.get(code) ?? new Set<string>();
      for (const id of row.programIds) programs.add(id);
      data.set(code, programs);
    }
  const rows: RiskRow[] = [];
  const push = (code: string, source: RiskRow['source'], group: Group) => {
    const entry = RISK_CATALOG[code] ?? RISK_CATALOG[OTHER_RISK_CODE];
    if (!entry) throw new Error('risk catalog has no fallback');
    const programs = [...group.programs].sort(byText);
    rows.push({
      code,
      source,
      category: entry.category,
      severity: entry.severity,
      count: group.count,
      content: entry.content,
      programs: programs.slice(0, MAX_LISTED_PROGRAMS),
      otherPrograms: Math.max(0, programs.length - MAX_LISTED_PROGRAMS),
      confirmation: entry.confirmation,
    });
  };
  for (const [code, group] of groups) push(code, 'warning', group);
  for (const [code, programs] of data)
    push(code, 'data', {
      count: code === 'EXTERNAL_COMPONENT' ? components.length : apis.length,
      programs,
      known: true,
    });
  return rows.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      b.count - a.count ||
      byText(a.code, b.code),
  );
}

// ---- Builder ---------------------------------------------------------------

export function buildCustomerReport(
  inventory: Inventory,
  origin: ReportOrigin | null = null,
): CustomerReport {
  const core = buildInventoryReport(inventory, ALL_PROGRAMS, origin);
  const unique = core.totals.unique;
  const screenReport = inventory.totals.screenReport ?? null;
  const pathOf = new Map(core.programs.map((p) => [p.id, p.projectPath]));
  const moduleOfProgram = (id: string) => moduleOf(pathOf.get(id) ?? '');

  // Tables: the mapped view when the inventory has one, else as written.
  const mapped = core.crud.some((row) => row.view === 'normalized');
  const view = mapped ? 'normalized' : 'raw';
  const tableRows = new Map<
    string,
    { programs: Set<string>; ops: Set<string> }
  >();
  for (const row of core.crud) {
    if (row.view !== view) continue;
    const entry = tableRows.get(row.table) ?? {
      programs: new Set<string>(),
      ops: new Set<string>(),
    };
    entry.programs.add(row.programId);
    for (const op of row.operations) entry.ops.add(op);
    tableRows.set(row.table, entry);
  }

  // Modules: own code by folder, shared files on one row, and whatever no
  // program lists, so the rows add up to the unique totals.
  const sharedFiles = core.files.filter(
    (file) => file.analysisStatus === 'analyzed' && file.usedBy.length > 1,
  );
  const modules = new Map<string, ModuleRow>();
  const moduleRow = (name: string, kind: ModuleRow['kind']): ModuleRow => {
    let row = modules.get(name);
    if (!row) {
      row = {
        module: name,
        kind,
        programs: 0,
        screens: 0,
        reports: 0,
        suspectedReports: 0,
        batches: 0,
        files: 0,
        codeLines: 0,
      };
      modules.set(name, row);
    }
    return row;
  };
  const sharedRow = moduleRow(SHARED_MODULE, 'shared');
  sharedRow.files = sharedFiles.length;
  sharedRow.codeLines = sharedFiles.reduce(
    (sum, file) => sum + (file.counters?.codeLines ?? 0),
    0,
  );
  const seenScreens = new Set<string>();
  const seenReports = new Set<string>();
  for (const program of inventory.programs) {
    const row = moduleRow(moduleOf(program.projectPath), 'module');
    row.programs += 1;
    row.files += program.analysis?.metrics.ownFiles ?? 0;
    row.codeLines += program.analysis?.metrics.ownCodeLines ?? 0;
    if (program.programType === 'batch') row.batches += 1;
    for (const screen of program.screens ?? []) {
      const key = screen.warnings.includes('SCREEN_FILE_MISSING')
        ? screen.file.toLowerCase()
        : screen.file;
      if (seenScreens.has(key)) continue;
      seenScreens.add(key);
      (screen.shared ? sharedRow : row).screens += 1;
    }
    for (const report of program.reports ?? []) {
      const key = [
        report.kind,
        report.file,
        report.line,
        report.name.toLowerCase(),
      ].join('\u0000');
      if (seenReports.has(key)) continue;
      seenReports.add(key);
      const target = report.shared ? sharedRow : row;
      if (report.confidence === 'suspected') target.suspectedReports += 1;
      else target.reports += 1;
    }
  }
  const rest = {
    files:
      inventory.totals.analyzedCodeFiles -
      [...modules.values()].reduce((sum, row) => sum + row.files, 0),
    codeLines:
      unique.codeLines -
      [...modules.values()].reduce((sum, row) => sum + row.codeLines, 0),
  };
  if (rest.files > 0 || rest.codeLines > 0) {
    const row = moduleRow(UNASSIGNED_MODULE, 'unassigned');
    row.files = Math.max(0, rest.files);
    row.codeLines = Math.max(0, rest.codeLines);
  }
  const moduleList = [...modules.values()].sort(
    (a, b) =>
      ['module', 'shared', 'unassigned'].indexOf(a.kind) -
        ['module', 'shared', 'unassigned'].indexOf(b.kind) ||
      byText(a.module, b.module),
  );

  // Complexity of programs, as stored (one model per inventory).
  const v0 = inventory.complexityVersion.startsWith('complexity-v0');
  const levels: Record<Level, number | null> = {
    low: 0,
    medium: 0,
    high: 0,
    'very-high': v0 ? null : 0,
  };
  let notAnalyzed = 0;
  const ranked: CustomerReport['complexity']['top'] = [];
  for (const program of inventory.programs) {
    const complexity = program.analysis?.complexity;
    if (!complexity) {
      notAnalyzed += 1;
      continue;
    }
    levels[complexity.level] = (levels[complexity.level] ?? 0) + 1;
    ranked.push({
      program: programLabel(program.projectPath),
      module: moduleOf(program.projectPath),
      level: complexity.level,
      score: complexity.score,
      codeLines: program.counters.codeLines,
      screens: program.screens ? program.screens.length : null,
      reports: program.reports
        ? program.reports.filter((r) => r.confidence !== 'suspected').length
        : null,
    });
  }
  ranked.sort((a, b) => b.score - a.score || byText(a.program, b.program));

  // Shared modules by number of programs that list them.
  const shared = sharedFiles
    .map((file) => ({
      file: file.relativePath,
      programs: file.usedBy.length,
      procedures: file.procedures ?? 0,
      codeLines: file.counters?.codeLines ?? 0,
    }))
    .sort((a, b) => b.programs - a.programs || byText(a.file, b.file))
    .slice(0, TOP_SHARED);
  const components = new Map<
    string,
    CustomerReport['dependencies']['components'][number] & { ids: Set<string> }
  >();
  for (const ref of core.externalReferences) {
    if (ref.kind !== 'component') continue;
    const key = `${ref.identifier}|${ref.fileName ?? ''}`;
    const entry = components.get(key) ?? {
      identifier: ref.identifier,
      fileName: ref.fileName,
      description: ref.description,
      programs: 0,
      ids: new Set<string>(),
    };
    entry.ids.add(ref.programId);
    entry.programs = entry.ids.size;
    components.set(key, entry);
  }
  const apis = new Map<
    string,
    { name: string; library: string; ids: Set<string> }
  >();
  for (const api of core.externalApis) {
    const key = `${api.library}|${api.name}`.toLowerCase();
    const entry = apis.get(key) ?? {
      name: api.name,
      library: api.library,
      ids: new Set<string>(),
    };
    entry.ids.add(api.programId);
    apis.set(key, entry);
  }

  // Dynamic and concatenated SQL by module of the file's program.
  const sqlModules = new Map<
    string,
    { dynamicSql: number; concatenatedSql: number }
  >();
  const countSql = (
    rows: readonly { usedBy: string[] }[],
    field: 'dynamicSql' | 'concatenatedSql',
  ) => {
    for (const row of rows) {
      const name =
        row.usedBy.length > 1
          ? SHARED_MODULE
          : row.usedBy[0] !== undefined
            ? moduleOfProgram(row.usedBy[0])
            : UNASSIGNED_MODULE;
      const entry = sqlModules.get(name) ?? {
        dynamicSql: 0,
        concatenatedSql: 0,
      };
      entry[field] += 1;
      sqlModules.set(name, entry);
    }
  };
  countSql(core.dynamicSql, 'dynamicSql');
  countSql(core.concatenatedSql, 'concatenatedSql');

  return {
    reportVersion: CUSTOMER_REPORT_VERSION,
    language: 'ja',
    source: core.source,
    scale: {
      programs: inventory.programs.length,
      completePrograms: inventory.programs.filter(
        (p) => p.status === 'parsed' && p.complete,
      ).length,
      files: inventory.totals.files,
      analyzedFiles: inventory.totals.analyzedCodeFiles,
      codeLines: unique.codeLines,
      commentLines: unique.commentOnlyLines,
      blankLines: unique.blankLines,
      physicalLines: unique.physicalLines,
      procedures: unique.procedures,
      tables: tableRows.size,
      tablesView: tableRows.size === 0 && !mapped ? null : view,
      screenReport,
    },
    modules: moduleList,
    complexity: {
      version: inventory.complexityVersion,
      levels,
      notAnalyzed,
      reportModelVersion: inventory.reportComplexityVersion ?? null,
      reportLevels: screenReport ? screenReport.reports.byLevel : null,
      top: ranked.slice(0, TOP_PROGRAMS),
    },
    dependencies: {
      shared,
      components: [...components.values()]
        .map((c) => ({
          identifier: c.identifier,
          fileName: c.fileName,
          description: c.description,
          programs: c.programs,
        }))
        .sort(
          (a, b) =>
            b.programs - a.programs || byText(a.identifier, b.identifier),
        ),
      apis: [...apis.values()]
        .map((api) => ({
          name: api.name,
          library: api.library,
          programs: api.ids.size,
        }))
        .sort((a, b) => b.programs - a.programs || byText(a.name, b.name)),
    },
    database: {
      tables: [...tableRows]
        .map(([table, entry]) => ({
          table,
          programs: entry.programs.size,
          operations: [...entry.ops]
            .sort(
              (a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b),
            )
            .join(''),
        }))
        .sort((a, b) => b.programs - a.programs || byText(a.table, b.table))
        .slice(0, TOP_TABLES),
      sqlByModule: [...sqlModules]
        .map(([module, counts]) => ({ module, ...counts }))
        .sort((a, b) => byText(a.module, b.module)),
      dynamicSql: core.dynamicSql.length,
      concatenatedSql: core.concatenatedSql.length,
    },
    risks: buildRisks(
      core.warnings,
      [...components.values()].map((c) => ({ programIds: [...c.ids] })),
      [...apis.values()].map((a) => ({ programIds: [...a.ids] })),
    ),
    items: buildItems(inventory),
    recommendations: RECOMMENDATIONS,
  };
}

// ---- Screen and report list -----------------------------------------------

const ITEM_TYPE_ORDER = ['画面', '帳票', 'バッチ'];
const WARNING_LABELS: Record<string, string> = {
  SCREEN_FILE_MISSING: '画面ファイルがソースにありません',
  SCREEN_FILE_NOT_ANALYZED:
    '画面ファイルを解析できません（画面数には含みます）',
  REPORT_FILE_MISSING: '帳票定義ファイル(.rpt)がソースにありません',
};

function buildItems(inventory: Inventory): ItemRow[] {
  if (!inventory.totals.screenReport) return [];
  type Owner = { label: string; module: string };
  const screens = new Map<
    string,
    {
      row: NonNullable<Inventory['programs'][number]['screens']>[number];
      owners: Owner[];
    }
  >();
  const reports = new Map<
    string,
    {
      row: NonNullable<Inventory['programs'][number]['reports']>[number];
      owners: Owner[];
    }
  >();
  const items: ItemRow[] = [];
  for (const program of inventory.programs) {
    const owner = {
      label: programLabel(program.projectPath),
      module: moduleOf(program.projectPath),
    };
    for (const screen of program.screens ?? []) {
      const key = screen.warnings.includes('SCREEN_FILE_MISSING')
        ? screen.file.toLowerCase()
        : screen.file;
      const entry = screens.get(key) ?? { row: screen, owners: [] };
      entry.owners.push(owner);
      screens.set(key, entry);
    }
    if (program.programType === 'batch')
      items.push({
        type: 'バッチ',
        kindLabel: 'バッチ（Sub Main 起動・画面なし）',
        programs: owner.label,
        module: owner.module,
        name: program.name ?? owner.label,
        file: redactAbsolutePath(program.projectPath),
        line: null,
        shared: false,
        confidence: 'detected',
        confidenceLabel: CONFIDENCE_LABELS['detected'] ?? '',
        level: null,
        levelLabel: null,
        score: null,
        modelVersion: null,
        factors: '',
        note: '',
      });
  }
  // Reports come from the project-level list the analyzer computed once (a
  // shared report at its highest score), never from the program rows.
  for (const item of inventory.totals.screenReport.reportItems)
    reports.set(
      [item.kind, item.file, item.line, item.name.toLowerCase()].join('\u0000'),
      {
        row: item,
        owners: item.programs.map((entry) => ({
          label: programLabel(entry.program),
          module: moduleOf(entry.program),
        })),
      },
    );
  const who = (owners: Owner[]) => {
    const labels = [...new Set(owners.map((o) => o.label))];
    return labels.length <= 3
      ? labels.join('、')
      : `${labels.slice(0, 3).join('、')} 他${labels.length - 3}件`;
  };
  for (const { row, owners } of screens.values())
    items.push({
      type: '画面',
      kindLabel: '画面（フォーム）',
      programs: who(owners),
      module: row.shared ? SHARED_MODULE : (owners[0]?.module ?? ''),
      name: row.name ?? '',
      file: redactAbsolutePath(row.file),
      line: null,
      shared: row.shared,
      confidence: 'detected',
      confidenceLabel: CONFIDENCE_LABELS['detected'] ?? '',
      level: null,
      levelLabel: null,
      score: null,
      modelVersion: null,
      factors: '',
      note: row.warnings.map((code) => WARNING_LABELS[code] ?? code).join('；'),
    });
  for (const { row, owners } of reports.values()) {
    const complexity = row.complexity;
    const notes = [
      ...(complexity.reason
        ? [REASON_LABELS[complexity.reason] ?? complexity.reason]
        : []),
      ...row.warnings.map((code) => WARNING_LABELS[code] ?? code),
    ];
    items.push({
      type: '帳票',
      kindLabel: REPORT_KIND_LABELS[row.kind] ?? row.kind,
      programs: who(owners),
      module: row.shared ? SHARED_MODULE : (owners[0]?.module ?? ''),
      name: redactAbsolutePath(row.name),
      file: redactAbsolutePath(row.file),
      line: row.line,
      shared: row.shared,
      confidence: row.confidence,
      confidenceLabel: CONFIDENCE_LABELS[row.confidence] ?? row.confidence,
      level: complexity.level,
      levelLabel: LEVEL_LABELS[complexity.level] ?? complexity.level,
      score: complexity.score,
      modelVersion: complexity.version,
      factors: complexity.factors
        .map((f) =>
          f.factor === 'design-not-analyzed'
            ? (FACTOR_LABELS[f.factor] ?? f.factor)
            : `${FACTOR_LABELS[f.factor] ?? f.factor} ${f.value} (+${f.points})`,
        )
        .join('；'),
      note: notes.join('；'),
    });
  }
  return items.sort(
    (a, b) =>
      ITEM_TYPE_ORDER.indexOf(a.type) - ITEM_TYPE_ORDER.indexOf(b.type) ||
      byText(a.module, b.module) ||
      byText(a.file, b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}
