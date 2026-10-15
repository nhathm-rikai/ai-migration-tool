// Decodes raw source bytes without guessing: BOM first, then an explicit
// per-file override, then the profile default (see specs/source-analysis.md §2).
export const SOURCE_DECODER_VERSION = 'whatwg-textdecoder-v1';

export type ProfileEncoding = 'cp932' | 'utf-8';
export type SourceEncoding =
  ProfileEncoding | 'utf-16le' | 'utf-16be' | 'ascii';
export type EncodingDecisionSource = 'bom' | 'profile' | 'override' | 'ascii';

export type DecodeFailureCode =
  | 'SOURCE_ENCODING_ERROR'
  | 'SOURCE_ENCODING_UNSUPPORTED'
  | 'SOURCE_TEXT_UNSUPPORTED'
  | 'SOURCE_ENCODING_CONFLICT'
  | 'SOURCE_PROFILE_REQUIRED';

export type DecodeResult =
  | {
      ok: true;
      text: string;
      encoding: SourceEncoding;
      decisionSource: EncodingDecisionSource;
    }
  | {
      ok: false;
      code: DecodeFailureCode;
      attemptedEncoding: SourceEncoding | null;
    };

// WHATWG "Shift_JIS" (label windows-31j) is the CP932 mapping, including the
// NEC/IBM extensions; tests pin the extended code points.
const DECODER_LABELS: Record<Exclude<SourceEncoding, 'ascii'>, string> = {
  cp932: 'windows-31j',
  'utf-8': 'utf-8',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
};

// UTF-32 BOMs are checked before UTF-16: FF FE 00 00 also starts with the
// UTF-16LE BOM.
function isUtf32Bom(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0xff &&
      bytes[1] === 0xfe &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x00) ||
    (bytes[0] === 0x00 &&
      bytes[1] === 0x00 &&
      bytes[2] === 0xfe &&
      bytes[3] === 0xff)
  );
}

function detectBom(
  bytes: Uint8Array,
): 'utf-8' | 'utf-16le' | 'utf-16be' | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

function decodeStrict(
  bytes: Uint8Array,
  encoding: Exclude<SourceEncoding, 'ascii'>,
): string | null {
  try {
    // ignoreBOM=false strips the BOM from the decoded view only.
    return new TextDecoder(DECODER_LABELS[encoding], { fatal: true }).decode(
      bytes,
    );
  } catch {
    return null;
  }
}

export function decodeSourceBytes(
  bytes: Uint8Array,
  options: {
    profileEncoding: ProfileEncoding | null;
    override?: ProfileEncoding;
  },
): DecodeResult {
  if (isUtf32Bom(bytes))
    return {
      ok: false,
      code: 'SOURCE_ENCODING_UNSUPPORTED',
      attemptedEncoding: null,
    };
  const bom = detectBom(bytes);
  if (bom) {
    if (options.override && options.override !== bom)
      return {
        ok: false,
        code: 'SOURCE_ENCODING_CONFLICT',
        attemptedEncoding: bom,
      };
    const text = decodeStrict(bytes, bom);
    return text === null
      ? { ok: false, code: 'SOURCE_ENCODING_ERROR', attemptedEncoding: bom }
      : { ok: true, text, encoding: bom, decisionSource: 'bom' };
  }

  if (bytes.includes(0))
    return {
      ok: false,
      code: 'SOURCE_TEXT_UNSUPPORTED',
      attemptedEncoding: null,
    };
  if (bytes.every((byte) => byte < 0x80))
    return {
      ok: true,
      text: decodeStrict(bytes, 'utf-8') ?? '',
      encoding: 'ascii',
      decisionSource: 'ascii',
    };

  const encoding = options.override ?? options.profileEncoding;
  if (!encoding)
    return {
      ok: false,
      code: 'SOURCE_PROFILE_REQUIRED',
      attemptedEncoding: null,
    };
  const text = decodeStrict(bytes, encoding);
  return text === null
    ? { ok: false, code: 'SOURCE_ENCODING_ERROR', attemptedEncoding: encoding }
    : {
        ok: true,
        text,
        encoding,
        decisionSource: options.override ? 'override' : 'profile',
      };
}
