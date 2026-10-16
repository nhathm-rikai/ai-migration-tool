import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkOutputs } from './output-guard.js';

describe('checkOutputs', () => {
  let base = '';
  let source = '';
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'portal-guard-'));
    source = join(base, 'source');
    await mkdir(join(source, 'sub'), { recursive: true });
    await writeFile(join(source, 'M.BAS'), 'Sub A()\r\nEnd Sub\r\n');
    // 'junction' is used on Windows (no admin rights needed), ignored elsewhere.
    await symlink(source, join(base, 'alias'), 'junction');
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('accepts distinct outputs outside the source', async () => {
    await expect(
      checkOutputs(source, [join(base, 'out', 'a.json'), join(base, 'a.csv')]),
    ).resolves.toBeNull();
  });

  it.each([
    ['an existing source file', ['source', 'M.BAS']],
    ['a new file below the source', ['source', 'sub', 'new', 'x.json']],
    ['a source file through a link', ['alias', 'M.BAS']],
    ['a new file through a link', ['alias', 'new', 'x.csv']],
  ])('refuses %s', async (_label, parts) => {
    await expect(checkOutputs(source, [join(base, ...parts)])).resolves.toMatch(
      'outside the source folder',
    );
  });

  it('refuses the same physical file for JSON and CSV', async () => {
    await mkdir(join(base, 'out'));
    await symlink(join(base, 'out'), join(base, 'out-alias'), 'junction');
    await expect(
      checkOutputs(source, [
        join(base, 'out', 'r.json'),
        join(base, 'out-alias', 'r.json'),
      ]),
    ).resolves.toMatch('different files');
  });
});
