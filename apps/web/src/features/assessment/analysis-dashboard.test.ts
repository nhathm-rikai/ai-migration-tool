import { describe, expect, it } from 'vitest';
import { mappedInventoryFixture } from '@portal/contracts/fixtures';
import type { SourceInventoryDocument } from '@portal/contracts';
import { summarizeInventory } from './assessment-summary';
import {
  complexityHistogram,
  crudMatrix,
  dashboardKpis,
  locDistribution,
  memberKinds,
} from './analysis-dashboard';

type Inventory = SourceInventoryDocument;
type Program = Inventory['programs'][number];
type Analysis = NonNullable<Program['analysis']>;

// Hand-labelled corpus: Order (own Order.frm, no SQL) and Customer both
// call LoadOrders of the shared cmn/OrderRules.bas (SQL on lines 6 and 8);
// Customer also owns Cust.bas (SQL on lines 3–5); Broken could not be
// analyzed. Expected numbers are counted by hand.
function corpus(): Inventory {
  const base: Inventory = structuredClone(mappedInventoryFixture);
  const [projectFile, sharedFile] = base.files;
  const order = base.programs[0];
  if (!projectFile || !sharedFile?.analysis || !order?.analysis)
    throw new Error('fixture changed');
  const shared = sharedFile.analysis;
  if (shared.status !== 'analyzed') throw new Error('fixture changed');
  shared.concatenatedSql = [];
  const custFile: Inventory['files'][number] = {
    manifest: { ...sharedFile.manifest, relativePath: 'cust/Cust.bas' },
    analysis: {
      ...shared,
      procedures: [
        { ...shared.procedures[0]!, id: 'cust#A', name: 'A' },
        { ...shared.procedures[0]!, id: 'cust#B', name: 'B' },
      ],
      sqlTables: [
        { table: 'CUSTOMERS', operation: 'C', line: 3, procedureId: null },
        { table: 'ORDERS', operation: 'R', line: 4, procedureId: null },
      ],
      dynamicSql: [
        { operation: 'R', line: 5, procedureId: null },
        { operation: 'R', line: 3, procedureId: null },
      ],
      concatenatedSql: [
        { operation: 'R', line: 4, procedureId: null },
        { operation: 'C', line: 3, procedureId: null },
      ],
    },
  };
  const orderFile: Inventory['files'][number] = {
    manifest: { ...sharedFile.manifest, relativePath: 'order/Order.frm' },
    analysis: {
      ...shared,
      procedures: [],
      sqlTables: [],
      dynamicSql: [],
      concatenatedSql: [],
    },
  };
  const loadOrders = shared.procedures[0]!.id;
  const callsFrom = (path: string): Analysis['calls'] => [
    {
      from: `${path}#file`,
      name: 'LoadOrders',
      resolution: 'program',
      targets: [loadOrders],
      line: 1,
      count: 1,
    },
  ];
  const sharedMember = { ...order.members[0]!, shared: true };
  const customerAnalysis: Analysis = {
    ...order.analysis,
    calls: callsFrom('cust/Cust.bas'),
    crud: [
      ...order.analysis.crud,
      {
        table: 'CUSTOMERS',
        operations: ['C'],
        evidence: { relativePath: 'cust/Cust.bas', line: 3 },
        viaSharedOnly: false,
      },
      {
        table: 'ORDERS',
        operations: ['R'],
        evidence: { relativePath: 'cust/Cust.bas', line: 4 },
        viaSharedOnly: false,
      },
    ],
    normalizedCrud: [
      ...(order.analysis.normalizedCrud ?? []),
      {
        table: 'CUSTOMERS',
        operations: ['C'],
        evidence: { relativePath: 'cust/Cust.bas', line: 3 },
        viaSharedOnly: false,
        names: ['CUSTOMERS'],
      },
    ],
    complexity: {
      ...order.analysis.complexity,
      version: 'complexity-v1',
      score: 74,
      level: 'very-high',
    },
  };
  const customer: Program = {
    ...order,
    projectPath: 'programs/Customer/Customer.vbp',
    name: 'Customer',
    members: [
      sharedMember,
      {
        ...order.members[0]!,
        kind: 'form',
        name: 'Cust',
        declaredPath: '..\\..\\cust\\Cust.bas',
        relativePath: 'cust/Cust.bas',
      },
    ],
    analysis: customerAnalysis,
  };
  const broken: Program = {
    ...order,
    projectPath: 'programs/Broken/Broken.vbp',
    name: 'Broken',
    status: 'unsupported',
    issue: { reason: 'PROJECT_UNREADABLE', line: null },
    members: [],
    complete: false,
    analysis: null,
  };
  order.members = [
    {
      ...order.members[0]!,
      kind: 'form',
      name: 'Order',
      declaredPath: '..\\..\\order\\Order.frm',
      relativePath: 'order/Order.frm',
    },
    sharedMember,
  ];
  order.analysis.calls = callsFrom('order/Order.frm');
  order.analysis.complexity = {
    ...order.analysis.complexity,
    version: 'complexity-v1',
  };
  base.files = [projectFile, sharedFile, custFile, orderFile];
  base.programs = [order, customer, broken];
  base.complexityVersion = 'complexity-v1';
  base.totals = {
    ...base.totals,
    files: 3,
    codeFiles: 2,
    analyzedCodeFiles: 2,
    uniqueCounters: {
      physicalLines: 30,
      codeLines: 20,
      commentOnlyLines: 3,
      blankLines: 4,
      designerLines: 2,
      metadataLines: 1,
      unclassifiedLines: 0,
    },
  };
  return base;
}

describe('analysis dashboard (UI02)', () => {
  it('UI02-AC01 counts KPIs once per file, with shared and unanalyzed programs', () => {
    const inventory = corpus();
    const kpis = dashboardKpis(inventory, summarizeInventory(inventory));
    expect(kpis).toEqual({
      programs: 3,
      completePrograms: 2,
      physicalLines: 30,
      codeLines: 20,
      // OrderRules.bas once (1) + Cust.bas (2); Order.frm has none.
      procedures: 3,
      analyzedFiles: 3,
      // OrderRules 6, 8 + Cust 3, 4, 5 (line 3 has both a table and a
      // runtime table name).
      sqlLocations: 5,
      concatenatedSql: 2,
      // After mapping: ORDERS, CUSTOMERS.
      tables: 2,
      tablesMapped: true,
      highPrograms: 1,
      analyzedPrograms: 2,
    });
  });

  it('UI02-AC01 hides the concatenated SQL count of an inventory before sql-access-v5', () => {
    const inventory = structuredClone(mappedInventoryFixture) as Inventory;
    const kpis = dashboardKpis(inventory, summarizeInventory(inventory));
    expect(kpis.concatenatedSql).toBeNull();
    expect(kpis.sqlLocations).toBe(2);
  });

  it('UI02-AC01 splits physical lines without an SQL part, unclassified only when present', () => {
    const counters = corpus().totals.uniqueCounters;
    expect(locDistribution(counters)).toEqual([
      { key: 'code', lines: 20 },
      { key: 'comment', lines: 3 },
      { key: 'blank', lines: 4 },
      { key: 'designer', lines: 3 },
    ]);
    expect(
      locDistribution({ ...counters, unclassifiedLines: 1 }).at(-1),
    ).toEqual({ key: 'unclassified', lines: 1 });
  });

  it('UI02-AC02 bins programs by their level and counts unanalyzed ones apart', () => {
    const summary = summarizeInventory(corpus());
    expect(complexityHistogram(summary.programs)).toEqual({
      bins: [
        { level: 'low', programs: 1 },
        { level: 'medium', programs: 0 },
        { level: 'high', programs: 0 },
        { level: 'very-high', programs: 1 },
      ],
      notAnalyzed: 1,
    });
  });

  it('UI02-AC02 keeps the level of a complexity-v0 inventory, never recomputed from the score', () => {
    const inventory = structuredClone(mappedInventoryFixture) as Inventory;
    const analysis = inventory.programs[0]?.analysis;
    if (!analysis) throw new Error('fixture changed');
    // v0 thresholds: 62 is "medium" there, "high" under v1.
    analysis.complexity = {
      ...analysis.complexity,
      score: 62,
      level: 'medium',
    };
    const { bins } = complexityHistogram(
      summarizeInventory(inventory).programs,
    );
    expect(bins.find((bin) => bin.level === 'medium')?.programs).toBe(1);
    expect(bins.find((bin) => bin.level === 'high')?.programs).toBe(0);
  });

  it('UI02-AC03 counts distinct programs and a shared file once per table, raw and mapped', () => {
    const inventory = corpus();
    expect(crudMatrix(inventory, 'raw')).toEqual([
      {
        table: 'ORDERS',
        operations: { C: false, R: true, U: true, D: false },
        programs: 2,
        // OrderRules line 8 (shared, once) + Cust line 4.
        locations: 2,
        top: { program: 'Customer', locations: 2 },
      },
      {
        table: 'APP.ORDERS',
        operations: { C: false, R: true, U: false, D: false },
        programs: 2,
        locations: 1,
        top: { program: 'Order', locations: 1 },
      },
      {
        table: 'CUSTOMERS',
        operations: { C: true, R: false, U: false, D: false },
        programs: 1,
        locations: 1,
        top: { program: 'Customer', locations: 1 },
      },
    ]);
    expect(crudMatrix(inventory, 'mapped')).toEqual([
      {
        table: 'ORDERS',
        operations: { C: false, R: true, U: true, D: false },
        programs: 2,
        // OrderRules 6, 8 (shared, once) + Cust 4.
        locations: 3,
        top: { program: 'Customer', locations: 3 },
      },
      {
        table: 'CUSTOMERS',
        operations: { C: true, R: false, U: false, D: false },
        programs: 1,
        locations: 1,
        top: { program: 'Customer', locations: 1 },
      },
    ]);
  });

  it('lists member kinds case-insensitively in a fixed order', () => {
    const customer = summarizeInventory(corpus()).programs[1];
    if (!customer) throw new Error('missing program');
    expect(memberKinds(customer)).toEqual([
      { kind: 'form', count: 1 },
      { kind: 'module', count: 1 },
    ]);
  });

  it('UI02-AC03 counts a program only for shared procedures it reaches (review fix)', () => {
    // A calls P1 (1 access), B calls P2 (5 accesses) of the same shared
    // module: B is the top program with 5, not A with everything.
    const inventory = corpus();
    const [projectFile, sharedFile] = inventory.files;
    const order = inventory.programs[0];
    if (!projectFile || !sharedFile || !order?.analysis)
      throw new Error('corpus changed');
    const analysis = sharedFile.analysis;
    if (analysis?.status !== 'analyzed') throw new Error('corpus changed');
    const procedure = analysis.procedures[0]!;
    analysis.procedures = [
      { ...procedure, id: 'lib#P1', name: 'P1' },
      { ...procedure, id: 'lib#P2', name: 'P2' },
    ];
    analysis.sqlTables = [
      { table: 'T', operation: 'R', line: 10, procedureId: 'lib#P1' },
      ...[20, 21, 22, 23, 24].map((line) => ({
        table: 'T',
        operation: 'U' as const,
        line,
        procedureId: 'lib#P2',
      })),
    ];
    // Raw names only: the mapped view of the fixture names other tables.
    const withoutMapped: Analysis = { ...order.analysis };
    delete withoutMapped.normalizedCrud;
    const program = (name: string, target: string): Program => ({
      ...order,
      projectPath: `programs/${name}/${name}.vbp`,
      name,
      members: [
        { ...order.members[0]!, relativePath: `own/${name}.frm` },
        order.members[1]!,
      ],
      analysis: {
        ...withoutMapped,
        calls: [
          {
            from: `own/${name}.frm#file`,
            name: target,
            resolution: 'program' as const,
            targets: [`lib#${target}`],
            line: 1,
            count: 1,
          },
        ],
        crud: [
          {
            table: 'T',
            operations: ['R' as const],
            evidence: { relativePath: 'cmn/OrderRules.bas', line: 10 },
            viaSharedOnly: true,
          },
        ],
      },
    });
    const ownFile = (name: string) => ({
      manifest: { ...sharedFile.manifest, relativePath: `own/${name}.frm` },
      analysis: { ...analysis, procedures: [], sqlTables: [], dynamicSql: [] },
    });
    inventory.files = [projectFile, sharedFile, ownFile('A'), ownFile('B')];
    inventory.programs = [program('A', 'P1'), program('B', 'P2')];
    expect(crudMatrix(inventory, 'raw')).toEqual([
      {
        table: 'T',
        operations: { C: false, R: true, U: false, D: false },
        programs: 2,
        locations: 6,
        top: { program: 'B', locations: 5 },
      },
    ]);
  });

  it('UI02-AC03 keeps quoted names that differ only in case apart (review fix)', () => {
    const inventory = structuredClone(mappedInventoryFixture) as Inventory;
    const file = inventory.files[1]?.analysis;
    const analysis = inventory.programs[0]?.analysis;
    if (file?.status !== 'analyzed' || !analysis) throw new Error('fixture');
    file.sqlTables = [
      { table: '"Orders"', operation: 'R', line: 6, procedureId: null },
      { table: '"ORDERS"', operation: 'D', line: 8, procedureId: null },
    ];
    const evidence = { relativePath: 'cmn/OrderRules.bas', line: 6 };
    analysis.crud = [
      { table: '"Orders"', operations: ['R'], evidence, viaSharedOnly: false },
      { table: '"ORDERS"', operations: ['D'], evidence, viaSharedOnly: false },
    ];
    analysis.normalizedCrud = [
      { ...analysis.crud[0]!, names: ['"Orders"'] },
      { ...analysis.crud[1]!, names: ['"ORDERS"'] },
    ];
    for (const view of ['raw', 'mapped'] as const)
      expect(
        crudMatrix(inventory, view).map((row) => [
          row.table,
          row.operations.R,
          row.operations.D,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ['"ORDERS"', false, true],
          ['"Orders"', true, false],
        ]),
      );
    expect(crudMatrix(inventory, 'raw')).toHaveLength(2);
    expect(dashboardKpis(inventory, summarizeInventory(inventory)).tables).toBe(
      2,
    );
  });
});
