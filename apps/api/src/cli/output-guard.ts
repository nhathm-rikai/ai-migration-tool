import { randomBytes } from 'node:crypto';
import { realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

// Resolves a path to its physical location: symlinks/junctions of the path
// or of its nearest existing ancestor are followed, so an alias of the source
// folder cannot hide that an output lands inside it.
export async function physicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch {
    const parent = dirname(absolute);
    if (parent === absolute) return absolute;
    return join(await physicalPath(parent), basename(absolute));
  }
}

// Windows and default macOS volumes compare paths without case.
function comparable(path: string): string {
  return process.platform === 'linux' ? path : path.toLowerCase();
}

function isInside(parent: string, child: string): boolean {
  const path = relative(comparable(parent), comparable(child));
  // Only a whole `..` segment leaves the parent; `..notes.bas` is a child.
  const leaves = path === '..' || path.startsWith(`..${sep}`);
  return !leaves && !isAbsolute(path);
}

// Device + file ID of an existing file, or null. Two paths with the same
// identity are the same file even through a hard link.
export async function fileIdentity(path: string): Promise<string | null> {
  try {
    const { dev, ino } = await stat(path, { bigint: true });
    return `${dev}:${ino}`;
  } catch {
    return null;
  }
}

// Returns why the outputs cannot be written, or null when they are safe:
// each must be outside the source root, must not be a hard link to a source
// file (`sourceFiles`: identities seen while reading) and they must be
// distinct files.
export async function checkOutputs(
  root: string,
  outputs: readonly string[],
  sourceFiles: ReadonlySet<string> = new Set(),
): Promise<string | null> {
  const physicalRoot = await physicalPath(root);
  const seen = new Set<string>();
  for (const output of outputs) {
    const physical = await physicalPath(output);
    if (isInside(physicalRoot, physical))
      return `Output must be written outside the source folder: ${output}`;
    const identity = await fileIdentity(physical);
    if (identity && sourceFiles.has(identity))
      return `Output is a hard link to a source file: ${output}`;
    for (const key of [comparable(physical), identity])
      if (key && seen.has(key))
        return `Outputs must be different files: ${output}`;
    seen.add(comparable(physical));
    if (identity) seen.add(identity);
  }
  return null;
}

// Writes a new file next to `path` and renames it over `path`, so an
// existing file (or another name linked to it) is replaced, never written
// through.
export async function writeReplacing(
  path: string,
  data: string,
): Promise<void> {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
