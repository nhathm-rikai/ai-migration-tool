// Language-neutral table name normalization for the "after mapping" view of
// CRUD. The names written in the source stay the evidence; this only says
// which of them are assumed to be the same database object.
//
// Unquoted SQL identifiers are case-insensitive (stored upper case), quoted
// ones ("Name") keep their case. A name qualified with the schema that
// unqualified names resolve to for the analyzed connection (Oracle
// CURRENT_SCHEMA) is shortened to the bare name. Synonyms are not known
// from the source, so the mapping stays an assumption until the database
// owner confirms it.

export const TABLE_NAME_VERSION = 'table-name-v1';

export type TableNameMapping = {
  version: typeof TABLE_NAME_VERSION;
  // Upper case; null when no schema was configured (case-only merge).
  defaultSchema: string | null;
  status: 'unconfigured' | 'assumed' | 'confirmed';
};

export const UNCONFIGURED_TABLE_NAMES: TableNameMapping = {
  version: TABLE_NAME_VERSION,
  defaultSchema: null,
  status: 'unconfigured',
};

const UNQUOTED_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$#]*$/;

// Returns null when `defaultSchema` is not a plain unquoted identifier.
export function createTableNameMapping(
  defaultSchema: string | null,
  confirmed = false,
): TableNameMapping | null {
  if (defaultSchema === null) return UNCONFIGURED_TABLE_NAMES;
  if (!UNQUOTED_IDENTIFIER.test(defaultSchema)) return null;
  return {
    version: TABLE_NAME_VERSION,
    defaultSchema: defaultSchema.toUpperCase(),
    status: confirmed ? 'confirmed' : 'assumed',
  };
}

// Splits on dots outside double quotes.
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

export function normalizeTableName(
  name: string,
  mapping: TableNameMapping,
): string {
  const parts = nameParts(name).map((part) =>
    part.startsWith('"') ? part : part.toUpperCase(),
  );
  const [schema, object] = parts;
  if (
    parts.length === 2 &&
    object !== undefined &&
    mapping.defaultSchema !== null &&
    schema === mapping.defaultSchema
  )
    return object;
  return parts.join('.');
}
