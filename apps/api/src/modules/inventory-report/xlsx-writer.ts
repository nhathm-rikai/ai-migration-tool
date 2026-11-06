import { crc32, deflateRawSync } from 'node:zlib';

// Minimal Office Open XML (.xlsx) writer for report tables: one header row
// (bold, frozen, with an autofilter) and plain values. Text is always written
// as an inline string, never as a formula, so `=...` in data cannot run; text
// that a spreadsheet could take for a formula also gets the quote prefix, so
// it stays text when a user edits the cell. Pure: returns bytes, no I/O.

export type CellValue = string | number | null;

export type SheetColumn = {
  header: string;
  width?: number;
  // Long text goes over several lines instead of running on.
  wrap?: boolean;
};

export type Sheet = {
  name: string;
  columns: readonly SheetColumn[];
  rows: readonly (readonly CellValue[])[];
  // ARGB colour of the sheet tab (`FF1F3864`), for grouping.
  tabColor?: string;
  // A title line above the table (then one blank row, then the header).
  title?: string;
  // Reading notes under the title, one row each (then one blank row).
  notes?: readonly string[];
  // Data rows (0-based) written in the header style: a further table under
  // the first one, with its own column labels.
  subHeaderRows?: readonly number[];
  // Data rows (0-based) shown as section headings; no autofilter then.
  headingRows?: readonly number[];
  // Data rows (0-based) whose first cell links to the sheet it names.
  linkRows?: ReadonlyMap<number, string>;
  // First column in bold (key/value layout).
  boldFirstColumn?: boolean;
  // Autofilter on the header; default on.
  filter?: boolean;
};

// Excel's limit per cell; longer text is cut and marked (JSON keeps it all).
export const MAX_CELL_TEXT = 32_767;
const TRUNCATED = '…[truncated]';
const FORMULA_START = /^[=+\-@\t\r]/;
// Characters XML 1.0 cannot carry are replaced, not dropped silently.
const INVALID_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;
const SHEET_NAME = /^[^[\]:*?/\\]{1,31}$/;

// Characters added to a header's length for bold text and the filter button.
const HEADER_MARGIN = 4;

// Style indexes in styles.xml (cellXfs order).
const STYLE = {
  header: 1,
  quoted: 2,
  text: 3,
  integer: 4,
  decimal: 5,
  heading: 6,
  title: 7,
  key: 8,
  wrapped: 9,
  link: 10,
  note: 11,
} as const;

// Excel limits per worksheet.
export const MAX_SHEET_ROWS = 1_048_576;
export const MAX_SHEET_COLUMNS = 16_384;
// Widest column the layout asks for; longer text runs on (wrap is opt-in).
export const MAX_COLUMN_WIDTH = 60;
const TITLE_ROWS = 2;

export class SheetLimitError extends Error {
  constructor(
    readonly sheet: string,
    readonly rows: number,
    readonly columns: number,
  ) {
    super(
      `Sheet ${sheet} needs ${rows} rows and ${columns} columns; a worksheet holds at most ${MAX_SHEET_ROWS} rows and ${MAX_SHEET_COLUMNS} columns`,
    );
    this.name = 'SheetLimitError';
  }
}

// Row index of the header: below the optional title and one blank row.
const headerRowOf = (sheet: Pick<Sheet, 'title' | 'notes'>) =>
  sheet.title === undefined ? 1 : TITLE_ROWS + 1 + (sheet.notes?.length ?? 0);

// Checked before any XML is built, so an oversized table fails fast.
export function assertSheetFits(
  sheet: Pick<Sheet, 'name' | 'title' | 'notes'> & {
    rows: { length: number };
    columns: { length: number };
  },
): void {
  const rows = headerRowOf(sheet) + sheet.rows.length;
  if (rows > MAX_SHEET_ROWS || sheet.columns.length > MAX_SHEET_COLUMNS)
    throw new SheetLimitError(sheet.name, rows, sheet.columns.length);
}

function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, '�')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// Wide enough for the whole (bold) header on one line, never past the
// maximum: a narrower requested width would cut the header off.
export function columnWidth(column: SheetColumn): number {
  return Math.min(
    MAX_COLUMN_WIDTH,
    Math.max(column.width ?? 14, column.header.length + HEADER_MARGIN),
  );
}

type CellKind = {
  // Style of a text cell and of an empty one (empty cells keep borders).
  text: number;
  empty: number;
};

function cellXml(ref: string, value: CellValue, kind: CellKind): string {
  // An empty string is written as an empty (but styled) cell.
  if (value === null || value === '')
    return `<c r="${ref}" s="${kind.empty}"/>`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cell ${ref} is not finite`);
    const style = Number.isInteger(value) ? STYLE.integer : STYLE.decimal;
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  const text =
    value.length > MAX_CELL_TEXT
      ? value.slice(0, MAX_CELL_TEXT - TRUNCATED.length) + TRUNCATED
      : value;
  const style = FORMULA_START.test(text) ? STYLE.quoted : kind.text;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const width = sheet.columns.length;
  const headerRow = headerRowOf(sheet);
  const headings = new Set(sheet.headingRows ?? []);
  const subHeaders = new Set(sheet.subHeaderRows ?? []);
  const rowsXml: string[] = [];
  if (sheet.title !== undefined) {
    rowsXml.push(
      `<row r="1" ht="24" customHeight="1">${cellXml('A1', sheet.title, { text: STYLE.title, empty: STYLE.title })}</row>`,
    );
  }
  (sheet.notes ?? []).forEach((note, index) => {
    const r = 2 + index;
    rowsXml.push(
      `<row r="${r}">${cellXml(`A${r}`, note, { text: STYLE.note, empty: STYLE.note })}</row>`,
    );
  });
  const header = sheet.columns
    .map((column, c) =>
      cellXml(`${columnName(c)}${headerRow}`, column.header, {
        text: STYLE.header,
        empty: STYLE.header,
      }),
    )
    .join('');
  rowsXml.push(`<row r="${headerRow}">${header}</row>`);
  sheet.rows.forEach((row, index) => {
    const r = headerRow + 1 + index;
    if (row.length !== width)
      throw new Error(
        `Sheet ${sheet.name} row ${index + 2} has ${row.length} cells, expected ${width}`,
      );
    const heading = headings.has(index);
    const subHeader = subHeaders.has(index);
    const cells = row
      .map((value, c) => {
        const column = sheet.columns[c];
        const kind: CellKind = subHeader
          ? { text: STYLE.header, empty: STYLE.header }
          : heading
            ? { text: STYLE.heading, empty: STYLE.heading }
            : sheet.linkRows?.has(index) && c === 0
              ? { text: STYLE.link, empty: STYLE.text }
              : c === 0 && sheet.boldFirstColumn
                ? { text: STYLE.key, empty: STYLE.key }
                : column?.wrap
                  ? { text: STYLE.wrapped, empty: STYLE.text }
                  : { text: STYLE.text, empty: STYLE.text };
        return cellXml(`${columnName(c)}${r}`, value, kind);
      })
      .join('');
    rowsXml.push(`<row r="${r}">${cells}</row>`);
  });
  const lastRow = headerRow + sheet.rows.length;
  const cols = sheet.columns
    .map(
      (column, c) =>
        `<col min="${c + 1}" max="${c + 1}" width="${columnWidth(column)}" customWidth="1"/>`,
    )
    .join('');
  const links = [...(sheet.linkRows ?? [])]
    .map(
      ([index, target]) =>
        `<hyperlink ref="A${headerRow + 1 + index}" location="${escapeXml(`'${target.replaceAll("'", "''")}'!A1`)}" display="${escapeXml(target)}"/>`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (sheet.tabColor
      ? `<sheetPr><tabColor rgb="${sheet.tabColor}"/></sheetPr>`
      : '') +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' +
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    '</sheetView></sheetViews>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    (sheetFilters(sheet)
      ? `<autoFilter ref="A${headerRow}:${columnName(width - 1)}${lastRow}"/>`
      : '') +
    (links ? `<hyperlinks>${links}</hyperlinks>` : '') +
    '</worksheet>'
  );
}

// Section headings and the index sheet are read, not filtered.
const sheetFilters = (sheet: Sheet) =>
  sheet.filter !== false && (sheet.headingRows ?? []).length === 0;

const BORDER = 'borderId="1"';
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="6">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="16"/><color rgb="FF1F3864"/><name val="Calibri"/></font>' +
  '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font>' +
  '<font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="4"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right>' +
  '<top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="12">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  `<xf numFmtId="0" fontId="1" fillId="2" ${BORDER} xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
  `<xf numFmtId="49" fontId="0" fillId="0" ${BORDER} xfId="0" quotePrefix="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" ${BORDER} xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>` +
  `<xf numFmtId="3" fontId="0" fillId="0" ${BORDER} xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>` +
  `<xf numFmtId="4" fontId="0" fillId="0" ${BORDER} xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="3" ${BORDER} xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  `<xf numFmtId="0" fontId="2" fillId="0" ${BORDER} xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" ${BORDER} xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="4" fillId="0" ${BORDER} xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>` +
  '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function workbookParts(sheets: readonly Sheet[]): [string, string][] {
  const names = new Set<string>();
  for (const sheet of sheets) {
    if (!SHEET_NAME.test(sheet.name) || sheet.name.startsWith("'"))
      throw new Error(`Invalid sheet name: ${sheet.name}`);
    if (names.has(sheet.name.toLowerCase()))
      throw new Error(`Duplicate sheet name: ${sheet.name}`);
    if (sheet.columns.length === 0)
      throw new Error(`Sheet ${sheet.name} has no columns`);
    assertSheetFits(sheet);
    names.add(sheet.name.toLowerCase());
  }
  const sheetEntries = sheets.map((sheet, i) => ({
    path: `xl/worksheets/sheet${i + 1}.xml`,
    rel: `rId${i + 1}`,
    sheet,
  }));
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheetEntries
      .map(
        (entry) =>
          `<Override PartName="/${entry.path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '</Types>';
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const filtered = sheetEntries.flatMap((entry, i) =>
    sheetFilters(entry.sheet) ? [{ entry, i }] : [],
  );
  const definedNames =
    filtered.length === 0
      ? ''
      : '<definedNames>' +
        filtered
          .map(
            ({ entry, i }) =>
              `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(entry.sheet.name.replaceAll("'", "''"))}'!$A$${headerRowOf(entry.sheet)}:$${columnName(entry.sheet.columns.length - 1)}$${headerRowOf(entry.sheet) + entry.sheet.rows.length}</definedName>`,
          )
          .join('') +
        '</definedNames>';
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    sheetEntries
      .map(
        (entry, i) =>
          `<sheet name="${escapeXml(entry.sheet.name)}" sheetId="${i + 1}" r:id="${entry.rel}"/>`,
      )
      .join('') +
    '</sheets>' +
    definedNames +
    '</workbook>';
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheetEntries
      .map(
        (entry, i) =>
          `<Relationship Id="${entry.rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';
  return [
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', workbookRels],
    ['xl/styles.xml', STYLES_XML],
    ...sheetEntries.map((entry): [string, string] => [
      entry.path,
      sheetXml(entry.sheet),
    ]),
  ];
}

// ZIP container (deflate, UTF-8 names, fixed 1980-01-01 timestamps so the
// same report gives the same bytes). No ZIP64: parts must stay under 4 GiB.
function zip(entries: readonly [string, Uint8Array][]): Uint8Array {
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data);
    if (compressed.length >= 0xffffffff || data.length >= 0xffffffff)
      throw new Error(`Part ${name} is too large for a ZIP without ZIP64`);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    chunks.push(local, nameBytes, compressed);
    central.push(header, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

export function writeXlsx(sheets: readonly Sheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error('A workbook needs a sheet');
  return zip(
    workbookParts(sheets).map(([name, xml]): [string, Uint8Array] => [
      name,
      Buffer.from(xml, 'utf8'),
    ]),
  );
}
