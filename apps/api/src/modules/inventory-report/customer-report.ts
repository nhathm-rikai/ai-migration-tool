import {
  crudTables,
  inventoryKpis,
  sqlUses,
  normalizeScreenReportTotals,
  type SourceInventoryDocument,
} from '@portal/contracts';
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
    // null: no program has analysis data (not 0).
    tablesView: 'normalized' | 'raw' | null;
    // The table names rest on an assumed or unconfirmed schema mapping.
    tablesAssumed: boolean;
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
      // Declared as Reference= (type library) or Object= (OCX component).
      kind: 'reference' | 'component';
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
  concatenatedSql: { count: number; programIds: readonly string[] } = {
    count: 0,
    programIds: [],
  },
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
  // String-built SQL is a risk of its own, whether or not dynamic SQL exists.
  if (concatenatedSql.count > 0)
    push('CONCATENATED_SQL', 'data', {
      count: concatenatedSql.count,
      programs: new Set(concatenatedSql.programIds),
      known: true,
    });
  return rows.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      b.count - a.count ||
      byText(a.code, b.code),
  );
}

// The technical report warns about files a program lists; step 2 warns by
// the totals of the whole inventory. Files no project lists are added here so
// both raise the same warnings (error, unsupported, unclassified lines).
function unlistedFileWarnings(
  inventory: Inventory,
  listed: ReadonlyMap<string, readonly string[]>,
): ReportWarning[] {
  const out: ReportWarning[] = [];
  for (const file of inventory.files) {
    const path = file.manifest.relativePath;
    if (listed.has(path)) continue;
    const warning = (code: string, detail: string): ReportWarning => ({
      code,
      programId: null,
      relativePath: path,
      line: null,
      detail,
    });
    if (file.manifest.kind === 'error')
      out.push(warning('FILE_ERROR', file.manifest.errorCode));
    else if (file.analysis?.status === 'unsupported')
      out.push(warning('FILE_UNSUPPORTED', file.analysis.reason));
    else if (
      file.analysis?.status === 'analyzed' &&
      file.analysis.counters.unclassifiedLines > 0
    )
      out.push(
        warning(
          'UNCLASSIFIED_LINES',
          `${file.analysis.counters.unclassifiedLines} lines`,
        ),
      );
  }
  return out;
}

// ---- Builder ---------------------------------------------------------------

export function buildCustomerReport(
  inventory: Inventory,
  origin: ReportOrigin | null = null,
): CustomerReport {
  const core = buildInventoryReport(inventory, ALL_PROGRAMS, origin);
  // The unique totals are those of the whole inventory, every analyzed file
  // (also one no project lists), exactly what step 2 shows; the technical
  // report only reaches the files the programs list.
  const kpis = inventoryKpis(inventory);
  const unique = {
    ...inventory.totals.uniqueCounters,
    procedures: kpis.procedures,
  };
  // The totals as the project-level list defines them (stored inventories
  // without it are derived by the same function). The list itself carries
  // names and files and stays out of the customer JSON; the items of sheet 6
  // are built from it with redacted paths.
  const normalized = normalizeScreenReportTotals(inventory);
  const screenReport: ScreenReportTotals | null = normalized
    ? {
        screens: normalized.screens,
        sharedScreens: normalized.sharedScreens,
        batches: normalized.batches,
        reports: normalized.reports,
        suspectedPrograms: normalized.suspectedPrograms,
      }
    : null;
  const pathOf = new Map(core.programs.map((p) => [p.id, p.projectPath]));
  const moduleOfProgram = (id: string) => moduleOf(pathOf.get(id) ?? '');

  // Tables: by the function step 2 uses (contracts), so both show the same
  // count; the mapped view when there is one, else as written.
  const crud = crudTables(inventory);
  const tableRows = crud.tables;

  // Modules: own code by folder, shared files on one row, and whatever no
  // program lists, so the rows add up to the unique totals.
  const sharedFiles = core.files.filter(
    (file) => file.analysisStatus === 'analyzed' && file.usedBy.length > 1,
  );
  // Keyed by kind and label: a folder may carry the label of a special row.
  const modules = new Map<string, ModuleRow>();
  const moduleRow = (name: string, kind: ModuleRow['kind']): ModuleRow => {
    const key = kind + '\u0000' + name;
    let row = modules.get(key);
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
      modules.set(key, row);
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
    if (ref.kind !== 'component' && ref.kind !== 'reference') continue;
    const key = `${ref.kind}|${ref.identifier}|${ref.fileName ?? ''}`;
    const entry = components.get(key) ?? {
      kind: ref.kind,
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
    { module: string; dynamicSql: number; concatenatedSql: number }
  >();
  const countSql = (
    rows: readonly { usedBy: string[] }[],
    field: 'dynamicSql' | 'concatenatedSql',
  ) => {
    for (const row of rows) {
      const label =
        row.usedBy.length > 1
          ? SHARED_MODULE
          : row.usedBy[0] !== undefined
            ? moduleOfProgram(row.usedBy[0])
            : UNASSIGNED_MODULE;
      const kind =
        row.usedBy.length > 1
          ? 'shared'
          : row.usedBy[0] !== undefined
            ? 'module'
            : 'unassigned';
      const key = kind + '\u0000' + label;
      const entry = sqlModules.get(key) ?? {
        module: label,
        dynamicSql: 0,
        concatenatedSql: 0,
      };
      entry[field] += 1;
      sqlModules.set(key, entry);
    }
  };
  // Every analyzed file counts (also one no project lists, which falls on
  // the unowned row), each (file, line) once: the same rows step 2 counts.
  const usedByFile = new Map(core.files.map((f) => [f.relativePath, f.usedBy]));
  const sqlRows = sqlUses(inventory).map((use) => ({
    ...use,
    usedBy: usedByFile.get(use.relativePath) ?? [],
  }));
  const dynamicRows = sqlRows.filter((row) => row.kind === 'dynamic');
  const concatenatedRows = sqlRows.filter((row) => row.kind === 'concatenated');
  countSql(dynamicRows, 'dynamicSql');
  countSql(concatenatedRows, 'concatenatedSql');

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
      tablesView: !crud.analyzed ? null : crud.mapped ? 'normalized' : 'raw',
      tablesAssumed: crud.analyzed && crud.assumed,
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
          kind: c.kind,
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
          operations: [...entry.operations]
            .sort(
              (a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b),
            )
            .join(''),
        }))
        .sort((a, b) => b.programs - a.programs || byText(a.table, b.table))
        .slice(0, TOP_TABLES),
      sqlByModule: [...sqlModules.values()].sort((a, b) =>
        byText(a.module, b.module),
      ),
      dynamicSql: dynamicRows.length,
      concatenatedSql: concatenatedRows.length,
    },
    risks: buildRisks(
      // One DYNAMIC_SQL warning per location of every analyzed file; the
      // technical report only warns for files a program lists.
      [
        ...core.warnings.filter((warning) => warning.code !== 'DYNAMIC_SQL'),
        ...unlistedFileWarnings(inventory, usedByFile),
        ...dynamicRows.map((row) => ({
          code: 'DYNAMIC_SQL',
          programId: row.usedBy[0] ?? null,
          relativePath: row.relativePath,
          line: row.line,
          detail: row.operation,
        })),
      ],
      [...components.values()].map((c) => ({ programIds: [...c.ids] })),
      [...apis.values()].map((a) => ({ programIds: [...a.ids] })),
      {
        count: concatenatedRows.length,
        programIds: concatenatedRows.flatMap((row) => row.usedBy),
      },
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
  const projectReports = normalizeScreenReportTotals(inventory);
  if (!projectReports) return [];
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
  for (const item of projectReports.reportItems)
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
