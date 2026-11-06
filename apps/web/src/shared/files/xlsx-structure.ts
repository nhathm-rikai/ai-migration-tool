// Structural check of an .xlsx (a ZIP) before it is saved: the End Of Central
// Directory record is found, the central directory lies inside the file and
// lists the two parts every workbook has. It does not inflate anything.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN = 22;
// 22 bytes plus a comment of at most 65535 bytes.
const EOCD_MAX = EOCD_MIN + 0xffff;
const REQUIRED_ENTRIES = ['[Content_Types].xml', 'xl/workbook.xml'];

export function isWellFormedXlsx(bytes: Uint8Array): boolean {
  if (bytes.length < EOCD_MIN) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.length - EOCD_MAX);
  let eocd = -1;
  for (let at = bytes.length - EOCD_MIN; at >= lowest; at--) {
    if (view.getUint32(at, true) !== EOCD_SIGNATURE) continue;
    // The comment length must reach exactly the end of the file.
    if (at + EOCD_MIN + view.getUint16(at + 20, true) === bytes.length) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) return false;

  const entries = view.getUint16(eocd + 10, true);
  const size = view.getUint32(eocd + 12, true);
  const offset = view.getUint32(eocd + 16, true);
  if (offset + size > eocd) return false;

  const found = new Set<string>();
  const decoder = new TextDecoder();
  let at = offset;
  for (let index = 0; index < entries; index++) {
    if (at + 46 > offset + size) return false;
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) return false;
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > offset + size) return false;
    found.add(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)));
    at = next;
  }
  return REQUIRED_ENTRIES.every((name) => found.has(name));
}
