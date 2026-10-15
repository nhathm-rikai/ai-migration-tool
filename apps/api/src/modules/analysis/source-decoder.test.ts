import { describe, expect, it } from 'vitest';
import { decodeSourceBytes } from './source-decoder.js';

const CP932 = { profileEncoding: 'cp932' } as const;

describe('decodeSourceBytes', () => {
  it('maps CP932 extended characters, not plain Shift_JIS', () => {
    // ① (NEC row 13), ～ ― ∥ － (CP932-specific mappings), ⅰ (IBM extension)
    const bytes = Uint8Array.from([
      0x87, 0x40, 0x81, 0x60, 0x81, 0x5c, 0x81, 0x61, 0x81, 0x7c, 0xfa, 0x40,
    ]);
    expect(decodeSourceBytes(bytes, CP932)).toEqual({
      ok: true,
      text: '\u2460\uff5e\u2015\u2225\uff0d\u2170',
      encoding: 'cp932',
      decisionSource: 'profile',
    });
  });

  it('fails on invalid bytes instead of inserting replacement characters', () => {
    expect(
      decodeSourceBytes(Uint8Array.from([0x41, 0x85, 0x40]), CP932),
    ).toEqual({
      ok: false,
      code: 'SOURCE_ENCODING_ERROR',
      attemptedEncoding: 'cp932',
    });
    expect(
      decodeSourceBytes(Uint8Array.from([0x41, 0x81]), CP932),
    ).toMatchObject({ ok: false, code: 'SOURCE_ENCODING_ERROR' });
  });

  it('records ASCII-only text as ascii and rejects NUL without a BOM', () => {
    expect(
      decodeSourceBytes(Buffer.from('Option Explicit\r\n'), CP932),
    ).toEqual({
      ok: true,
      text: 'Option Explicit\r\n',
      encoding: 'ascii',
      decisionSource: 'ascii',
    });
    expect(
      decodeSourceBytes(Uint8Array.from([0x41, 0x00, 0x42]), CP932),
    ).toMatchObject({ ok: false, code: 'SOURCE_TEXT_UNSUPPORTED' });
  });

  it('honours a BOM, strips it from the decoded view and rejects a contradicting override', () => {
    const utf8 = Buffer.from('\ufeffあ', 'utf8');
    expect(decodeSourceBytes(utf8, CP932)).toEqual({
      ok: true,
      text: 'あ',
      encoding: 'utf-8',
      decisionSource: 'bom',
    });
    expect(decodeSourceBytes(utf8, { ...CP932, override: 'cp932' })).toEqual({
      ok: false,
      code: 'SOURCE_ENCODING_CONFLICT',
      attemptedEncoding: 'utf-8',
    });
    const utf16le = Uint8Array.from([0xff, 0xfe, 0x42, 0x30, 0x0a, 0x00]);
    expect(decodeSourceBytes(utf16le, CP932)).toMatchObject({
      text: 'あ\n',
      encoding: 'utf-16le',
    });
    const utf16be = Uint8Array.from([0xfe, 0xff, 0x30, 0x42]);
    expect(decodeSourceBytes(utf16be, CP932)).toMatchObject({
      text: 'あ',
      encoding: 'utf-16be',
    });
  });

  it.each([
    [[0xff, 0xfe, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00]],
    [[0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x41]],
  ])('rejects UTF-32 BOM %j instead of reading it as UTF-16', (bytes) => {
    expect(decodeSourceBytes(Uint8Array.from(bytes), CP932)).toEqual({
      ok: false,
      code: 'SOURCE_ENCODING_UNSUPPORTED',
      attemptedEncoding: null,
    });
  });

  it('uses a per-file override and never guesses when no profile encoding is chosen', () => {
    const utf8 = Buffer.from('あ', 'utf8');
    expect(decodeSourceBytes(utf8, { ...CP932, override: 'utf-8' })).toEqual({
      ok: true,
      text: 'あ',
      encoding: 'utf-8',
      decisionSource: 'override',
    });
    expect(decodeSourceBytes(utf8, { profileEncoding: null })).toEqual({
      ok: false,
      code: 'SOURCE_PROFILE_REQUIRED',
      attemptedEncoding: null,
    });
  });
});
