import { mappedInventoryFixture } from '@portal/contracts/fixtures';
import {
  REPORT_COMPLEXITY_VERSION,
  type SourceInventoryDocument,
} from '@portal/contracts';

type Inventory = SourceInventoryDocument;

// Unconfigured schema: the analyzer stored a case-only mapped view with
// HAN01.ORDERS and ORDERS apart; the UI infers HAN01 and merges them.
export function inferredCorpus(): Inventory {
  const inventory = structuredClone(mappedInventoryFixture) as Inventory;
  inventory.tableNames = {
    version: 'table-name-v1',
    defaultSchema: null,
    status: 'unconfigured',
  };
  const file = inventory.files[1]?.analysis;
  const analysis = inventory.programs[0]?.analysis;
  if (file?.status !== 'analyzed' || !analysis) throw new Error('fixture');
  file.sqlTables = [
    { table: 'HAN01.ORDERS', operation: 'R', line: 6, procedureId: null },
    { table: 'ORDERS', operation: 'U', line: 8, procedureId: null },
  ];
  analysis.crud = [
    {
      table: 'HAN01.ORDERS',
      operations: ['R'],
      evidence: { relativePath: 'cmn/OrderRules.bas', line: 6 },
      viaSharedOnly: false,
    },
    {
      table: 'ORDERS',
      operations: ['U'],
      evidence: { relativePath: 'cmn/OrderRules.bas', line: 8 },
      viaSharedOnly: false,
    },
  ];
  analysis.normalizedCrud = analysis.crud.map((entry) => ({
    ...entry,
    names: [entry.table],
  }));
  analysis.metrics = { ...analysis.metrics, tables: 2, normalizedTables: 2 };
  return inventory;
}

type InventoryFile = Inventory['files'][number];
type Procedure = Extract<
  NonNullable<InventoryFile['analysis']>,
  { status: 'analyzed' }
>['procedures'][number];
type Call = NonNullable<
  Inventory['programs'][number]['analysis']
>['calls'][number];

export const PROCEDURE_PROGRAM = 'apps/Order/Order.vbp';

const procedure = (
  path: string,
  kind: string,
  name: string,
  startLine: number,
  visibility: Procedure['visibility'] = 'private',
): Procedure => ({
  id: `${path}#${kind}:${name}`,
  kind,
  name,
  visibility,
  startLine,
  endLine: startLine + 4,
  codeLines: 3,
  decisionPoints: 1,
});

function codeFile(
  relativePath: string,
  analysis: Partial<
    Extract<NonNullable<InventoryFile['analysis']>, { status: 'analyzed' }>
  >,
): InventoryFile {
  const base = mappedInventoryFixture.files[1];
  return {
    manifest: { ...base.manifest, relativePath },
    analysis: {
      status: 'analyzed',
      counters: {
        physicalLines: 9,
        designerLines: 0,
        metadataLines: 2,
        blankLines: 1,
        commentOnlyLines: 0,
        codeLines: 6,
        unclassifiedLines: 0,
      },
      procedures: [],
      fileLevelCodeLines: 1,
      sqlTables: [],
      dynamicSql: [],
      externalDeclarations: [],
      labels: [],
      ...analysis,
    },
  };
}

const call = (
  from: string,
  target: string | string[],
  resolution: Call['resolution'],
  line: number,
  count = 1,
): Call => {
  const targets = Array.isArray(target) ? target : [target];
  return {
    from,
    name: (targets[0] ?? '').split(':').pop() ?? '',
    resolution,
    targets,
    line,
    count,
  };
};

// One program with an own form and two shared modules: Form_Load →
// LocalHelper → UtilRun (shared) → UtilDb and GetTickCount (Declare),
// UtilRun is recursive, cmdOk_Click calls `Dup` that both shared modules
// define (ambiguous). UtilUnused is shared and called by nothing here.
// Tables: APP.ORDERS / ORDERS (one table after mapping APP) and LOGS.
export function procedureCorpus(): Inventory {
  const form = 'apps/Order/Order.frm';
  const util = 'cmn/util.bas';
  const other = 'cmn/other.bas';
  const id = (path: string, kind: string, name: string) =>
    `${path}#${kind}:${name}`;
  const inventory = structuredClone(mappedInventoryFixture) as Inventory;
  inventory.files = [
    codeFile(form, {
      procedures: [
        procedure(form, 'Sub', 'Form_Load', 10),
        procedure(form, 'Sub', 'cmdOk_Click', 20),
        procedure(form, 'Sub', 'LocalHelper', 30),
        procedure(form, 'Sub', 'Isolated', 40),
      ],
      sqlTables: [
        {
          table: 'APP.ORDERS',
          operation: 'R',
          line: 12,
          procedureId: id(form, 'Sub', 'Form_Load'),
        },
        {
          table: 'ORDERS',
          operation: 'U',
          line: 22,
          procedureId: id(form, 'Sub', 'cmdOk_Click'),
        },
      ],
      dynamicSql: [
        {
          operation: 'R',
          line: 23,
          procedureId: id(form, 'Sub', 'cmdOk_Click'),
        },
      ],
    }),
    codeFile(util, {
      procedures: [
        procedure(util, 'Function', 'UtilRun', 10, 'global'),
        procedure(util, 'Sub', 'UtilDb', 20),
        procedure(util, 'Sub', 'Dup', 30, 'global'),
        procedure(util, 'Sub', 'UtilUnused', 40, 'global'),
      ],
      sqlTables: [
        {
          table: 'LOGS',
          operation: 'C',
          line: 21,
          procedureId: id(util, 'Sub', 'UtilDb'),
        },
        {
          table: 'LOGS',
          operation: 'D',
          line: 41,
          procedureId: id(util, 'Sub', 'UtilUnused'),
        },
      ],
      externalDeclarations: [
        {
          name: 'GetTickCount',
          library: 'kernel32',
          visibility: 'private',
          line: 2,
        },
      ],
    }),
    codeFile(other, {
      procedures: [procedure(other, 'Sub', 'Dup', 10, 'global')],
    }),
  ];
  const [base] = mappedInventoryFixture.programs;
  const member = (relativePath: string, shared: boolean) => ({
    kind: relativePath.endsWith('.frm') ? 'Form' : 'Module',
    name: null,
    declaredPath: relativePath,
    relativePath,
    resolution: 'resolved' as const,
    fileStatus: 'analyzed' as const,
    shared,
  });
  inventory.programs = [
    {
      ...structuredClone(base),
      projectPath: PROCEDURE_PROGRAM,
      name: 'Order',
      members: [member(form, false), member(util, true), member(other, true)],
      analysis: {
        ...structuredClone(base.analysis),
        calls: [
          call(
            id(form, 'Sub', 'Form_Load'),
            id(form, 'Sub', 'LocalHelper'),
            'local',
            11,
            2,
          ),
          call(
            id(form, 'Sub', 'LocalHelper'),
            id(util, 'Function', 'UtilRun'),
            'program',
            31,
          ),
          call(
            id(form, 'Sub', 'cmdOk_Click'),
            [id(util, 'Sub', 'Dup'), id(other, 'Sub', 'Dup')],
            'ambiguous',
            24,
          ),
          call(
            id(util, 'Function', 'UtilRun'),
            id(util, 'Sub', 'UtilDb'),
            'local',
            11,
          ),
          call(
            id(util, 'Function', 'UtilRun'),
            `${util}#declare:GetTickCount`,
            'external',
            12,
            3,
          ),
          call(
            id(util, 'Function', 'UtilRun'),
            id(util, 'Function', 'UtilRun'),
            'local',
            13,
          ),
          call(
            id(util, 'Sub', 'UtilUnused'),
            id(util, 'Sub', 'UtilDb'),
            'local',
            42,
          ),
        ],
      },
    },
  ];
  return inventory;
}

type ScreenReportProgram = Inventory['programs'][number];
type Report = NonNullable<ScreenReportProgram['reports']>[number];

const REPORT_VERSION = REPORT_COMPLEXITY_VERSION;
const reportRow = (row: Partial<Report> & Pick<Report, 'kind' | 'name'>) =>
  ({
    file: 'x.bas',
    line: 1,
    confidence: 'detected',
    shared: false,
    procedureId: null,
    warnings: [],
    complexity: {
      version: REPORT_VERSION,
      level: 'unrated',
      score: null,
      factors: [],
      reason: 'SUSPECTED',
    },
    ...row,
  }) satisfies Report;

// Hand-written AR04 inventory (numbers are set here, not computed): three
// programs, a form shared by two of them, one batch, and one report per
// confidence level plus a Crystal report in a shared module.
//   screens: frmOrder, frmLogin (shared), frmInvoice = 3, shared 1
//   reports: order.rpt (detected, high), common.rpt (detected, shared,
//   very-high), bill.rpt (referenced, medium), Excel + Printer (suspected)
//   = 5 rows, 3 counted, 2 suspected in 2 programs; batches 1.
export function screenReportCorpus(): Inventory {
  const inventory = structuredClone(mappedInventoryFixture) as Inventory;
  const [base] = inventory.programs;
  if (!base) throw new Error('fixture has a program');
  const program = (
    projectPath: string,
    name: string,
    extra: Pick<ScreenReportProgram, 'programType' | 'screens' | 'reports'>,
  ): ScreenReportProgram => ({
    ...structuredClone(base),
    projectPath,
    name,
    ...extra,
  });
  const common = reportRow({
    kind: 'crystal',
    name: 'common.rpt',
    file: 'cmn/Common.bas',
    line: 5,
    shared: true,
    procedureId: 'cmn/Common.bas#Sub:Print',
    complexity: {
      version: REPORT_VERSION,
      level: 'very-high',
      score: 10,
      factors: [
        { factor: 'decisionPoints', value: 40, points: 3 },
        { factor: 'dynamicSql', value: 2, points: 3 },
        { factor: 'design-not-analyzed', value: 1, points: 0 },
      ],
    },
  });
  const login = {
    name: 'frmLogin',
    file: 'cmn/frmLogin.frm',
    shared: true,
    warnings: [],
  };
  inventory.programs = [
    program('programs/Order/Order.vbp', 'Order', {
      programType: 'screen',
      screens: [
        {
          name: 'frmOrder',
          file: 'programs/Order/frmOrder.frm',
          shared: false,
          warnings: [],
        },
        login,
      ],
      reports: [
        reportRow({
          kind: 'crystal',
          name: 'order.rpt',
          file: 'programs/Order/Order.bas',
          line: 12,
          procedureId: 'programs/Order/Order.bas#Sub:Show',
          complexity: {
            version: REPORT_VERSION,
            level: 'high',
            score: 7,
            factors: [
              { factor: 'decisionPoints', value: 30, points: 3 },
              { factor: 'tables', value: 4, points: 2 },
              { factor: 'executableLines', value: 80, points: 2 },
              { factor: 'design-not-analyzed', value: 1, points: 0 },
            ],
            // What a v2 analysis stores: the procedures scored with their
            // tier, the unresolved calls and the print / draw statements.
            scope: {
              procedures: [
                { id: 'programs/Order/Order.bas#Sub:Show', tier: 0 },
                { id: 'programs/Order/Order.bas#Sub:LoadOrder', tier: 1 },
                { id: 'cmn/Common.bas#Sub:Format', tier: 2 },
              ],
              unresolvedCalls: 2,
              printOps: { content: 25, drawing: 4, position: 7 },
            },
          },
        }),
        common,
      ],
    }),
    program('programs/Invoice/Invoice.vbp', 'Invoice', {
      programType: 'screen',
      screens: [
        login,
        {
          name: 'frmInvoice',
          file: 'programs/Invoice/frmInvoice.frm',
          shared: false,
          warnings: [],
        },
      ],
      reports: [
        reportRow({
          kind: 'crystal',
          name: 'bill.rpt',
          file: 'programs/Invoice/Invoice.bas',
          line: 20,
          confidence: 'referenced',
          warnings: ['REPORT_FILE_MISSING'],
          procedureId: 'programs/Invoice/Invoice.bas#Sub:Bill',
          complexity: {
            version: REPORT_VERSION,
            level: 'medium',
            score: 1,
            factors: [
              { factor: 'tables', value: 2, points: 1 },
              { factor: 'design-not-analyzed', value: 1, points: 0 },
            ],
            reason: 'DESIGN_NOT_ANALYZED_FLOOR',
          },
        }),
        { ...common },
        reportRow({
          kind: 'excel',
          name: 'Excel.Application',
          file: 'programs/Invoice/Invoice.bas',
          line: 30,
          confidence: 'suspected',
        }),
      ],
    }),
    program('programs/Batch/Batch.vbp', 'Batch', {
      programType: 'batch',
      screens: [],
      reports: [
        reportRow({
          kind: 'print',
          name: 'Printer',
          file: 'programs/Batch/Batch.bas',
          line: 7,
          confidence: 'suspected',
        }),
      ],
    }),
  ];
  inventory.screenReportVersion = 'screen-report-v5';
  inventory.reportComplexityVersion = REPORT_VERSION;
  inventory.totals.screenReport = {
    screens: 3,
    sharedScreens: 1,
    batches: 1,
    reports: {
      rows: 5,
      counted: 3,
      suspected: 2,
      byKind: {
        'data-report': 0,
        crystal: 3,
        excel: 1,
        print: 1,
        'file-output': 0,
        unknown: 0,
      },
      byLevel: { low: 0, medium: 1, high: 1, 'very-high': 1, unrated: 2 },
    },
    suspectedPrograms: 2,
    // The project-level list the analyzer computes once: each report once,
    // a report of a shared module at its highest score.
    reportItems: (() => {
      const seen = new Set<string>();
      const items: NonNullable<
        Inventory['totals']['screenReport']
      >['reportItems'] = [];
      for (const owner of inventory.programs)
        for (const row of owner.reports ?? []) {
          const key = `${row.file}|${row.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push({
            ...row,
            programs: inventory.programs
              .filter((candidate) =>
                (candidate.reports ?? []).some(
                  (r) => r.file === row.file && r.name === row.name,
                ),
              )
              .map((candidate) => ({
                program: candidate.projectPath,
                level: row.complexity.level,
                score: row.complexity.score,
              })),
          });
        }
      return items;
    })(),
  };
  return inventory;
}
