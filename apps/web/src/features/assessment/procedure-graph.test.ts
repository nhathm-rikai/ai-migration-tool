import { describe, expect, it } from 'vitest';
import {
  PROCEDURE_PROGRAM,
  procedureCorpus,
} from '../../testing/inventory-fixtures';
import { laneLayout } from './dependency-graph-layout';
import {
  apiNodeId,
  buildProcedureGraph,
  fileOwnerId,
  procedureNeighbourhood,
  procedureTableNodeId,
  visibleProcedureGraph,
} from './procedure-graph';
import { procedureLayoutRequest } from './procedure-graph-layout';

const FORM = 'apps/Order/Order.frm';
const UTIL = 'cmn/util.bas';
const OTHER = 'cmn/other.bas';
const TICK = apiNodeId(`${UTIL}#declare:GetTickCount`);

function graphOf(inventory = procedureCorpus()) {
  const graph = buildProcedureGraph(inventory, PROCEDURE_PROGRAM);
  if (!graph) throw new Error('graph');
  return graph;
}

const edgeIds = (graph: ReturnType<typeof graphOf>) =>
  graph.edges.map((edge) => edge.id).sort();

describe('UI03-EXT01 procedure call graph model', () => {
  it('draws own procedures, reached shared ones, APIs and tables', () => {
    const graph = graphOf();
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(graph.ownProcedures).toBe(4);
    // UtilUnused is shared and nothing in this program calls it.
    expect(byId.has(`${UTIL}#Sub:UtilUnused`)).toBe(false);
    // UtilRun and UtilDb; the two Dup are only candidates of an ambiguous
    // call and are not counted.
    expect(graph.sharedProcedures).toBe(2);
    expect(byId.get(`${OTHER}#Sub:Dup`)?.candidate).toBe(true);
    expect(byId.get(`${UTIL}#Function:UtilRun`)?.candidate).toBe(false);
    expect(byId.get(`${UTIL}#Function:UtilRun`)?.kind).toBe('shared-procedure');
    expect(byId.get(TICK)).toMatchObject({
      kind: 'api',
      label: 'GetTickCount',
      detail: 'kernel32',
    });
    expect(byId.get(`${FORM}#Sub:cmdOk_Click`)?.dynamicSql).toBe(1);
    expect(edgeIds(graph)).toEqual(
      [
        `ambiguous|${FORM}#Sub:cmdOk_Click|${OTHER}#Sub:Dup`,
        `ambiguous|${FORM}#Sub:cmdOk_Click|${UTIL}#Sub:Dup`,
        `api|${UTIL}#Function:UtilRun|${TICK}`,
        `call|${FORM}#Sub:Form_Load|${FORM}#Sub:LocalHelper`,
        `call|${FORM}#Sub:LocalHelper|${UTIL}#Function:UtilRun`,
        `call|${UTIL}#Function:UtilRun|${UTIL}#Function:UtilRun`,
        `call|${UTIL}#Function:UtilRun|${UTIL}#Sub:UtilDb`,
        `table|${FORM}#Sub:Form_Load|${procedureTableNodeId('ORDERS')}`,
        `table|${FORM}#Sub:cmdOk_Click|${procedureTableNodeId('ORDERS')}`,
        `table|${UTIL}#Sub:UtilDb|${procedureTableNodeId('LOGS')}`,
      ].sort(),
    );
    const load = graph.edges.find(
      (edge) => edge.source === `${FORM}#Sub:Form_Load` && edge.kind === 'call',
    );
    expect(load).toMatchObject({ count: 2, line: 11 });
  });

  it('merges table names after mapping, or keeps them as written', () => {
    const tables = (graph: ReturnType<typeof graphOf>) =>
      graph.nodes
        .filter((node) => node.kind === 'table')
        .map((node) => node.label)
        .sort();
    const mapped = graphOf();
    expect(mapped.tableView).toBe('mapped');
    expect(tables(mapped)).toEqual(['LOGS', 'ORDERS']);
    // No schema configured, none to infer and no stored mapped view.
    const raw = procedureCorpus();
    const form = raw.files[0]?.analysis;
    if (form?.status !== 'analyzed') throw new Error('fixture');
    form.sqlTables = form.sqlTables.map((access) => ({
      ...access,
      table: access.table === 'APP.ORDERS' ? 'orders' : access.table,
    }));
    delete raw.tableNames;
    const program = raw.programs[0]?.analysis;
    if (!program) throw new Error('fixture');
    delete program.normalizedCrud;
    const graph = graphOf(raw);
    expect(graph.tableView).toBe('raw');
    expect(tables(graph)).toEqual(['LOGS', 'ORDERS', 'orders']);
  });

  it('gives code outside procedures a node only when it does something', () => {
    const inventory = procedureCorpus();
    const form = inventory.files[0]?.analysis;
    if (form?.status !== 'analyzed') throw new Error('fixture');
    form.sqlTables.push({
      table: 'SETTINGS',
      operation: 'R',
      line: 3,
      procedureId: null,
    });
    const graph = graphOf(inventory);
    const owner = graph.nodes.find((node) => node.id === fileOwnerId(FORM));
    expect(owner).toMatchObject({ procedureKind: null, callees: 1 });
    expect(graphOf().nodes.some((node) => node.id === fileOwnerId(FORM))).toBe(
      false,
    );
  });

  it('hides procedures without edges until asked, and counts neighbours', () => {
    const graph = graphOf();
    const isolated = `${FORM}#Sub:Isolated`;
    expect(
      visibleProcedureGraph(graph, false).nodes.some(
        (node) => node.id === isolated,
      ),
    ).toBe(false);
    expect(
      visibleProcedureGraph(graph, true).nodes.some(
        (node) => node.id === isolated,
      ),
    ).toBe(true);
    const run = `${UTIL}#Function:UtilRun`;
    expect([...procedureNeighbourhood(graph.edges, run)].sort()).toEqual(
      [`${FORM}#Sub:LocalHelper`, run, `${UTIL}#Sub:UtilDb`, TICK].sort(),
    );
  });

  it('returns null for a program that was not analysed', () => {
    const inventory = procedureCorpus();
    const [program] = inventory.programs;
    if (!program) throw new Error('fixture');
    program.analysis = null;
    expect(buildProcedureGraph(inventory, PROCEDURE_PROGRAM)).toBeNull();
    expect(buildProcedureGraph(procedureCorpus(), 'missing.vbp')).toBeNull();
  });

  // Review P2: ambiguous candidates are not a confirmed dependency, and the
  // graph does not depend on the order of `calls[]`.
  it('does not follow ambiguous candidates and ignores the order of calls', () => {
    const inventory = procedureCorpus();
    const util = inventory.files[1]?.analysis;
    const program = inventory.programs[0]?.analysis;
    if (util?.status !== 'analyzed' || !program) throw new Error('fixture');
    // Dup in util.bas (only reached as a candidate) calls UtilUnused and
    // writes AUDIT: neither is a confirmed dependency of the program.
    util.sqlTables.push({
      table: 'AUDIT',
      operation: 'C',
      line: 31,
      procedureId: `${UTIL}#Sub:Dup`,
    });
    program.calls.push({
      from: `${UTIL}#Sub:Dup`,
      name: 'UtilUnused',
      resolution: 'local',
      targets: [`${UTIL}#Sub:UtilUnused`],
      line: 32,
      count: 1,
    });
    const forward = graphOf(inventory);
    const ids = forward.nodes.map((node) => node.id);
    expect(ids).not.toContain(procedureTableNodeId('AUDIT'));
    expect(ids).not.toContain(`${UTIL}#Sub:UtilUnused`);
    const reversed = structuredClone(inventory);
    reversed.programs[0]?.analysis?.calls.reverse();
    const backward = graphOf(reversed);
    const summary = (graph: ReturnType<typeof graphOf>) => ({
      nodes: graph.nodes.map((node) => node.id).sort(),
      edges: graph.edges.map((edge) => edge.id).sort(),
      shared: graph.sharedProcedures,
    });
    expect(summary(backward)).toEqual(summary(forward));
  });

  // Review P2: the same API name declared from two libraries is two nodes,
  // each with its own library.
  it('keeps two declarations of one name from different libraries apart', () => {
    const inventory = procedureCorpus();
    const util = inventory.files[1]?.analysis;
    const form = inventory.files[0]?.analysis;
    const program = inventory.programs[0]?.analysis;
    if (util?.status !== 'analyzed' || form?.status !== 'analyzed' || !program)
      throw new Error('fixture');
    util.externalDeclarations = [
      { name: 'Tick', library: 'one.dll', visibility: 'private', line: 2 },
    ];
    form.externalDeclarations = [
      { name: 'Tick', library: 'two.dll', visibility: 'private', line: 2 },
    ];
    program.calls.push(
      {
        from: `${UTIL}#Function:UtilRun`,
        name: 'Tick',
        resolution: 'external',
        targets: [`${UTIL}#declare:Tick`],
        line: 14,
        count: 1,
      },
      {
        from: `${FORM}#Sub:Form_Load`,
        name: 'Tick',
        resolution: 'external',
        targets: [`${FORM}#declare:Tick`],
        line: 15,
        count: 1,
      },
    );
    const graph = graphOf(inventory);
    const one = graph.nodes.find(
      (node) => node.id === apiNodeId(`${UTIL}#declare:Tick`),
    );
    const two = graph.nodes.find(
      (node) => node.id === apiNodeId(`${FORM}#declare:Tick`),
    );
    expect(one).toMatchObject({ label: 'Tick', detail: 'one.dll', callers: 1 });
    expect(two).toMatchObject({ label: 'Tick', detail: 'two.dll', callers: 1 });
  });
});

describe('UI03-EXT01 procedure graph layout', () => {
  it('puts each kind in its lane and leaves recursion out of the layout', () => {
    const graph = graphOf();
    const request = procedureLayoutRequest(graph.nodes, graph.edges);
    const partition = (id: string) =>
      request.children.find((child) => child.id === id)?.layoutOptions?.[
        'elk.partitioning.partition'
      ];
    expect(partition(`${FORM}#Sub:Form_Load`)).toBe('0');
    expect(partition(`${UTIL}#Sub:UtilDb`)).toBe('1');
    expect(partition(TICK)).toBe('2');
    expect(partition(procedureTableNodeId('LOGS'))).toBe('3');
    expect(
      request.edges.some((edge) => edge.sources[0] === edge.targets[0]),
    ).toBe(false);
    // The fallback places every node.
    const positions = laneLayout(request);
    expect(positions.size).toBe(request.children.length);
  });
});
