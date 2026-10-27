import { crc32, inflateRawSync } from 'node:zlib';

// Test-only ZIP reader for generated .xlsx files: walks the central
// directory, inflates each part and checks its CRC.
export function unzip(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('No ZIP end record');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const parts = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Bad central directory entry');
    const crc = buffer.readUInt32LE(offset + 16);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26);
    const data = inflateRawSync(buffer.subarray(dataStart, dataStart + size));
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in ${name}`);
    parts.set(name, data.toString('utf8'));
    offset += 46 + nameLength;
  }
  return parts;
}
