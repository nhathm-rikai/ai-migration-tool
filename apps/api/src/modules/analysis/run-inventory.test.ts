import { randomUUID } from 'node:crypto';
import { SourceInventorySchema, type Run } from '@portal/contracts';
import { succeededRunFixture } from '@portal/contracts/fixtures';
import { Check } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotManifest,
} from '../../ports/workspace-provider.js';
import { analyzeRunConfig } from '../jobs/analyze-run-config.js';
import { buildRunInventory } from './run-inventory.js';
import { SOURCE_DECODER_VERSION } from './source-decoder.js';
import { createManifestEntry } from './source-manifest.js';
import { SOURCE_NORMALIZATION_VERSION } from './source-text.js';

const encoder = new TextEncoder();
const files = [
  {
    relativePath: 'app/APP.VBP',
    bytes: encoder.encode(
      'Type=Exe\r\nModule=Main; MAIN.BAS\r\nName="App"\r\n',
    ),
  },
  {
    relativePath: 'app/MAIN.BAS',
    bytes: encoder.encode(
      'Attribute VB_Name = "Main"\r\nPublic Sub Run()\r\n  Dim a\r\nEnd Sub\r\n',
    ),
  },
];

function manifest(skipped: SnapshotManifest['skipped'] = []): SnapshotManifest {
  const entries = files.map(
    (file) =>
      createManifestEntry({
        relativePath: file.relativePath,
        role: file.relativePath.endsWith('.VBP') ? 'project' : 'code',
        bytes: file.bytes,
        profileEncoding: 'cp932',
      }).entry,
  );
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId: randomUUID(),
    profileId: 'vb6-cp932-v1',
    decoderVersion: SOURCE_DECODER_VERSION,
    normalizationVersion: SOURCE_NORMALIZATION_VERSION,
    snapshotHash: 'a'.repeat(64),
    fileCount: entries.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes.byteLength, 0),
    entries,
    skipped,
  };
}

function run(overrides: Partial<Run['config']> = {}): Run {
  const config = analyzeRunConfig(
    'vb6-cp932-v1',
    { defaultSchema: 'APP', status: 'confirmed' },
    succeededRunFixture.config.limits,
  );
  if (!config) throw new Error('profile missing');
  return { ...succeededRunFixture, config: { ...config, ...overrides } };
}

describe('buildRunInventory (B08)', () => {
  it('builds a schema-valid inventory with the locked mapping and the snapshot content hash', () => {
    const outcome = buildRunInventory({
      run: run(),
      manifest: manifest(),
      files,
    });
    if (outcome.status !== 'built') throw new Error(outcome.errorCode);
    expect(Check(SourceInventorySchema, outcome.inventory)).toBe(true);
    expect(outcome.inventory.snapshotHash).toBe(outcome.contentHash);
    expect(outcome.inventory.tableNames).toMatchObject({
      defaultSchema: 'APP',
      status: 'confirmed',
    });
    expect(outcome.inventory.programs[0]).toMatchObject({
      name: 'App',
      complete: true,
    });
    expect(outcome.inventory.skipped).toEqual([]);
  });

  it('keeps coverage gaps of the snapshot but not files outside the profile', () => {
    const outcome = buildRunInventory({
      run: run(),
      manifest: manifest([
        {
          relativePath: 'app/BUILD.LOG',
          kind: 'file',
          reason: 'excluded',
          byteLength: 3,
        },
        {
          relativePath: 'app/link',
          kind: 'other',
          reason: 'link',
          byteLength: null,
        },
        {
          relativePath: 'app/BIG.BAS',
          kind: 'file',
          reason: 'too-large',
          byteLength: 9,
        },
        {
          relativePath: 'locked',
          kind: 'directory',
          reason: 'unreadable',
          byteLength: null,
        },
        {
          relativePath: 'app/pipe',
          kind: 'other',
          reason: 'special',
          byteLength: null,
        },
        {
          relativePath: 'app/a\\b',
          kind: 'file',
          reason: 'invalid-name',
          byteLength: null,
        },
      ]),
      files,
    });
    if (outcome.status !== 'built') throw new Error(outcome.errorCode);
    expect(outcome.inventory.skipped).toEqual([
      { relativePath: 'app/link', reason: 'symlink' },
      { relativePath: 'app/BIG.BAS', reason: 'too-large' },
      { relativePath: 'locked', reason: 'unreadable' },
      { relativePath: 'app/pipe', reason: 'special' },
      { relativePath: 'app/a\\b', reason: 'invalid-name' },
    ]);
    expect(Check(SourceInventorySchema, outcome.inventory)).toBe(true);
  });

  it('refuses a run whose locked analyzer versions are not the running build', () => {
    const locked = run();
    const outcome = buildRunInventory({
      run: run({
        analyzer: { ...locked.config.analyzer, metricVersion: 'loc-v0' },
      }),
      manifest: manifest(),
      files,
    });
    expect(outcome).toEqual({
      status: 'failed',
      errorCode: 'ANALYSIS_OUTPUT_INVALID',
    });
  });

  it('refuses a snapshot of another profile and an unknown profile', () => {
    expect(
      buildRunInventory({
        run: run(),
        manifest: { ...manifest(), profileId: 'other-profile' },
        files,
      }).status,
    ).toBe('failed');
    expect(
      buildRunInventory({
        run: run({ profileId: 'vb6-unknown-v9' }),
        manifest: manifest(),
        files,
      }),
    ).toEqual({ status: 'failed', errorCode: 'SOURCE_PROFILE_UNSUPPORTED' });
  });
});
