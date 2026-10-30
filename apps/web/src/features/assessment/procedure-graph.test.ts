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

function graphOf(inventory = procedureCorpus()) {
  const graph = buildProcedureGraph(inventory, PROCEDURE_PROGRAM);
  if (!graph) throw new Error('graph');
  return graph;
}

const edgeIds = (graph: ReturnType<typeof graphOf>) =>
  graph.edges.map((edge) => edge.id).sort();

describe('UI04 procedure call graph model', () => {
  it('draws own procedures, reached shared ones, APIs and tables', () => {
    const graph = graphOf();
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(graph.ownProcedures).toBe(4);
    // UtilUnused is shared and nothing in this program calls it.
    expect(byId.has(`${UTIL}#Sub:UtilUnused`)).toBe(false);
    expect(graph.sharedProcedures).toBe(4);
    expect(byId.get(`${UTIL}#Function:UtilRun`)?.kind).toBe('shared-procedure');
    expect(byId.get(apiNodeId('GetTickCount'))).toMatchObject({
      kind: 'api',
      label: 'GetTickCount',
      detail: 'kernel32',
    });
    expect(byId.get(`${FORM}#Sub:cmdOk_Click`)?.dynamicSql).toBe(1);
    expect(edgeIds(graph)).toEqual(
      [
        `ambiguous|${FORM}#Sub:cmdOk_Click|${OTHER}#Sub:Dup`,
        `ambiguous|${FORM}#Sub:cmdOk_Click|${UTIL}#Sub:Dup`,
        `api|${UTIL}#Function:UtilRun|${apiNodeId('GetTickCount')}`,
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
      [
        `${FORM}#Sub:LocalHelper`,
        run,
        `${UTIL}#Sub:UtilDb`,
        apiNodeId('GetTickCount'),
      ].sort(),
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
});

describe('UI04 procedure graph layout', () => {
  it('puts each kind in its lane and leaves recursion out of the layout', () => {
    const graph = graphOf();
    const request = procedureLayoutRequest(graph.nodes, graph.edges);
    const partition = (id: string) =>
      request.children.find((child) => child.id === id)?.layoutOptions?.[
        'elk.partitioning.partition'
      ];
    expect(partition(`${FORM}#Sub:Form_Load`)).toBe('0');
    expect(partition(`${UTIL}#Sub:UtilDb`)).toBe('1');
    expect(partition(apiNodeId('GetTickCount'))).toBe('2');
    expect(partition(procedureTableNodeId('LOGS'))).toBe('3');
    expect(
      request.edges.some((edge) => edge.sources[0] === edge.targets[0]),
    ).toBe(false);
    // The fallback places every node.
    const positions = laneLayout(request);
    expect(positions.size).toBe(request.children.length);
  });
});
