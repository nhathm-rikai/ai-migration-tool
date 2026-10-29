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
