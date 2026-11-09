import { createHash } from 'node:crypto';

// Paths declared in a project file (Reference/Object/Form/Module lines) can be
// absolute paths of the author's machine. They are kept in the inventory's own
// `members`, but anything derived from them for reading (report names and
// files, warnings, exports) shows the file name only (DATA-08).

const ABSOLUTE_PATH = /^(?:[A-Za-z]:|[\\/])/;
export const REDACTED_PREFIX = '<absolute path>/';

// A path may be written in quotes (`Module=X; "C:\dir\X.bas"`); the quotes
// are not part of it.
const SURROUNDING_QUOTES = /^["']+|["']+$/g;

export function redactAbsolutePath(path: string): string {
  const trimmed = path.trim().replace(SURROUNDING_QUOTES, '').trim();
  if (!ABSOLUTE_PATH.test(trimmed)) return path;
  return REDACTED_PREFIX + (trimmed.split(/[\\/]/).at(-1) ?? '');
}

// Display text for a declared absolute path that must also tell two different
// paths apart: the redacted file name plus the first 8 hex digits of the
// SHA-256 of the normalized original (not reversible in practice). Identity
// and de-duplication use this text, never the plain redacted one, so
// `C:\one\Main.frm` and `D:\two\Main.frm` stay two files. A relative path is
// returned as written.
export function redactWithId(path: string): string {
  const trimmed = path.trim().replace(SURROUNDING_QUOTES, '').trim();
  if (!ABSOLUTE_PATH.test(trimmed)) return path;
  const id = createHash('sha256')
    .update(trimmed.replaceAll('\\', '/').toLowerCase())
    .digest('hex')
    .slice(0, 8);
  return `${redactAbsolutePath(path)} [${id}]`;
}
