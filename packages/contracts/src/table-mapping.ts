import type { SourceInventoryDocument } from '@portal/contracts';

// Table name mapping used for the "after mapping" CRUD views. When the
// source registration names a default schema, the analyzer's mapped view
// (`normalizedCrud`) is used as is. When none was configured, the UI assumes
// the schema prefix written most often in the source (e.g. `HAN01` in
// `HAN01.KTBNKT`) and merges the same way the analyzer would; the view says
// it is an assumption. Display only: the inventory is never changed.

type Inventory = SourceInventoryDocument;
type Program = Inventory['programs'][number];
type Analysis = NonNullable<Program['analysis']>;
export type MappedCrudEntry = NonNullable<Analysis['normalizedCrud']>[number];

export type EffectiveMapping = {
  defaultSchema: string | null;
  status: 'unconfigured' | 'assumed' | 'confirmed';
  // True when the schema is the UI's guess from the source, not configured.
  inferred: boolean;
};

const UNQUOTED_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$#]*$/;

// Splits on dots outside double quotes (same rule as the analyzer).
function nameParts(name: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of name) {
    if (char === '"') quoted = !quoted;
    if (char === '.' && !quoted) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

// table-name-v1: unquoted parts upper case, quoted parts kept; a name
// qualified with the default schema becomes the bare name.
export function normalizeTableName(
  name: string,
  defaultSchema: string | null,
): string {
  const parts = nameParts(name).map((part) =>
    part.startsWith('"') ? part : part.toUpperCase(),
  );
  const [schema, object] = parts;
  if (
    parts.length === 2 &&
    object !== undefined &&
    defaultSchema !== null &&
    schema === defaultSchema
  )
    return object;
  return parts.join('.');
}

// The unquoted schema prefix written most often in table accesses; ties go
// to the alphabetically first. null when no access names a schema.
export function inferDefaultSchema(inventory: Inventory): string | null {
  const counts = new Map<string, number>();
  for (const file of inventory.files) {
    if (file.analysis?.status !== 'analyzed') continue;
    for (const access of file.analysis.sqlTables) {
      const parts = nameParts(access.table);
      const schema = parts[0];
      if (parts.length !== 2 || !schema || !UNQUOTED_IDENTIFIER.test(schema))
        continue;
      const key = schema.toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: [string, number] | null = null;
  for (const entry of counts)
    if (
      !best ||
      entry[1] > best[1] ||
      (entry[1] === best[1] && entry[0] < best[0])
    )
      best = entry;
  return best ? best[0] : null;
}

export function effectiveMapping(inventory: Inventory): EffectiveMapping {
  const configured = inventory.tableNames;
  if (configured && configured.defaultSchema !== null)
    return {
      defaultSchema: configured.defaultSchema,
      status: configured.status,
      inferred: false,
    };
  const inferred = inferDefaultSchema(inventory);
  if (inferred !== null)
    return { defaultSchema: inferred, status: 'assumed', inferred: true };
  return {
    defaultSchema: null,
    status: configured?.status ?? 'unconfigured',
    inferred: false,
  };
}

// Merges raw CRUD rows under the mapped names, in first-access order, like
// the analyzer's normalizeCrud.
function mergeCrud(
  crud: Analysis['crud'],
  defaultSchema: string | null,
): MappedCrudEntry[] {
  const order = ['C', 'R', 'U', 'D', 'X'];
  const merged = new Map<string, MappedCrudEntry>();
  for (const entry of crud) {
    const table = normalizeTableName(entry.table, defaultSchema);
    const existing = merged.get(table);
    if (!existing) {
      merged.set(table, {
        ...entry,
        table,
        operations: [...entry.operations],
        names: [entry.table],
      });
      continue;
    }
    for (const operation of entry.operations)
      if (!existing.operations.includes(operation))
        existing.operations.push(operation);
    existing.operations.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (!existing.names.includes(entry.table)) existing.names.push(entry.table);
    if (!entry.viaSharedOnly) existing.viaSharedOnly = false;
  }
  return [...merged.values()];
}

// The mapped CRUD of a program under the effective mapping; null when there
// is no mapped view (no schema configured, none inferable and none stored).
export function mappedCrud(
  analysis: Analysis,
  mapping: EffectiveMapping,
): MappedCrudEntry[] | null {
  if (mapping.inferred) return mergeCrud(analysis.crud, mapping.defaultSchema);
  return analysis.normalizedCrud ?? null;
}

// A mapped view exists when the schema is inferred from the source or every
// analyzed program carries the analyzer's mapped CRUD.
export function hasMappedCrud(inventory: Inventory): boolean {
  const mapping = effectiveMapping(inventory);
  const analyzed = inventory.programs.filter((program) => program.analysis);
  return (
    analyzed.length > 0 &&
    analyzed.every(
      (program) =>
        program.analysis && mappedCrud(program.analysis, mapping) !== null,
    )
  );
}

export type CrudTables = {
  // Whether any program carries analysis data at all; false = "not analyzed"
  // (an old or unsupported inventory), true with no table = analyzed, 0.
  analyzed: boolean;
  // The table names are the mapped view's.
  mapped: boolean;
  // The mapping is an assumption (inferred, or stored but not confirmed).
  assumed: boolean;
  // One entry per table of the chosen view, as step 2 counts them.
  tables: Map<string, { programs: Set<string>; operations: Set<string> }>;
};

// The tables of the whole inventory, by the one rule step 2 and the customer
// report share: the mapped view when there is one, else the names as
// written; one entry per identifier.
export function crudTables(inventory: Inventory): CrudTables {
  const mapping = effectiveMapping(inventory);
  const mapped = hasMappedCrud(inventory);
  const tables: CrudTables['tables'] = new Map();
  for (const program of inventory.programs) {
    const analysis = program.analysis;
    if (!analysis) continue;
    const entries =
      (mapped ? mappedCrud(analysis, mapping) : null) ?? analysis.crud;
    for (const entry of entries) {
      const row = tables.get(entry.table) ?? {
        programs: new Set<string>(),
        operations: new Set<string>(),
      };
      row.programs.add(program.projectPath);
      for (const operation of entry.operations) row.operations.add(operation);
      tables.set(entry.table, row);
    }
  }
  return {
    analyzed: inventory.programs.some((program) => program.analysis),
    mapped,
    assumed: mapped && mapping.status !== 'confirmed',
    tables,
  };
}
