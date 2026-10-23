import { crc32, deflateRawSync } from 'node:zlib';

// Minimal Office Open XML (.xlsx) writer for report tables: one header row
// (bold, frozen, with an autofilter) and plain values. Text is always written
// as an inline string, never as a formula, so `=...` in data cannot run; text
// that a spreadsheet could take for a formula also gets the quote prefix, so
// it stays text when a user edits the cell. Pure: returns bytes, no I/O.

export type CellValue = string | number | null;

export type SheetColumn = { header: string; width?: number };

export type Sheet = {
  name: string;
  columns: readonly SheetColumn[];
  rows: readonly (readonly CellValue[])[];
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

// Style indexes in styles.xml.
const STYLE_HEADER = 1;
const STYLE_QUOTED = 2;

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

// Wide enough for the whole (bold) header on one line; a narrower requested
// width would cut the header off.
export function columnWidth(column: SheetColumn): number {
  return Math.max(column.width ?? 14, column.header.length + HEADER_MARGIN);
}

function cellXml(ref: string, value: CellValue, header: boolean): string {
  // An empty string is written as an empty cell.
  if (value === null || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cell ${ref} is not finite`);
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  const text =
    value.length > MAX_CELL_TEXT
      ? value.slice(0, MAX_CELL_TEXT - TRUNCATED.length) + TRUNCATED
      : value;
  const style = header
    ? ` s="${STYLE_HEADER}"`
    : FORMULA_START.test(text)
      ? ` s="${STYLE_QUOTED}"`
      : '';
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const width = sheet.columns.length;
  const rows = [sheet.columns.map((column) => column.header), ...sheet.rows];
  const rowsXml = rows.map((row, r) => {
    if (row.length !== width)
      throw new Error(
        `Sheet ${sheet.name} row ${r + 1} has ${row.length} cells, expected ${width}`,
      );
    const cells = row
      .map((value, c) => cellXml(`${columnName(c)}${r + 1}`, value, r === 0))
      .join('');
    return `<row r="${r + 1}">${cells}</row>`;
  });
  const lastCell = `${columnName(width - 1)}${rows.length}`;
  const cols = sheet.columns
    .map(
      (column, c) =>
        `<col min="${c + 1}" max="${c + 1}" width="${columnWidth(column)}" customWidth="1"/>`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    `<autoFilter ref="A1:${lastCell}"/>` +
    '</worksheet>'
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" quotePrefix="1" applyNumberFormat="1"/>' +
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
    '</sheets><definedNames>' +
    sheetEntries
      .map(
        (entry, i) =>
          `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(entry.sheet.name.replaceAll("'", "''"))}'!$A$1:$${columnName(entry.sheet.columns.length - 1)}$${entry.sheet.rows.length + 1}</definedName>`,
      )
      .join('') +
    '</definedNames></workbook>';
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
