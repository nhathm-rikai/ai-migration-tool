// Minimal .xlsx writer (no dependency): a ZIP with stored entries. Text goes
// out as inline strings, never as formulas, so a value starting with "="
// stays text. A cell is a formula only when a sheet gives it `f` explicitly.

// Looks a cell can take; each is one entry of the style sheet below.
export type CellStyle =
  | 'title'
  | 'head'
  | 'text'
  | 'textCenter'
  | 'int'
  | 'mm'
  | 'yen'
  | 'pct'
  | 'section'
  | 'subText'
  | 'subInt'
  | 'subMm'
  | 'subYen'
  | 'totalText'
  | 'totalInt'
  | 'totalMm'
  | 'totalYen'
  | 'note'
  | 'input'
  | 'inputPct'
  | 'inputYen'
  | 'label';

// `f` is a formula (without "="); `v` is the value saved with it so viewers
// that do not recalculate still show a number.
export type StyledCell = {
  v: string | number | null;
  s?: CellStyle;
  f?: string;
};

export type Cell = string | number | null | StyledCell;

export type Sheet = {
  name: string;
  rows: readonly (readonly Cell[])[];
  // Character widths of the columns, from the first.
  widths?: readonly number[];
  // Ranges such as "A1:H1".
  merges?: readonly string[];
  // Rows and columns kept in view while scrolling.
  freeze?: { rows?: number; columns?: number };
  // Row heights in points, by 1-based row number.
  heights?: Readonly<Record<number, number>>;
  landscape?: boolean;
};

const encoder = new TextEncoder();

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(
  files: { name: string; content: string }[],
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const header = (size: number) => {
    const bytes = new Uint8Array(size);
    return { bytes, view: new DataView(bytes.buffer) };
  };
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true); // UTF-8 names
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    chunks.push(local.bytes, name, data);
    const entry = header(46);
    entry.view.setUint32(0, 0x02014b50, true);
    entry.view.setUint16(4, 20, true);
    entry.view.setUint16(6, 20, true);
    entry.view.setUint16(8, 0x0800, true);
    entry.view.setUint32(16, crc, true);
    entry.view.setUint32(20, data.length, true);
    entry.view.setUint32(24, data.length, true);
    entry.view.setUint16(28, name.length, true);
    entry.view.setUint32(42, offset, true);
    central.push(entry.bytes, name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  const parts = [...chunks, ...central, end.bytes];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters are not allowed in XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function column(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

const STYLE_ORDER: CellStyle[] = [
  'title',
  'head',
  'text',
  'textCenter',
  'int',
  'mm',
  'yen',
  'pct',
  'section',
  'subText',
  'subInt',
  'subMm',
  'subYen',
  'totalText',
  'totalInt',
  'totalMm',
  'totalYen',
  'note',
  'input',
  'inputPct',
  'inputYen',
  'label',
];

// numFmt ids: 3 = #,##0 · 4 = #,##0.00 · 9 = 0% · 164 = yen
// fonts: 0 normal · 1 bold · 2 bold white · 3 bold 14 · 4 grey
// fills: 2 brand blue · 3 light blue · 4 light grey · 5 light yellow
// borders: 1 thin grey
type Look = {
  font?: number;
  fill?: number;
  border?: boolean;
  fmt?: number;
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
  top?: boolean;
};
const LOOKS: Record<CellStyle, Look> = {
  title: { font: 3 },
  head: {
    font: 2,
    fill: 2,
    border: true,
    align: 'center',
    wrap: true,
  },
  text: { border: true, wrap: true },
  textCenter: { border: true, align: 'center' },
  int: { border: true, fmt: 3 },
  mm: { border: true, fmt: 4 },
  yen: { border: true, fmt: 164 },
  pct: { border: true, fmt: 9 },
  section: { font: 1, fill: 3 },
  subText: { font: 1, fill: 4, border: true },
  subInt: { font: 1, fill: 4, border: true, fmt: 3 },
  subMm: { font: 1, fill: 4, border: true, fmt: 4 },
  subYen: { font: 1, fill: 4, border: true, fmt: 164 },
  totalText: { font: 1, fill: 3, border: true },
  totalInt: { font: 1, fill: 3, border: true, fmt: 3 },
  totalMm: { font: 1, fill: 3, border: true, fmt: 4 },
  totalYen: { font: 1, fill: 3, border: true, fmt: 164 },
  note: { font: 4, wrap: true, top: true },
  input: { fill: 5, border: true },
  inputPct: { fill: 5, border: true, fmt: 9 },
  inputYen: { fill: 5, border: true, fmt: 164 },
  label: { font: 1, border: true, wrap: true },
};

const FONT = 'Meiryo';
const font = (size: number, extra = '') =>
  `<font>${extra}<sz val="${size}"/><name val="${FONT}"/><family val="2"/></font>`;

function stylesXml(xml: string, main: string): string {
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    ...STYLE_ORDER.map((name) => {
      const look = LOOKS[name];
      const align = [
        `vertical="${look.top ? 'top' : 'center'}"`,
        look.align ? `horizontal="${look.align}"` : '',
        look.wrap ? 'wrapText="1"' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<xf numFmtId="${look.fmt ?? 0}" fontId="${look.font ?? 0}" fillId="${look.fill ?? 0}" borderId="${look.border ? 1 : 0}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment ${align}/></xf>`;
    }),
  ];
  const fill = (rgb: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  return `${xml}<styleSheet xmlns="${main}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;¥&quot;#,##0"/></numFmts><fonts count="5">${font(10)}${font(10, '<b/>')}${font(10, '<b/><color rgb="FFFFFFFF"/>')}${font(14, '<b/>')}${font(9, '<color rgb="FF55657A"/>')}</fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill('0077BE')}${fill('DDEBF7')}${fill('F2F2F2')}${fill('FFF2CC')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function sheetXml(sheet: Sheet, xml: string, main: string): string {
  const body = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          const ref = `${column(c)}${r + 1}`;
          const value =
            cell !== null && typeof cell === 'object' ? cell.v : cell;
          const formula =
            cell !== null && typeof cell === 'object' ? cell.f : undefined;
          const style =
            cell !== null && typeof cell === 'object' && cell.s
              ? ` s="${STYLE_ORDER.indexOf(cell.s) + 1}"`
              : '';
          if (formula !== undefined)
            return `<c r="${ref}"${style}><f>${escapeXml(formula)}</f>${typeof value === 'number' ? `<v>${value}</v>` : ''}</c>`;
          if (value === null || value === '') {
            // A styled empty cell keeps its border and fill.
            return style ? `<c r="${ref}"${style}/>` : '';
          }
          return typeof value === 'number'
            ? `<c r="${ref}"${style}><v>${value}</v></c>`
            : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      const height = sheet.heights?.[r + 1];
      return `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`;
    })
    .join('');
  const freeze = sheet.freeze;
  const pane =
    freeze && (freeze.rows || freeze.columns)
      ? `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane${freeze.columns ? ` xSplit="${freeze.columns}"` : ''}${freeze.rows ? ` ySplit="${freeze.rows}"` : ''} topLeftCell="${column(freeze.columns ?? 0)}${(freeze.rows ?? 0) + 1}" activePane="${freeze.rows && freeze.columns ? 'bottomRight' : freeze.rows ? 'bottomLeft' : 'topRight'}" state="frozen"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  return `${xml}<worksheet xmlns="${main}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${pane}${cols}<sheetData>${body}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${sheet.landscape === false ? 'portrait' : 'landscape'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

export function buildWorkbook(
  sheets: readonly Sheet[],
): Uint8Array<ArrayBuffer> {
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const pkg = 'http://schemas.openxmlformats.org/package/2006';
  const ids = sheets.map((_, i) => i + 1);
  return zip([
    {
      name: '[Content_Types].xml',
      content: `${xml}<Types xmlns="${pkg}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ids.map((n) => `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `${xml}<Relationships xmlns="${pkg}/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `${xml}<workbook xmlns="${main}" xmlns:r="${rel}"><sheets>${sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `${xml}<Relationships xmlns="${pkg}/relationships">${ids.map((n) => `<Relationship Id="rId${n}" Type="${rel}/worksheet" Target="worksheets/sheet${n}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', content: stylesXml(xml, main) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: sheetXml(sheet, xml, main),
    })),
  ]);
}

export function buildXlsx(
  sheetName: string,
  rows: readonly (readonly Cell[])[],
): Uint8Array<ArrayBuffer> {
  return buildWorkbook([{ name: sheetName, rows }]);
}
