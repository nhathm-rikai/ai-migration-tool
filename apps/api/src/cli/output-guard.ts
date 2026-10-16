import { realpath } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
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
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

// Returns why the outputs cannot be written, or null when they are safe:
// each must be outside the source root and they must be distinct files.
export async function checkOutputs(
  root: string,
  outputs: readonly string[],
): Promise<string | null> {
  const physicalRoot = await physicalPath(root);
  const seen = new Set<string>();
  for (const output of outputs) {
    const physical = await physicalPath(output);
    if (isInside(physicalRoot, physical))
      return `Output must be written outside the source folder: ${output}`;
    if (seen.has(comparable(physical)))
      return `Outputs must be different files: ${output}`;
    seen.add(comparable(physical));
  }
  return null;
}
