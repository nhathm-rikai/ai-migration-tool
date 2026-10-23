import { describe, expect, it } from 'vitest';
import { unzip } from '../../testing/zip-reader.js';
import { columnName, MAX_CELL_TEXT, writeXlsx } from './xlsx-writer.js';

const sheet = (rows: (string | number | null)[][]) => ({
  name: 'Data',
  columns: [{ header: 'A' }, { header: 'B', width: 30 }],
  rows,
});

describe('writeXlsx', () => {
  it('writes a package with a frozen, filtered header and typed cells', () => {
    const parts = unzip(
      writeXlsx([
        sheet([
          ['x', 1],
          [null, 2.5],
        ]),
      ]),
    );
    expect([...parts.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const xml = parts.get('xl/worksheets/sheet1.xml') ?? '';
    expect(xml).toContain('state="frozen"');
    expect(xml).toContain('<autoFilter ref="A1:B3"/>');
    expect(xml).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(xml).toContain('<c r="B2"><v>1</v></c>');
    expect(xml).toContain('<row r="3"><c r="B3"><v>2.5</v></c></row>');
    expect(xml).toContain('<col min="2" max="2" width="30" customWidth="1"/>');
  });

  it('widens a column so its whole header shows', () => {
    const xml =
      unzip(
        writeXlsx([
          {
            name: 'W',
            columns: [{ header: 'unclassifiedLines', width: 8 }],
            rows: [],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml') ?? '';
    expect(xml).toContain('<col min="1" max="1" width="21" customWidth="1"/>');
  });

  it.each(['=HYPERLINK("http://x","y")', '+1', '-1', '@SUM(A1)', '\t=1'])(
    'keeps %j as quoted text, never a formula',
    (value) => {
      const xml =
        unzip(writeXlsx([sheet([[value, null]])])).get(
          'xl/worksheets/sheet1.xml',
        ) ?? '';
      expect(xml).not.toContain('<f>');
      expect(xml).toContain('<c r="A2" t="inlineStr" s="2">');
    },
  );

  it('escapes XML and replaces characters XML cannot carry', () => {
    const xml =
      unzip(writeXlsx([sheet([['<a href="x">&</a>\u0001', 'テスト']])])).get(
        'xl/worksheets/sheet1.xml',
      ) ?? '';
    expect(xml).toContain('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;�</t>');
    expect(xml).toContain('テスト');
  });

  it('cuts text over the cell limit and marks it', () => {
    const xml =
      unzip(writeXlsx([sheet([['x'.repeat(MAX_CELL_TEXT + 10), null]])])).get(
        'xl/worksheets/sheet1.xml',
      ) ?? '';
    const text = /<c r="A2"[^>]*><is><t[^>]*>([^<]*)<\/t>/.exec(xml)?.[1];
    expect(text?.length).toBe(MAX_CELL_TEXT);
    expect(text?.endsWith('…[truncated]')).toBe(true);
  });

  it('gives the same bytes for the same sheets', () => {
    expect(writeXlsx([sheet([['a', 1]])])).toEqual(
      writeXlsx([sheet([['a', 1]])]),
    );
  });

  it.each([
    [[{ ...sheet([]), name: 'A/B' }], 'Invalid sheet name'],
    [[{ ...sheet([]), name: 'x'.repeat(32) }], 'Invalid sheet name'],
    [[sheet([]), { ...sheet([]), name: 'data' }], 'Duplicate sheet name'],
    [[sheet([['only one']])], 'has 1 cells'],
    [[sheet([[Number.NaN, null]])], 'not finite'],
    [[], 'needs a sheet'],
  ])('rejects an invalid workbook (%#)', (sheets, message) => {
    expect(() => writeXlsx(sheets)).toThrow(message);
  });

  it('names columns past Z', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });
});
