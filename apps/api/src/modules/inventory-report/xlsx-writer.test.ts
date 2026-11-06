import { describe, expect, it } from 'vitest';
import { unzip } from '../../testing/zip-reader.js';
import {
  assertSheetFits,
  columnName,
  columnWidth,
  MAX_CELL_TEXT,
  MAX_COLUMN_WIDTH,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  SheetLimitError,
  writeXlsx,
} from './xlsx-writer.js';

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
    expect(xml).toContain('<c r="B2" s="4"><v>1</v></c>');
    // An empty cell keeps its border; a fraction gets the decimal format.
    expect(xml).toContain(
      '<row r="3"><c r="A3" s="3"/><c r="B3" s="5"><v>2.5</v></c></row>',
    );
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

describe('table style', () => {
  const styles = (sheets: Parameters<typeof writeXlsx>[0]) =>
    unzip(writeXlsx(sheets)).get('xl/styles.xml') ?? '';

  it('has a dark header, thin borders and a thousands format', () => {
    const xml = styles([sheet([['a', 1]])]);
    expect(xml).toContain('FF1F3864');
    expect(xml).toContain('<left style="thin">');
    expect(xml).toContain('numFmtId="3"');
    expect(xml).toContain('quotePrefix="1"');
  });

  it('colours the tab and starts the table below a title', () => {
    const parts = unzip(
      writeXlsx([
        {
          name: 'T',
          title: 'Title',
          tabColor: 'FF2E75B6',
          columns: [{ header: 'A' }],
          rows: [['x']],
        },
      ]),
    );
    const xml = parts.get('xl/worksheets/sheet1.xml') ?? '';
    expect(xml).toContain('<tabColor rgb="FF2E75B6"/>');
    expect(xml).toContain('<c r="A1" t="inlineStr" s="7">');
    expect(xml).toContain('<c r="A3" t="inlineStr" s="1">');
    expect(xml).toContain('<pane ySplit="3" topLeftCell="A4"');
    expect(xml).toContain('<autoFilter ref="A3:A4"/>');
  });

  it('shows section headings without a filter and links a sheet name', () => {
    const parts = unzip(
      writeXlsx([
        sheet([
          ['Section', null],
          ['Data', 1],
        ]),
        {
          name: 'Index',
          columns: [{ header: 'Sheet' }, { header: 'Rows' }],
          rows: [
            ['Section', null],
            ['Data', 2],
          ],
          headingRows: [0],
          linkRows: new Map([[1, 'Data']]),
          filter: false,
        },
      ]),
    );
    const xml = parts.get('xl/worksheets/sheet2.xml') ?? '';
    expect(xml).not.toContain('<autoFilter');
    expect(xml).toContain('<c r="A2" t="inlineStr" s="6">');
    expect(xml).toContain('<c r="B2" s="6"/>');
    expect(xml).toContain(`<hyperlink ref="A3" location="'Data'!A1"`);
    expect(parts.get('xl/workbook.xml')).not.toContain("'Index'!");
  });

  it('caps the column width', () => {
    expect(columnWidth({ header: 'a', width: 400 })).toBe(MAX_COLUMN_WIDTH);
    expect(columnWidth({ header: 'a' })).toBe(14);
  });
});

// Review finding 5: Excel holds 1,048,576 rows and 16,384 columns per sheet.
describe('worksheet limits', () => {
  const fake = (rows: number, columns: number, title?: string) => ({
    name: 'Big',
    ...(title === undefined ? {} : { title }),
    rows: { length: rows },
    columns: { length: columns },
  });

  it('accepts a sheet that fills the worksheet exactly', () => {
    expect(() => assertSheetFits(fake(MAX_SHEET_ROWS - 1, 1))).not.toThrow();
    expect(() => assertSheetFits(fake(1, MAX_SHEET_COLUMNS))).not.toThrow();
  });

  it.each([
    [fake(MAX_SHEET_ROWS, 1)],
    [fake(MAX_SHEET_ROWS - 2, 1, 'with a title')],
    [fake(1, MAX_SHEET_COLUMNS + 1)],
  ])('refuses a sheet past the limit (%#)', (big) => {
    expect(() => assertSheetFits(big)).toThrow(SheetLimitError);
  });

  it('refuses before building any XML', () => {
    const huge = {
      name: 'Big',
      columns: [{ header: 'A' }],
      // Never iterated: the guard runs on the length alone.
      rows: { length: MAX_SHEET_ROWS } as unknown as [],
    };
    expect(() => writeXlsx([huge])).toThrow(SheetLimitError);
  });
});
