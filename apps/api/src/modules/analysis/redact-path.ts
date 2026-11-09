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
