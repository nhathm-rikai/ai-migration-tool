import { lstatSync, realpathSync, statSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuntimeError } from '../shared/runtime-error.js';

// Same relative layout in src/platform and dist/platform; independent of process.cwd().
const APPLICATION_ROOT = fileURLToPath(
  new URL('../../../../', import.meta.url),
);

// Optional sibling source directory in a local workspace; absent in standalone clones is fine.
const PROTECTED_ROOTS = [
  APPLICATION_ROOT,
  resolve(APPLICATION_ROOT, '..', 'source_vb6'),
];

export function resolveDefaultDataDirectory(input: {
  platform: NodeJS.Platform;
  homeDir: string;
  localAppData?: string;
  xdgDataHome?: string;
}): string {
  switch (input.platform) {
    case 'win32': {
      const base =
        input.localAppData && win32.isAbsolute(input.localAppData)
          ? input.localAppData
          : win32.join(input.homeDir, 'AppData', 'Local');
      return win32.join(base, 'MigrationPortal', 'portal-dev');
    }
    case 'darwin':
      return posix.join(
        input.homeDir,
        'Library',
        'Application Support',
        'MigrationPortal',
        'portal-dev',
      );
    case 'linux': {
      const base =
        input.xdgDataHome && posix.isAbsolute(input.xdgDataHome)
          ? input.xdgDataHome
          : posix.join(input.homeDir, '.local', 'share');
      return posix.join(base, 'MigrationPortal', 'portal-dev');
    }
    default:
      throw new RuntimeError('UNSUPPORTED_PLATFORM');
  }
}

function isWithin(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === '' ||
    (!isAbsolute(difference) &&
      difference !== '..' &&
      !difference.startsWith(`..${sep}`))
  );
}

function canonicalDirectory(path: string): string {
  let ancestor = path;
  const missing: string[] = [];
  while (true) {
    try {
      const existing = realpathSync.native(ancestor);
      if (!statSync(existing).isDirectory())
        throw new RuntimeError('DATA_DIR_INVALID');
      return join(existing, ...missing.reverse());
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      )
        throw error;
      // A dangling symlink is not a safe missing directory. Fail closed instead of creating through it.
      try {
        lstatSync(ancestor);
        throw new RuntimeError('DATA_DIR_INVALID');
      } catch (entryError) {
        if (
          !(entryError instanceof Error) ||
          !('code' in entryError) ||
          entryError.code !== 'ENOENT'
        )
          throw entryError;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new RuntimeError('DATA_DIR_INVALID');
      missing.push(basename(ancestor));
      ancestor = parent;
    }
  }
}

export function validateDataDirectory(
  path: string,
  forbiddenRoots: readonly string[] = PROTECTED_ROOTS,
): string {
  if (!isAbsolute(path)) throw new RuntimeError('DATA_DIR_INVALID');
  const normalized = resolve(path);
  // Lexical checks reject repo paths even if a repo child is a symlink pointing outside it.
  if (forbiddenRoots.some((root) => isWithin(resolve(root), normalized)))
    throw new RuntimeError('DATA_DIR_FORBIDDEN');
  const canonical = canonicalDirectory(normalized);
  if (
    forbiddenRoots.some((root) =>
      isWithin(canonicalDirectory(resolve(root)), canonical),
    )
  )
    throw new RuntimeError('DATA_DIR_FORBIDDEN');
  // Return the checked physical path so callers do not keep using an alias.
  return canonical;
}
