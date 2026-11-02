import { mappedInventoryFixture } from '@portal/contracts/fixtures';
import type { SourceInventoryDocument } from '@portal/contracts';

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
