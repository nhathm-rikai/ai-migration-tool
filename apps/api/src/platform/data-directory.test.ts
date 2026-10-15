import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import {
  resolveDefaultDataDirectory,
  validateDataDirectory,
} from './data-directory.js';

describe('data directory containment on the host filesystem', () => {
  let owned: string;
  let repository: string;
  beforeEach(() => {
    owned = mkdtempSync(join(tmpdir(), 'portal-path-test-'));
    repository = join(owned, 'application');
    mkdirSync(join(repository, 'source_vb6'), { recursive: true });
  });
  afterEach(() => {
    rmSync(owned, { recursive: true, force: true });
  });

  it('rejects the repository, source and nonexistent descendants without creating them', () => {
    for (const path of [
      repository,
      join(repository, 'source_vb6'),
      join(repository, 'missing', 'data'),
    ]) {
      expect(() => validateDataDirectory(path, [repository])).toThrow(
        expect.objectContaining({ code: 'DATA_DIR_FORBIDDEN' }),
      );
    }
    expect(existsSync(join(repository, 'missing'))).toBe(false);
    expect(existsSync(join(repository, 'portal.db'))).toBe(false);
  });

  it('normalizes traversal and distinguishes a sibling with the same prefix', () => {
    expect(() =>
      validateDataDirectory(
        join(owned, 'external', '..', 'application', 'new'),
        [repository],
      ),
    ).toThrow();
    const sibling = join(owned, 'application-data', 'nested');
    expect(validateDataDirectory(sibling, [repository])).toBe(
      join(realpathSync.native(owned), 'application-data', 'nested'),
    );
    expect(existsSync(sibling)).toBe(false);
  });

  it('rejects an outside alias into the repository, including missing descendants', () => {
    const alias = join(owned, 'outside-alias');
    symlinkSync(
      repository,
      alias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() => validateDataDirectory(alias, [repository])).toThrow(
      expect.objectContaining({ code: 'DATA_DIR_FORBIDDEN' }),
    );
    expect(() =>
      validateDataDirectory(join(alias, 'not-created', 'data'), [repository]),
    ).toThrow(expect.objectContaining({ code: 'DATA_DIR_FORBIDDEN' }));
  });

  it('rejects a repo child even when its link points outside the repo', () => {
    const external = join(owned, 'external');
    mkdirSync(external);
    const alias = join(repository, 'link-out');
    symlinkSync(
      external,
      alias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() => validateDataDirectory(alias, [repository])).toThrow(
      expect.objectContaining({ code: 'DATA_DIR_FORBIDDEN' }),
    );
  });

  it('resolves an allowed alias to its physical location', () => {
    const external = join(owned, 'external');
    mkdirSync(external);
    const alias = join(owned, 'allowed-alias');
    symlinkSync(
      external,
      alias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(validateDataDirectory(join(alias, 'new'), [repository])).toBe(
      join(realpathSync.native(external), 'new'),
    );
  });

  it('protects a customer source sibling without treating the workspace as the repo', () => {
    const customerSource = join(owned, 'source_vb6');
    mkdirSync(customerSource);
    const roots = [repository, customerSource];
    const alias = join(owned, 'source-alias');
    symlinkSync(
      customerSource,
      alias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    for (const candidate of [
      customerSource,
      join(customerSource, 'missing'),
      join(alias, 'missing'),
    ]) {
      expect(() => validateDataDirectory(candidate, roots)).toThrow(
        expect.objectContaining({ code: 'DATA_DIR_FORBIDDEN' }),
      );
    }
    expect(validateDataDirectory(join(owned, 'runtime'), roots)).toBe(
      join(realpathSync.native(owned), 'runtime'),
    );
    expect(validateDataDirectory(owned, roots)).toBe(
      realpathSync.native(owned),
    );
  });

  it('allows a standalone clone with no customer source sibling', () => {
    const customerSource = join(owned, 'source_vb6');
    const roots = [repository, customerSource];
    expect(existsSync(customerSource)).toBe(false);
    expect(validateDataDirectory(join(owned, 'runtime'), roots)).toBe(
      join(realpathSync.native(owned), 'runtime'),
    );
    expect(() =>
      validateDataDirectory(join(customerSource, 'missing'), roots),
    ).toThrow(expect.objectContaining({ code: 'DATA_DIR_FORBIDDEN' }));
    expect(existsSync(customerSource)).toBe(false);
  });

  it('fails closed for a dangling link or a file used as a directory', () => {
    const dangling = join(owned, 'dangling');
    symlinkSync(
      join(owned, 'absent-target'),
      dangling,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() =>
      validateDataDirectory(join(dangling, 'data'), [repository]),
    ).toThrow();
    const file = join(owned, 'existing-file');
    writeFileSync(file, 'fixture');
    expect(() => validateDataDirectory(file, [repository])).toThrow();
    expect(() =>
      validateDataDirectory(join(file, 'data'), [repository]),
    ).toThrow();
  });

  it('rejects real application/source paths at the config boundary without opening SQLite', () => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    for (const path of [
      root,
      join(root, 'source_vb6'),
      join(root, 'apps', 'runtime-data'),
      join(root, '..', 'source_vb6'),
      join(root, '..', 'source_vb6', 'missing', 'data'),
    ]) {
      expect(() => loadConfig({ PORTAL_DATA_DIR: path })).toThrow(
        expect.objectContaining({ code: 'DATA_DIR_FORBIDDEN' }),
      );
    }
    expect(() =>
      validateDataDirectory('relative-path', [repository]),
    ).toThrow();
  });
});

describe('default path selection (unit cases, not native OS acceptance)', () => {
  it('uses Windows LOCALAPPDATA or the user AppData fallback', () => {
    expect(
      resolveDefaultDataDirectory({
        platform: 'win32',
        homeDir: 'C:\\Users\\dev',
        localAppData: 'D:\\Local Data',
      }),
    ).toBe('D:\\Local Data\\MigrationPortal\\portal-dev');
    expect(
      resolveDefaultDataDirectory({
        platform: 'win32',
        homeDir: 'C:\\Users\\dev',
        localAppData: 'relative',
      }),
    ).toBe('C:\\Users\\dev\\AppData\\Local\\MigrationPortal\\portal-dev');
  });
  it('uses macOS Application Support', () => {
    expect(
      resolveDefaultDataDirectory({
        platform: 'darwin',
        homeDir: '/Users/dev',
      }),
    ).toBe('/Users/dev/Library/Application Support/MigrationPortal/portal-dev');
  });
  it('uses Linux XDG_DATA_HOME only when absolute', () => {
    expect(
      resolveDefaultDataDirectory({
        platform: 'linux',
        homeDir: '/home/dev',
        xdgDataHome: '/custom/data',
      }),
    ).toBe('/custom/data/MigrationPortal/portal-dev');
    for (const xdgDataHome of ['', 'relative']) {
      expect(
        resolveDefaultDataDirectory({
          platform: 'linux',
          homeDir: '/home/dev',
          xdgDataHome,
        }),
      ).toBe('/home/dev/.local/share/MigrationPortal/portal-dev');
    }
  });
});
