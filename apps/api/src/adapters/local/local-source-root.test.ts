import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APPLICATION_ROOT } from '../../platform/data-directory.js';
import { createLocalSourceRootPolicy } from './local-source-root.js';

// Directory links: a junction on Windows (no admin right needed), a symlink
// elsewhere. Both are the aliases DATA-03 asks to resolve.
function linkDirectory(target: string, path: string): void {
  symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
}

describe('local source root policy (B03-AC01, DATA-03)', () => {
  let base: string;
  let dataDir: string;
  let source: string;
  let policy: ReturnType<typeof createLocalSourceRootPolicy>;

  beforeEach(() => {
    base = realpathSync.native(
      mkdtempSync(join(tmpdir(), 'portal-root-test-')),
    );
    dataDir = join(base, 'data');
    source = join(base, 'ソース 2026');
    mkdirSync(dataDir);
    mkdirSync(source);
    writeFileSync(join(source, 'MAIN.BAS'), 'Attribute VB_Name = "MAIN"\r\n');
    policy = createLocalSourceRootPolicy({
      protectedRoots: [APPLICATION_ROOT, dataDir],
    });
  });
  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('accepts a readable local folder and keeps only its last segment public', () => {
    const result = policy.resolve(join(source, '.', '..', 'ソース 2026'));
    expect(result).toEqual({
      ok: true,
      root: realpathSync.native(source),
      displayName: 'ソース 2026',
    });
    expect(policy.check(realpathSync.native(source))).toBe('ready');
  });

  it('refuses relative and drive-relative paths as invalid input', () => {
    expect(policy.resolve('source')).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(policy.resolve(relative(process.cwd(), source))).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(policy.resolve(`${source}\0`)).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
  });

  it('applies the Windows drive/UNC/device policy by path form', () => {
    const windows = createLocalSourceRootPolicy({
      protectedRoots: [],
      platform: 'win32',
    });
    for (const path of [
      '\\\\server\\share\\src',
      '//server/share',
      '\\\\?\\C:\\src',
      '\\\\.\\C:\\src',
    ])
      expect(windows.resolve(path)).toEqual({
        ok: false,
        code: 'SOURCE_FORBIDDEN',
      });
    for (const path of ['C:src', '\\src', 'src\\a'])
      expect(windows.resolve(path)).toEqual({
        ok: false,
        code: 'INVALID_INPUT',
      });
  });

  it('refuses the application repository, its children and its parents', () => {
    for (const path of [
      APPLICATION_ROOT,
      join(APPLICATION_ROOT, 'tests', 'fixtures', 'vb6-sample'),
      join(APPLICATION_ROOT, '..'),
    ])
      expect(policy.resolve(path)).toEqual({
        ok: false,
        code: 'SOURCE_FORBIDDEN',
      });
  });

  it('refuses a root overlapping the data directory in either direction', () => {
    mkdirSync(join(dataDir, 'inside'));
    expect(policy.resolve(join(dataDir, 'inside'))).toEqual({
      ok: false,
      code: 'SOURCE_FORBIDDEN',
    });
    expect(policy.resolve(base)).toEqual({
      ok: false,
      code: 'SOURCE_FORBIDDEN',
    });
  });

  it('refuses a link whose target is a protected directory', () => {
    const alias = join(base, 'alias-to-data');
    linkDirectory(dataDir, alias);
    expect(policy.resolve(alias)).toEqual({
      ok: false,
      code: 'SOURCE_FORBIDDEN',
    });
    const repoAlias = join(base, 'alias-to-repo');
    linkDirectory(APPLICATION_ROOT, repoAlias);
    expect(policy.resolve(repoAlias)).toEqual({
      ok: false,
      code: 'SOURCE_FORBIDDEN',
    });
  });

  it('stores the physical target of an allowed link, not the alias', () => {
    const alias = join(base, 'alias-to-source');
    linkDirectory(source, alias);
    const result = policy.resolve(alias);
    expect(result).toMatchObject({
      ok: true,
      root: realpathSync.native(source),
    });
  });

  it('answers unreadable for a missing folder or a file', () => {
    expect(policy.resolve(join(base, 'missing'))).toEqual({
      ok: false,
      code: 'SOURCE_UNREADABLE',
    });
    expect(policy.resolve(join(source, 'MAIN.BAS'))).toEqual({
      ok: false,
      code: 'SOURCE_UNREADABLE',
    });
  });

  it('reports a registered root replaced by a link elsewhere as unreadable', () => {
    const root = realpathSync.native(source);
    const other = join(base, 'other');
    mkdirSync(other);
    renameSync(source, join(base, 'moved'));
    linkDirectory(other, source);
    expect(policy.check(root)).toBe('unreadable');
    rmSync(source);
    expect(policy.check(root)).toBe('unreadable');
  });
});
