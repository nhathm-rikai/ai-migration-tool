import { describe, expect, it } from 'vitest';
import type { SourceInventoryDocument } from '@portal/contracts';
import {
  partialInventoryFixture,
  syntheticCorpusFixture,
} from '@portal/contracts/fixtures';
import {
  buildDependencyGraph,
  commonModules,
  fileNodeId,
  neighbourhood,
  programGroups,
  programNodeId,
  restingEdges,
  tableNodeId,
  visibleGraph,
} from './dependency-graph';

type Inventory = SourceInventoryDocument;
type Program = Inventory['programs'][number];
type Member = Program['members'][number];
type Call = NonNullable<Program['analysis']>['calls'][number];

const ZERO = {
  physicalLines: 0,
  designerLines: 0,
  metadataLines: 0,
  blankLines: 0,
  commentOnlyLines: 0,
  codeLines: 0,
  unclassifiedLines: 0,
};

const member = (relativePath: string | null, shared: boolean): Member => ({
  kind: relativePath?.endsWith('.frm') ? 'Form' : 'Module',
  name: null,
  declaredPath: relativePath ?? 'Lost.bas',
  relativePath,
  resolution: relativePath ? 'resolved' : 'missing',
  fileStatus: relativePath ? 'analyzed' : null,
  shared,
});

function program(
  projectPath: string,
  members: Member[],
  options: {
    calls?: Call[];
    crud?: [string, ('C' | 'R' | 'U' | 'D')[]][];
    components?: string[];
    analysed?: boolean;
    complete?: boolean;
  } = {},
): Program {
  const analysed = options.analysed ?? true;
  return {
    projectPath,
    status: analysed ? 'parsed' : 'unsupported',
    issue: null,
    name: null,
    members,
    externalReferences: (options.components ?? []).map((fileName) => ({
      kind: 'component',
      identifier: `{${fileName}}#1.0#0`,
      fileName,
      description: null,
    })),
    counters: ZERO,
    complete: options.complete ?? analysed,
    analysis: analysed
      ? {
          calls: options.calls ?? [],
          crud: (options.crud ?? []).map(([table, operations]) => ({
            table,
            operations,
            evidence: { relativePath: 'x.bas', line: 1 },
            viaSharedOnly: false,
          })),
          externalApis: [],
          metrics: {
            ownFiles: 0,
            ownCodeLines: 0,
            ownProcedures: 0,
            decisionPoints: 0,
            maxProcedureDecisionPoints: 0,
            reachableSharedProcedures: 0,
            tables: 0,
            dynamicSql: 0,
            components: 0,
            externalApis: 0,
          },
          complexity: {
            version: 'complexity-v1',
            score: 10,
            level: 'low',
            parts: {
              size: 0,
              decisions: 0,
              tables: 0,
              dynamicSql: 0,
              components: 0,
              externalApis: 0,
            },
          },
        }
      : null,
  };
}

const call = (
  from: string,
  target: string,
  line: number,
  count: number,
  resolution: Call['resolution'] = 'program',
): Call => ({
  from,
  name: target.split(':').pop() ?? target,
  resolution,
  targets: [target],
  line,
  count,
});

function inventory(programs: Program[]): Inventory {
  return {
    ...partialInventoryFixture,
    files: [],
    programs,
  };
}

// Two programs share util.bas; util.bas calls db.bas once (count 4) and
// both programs list that call: it is one site, counted once.
const handWritten = inventory([
  program(
    'apps/A/A.vbp',
    [
      member('apps/A/A.frm', false),
      member('cmn/util.bas', true),
      member('cmn/db.bas', true),
    ],
    {
      calls: [
        call('apps/A/A.frm#Sub:Load', 'cmn/util.bas#Function:Fmt', 3, 2),
        call('apps/A/A.frm#Sub:Load', 'apps/A/A.frm#Sub:Init', 4, 1, 'local'),
        call('cmn/util.bas#Function:Fmt', 'cmn/db.bas#Function:Open', 9, 4),
        call(
          'apps/A/A.frm#Sub:Load',
          'cmn/util.bas#Function:Pad',
          5,
          1,
          'ambiguous',
        ),
      ],
      crud: [
        ['ORDERS', ['R']],
        ['CUSTOMERS', ['U', 'C']],
      ],
      components: ['Grid.ocx'],
    },
  ),
  program(
    'apps/B/B.vbp',
    [
      member('apps/B/B.frm', false),
      member('cmn/util.bas', true),
      member('cmn/db.bas', true),
      member(null, false),
    ],
    {
      calls: [
        call('apps/B/B.frm#Sub:Load', 'cmn/util.bas#Function:Fmt', 7, 3),
        call('cmn/util.bas#Function:Fmt', 'cmn/db.bas#Function:Open', 9, 4),
      ],
      crud: [['ORDERS', ['D', 'R']]],
      components: ['grid.OCX'],
      complete: false,
    },
  ),
  program('tools/C/C.vbp', [], { analysed: false }),
]);

describe('UI03-AC01 dependency graph numbers', () => {
  const graph = buildDependencyGraph(handWritten);
  const node = (id: string) => graph.nodes.find((value) => value.id === id);
  const edge = (kind: string, source: string, target: string) =>
    graph.edges.find((value) => value.id === `${kind}|${source}|${target}`);

  it('builds one node per program, file, table and COM reference', () => {
    expect(
      graph.nodes.map((value) => [value.kind, value.label]).sort(),
    ).toEqual(
      [
        ['component', 'Grid.ocx'],
        ['own-module', 'A.frm'],
        ['own-module', 'B.frm'],
        ['program', 'A'],
        ['program', 'B'],
        ['program', 'C'],
        ['shared-module', 'db.bas'],
        ['shared-module', 'util.bas'],
        ['table', 'CUSTOMERS'],
        ['table', 'ORDERS'],
      ].sort(),
    );
  });

  it('counts fan-in in programs and fan-out in distinct targets', () => {
    expect(node(fileNodeId('cmn/util.bas'))).toMatchObject({
      fanIn: 2,
      fanOut: 1,
      callers: 2,
    });
    expect(node(fileNodeId('cmn/db.bas'))).toMatchObject({
      fanIn: 2,
      fanOut: 0,
      callers: 1,
    });
    expect(node(tableNodeId('ORDERS'))?.fanIn).toBe(2);
    expect(node(tableNodeId('CUSTOMERS'))?.fanIn).toBe(1);
    // A: 3 files + 2 tables + 1 COM; B: 3 files + 1 table + 1 COM.
    expect(node(programNodeId('apps/A/A.vbp'))?.fanOut).toBe(6);
    expect(node(programNodeId('apps/B/B.vbp'))?.fanOut).toBe(5);
    expect(node(programNodeId('apps/A/A.vbp'))?.fanIn).toBe(0);
  });

  it('merges resolved calls to file level, each call site once', () => {
    expect(
      edge('call', fileNodeId('apps/A/A.frm'), fileNodeId('cmn/util.bas')),
    ).toMatchObject({ sites: 1, calls: 2 });
    expect(
      edge('call', fileNodeId('cmn/util.bas'), fileNodeId('cmn/db.bas')),
    ).toMatchObject({ sites: 1, calls: 4 });
    // Local and ambiguous calls are not file → file edges.
    expect(graph.callSites).toBe(3);
    expect(graph.calls).toBe(2 + 3 + 4);
    expect(graph.edges.filter((value) => value.kind === 'call')).toHaveLength(
      3,
    );
  });

  it('keeps table operations per program and COM references once', () => {
    expect(
      edge('table', programNodeId('apps/A/A.vbp'), tableNodeId('CUSTOMERS'))
        ?.operations,
    ).toEqual(['C', 'U']);
    expect(
      edge('table', programNodeId('apps/B/B.vbp'), tableNodeId('ORDERS'))
        ?.operations,
    ).toEqual(['R', 'D']);
    expect(node('com:grid.ocx')?.fanIn).toBe(2);
    expect(graph.edges).toHaveLength(6 + 5 + 3);
  });

  it('matches a count made independently on a synthetic corpus', () => {
    const corpus = syntheticCorpusFixture({
      programs: 120,
      sharedModules: 12,
      tables: 40,
    });
    const built = buildDependencyGraph(corpus);
    expect(built.tableView).toBe('mapped');
    // Independent count straight from the inventory.
    const declaring = new Map<string, Set<string>>();
    const tables = new Map<string, Set<string>>();
    const sites = new Map<string, number>();
    for (const value of corpus.programs) {
      for (const item of value.members)
        if (item.relativePath && item.shared)
          declaring
            .set(
              item.relativePath,
              declaring.get(item.relativePath) ?? new Set(),
            )
            .get(item.relativePath)
            ?.add(value.projectPath);
      // Every access names the APP schema, which the mapped view (inferred
      // from the source) drops.
      for (const entry of value.analysis?.crud ?? []) {
        const table = entry.table.replace(/^APP\./, '');
        tables
          .set(table, tables.get(table) ?? new Set())
          .get(table)
          ?.add(value.projectPath);
      }
      for (const item of value.analysis?.calls ?? [])
        if (item.resolution === 'program')
          for (const target of item.targets)
            sites.set(`${item.from}|${item.line}|${target}`, item.count);
    }
    for (const [path, programs] of declaring)
      expect(
        built.nodes.find((value) => value.id === fileNodeId(path))?.fanIn,
      ).toBe(programs.size);
    for (const [table, programs] of tables)
      expect(
        built.nodes.find((value) => value.id === tableNodeId(table))?.fanIn,
      ).toBe(programs.size);
    expect(built.callSites).toBe(sites.size);
    expect(built.calls).toBe([...sites.values()].reduce((a, b) => a + b, 0));
    const memberEdges = corpus.programs.reduce(
      (sum, value) =>
        sum + value.members.filter((item) => item.relativePath).length,
      0,
    );
    expect(built.edges.filter((value) => value.kind === 'member')).toHaveLength(
      memberEdges,
    );
  });
});

describe('UI03-AC02 program state and missing members', () => {
  const graph = buildDependencyGraph(handWritten);

  it('marks programs that were not analysed or are incomplete', () => {
    const c = graph.nodes.find(
      (value) => value.id === programNodeId('tools/C/C.vbp'),
    );
    expect(c).toMatchObject({ state: 'unsupported', fanOut: 0 });
    const b = graph.nodes.find(
      (value) => value.id === programNodeId('apps/B/B.vbp'),
    );
    expect(b).toMatchObject({ state: 'partial', unresolvedMembers: 1 });
    expect(
      graph.nodes.find((value) => value.id === programNodeId('apps/A/A.vbp'))
        ?.state,
    ).toBe('complete');
  });

  it('never creates a node for a member that was not found', () => {
    expect(graph.nodes.some((value) => value.detail === 'Lost.bas')).toBe(
      false,
    );
    expect(
      graph.nodes.filter((value) => value.kind !== 'program'),
    ).toHaveLength(7);
  });

  it('keeps the partial fixture without inventing nodes', () => {
    const partial = buildDependencyGraph(partialInventoryFixture);
    for (const value of partial.edges) {
      expect(partial.nodes.some((item) => item.id === value.source)).toBe(true);
      expect(partial.nodes.some((item) => item.id === value.target)).toBe(true);
    }
  });
});

describe('UI03 grouping, common modules and focus', () => {
  it('groups programs by the first folder below the shared prefix', () => {
    const groups = programGroups([
      'src/KNR/KNR01/KNR01.vbp',
      'src/KNR/KNR02/KNR02.vbp',
      'src/KUK/KUK01/KUK01.vbp',
      'src/Top.vbp',
    ]);
    expect([...groups.values()]).toEqual(['KNR', 'KNR', 'KUK', '']);
    expect([...programGroups(['a/b/One.vbp']).values()]).toEqual(['a']);
  });

  it('hides files and COM used by more than 80% of programs by default', () => {
    const corpus = syntheticCorpusFixture({
      programs: 50,
      sharedModules: 6,
      tables: 10,
    });
    const graph = buildDependencyGraph(corpus);
    const common = graph.nodes.filter((value) => value.common);
    // Cmn00 is declared by every analysed program and Ctl00 is referenced
    // by all of them.
    expect(common.map((value) => value.label).sort()).toEqual([
      'Cmn00.bas',
      'Ctl00.ocx',
    ]);
    const hidden = visibleGraph(graph, false);
    expect(hidden.nodes).toHaveLength(graph.nodes.length - 2);
    expect(
      hidden.edges.some(
        (value) =>
          value.target === fileNodeId('common/Cmn00.bas') ||
          value.source === fileNodeId('common/Cmn00.bas'),
      ),
    ).toBe(false);
    expect(visibleGraph(graph, true).edges).toHaveLength(graph.edges.length);
    expect(commonModules(graph)[0]?.label).toBe('Cmn00.bas');
  });

  it('does not hide anything in a corpus of a few programs', () => {
    const graph = buildDependencyGraph(handWritten);
    expect(graph.nodes.some((value) => value.common)).toBe(false);
  });

  it('finds the focused node and its direct neighbours', () => {
    const graph = buildDependencyGraph(handWritten);
    expect(
      [...neighbourhood(graph.edges, fileNodeId('cmn/db.bas'))].sort(),
    ).toEqual(
      [
        fileNodeId('cmn/db.bas'),
        fileNodeId('cmn/util.bas'),
        programNodeId('apps/A/A.vbp'),
        programNodeId('apps/B/B.vbp'),
      ].sort(),
    );
  });

  it('merges programs edges per folder while nothing is focused', () => {
    const graph = buildDependencyGraph(handWritten);
    const shown = restingEdges(
      graph.nodes,
      graph.edges,
      (program) => `folder:${program.group ?? ''}`,
    );
    const util = shown.find(
      (edge) => edge.id === `folder|folder:apps|${fileNodeId('cmn/util.bas')}`,
    );
    expect(util).toMatchObject({ programs: 2, edge: null });
    // Own files keep their program; own → shared calls wait for focus.
    expect(
      shown.some(
        (edge) =>
          edge.source === programNodeId('apps/A/A.vbp') &&
          edge.target === fileNodeId('apps/A/A.frm'),
      ),
    ).toBe(true);
    expect(
      shown.some(
        (edge) =>
          edge.kind === 'call' && edge.source === fileNodeId('apps/A/A.frm'),
      ),
    ).toBe(false);
    expect(
      shown.find(
        (edge) =>
          edge.kind === 'call' && edge.source === fileNodeId('cmn/util.bas'),
      )?.edge?.calls,
    ).toBe(4);
    // A and B: 2 own files + (util, db, ORDERS, CUSTOMERS, Grid) + 1 call.
    expect(shown).toHaveLength(2 + 5 + 1);
  });
});
