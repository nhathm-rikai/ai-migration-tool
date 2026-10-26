import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSourceInventory } from '../modules/analysis/source-inventory.js';
import { findSourceProfile } from '../modules/analysis/source-profiles.js';
import { main } from './export-inventory-report-command.js';

const SOURCE_FILES: Record<string, string> = {
  'P.VBP': 'Type=Exe\r\nModule=M; M.BAS\r\n',
  'M.BAS': 'Sub Main()\r\n    x = "SELECT * FROM T1"\r\nEnd Sub\r\n',
};

const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

describe('export-inventory-report command', () => {
  let base = '';
  let source = '';
  let inventory = '';
  const sourceHashes = async (): Promise<Record<string, string>> => {
    const hashes: Record<string, string> = {};
    for (const name of await readdir(source))
      hashes[name] = sha(await readFile(join(source, name)));
    return hashes;
  };
  const run = (outJson: string, outXlsx: string, root = source) =>
    main([
      '--inventory',
      inventory,
      '--source-root',
      root,
      '--programs',
      'P',
      '--out-json',
      outJson,
      '--out-xlsx',
      outXlsx,
    ]);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    base = await mkdtemp(join(tmpdir(), 'portal-report-'));
    source = join(base, 'source');
    await mkdir(source);
    for (const [name, body] of Object.entries(SOURCE_FILES))
      await writeFile(join(source, name), body);
    // 'junction' is used on Windows (no admin rights needed), ignored elsewhere.
    await symlink(source, join(base, 'alias'), 'junction');
    const profile = findSourceProfile('vb6-cp932-v1');
    if (!profile) throw new Error('setup');
    inventory = join(base, 'inventory.json');
    await writeFile(
      inventory,
      JSON.stringify(
        buildSourceInventory({
          profile,
          files: Object.entries(SOURCE_FILES).map(([relativePath, body]) => ({
            relativePath,
            bytes: Buffer.from(body),
          })),
        }),
      ),
    );
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(base, { recursive: true, force: true });
  });

  it('writes the JSON and XLSX outside the source', async () => {
    await expect(run(join(base, 'r.json'), join(base, 'r.xlsx'))).resolves.toBe(
      0,
    );
    const report: unknown = JSON.parse(
      await readFile(join(base, 'r.json'), 'utf8'),
    );
    expect(report).toHaveProperty('selection.programs', [
      { id: 'P', projectPath: 'P.VBP' },
    ]);
    expect(
      (
        await readFile(join(base, 'r.xlsx')).then((b) => b.subarray(0, 2))
      ).toString(),
    ).toBe('PK');
  });

  it.each([
    ['a source file as JSON', ['source', 'M.BAS'], ['r.xlsx']],
    ['a source file as XLSX', ['r.json'], ['source', 'P.VBP']],
    ['a source file through a junction', ['alias', 'M.BAS'], ['r.xlsx']],
    ['a new file inside the source', ['source', 'new', 'r.json'], ['r.xlsx']],
    ['the inventory itself', ['inventory.json'], ['r.xlsx']],
    ['the same file twice', ['r.json'], ['r.json']],
  ])('refuses %s and changes nothing', async (_label, json, xlsx) => {
    const before = await sourceHashes();
    const inventoryBefore = sha(await readFile(inventory));
    await expect(run(join(base, ...json), join(base, ...xlsx))).resolves.toBe(
      2,
    );
    expect(await sourceHashes()).toEqual(before);
    expect(sha(await readFile(inventory))).toBe(inventoryBefore);
    expect(await readdir(source)).toEqual(Object.keys(SOURCE_FILES).sort());
  });

  it('flags known mismatches from a complexity review file', async () => {
    const review = join(base, 'review.json');
    await writeFile(
      review,
      JSON.stringify({ knownMismatches: [{ program: 'P', note: 'n' }] }),
    );
    const args = (path: string) => [
      '--inventory',
      inventory,
      '--source-root',
      source,
      '--programs',
      'P',
      '--out-json',
      join(base, 'r.json'),
      '--out-xlsx',
      join(base, 'r.xlsx'),
      '--complexity-review',
      path,
    ];
    await expect(main(args(review))).resolves.toBe(0);
    const report: unknown = JSON.parse(
      await readFile(join(base, 'r.json'), 'utf8'),
    );
    expect(report).toHaveProperty('programs.0.complexityReviewFlags', [
      'known-mismatch',
    ]);
    await writeFile(review, JSON.stringify({ knownMismatches: [{ id: 'P' }] }));
    await expect(main(args(review))).resolves.toBe(2);
    await expect(main(args(join(base, 'r.json')))).resolves.toBe(2);
  });

  it('requires the source root', async () => {
    await expect(
      main([
        '--inventory',
        inventory,
        '--programs',
        'P',
        '--out-json',
        join(base, 'r.json'),
        '--out-xlsx',
        join(base, 'r.xlsx'),
      ]),
    ).resolves.toBe(2);
    await expect(readdir(base)).resolves.not.toContain('r.json');
  });
});
