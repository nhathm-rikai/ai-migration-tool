// Minimal .xlsx writer (one sheet, no dependency): a ZIP with stored entries.
// Text goes out as inline strings, never as formulas, so a value starting
// with "=" stays text.

export type Cell = string | number | null;

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

export function buildXlsx(
  sheetName: string,
  rows: readonly (readonly Cell[])[],
): Uint8Array<ArrayBuffer> {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          const ref = `${column(c)}${r + 1}`;
          if (cell === null || cell === '') return '';
          return typeof cell === 'number'
            ? `<c r="${ref}"><v>${cell}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const pkg = 'http://schemas.openxmlformats.org/package/2006';
  return zip([
    {
      name: '[Content_Types].xml',
      content: `${xml}<Types xmlns="${pkg}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      content: `${xml}<Relationships xmlns="${pkg}/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `${xml}<workbook xmlns="${main}" xmlns:r="${rel}"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `${xml}<Relationships xmlns="${pkg}/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: `${xml}<worksheet xmlns="${main}"><sheetData>${body}</sheetData></worksheet>`,
    },
  ]);
}
