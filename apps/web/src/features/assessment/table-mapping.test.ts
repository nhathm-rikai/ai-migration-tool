import { describe, expect, it } from 'vitest';
import {
  mappedInventoryFixture,
  unmappedInventoryFixture,
} from '@portal/contracts/fixtures';
import type { SourceInventoryDocument } from '@portal/contracts';
import {
  effectiveMapping,
  inferDefaultSchema,
  normalizeTableName,
} from './table-mapping';

type Inventory = SourceInventoryDocument;

function withTables(tables: string[]): Inventory {
  const inventory = structuredClone(unmappedInventoryFixture) as Inventory;
  const file = inventory.files[1]?.analysis;
  if (file?.status !== 'analyzed') throw new Error('fixture changed');
  file.sqlTables = tables.map((table, index) => ({
    table,
    operation: 'R',
    line: index + 1,
    procedureId: null,
  }));
  return inventory;
}

describe('table name mapping in the UI', () => {
  it('picks the schema prefix written most often, case-insensitively', () => {
    expect(
      inferDefaultSchema(
        withTables(['han01.A', 'HAN01.B', 'X.C', 'D', '"Q".E', '"Q".F']),
      ),
    ).toBe('HAN01');
    // Ties go to the alphabetically first; quoted schemas are never picked.
    expect(inferDefaultSchema(withTables(['B.T', 'A.T', '"Z".T']))).toBe('A');
    expect(inferDefaultSchema(withTables(['T', '"Q".T']))).toBeNull();
  });

  it('keeps a configured schema and only infers when none is set', () => {
    expect(effectiveMapping(mappedInventoryFixture)).toEqual({
      defaultSchema: 'APP',
      status: 'assumed',
      inferred: false,
    });
    expect(effectiveMapping(unmappedInventoryFixture)).toEqual({
      defaultSchema: 'APP',
      status: 'assumed',
      inferred: true,
    });
    expect(effectiveMapping(withTables(['T']))).toEqual({
      defaultSchema: null,
      status: 'unconfigured',
      inferred: false,
    });
  });

  it('normalizes like table-name-v1: unquoted upper case, quoted kept', () => {
    expect(normalizeTableName('han01.ktbnkt', 'HAN01')).toBe('KTBNKT');
    expect(normalizeTableName('other.ktbnkt', 'HAN01')).toBe('OTHER.KTBNKT');
    expect(normalizeTableName('"Orders"', 'HAN01')).toBe('"Orders"');
    expect(normalizeTableName('HAN01."Orders"', 'HAN01')).toBe('"Orders"');
  });
});
