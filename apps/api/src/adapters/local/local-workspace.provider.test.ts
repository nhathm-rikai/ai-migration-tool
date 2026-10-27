import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findSourceProfile,
  type SourceProfile,
} from '../../modules/analysis/source-profiles.js';
import type {
  CreateSnapshotRequest,
  SnapshotLimits,
} from '../../ports/workspace-provider.js';
import { createLocalWorkspaceProvider } from './local-workspace.provider.js';

const found = findSourceProfile('vb6-cp932-v1');
if (!found) throw new Error('Profile vb6-cp932-v1 is missing.');
const profile: SourceProfile = found;

const LIMITS: SnapshotLimits = {
  maxFiles: 100,
  maxFileBytes: 1024,
  maxTotalBytes: 64 * 1024,
};

// Expected values are written by hand (bytes and decoded text), not derived
// from the decoder under test. あ = 82 A0, ① = 87 40 (NEC), 髙 = FB FC (IBM).
const CP932_BYTES = Buffer.concat([
  Buffer.from('Attribute VB_Name = "MAIN"\r\n\' ', 'ascii'),
  Buffer.from([0x82, 0xa0, 0x87, 0x40, 0xfb, 0xfc]),
  Buffer.from('\r\nx = "1"\n', 'ascii'),
]);
const CP932_NORMALIZED = 'Attribute VB_Name = "MAIN"\n\' あ①髙\nx = "1"\n';
const BOM_BYTES = Buffer.from('﻿Attribute VB_Name = "U"\r\nDim s\r\n', 'utf8');
const BOM_NORMALIZED = 'Attribute VB_Name = "U"\nDim s\n';
const FRX_BYTES = Buffer.from([0x00, 0xff, 0x10, 0x82]);

const sha = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex');

function linkDirectory(target: string, path: string): void {
  symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
}

// Hash of every file under a directory, to prove the source is not written.
function treeHashes(dir: string, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory())
      Object.assign(result, treeHashes(path, `${prefix}${entry.name}/`));
    else result[`${prefix}${entry.name}`] = sha(readFileSync(path));
  }
  return result;
}

describe('local workspace provider (B06)', () => {
  let base: string;
  let source: string;
  let outside: string;
  let snapshotsDir: string;
  let provider: ReturnType<typeof createLocalWorkspaceProvider>;

  beforeEach(() => {
    base = realpathSync.native(
      mkdtempSync(join(tmpdir(), 'portal-snapshot-test-')),
    );
    source = join(base, 'source');
    outside = join(base, 'outside');
    snapshotsDir = join(base, 'data', 'snapshots');
    mkdirSync(join(source, 'programs', '受注'), { recursive: true });
    mkdirSync(join(source, '.claude'));
    mkdirSync(outside);
    writeFileSync(join(source, 'programs', '受注', 'MAIN.BAS'), CP932_BYTES);
    writeFileSync(join(source, 'programs', 'UTF.BAS'), BOM_BYTES);
    writeFileSync(join(source, 'programs', 'FORM1.FRX'), FRX_BYTES);
    writeFileSync(join(source, 'programs', 'CTRL.CTL'), 'VERSION 5.00\r\n');
    writeFileSync(join(source, 'BUILD.LOG'), 'build output\n');
    writeFileSync(join(source, '.claude', 'settings.json'), '{"hooks":{}}');
    writeFileSync(join(outside, 'SECRET.BAS'), 'Attribute VB_Name = "S"\r\n');
    provider = createLocalWorkspaceProvider({ snapshotsDir });
  });
  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  function request(overrides: Partial<CreateSnapshotRequest> = {}) {
    return {
      snapshotId: randomUUID(),
      root: source,
      profile,
      limits: LIMITS,
      signal: new AbortController().signal,
      ...overrides,
    } satisfies CreateSnapshotRequest;
  }

  const stagingEntries = () =>
    existsSync(join(snapshotsDir, '.staging'))
      ? readdirSync(join(snapshotsDir, '.staging'))
      : [];

  it('B06-AC01 keeps raw bytes and the normalized view with independent hashes and lines', async () => {
    const before = treeHashes(source);
    const input = request();
    const result = await provider.createSnapshot(input);
    expect(result.status).toBe('published');
    if (result.status !== 'published') return;
    const { manifest } = result;
    const byPath = new Map(manifest.entries.map((e) => [e.relativePath, e]));

    expect(byPath.get('programs/受注/MAIN.BAS')).toMatchObject({
      kind: 'text',
      encoding: 'cp932',
      encodingSource: 'profile',
      rawSha256: sha(CP932_BYTES),
      normalizedSha256: sha(CP932_NORMALIZED),
      byteLength: CP932_BYTES.byteLength,
      lineCount: 3,
      newlineStyle: 'mixed',
    });
    expect(byPath.get('programs/UTF.BAS')).toMatchObject({
      kind: 'text',
      encoding: 'utf-8',
      encodingSource: 'bom',
      rawSha256: sha(BOM_BYTES),
      normalizedSha256: sha(BOM_NORMALIZED),
      lineCount: 2,
      newlineStyle: 'crlf',
    });
    // Binary resource: hashed and kept, never decoded.
    expect(byPath.get('programs/FORM1.FRX')).toMatchObject({
      kind: 'binary',
      rawSha256: sha(FRX_BYTES),
    });
    // Unsupported VB6 type stays in the snapshot for coverage.
    expect(byPath.get('programs/CTRL.CTL')).toMatchObject({
      role: 'unsupported',
    });

    const stored = join(snapshotsDir, input.snapshotId);
    expect(
      readFileSync(join(stored, 'raw', 'programs', '受注', 'MAIN.BAS')),
    ).toEqual(CP932_BYTES);
    expect(
      readFileSync(
        join(stored, 'normalized', 'programs', '受注', 'MAIN.BAS'),
        'utf8',
      ),
    ).toBe(CP932_NORMALIZED);
    expect(
      readFileSync(join(stored, 'normalized', 'programs', 'UTF.BAS'), 'utf8'),
    ).toBe(BOM_NORMALIZED);
    // Evidence lines come from the normalized view: line 2 is the quote.
    expect(
      readFileSync(
        join(stored, 'normalized', 'programs', '受注', 'MAIN.BAS'),
        'utf8',
      ).split('\n')[1],
    ).toBe("' あ①髙");

    // Agent settings and logs are listed, never copied.
    expect(manifest.skipped).toEqual(
      expect.arrayContaining([
        {
          relativePath: '.claude/settings.json',
          kind: 'file',
          reason: 'excluded',
          byteLength: 12,
        },
        {
          relativePath: 'BUILD.LOG',
          kind: 'file',
          reason: 'excluded',
          byteLength: 13,
        },
      ]),
    );
    expect(existsSync(join(stored, 'raw', '.claude'))).toBe(false);
    expect(manifest.fileCount).toBe(4);
    expect(treeHashes(source)).toEqual(before);
    expect(stagingEntries()).toEqual([]);

    // Reopen: the stored snapshot verifies against its manifest.
    expect(await provider.openSnapshot(input.snapshotId)).toEqual(manifest);
  });

  it('gives the same bytes the same snapshot hash and a different one after an edit', async () => {
    const first = await provider.createSnapshot(request());
    const second = await provider.createSnapshot(request());
    appendFileSync(join(source, 'programs', 'UTF.BAS'), 'x = 1\r\n');
    const third = await provider.createSnapshot(request());
    if (
      first.status !== 'published' ||
      second.status !== 'published' ||
      third.status !== 'published'
    )
      throw new Error('Snapshots should publish.');
    expect(second.manifest.snapshotHash).toBe(first.manifest.snapshotHash);
    expect(third.manifest.snapshotHash).not.toBe(first.manifest.snapshotHash);
  });

  it('B06-AC02 fails SOURCE_CHANGED when the file just read changes during the copy', async () => {
    const input = request({
      afterFileRead: (path) => {
        if (path === 'programs/受注/MAIN.BAS')
          appendFileSync(
            join(source, 'programs', '受注', 'MAIN.BAS'),
            "' late\r\n",
          );
      },
    });
    const result = await provider.createSnapshot(input);
    expect(result).toEqual({ status: 'failed', errorCode: 'SOURCE_CHANGED' });
    expect(existsSync(join(snapshotsDir, input.snapshotId))).toBe(false);
    expect(stagingEntries()).toEqual([]);
  });

  it('B06-AC02 fails SOURCE_CHANGED when an already copied file is edited later', async () => {
    const result = await provider.createSnapshot(
      request({
        afterFileRead: (path) => {
          if (path === 'programs/受注/MAIN.BAS')
            writeFileSync(
              join(source, 'programs', 'FORM1.FRX'),
              Buffer.from([1, 2, 3, 4, 5]),
            );
        },
      }),
    );
    expect(result).toEqual({ status: 'failed', errorCode: 'SOURCE_CHANGED' });
  });

  it('B06-AC02 fails SOURCE_CHANGED when a file is added or removed during the copy', async () => {
    const added = await provider.createSnapshot(
      request({
        afterFileRead: (path) => {
          if (path === 'programs/CTRL.CTL')
            writeFileSync(join(source, 'programs', 'NEW.BAS'), 'x');
        },
      }),
    );
    expect(added).toEqual({ status: 'failed', errorCode: 'SOURCE_CHANGED' });
    rmSync(join(source, 'programs', 'NEW.BAS'));
    const removed = await provider.createSnapshot(
      request({
        afterFileRead: (path) => {
          if (path === 'programs/CTRL.CTL') rmSync(join(source, 'BUILD.LOG'));
        },
      }),
    );
    expect(removed).toEqual({ status: 'failed', errorCode: 'SOURCE_CHANGED' });
  });

  it('B06-AC03 never follows a link out of the root and keeps it in coverage', async () => {
    linkDirectory(outside, join(source, 'escape'));
    const result = await provider.createSnapshot(request());
    if (result.status !== 'published')
      throw new Error('Snapshot should publish.');
    expect(result.manifest.skipped).toContainEqual({
      relativePath: 'escape',
      kind: 'other',
      reason: 'link',
      byteLength: null,
    });
    expect(
      result.manifest.entries.some((e) => e.relativePath.includes('SECRET')),
    ).toBe(false);
  });

  it('B06-AC03 marks an oversize file and fails a snapshot over the total or count limit', async () => {
    writeFileSync(
      join(source, 'programs', 'BIG.BAS'),
      'x'.repeat(LIMITS.maxFileBytes + 1),
    );
    const marked = await provider.createSnapshot(request());
    if (marked.status !== 'published')
      throw new Error('Snapshot should publish.');
    expect(marked.manifest.skipped).toContainEqual({
      relativePath: 'programs/BIG.BAS',
      kind: 'file',
      reason: 'too-large',
      byteLength: LIMITS.maxFileBytes + 1,
    });

    const total = request({ limits: { ...LIMITS, maxTotalBytes: 40 } });
    expect(await provider.createSnapshot(total)).toEqual({
      status: 'failed',
      errorCode: 'SOURCE_LIMIT_EXCEEDED',
    });
    const count = request({ limits: { ...LIMITS, maxFiles: 3 } });
    expect(await provider.createSnapshot(count)).toEqual({
      status: 'failed',
      errorCode: 'SOURCE_LIMIT_EXCEEDED',
    });
    expect(existsSync(join(snapshotsDir, total.snapshotId))).toBe(false);
    expect(stagingEntries()).toEqual([]);
  });

  it('B06-AC03 stops on cancel without publishing and removes its staging copy', async () => {
    const controller = new AbortController();
    const input = request({
      signal: controller.signal,
      afterFileRead: () => controller.abort(),
    });
    expect(await provider.createSnapshot(input)).toEqual({ status: 'stopped' });
    expect(existsSync(join(snapshotsDir, input.snapshotId))).toBe(false);
    expect(stagingEntries()).toEqual([]);
  });

  it('answers SOURCE_UNREADABLE for a root that is gone', async () => {
    expect(
      await provider.createSnapshot(request({ root: join(base, 'missing') })),
    ).toEqual({ status: 'failed', errorCode: 'SOURCE_UNREADABLE' });
  });

  it('refuses to reopen a snapshot whose stored bytes no longer match', async () => {
    const input = request();
    await provider.createSnapshot(input);
    writeFileSync(
      join(snapshotsDir, input.snapshotId, 'raw', 'programs', 'UTF.BAS'),
      'x',
    );
    expect(await provider.openSnapshot(input.snapshotId)).toBeUndefined();
    expect(await provider.openSnapshot(randomUUID())).toBeUndefined();
    expect(await provider.openSnapshot('../escape')).toBeUndefined();
  });

  it('reads the raw bytes of a snapshot only while they match the manifest (B08)', async () => {
    const input = request();
    const created = await provider.createSnapshot(input);
    if (created.status !== 'published') throw new Error('not published');
    const { manifest } = created;
    const files = await provider.readSnapshotFiles(manifest);
    expect(files?.map((file) => file.relativePath)).toEqual(
      manifest.entries.map((entry) => entry.relativePath),
    );
    const main = files?.find(
      (file) => file.relativePath === 'programs/受注/MAIN.BAS',
    );
    expect(Buffer.from(main?.bytes ?? [])).toEqual(CP932_BYTES);

    writeFileSync(
      join(snapshotsDir, input.snapshotId, 'raw', 'programs', 'UTF.BAS'),
      'x',
    );
    expect(await provider.readSnapshotFiles(manifest)).toBeUndefined();
    rmSync(join(snapshotsDir, input.snapshotId), { recursive: true });
    expect(await provider.readSnapshotFiles(manifest)).toBeUndefined();
    expect(
      await provider.readSnapshotFiles({ ...manifest, snapshotId: '../x' }),
    ).toBeUndefined();
  });

  it('cleans only the UUID staging copies it owns', async () => {
    const staging = join(snapshotsDir, '.staging');
    mkdirSync(join(staging, randomUUID()), { recursive: true });
    mkdirSync(join(staging, 'keep-me'));
    expect(await provider.cleanupStaging()).toBe(1);
    expect(readdirSync(staging)).toEqual(['keep-me']);
  });

  it.each(['snapshots', '.staging'])(
    'refuses cleanup through a linked %s directory without touching external bytes',
    async (part) => {
      mkdirSync(join(base, 'data'), { recursive: true });
      const target = part === 'snapshots' ? join(outside, '.staging') : outside;
      const abandoned = join(target, randomUUID());
      mkdirSync(abandoned, { recursive: true });
      writeFileSync(join(abandoned, 'keep.txt'), 'external fixture');
      if (part === '.staging') mkdirSync(snapshotsDir);
      linkDirectory(
        outside,
        part === 'snapshots' ? snapshotsDir : join(snapshotsDir, '.staging'),
      );
      const before = treeHashes(outside);
      await expect(provider.cleanupStaging()).rejects.toMatchObject({
        code: 'SNAPSHOT_STORAGE_INVALID',
      });
      expect(treeHashes(outside)).toEqual(before);
    },
  );

  it.each(['snapshots', '.staging'])(
    'refuses creation through a linked %s directory without writing outside data',
    async (part) => {
      mkdirSync(join(base, 'data'), { recursive: true });
      if (part === '.staging') mkdirSync(snapshotsDir);
      linkDirectory(
        outside,
        part === 'snapshots' ? snapshotsDir : join(snapshotsDir, '.staging'),
      );
      const before = treeHashes(outside);
      await expect(provider.createSnapshot(request())).rejects.toMatchObject({
        code: 'SNAPSHOT_STORAGE_INVALID',
      });
      expect(treeHashes(outside)).toEqual(before);
    },
  );

  it('refuses read and discard through a linked published snapshot', async () => {
    const input = request();
    await provider.createSnapshot(input);
    const published = join(snapshotsDir, input.snapshotId);
    const moved = join(outside, 'published');
    renameSync(published, moved);
    linkDirectory(moved, published);
    const before = treeHashes(outside);
    await expect(provider.openSnapshot(input.snapshotId)).rejects.toMatchObject(
      { code: 'SNAPSHOT_STORAGE_INVALID' },
    );
    await expect(
      provider.discardSnapshot(input.snapshotId),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_STORAGE_INVALID' });
    expect(treeHashes(outside)).toEqual(before);
  });

  it('refuses linked subdirectories of a stored snapshot', async () => {
    const input = request();
    await provider.createSnapshot(input);
    const raw = join(snapshotsDir, input.snapshotId, 'raw');
    const moved = join(outside, 'raw');
    renameSync(raw, moved);
    linkDirectory(moved, raw);
    const before = treeHashes(outside);
    await expect(provider.openSnapshot(input.snapshotId)).rejects.toMatchObject(
      { code: 'SNAPSHOT_STORAGE_INVALID' },
    );
    await expect(
      provider.discardSnapshot(input.snapshotId),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_STORAGE_INVALID' });
    expect(treeHashes(outside)).toEqual(before);
  });

  it('refuses a UUID staging junction without deleting the target', async () => {
    const staging = join(snapshotsDir, '.staging');
    mkdirSync(staging, { recursive: true });
    linkDirectory(outside, join(staging, randomUUID()));
    const before = treeHashes(outside);
    await expect(provider.cleanupStaging()).rejects.toMatchObject({
      code: 'SNAPSHOT_STORAGE_INVALID',
    });
    expect(treeHashes(outside)).toEqual(before);
  });

  it('refuses a hard-linked manifest for read and discard', async () => {
    const input = request();
    await provider.createSnapshot(input);
    const manifest = join(snapshotsDir, input.snapshotId, 'manifest.json');
    linkSync(manifest, join(outside, 'manifest.json'));
    const before = treeHashes(outside);
    await expect(provider.openSnapshot(input.snapshotId)).rejects.toMatchObject(
      {
        code: 'SNAPSHOT_STORAGE_INVALID',
      },
    );
    await expect(
      provider.discardSnapshot(input.snapshotId),
    ).rejects.toMatchObject({
      code: 'SNAPSHOT_STORAGE_INVALID',
    });
    expect(treeHashes(outside)).toEqual(before);
  });

  it('rechecks storage before writing and error cleanup if its root becomes a junction during copy', async () => {
    let before: Record<string, string> | undefined;
    const input = request({
      afterFileRead() {
        if (before) return;
        const moved = join(outside, 'snapshots');
        renameSync(snapshotsDir, moved);
        linkDirectory(moved, snapshotsDir);
        before = treeHashes(outside);
      },
    });
    await expect(provider.createSnapshot(input)).rejects.toMatchObject({
      code: 'SNAPSHOT_STORAGE_INVALID',
    });
    expect(before).toBeDefined();
    expect(treeHashes(outside)).toEqual(before);
  });
});
