import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { RuntimeError } from '../../shared/runtime-error.js';

// Snapshot paths are app-owned. Source links may be skipped, but links in
// storage are invalid: even cleanup must never traverse one. Check from the
// data-directory anchor on every operation, including nested raw/text paths.
// This guards existing links and replacement between operations. Node has no
// portable openat/unlinkat; the data directory must remain private to the app
// to exclude a concurrent process swapping directories between syscalls.
export function createSnapshotStorage(snapshotsDir: string) {
  const dataDir = dirname(resolve(snapshotsDir));
  let anchor: { path: string; identity: string } | undefined;
  const invalid = () => new RuntimeError('SNAPSHOT_STORAGE_INVALID');
  const identity = (stats: { dev: bigint; ino: bigint }) =>
    `${stats.dev}:${stats.ino}`;
  // Directories already proven physical (realpath under the anchor), by
  // path. A later check of the same path only needs lstat: still a real
  // directory (a link or junction swapped in reports isSymbolicLink) with the
  // same identity. A different identity falls back to the full check. This
  // keeps every component checked per operation without one realpath and
  // mkdir per component per file.
  const verified = new Map<string, string>();

  async function stillVerified(current: string): Promise<boolean> {
    const known = verified.get(current);
    if (known === undefined) return false;
    let stats;
    try {
      stats = await lstat(current, { bigint: true });
    } catch (error) {
      verified.delete(current);
      throw error;
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw invalid();
    if (identity(stats) === known) return true;
    verified.delete(current);
    return false;
  }

  function forget(path: string): void {
    const root = resolve(path);
    for (const known of verified.keys())
      if (known === root || known.startsWith(`${root}${sep}`))
        verified.delete(known);
  }

  async function directory(path: string, create = false): Promise<void> {
    const suffix = relative(dataDir, resolve(path));
    if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`))
      throw invalid();
    const parts = suffix ? suffix.split(sep) : [];
    const directories = [dataDir];
    for (const part of parts)
      directories.push(join(directories.at(-1) ?? dataDir, part));
    for (const [index, current] of directories.entries()) {
      if (await stillVerified(current)) continue;
      if (create) {
        try {
          await mkdir(current);
        } catch (error) {
          if (!(
            error instanceof Error &&
            'code' in error &&
            error.code === 'EEXIST'
          ))
            throw error;
        }
      }
      const stats = await lstat(current, { bigint: true });
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw invalid();
      const physical = await realpath(current);
      if (index === 0) {
        anchor ??= { path: physical, identity: identity(stats) };
        if (anchor.path !== physical || anchor.identity !== identity(stats))
          throw invalid();
      } else if (
        !anchor ||
        physical !== join(anchor.path, ...parts.slice(0, index))
      ) {
        throw invalid();
      }
      verified.set(current, identity(stats));
    }
  }

  // A regular, singly linked, non-link entry of a verified directory is
  // physically there; its own realpath adds nothing.
  async function file(path: string) {
    await directory(dirname(path));
    const stats = await lstat(path, { bigint: true });
    if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1n)
      throw invalid();
    return stats;
  }

  async function checkTree(path: string): Promise<void> {
    await directory(path);
    for (const name of await readdir(path)) {
      const child = join(path, name);
      const stats = await lstat(child);
      if (stats.isDirectory() && !stats.isSymbolicLink())
        await checkTree(child);
      else await file(child);
    }
  }

  async function removeTree(path: string): Promise<void> {
    await directory(path);
    for (const name of await readdir(path)) {
      const child = join(path, name);
      const stats = await lstat(child);
      if (stats.isDirectory() && !stats.isSymbolicLink())
        await removeTree(child);
      else {
        await file(child);
        await unlink(child);
      }
    }
    await directory(path);
    forget(path);
    await rmdir(path);
  }

  return {
    async createDirectory(path: string) {
      await directory(dirname(path), true);
      await mkdir(path);
      await directory(path);
    },
    async names(path: string) {
      await directory(path);
      return readdir(path);
    },
    async read(path: string): Promise<Buffer> {
      const listed = await file(path);
      const handle = await open(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      try {
        const opened = await handle.stat({ bigint: true });
        if (identity(opened) !== identity(listed) || opened.nlink !== 1n)
          throw invalid();
        await directory(dirname(path));
        return await handle.readFile();
      } finally {
        await handle.close();
      }
    },
    async writeNew(path: string, bytes: string | Uint8Array) {
      await directory(dirname(path), true);
      // O_EXCL creates a new regular file and never follows a link; publish
      // checks the whole tree again before it becomes visible.
      const handle = await open(path, 'wx');
      try {
        await handle.writeFile(bytes);
      } finally {
        await handle.close();
      }
    },
    async publish(staging: string, published: string) {
      await checkTree(staging);
      await directory(dirname(published));
      forget(staging);
      await rename(staging, published);
      await directory(published);
    },
    async remove(path: string) {
      try {
        // Validate the whole tree before deleting anything, then recheck each
        // operation. No recursive rm which could traverse a replaced parent.
        await checkTree(path);
        await removeTree(path);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return;
        throw error;
      }
    },
  };
}
