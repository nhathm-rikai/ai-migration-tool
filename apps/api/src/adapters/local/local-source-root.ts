import { opendirSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import type {
  SourceRootPolicy,
  SourceRootRejection,
} from '../../ports/source-root.js';

// Local filesystem implementation of the source root policy (DATA-03).
// Containment is compared by path segments on canonical physical paths
// (realpath follows symlinks, junctions and 8.3 names), never by a string
// prefix, and never by lower-casing: the filesystem decides case.

function isWithin(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === '' ||
    (!isAbsolute(difference) &&
      difference !== '..' &&
      !difference.startsWith(`..${sep}`))
  );
}

function overlaps(a: string, b: string): boolean {
  return isWithin(a, b) || isWithin(b, a);
}

// v1 reads local drives only. On Windows a root must be `X:\...`: UNC shares
// (`\\server\share`), device paths (`\\?\`, `\\.\`) and drive-relative or
// rooted-without-drive forms are refused; POSIX roots must start with `/`.
function localPathForm(
  path: string,
  platform: NodeJS.Platform,
): 'local' | 'relative' | 'remote' {
  if (path.includes('\0')) return 'relative';
  if (platform === 'win32') {
    if (/^[\\/]{2}/.test(path)) return 'remote';
    return /^[A-Za-z]:[\\/]/.test(path) && win32.isAbsolute(path)
      ? 'local'
      : 'relative';
  }
  return path.startsWith('/') ? 'local' : 'relative';
}

function canonical(path: string): string | null {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
}

function readable(directory: string): boolean {
  try {
    if (!statSync(directory).isDirectory()) return false;
    // Opening and reading one entry proves list permission without walking.
    const handle = opendirSync(directory);
    try {
      handle.readSync();
    } finally {
      handle.closeSync();
    }
    return true;
  } catch {
    return false;
  }
}

function displayNameOf(root: string): string {
  const name = basename(root) || root.replaceAll(/[\\/]/g, '') || 'source';
  return name.slice(0, 255);
}

export function createLocalSourceRootPolicy(options: {
  // Directories a source may not overlap: the application and its data.
  protectedRoots: readonly string[];
  platform?: NodeJS.Platform;
}): SourceRootPolicy {
  const platform = options.platform ?? process.platform;
  const protectedRoots = () =>
    options.protectedRoots.flatMap((root) => {
      const physical = canonical(root);
      return physical ? [resolve(root), physical] : [resolve(root)];
    });

  function forbidden(path: string): boolean {
    return protectedRoots().some((root) => overlaps(root, path));
  }

  function inspect(
    rootPath: string,
  ): { root: string } | { code: SourceRootRejection } {
    const form = localPathForm(rootPath, platform);
    if (form === 'remote') return { code: 'SOURCE_FORBIDDEN' };
    if (form === 'relative') return { code: 'INVALID_INPUT' };
    const lexical = resolve(rootPath);
    // Lexical first: a path inside the repo is refused even when a link in
    // it points elsewhere.
    if (forbidden(lexical)) return { code: 'SOURCE_FORBIDDEN' };
    const physical = canonical(lexical);
    if (physical === null) return { code: 'SOURCE_UNREADABLE' };
    if (localPathForm(physical, platform) !== 'local' || forbidden(physical))
      return { code: 'SOURCE_FORBIDDEN' };
    if (!readable(physical)) return { code: 'SOURCE_UNREADABLE' };
    return { root: physical };
  }

  return {
    resolve(rootPath) {
      const result = inspect(rootPath);
      if ('code' in result) return { ok: false, code: result.code };
      return {
        ok: true,
        root: result.root,
        displayName: displayNameOf(result.root),
      };
    },
    check(root) {
      const result = inspect(root);
      // Still the same physical directory: a root replaced by a link to
      // somewhere else is not the registered source any more.
      return 'root' in result && result.root === root ? 'ready' : 'unreadable';
    },
  };
}
