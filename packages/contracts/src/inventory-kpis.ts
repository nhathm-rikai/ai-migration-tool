import type { SourceInventoryDocument } from './source-inventory.schema.js';
import { crudTables } from './table-mapping.js';

// KPIs that step 2 and the customer report both show, computed in ONE place
// from the whole inventory: every analyzed file counts, also one no project
// lists. (Program-level figures such as native API declarations, external
// references and the screen/report counts follow their own scope; see
// progress.md, AR02 review 2.)

type Inventory = SourceInventoryDocument;

export type SqlUseKind = 'dynamic' | 'concatenated';
export type SqlUseRow = {
  relativePath: string;
  kind: SqlUseKind;
  operation: string;
  line: number;
  procedureId: string | null;
};

// Dynamic and concatenated SQL of every analyzed file, one row per
// (file, kind, line).
export function sqlUses(inventory: Inventory): SqlUseRow[] {
  const rows: SqlUseRow[] = [];
  const seen = new Set<string>();
  for (const file of inventory.files) {
    const analysis = file.analysis;
    if (analysis?.status !== 'analyzed') continue;
    const path = file.manifest.relativePath;
    for (const [kind, uses] of [
      ['dynamic', analysis.dynamicSql],
      ['concatenated', analysis.concatenatedSql ?? []],
    ] as const)
      for (const use of uses) {
        const key = `${path}\u0000${kind}\u0000${use.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          relativePath: path,
          kind,
          operation: use.operation,
          line: use.line,
          procedureId: use.procedureId,
        });
      }
  }
  return rows;
}

export type InventoryKpis = {
  analyzedFiles: number;
  procedures: number;
  // Distinct (file, line) pairs with a table access or a runtime table name.
  sqlLocations: number;
  dynamicSql: number;
  // null: no analyzed file carries the field (inventory of an older version).
  concatenatedSql: number | null;
  tables: number;
};

export function inventoryKpis(inventory: Inventory): InventoryKpis {
  let analyzedFiles = 0;
  let procedures = 0;
  let concatenatedKnown = false;
  const locations = new Set<string>();
  for (const file of inventory.files) {
    const analysis = file.analysis;
    if (analysis?.status !== 'analyzed') continue;
    const path = file.manifest.relativePath;
    analyzedFiles += 1;
    procedures += analysis.procedures.length;
    if (analysis.concatenatedSql) concatenatedKnown = true;
    for (const use of [...analysis.sqlTables, ...analysis.dynamicSql])
      locations.add(`${path}\u0000${use.line}`);
  }
  const uses = sqlUses(inventory);
  return {
    analyzedFiles,
    procedures,
    sqlLocations: locations.size,
    dynamicSql: uses.filter((use) => use.kind === 'dynamic').length,
    concatenatedSql: concatenatedKnown
      ? uses.filter((use) => use.kind === 'concatenated').length
      : null,
    tables: crudTables(inventory).tables.size,
  };
}
