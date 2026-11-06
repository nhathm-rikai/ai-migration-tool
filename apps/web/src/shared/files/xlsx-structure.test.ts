import { describe, expect, it } from 'vitest';
import { REAL_WRITER_XLSX_BASE64 } from '../../testing/real-writer-xlsx';
import { isWellFormedXlsx } from './xlsx-structure';

// Review finding 1 (second AR01 review): a body of only the ZIP signature
// is not a workbook.

const encoder = new TextEncoder();

function u16(value: number) {
  return [value & 0xff, (value >> 8) & 0xff];
}
function u32(value: number) {
  return [...u16(value & 0xffff), ...u16(value >>> 16)];
}

// Stored (uncompressed) ZIP with a correct central directory.
function zip(names: string[], comment = '') {
  const local: number[] = [];
  const central: number[] = [];
  for (const name of names) {
    const nameBytes = [...encoder.encode(name)];
    const offset = local.length;
    local.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
    );
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...nameBytes,
    );
  }
  const commentBytes = [...encoder.encode(comment)];
  const eocd = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(names.length),
    ...u16(names.length),
    ...u32(central.length),
    ...u32(local.length),
    ...u16(commentBytes.length),
    ...commentBytes,
  ];
  return new Uint8Array([...local, ...central, ...eocd]);
}

const REQUIRED = ['[Content_Types].xml', 'xl/workbook.xml'];

describe('isWellFormedXlsx', () => {
  it('accepts the workbook of the real writer', () => {
    const bytes = Uint8Array.from(atob(REAL_WRITER_XLSX_BASE64), (c) =>
      c.charCodeAt(0),
    );
    expect(isWellFormedXlsx(bytes)).toBe(true);
  });

  it('accepts a package with the required entries and a comment', () => {
    expect(isWellFormedXlsx(zip([...REQUIRED, 'xl/styles.xml']))).toBe(true);
    expect(isWellFormedXlsx(zip(REQUIRED, 'x'.repeat(500)))).toBe(true);
  });

  it('rejects a body of only the ZIP signature', () => {
    expect(isWellFormedXlsx(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(
      false,
    );
  });

  it('rejects a truncated workbook', () => {
    const full = Uint8Array.from(atob(REAL_WRITER_XLSX_BASE64), (c) =>
      c.charCodeAt(0),
    );
    expect(isWellFormedXlsx(full.slice(0, full.length - 10))).toBe(false);
    expect(isWellFormedXlsx(full.slice(0, 100))).toBe(false);
  });

  it('rejects random bytes that start with the signature', () => {
    const bytes = new Uint8Array(4000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 131 + 7) % 251;
    bytes.set([0x50, 0x4b, 0x03, 0x04]);
    expect(isWellFormedXlsx(bytes)).toBe(false);
  });

  it('rejects a central directory outside the file', () => {
    const bytes = zip(REQUIRED);
    // Central directory offset field of the end record (22 bytes from end).
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 22 + 16, bytes.length + 100, true);
    expect(isWellFormedXlsx(bytes)).toBe(false);
    const sized = zip(REQUIRED);
    new DataView(sized.buffer).setUint32(sized.length - 22 + 12, 99999, true);
    expect(isWellFormedXlsx(sized)).toBe(false);
  });

  it.each([
    [['[Content_Types].xml']],
    [['xl/workbook.xml']],
    [['a.txt', 'b.txt']],
  ])('rejects a ZIP without the workbook entries (%#)', (names) => {
    expect(isWellFormedXlsx(zip(names))).toBe(false);
  });
});

// Third review, finding 1: the entries the check relies on must be inside
// the file, with a local header and their data before the central directory.
describe('isWellFormedXlsx entry ranges', () => {
  // Patch a field of the central directory entry called `name`.
  function patched(
    name: string,
    at: number,
    value: number,
    wide: boolean,
    names: string[] = REQUIRED,
  ) {
    const bytes = zip(names);
    const view = new DataView(bytes.buffer);
    let entry = view.getUint32(bytes.length - 22 + 16, true);
    for (;;) {
      const length = view.getUint16(entry + 28, true);
      const found = new TextDecoder().decode(
        bytes.subarray(entry + 46, entry + 46 + length),
      );
      if (found === name) break;
      entry += 46 + length;
    }
    if (wide) view.setUint32(entry + at, value, true);
    else view.setUint16(entry + at, value, true);
    return bytes;
  }

  it('accepts the unpatched package', () => {
    expect(isWellFormedXlsx(zip(REQUIRED))).toBe(true);
  });

  it.each(REQUIRED)('rejects %s with a local offset outside the file', (n) => {
    expect(isWellFormedXlsx(patched(n, 42, 0x7fffffff, true))).toBe(false);
  });

  it.each(REQUIRED)('rejects %s with no local signature at its offset', (n) => {
    // Offset 5 is inside the first local header, not at a signature.
    expect(isWellFormedXlsx(patched(n, 42, 5, true))).toBe(false);
  });

  it.each(REQUIRED)('rejects %s whose data overruns the file', (n) => {
    expect(isWellFormedXlsx(patched(n, 20, 100000, true))).toBe(false);
  });

  // Fourth review: every entry is held to the same ranges.
  const SHEET = 'xl/worksheets/sheet1.xml';
  const WITH_SHEET = [...REQUIRED, SHEET];

  it('accepts a package with a sheet entry', () => {
    expect(isWellFormedXlsx(zip(WITH_SHEET))).toBe(true);
  });

  it('rejects a sheet entry with a local offset outside the file', () => {
    expect(
      isWellFormedXlsx(patched(SHEET, 42, 0x7fffffff, true, WITH_SHEET)),
    ).toBe(false);
  });

  it('rejects a sheet entry with no local signature at its offset', () => {
    expect(isWellFormedXlsx(patched(SHEET, 42, 5, true, WITH_SHEET))).toBe(
      false,
    );
  });

  it('rejects a sheet entry whose data overruns the file', () => {
    expect(isWellFormedXlsx(patched(SHEET, 20, 100000, true, WITH_SHEET))).toBe(
      false,
    );
  });

  it('rejects a local header name that differs from the central one', () => {
    const bytes = zip(WITH_SHEET);
    // Last local header: change the last letter of its name.
    const view = new DataView(bytes.buffer);
    const central = view.getUint32(bytes.length - 22 + 16, true);
    // Local header of the sheet is the third; its name ends right before
    // the central directory.
    bytes[central - 1] = 0x5a;
    expect(isWellFormedXlsx(bytes)).toBe(false);
  });

  it('rejects an entry count that differs from the directory', () => {
    const bytes = zip(WITH_SHEET);
    const view = new DataView(bytes.buffer);
    view.setUint16(bytes.length - 22 + 10, 2, true);
    view.setUint16(bytes.length - 22 + 8, 2, true);
    expect(isWellFormedXlsx(bytes)).toBe(false);
  });
});
