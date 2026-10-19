import { describe, expect, it } from 'vitest';
import {
  createTableNameMapping,
  normalizeTableName,
  UNCONFIGURED_TABLE_NAMES,
} from './table-names.js';

describe('table name mapping', () => {
  const han = createTableNameMapping('han01');

  it('records the schema upper case, as an assumption unless confirmed', () => {
    expect(han).toEqual({
      version: 'table-name-v1',
      defaultSchema: 'HAN01',
      status: 'assumed',
    });
    expect(createTableNameMapping('S', true)?.status).toBe('confirmed');
    expect(createTableNameMapping(null)).toBe(UNCONFIGURED_TABLE_NAMES);
  });

  it.each(['', 'A.B', '"S"', '1S', 'S;DROP'])(
    'refuses %j as a default schema',
    (schema) => {
      expect(createTableNameMapping(schema)).toBeNull();
    },
  );

  it.each([
    ['HAN01.KMTANT', 'KMTANT'],
    ['han01.kmtant', 'KMTANT'],
    ['KMTANT', 'KMTANT'],
    ['kmtant', 'KMTANT'],
    ['OTHER.KMTANT', 'OTHER.KMTANT'],
    ['"HAN01".KMTANT', '"HAN01".KMTANT'],
    ['HAN01."MixedCase"', '"MixedCase"'],
    ['"Mixed.Name"', '"Mixed.Name"'],
  ])('maps %j to %j with schema HAN01', (name, expected) => {
    if (!han) throw new Error('mapping');
    expect(normalizeTableName(name, han)).toBe(expected);
  });

  it('only merges case without a configured schema', () => {
    expect(normalizeTableName('han01.t', UNCONFIGURED_TABLE_NAMES)).toBe(
      'HAN01.T',
    );
  });
});
