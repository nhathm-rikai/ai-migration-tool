// Structural sanity check of an .xlsx (a ZIP) before it is saved. The answer
// comes from our own local backend, which builds the file with a tested
// writer; this only catches a response that is not a workbook package at all
// (an error page, a cut-off body, a wrong offset table). It finds the End Of
// Central Directory record, walks EVERY central directory entry, checks that
// each has a local header at an offset inside the file whose name equals the
// central one and whose data ends before the central directory, and that the
// two parts every workbook has are listed. It does not decompress, verify
// CRCs or parse XML: corruption below that level is out of scope.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN = 22;
// 22 bytes plus a comment of at most 65535 bytes.
const EOCD_MAX = EOCD_MIN + 0xffff;
const CENTRAL_HEADER = 46;
const LOCAL_HEADER = 30;
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
  const end = offset + size;
  if (end > eocd) return false;

  const found = new Set<string>();
  const decoder = new TextDecoder();
  let at = offset;
  for (let index = 0; index < entries; index++) {
    if (at + CENTRAL_HEADER > end) return false;
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) return false;
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const next = at + CENTRAL_HEADER + nameLength + extraLength + commentLength;
    if (next > end) return false;

    // Local header: signature, same name, and header + data before the
    // central directory.
    if (local + LOCAL_HEADER > offset) return false;
    if (view.getUint32(local, true) !== LOCAL_SIGNATURE) return false;
    if (view.getUint16(local + 26, true) !== nameLength) return false;
    const nameStart = local + LOCAL_HEADER;
    const dataStart = nameStart + nameLength + view.getUint16(local + 28, true);
    if (dataStart + compressed > offset) return false;
    const name = decoder.decode(
      bytes.subarray(at + CENTRAL_HEADER, at + CENTRAL_HEADER + nameLength),
    );
    if (
      name !== decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    )
      return false;
    found.add(name);
    at = next;
  }
  // The directory holds exactly the counted entries.
  if (at !== end) return false;
  return REQUIRED_ENTRIES.every((name) => found.has(name));
}
