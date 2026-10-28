import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Run } from '@portal/contracts';
import { succeededRunFixture } from '@portal/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import { analyzeRunConfig } from '../../modules/jobs/analyze-run-config.js';
import { prepareRunInventory } from '../../modules/analysis/run-inventory.js';
import { SOURCE_DECODER_VERSION } from '../../modules/analysis/source-decoder.js';
import { createManifestEntry } from '../../modules/analysis/source-manifest.js';
import { SOURCE_NORMALIZATION_VERSION } from '../../modules/analysis/source-text.js';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotManifest,
} from '../../ports/workspace-provider.js';
import { createWorkerInventoryBuilder } from './worker-inventory.builder.js';

// Synthetic VB6 corpus (no customer source): `programs` projects of six
// modules each, every module with a few procedures, SQL and calls.
function corpus(programs: number) {
  const module = (name: string) => {
    const lines = [`Attribute VB_Name = "${name}"`];
    for (let p = 0; p < 8; p++) {
      lines.push(`Public Function ${name}_F${p}(ByVal a As Long) As Long`);
      for (let l = 0; l < 25; l++)
        lines.push(
          l % 7 === 0
            ? `    If a > ${l} Then a = a - 1`
            : l % 11 === 0
              ? `    sql = "SELECT * FROM APP.T${l} WHERE ID = " & a`
              : `    a = a + ${l}`,
        );
      lines.push(`    ${name}_F${p} = a`, 'End Function');
    }
    return new TextEncoder().encode(lines.join('\r\n') + '\r\n');
  };
  const files: { relativePath: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < programs; i++) {
    const members: string[] = [];
    for (let m = 0; m < 6; m++) {
      const name = `P${i}M${m}`;
      files.push({ relativePath: `p${i}/${name}.BAS`, bytes: module(name) });
      members.push(`Module=${name}; ${name}.BAS`);
    }
    files.push({
      relativePath: `p${i}/P${i}.VBP`,
      bytes: new TextEncoder().encode(
        ['Type=Exe', ...members, `Name="P${i}"`].join('\r\n'),
      ),
    });
  }
  const entries = files.map(
    (file) =>
      createManifestEntry({
        relativePath: file.relativePath,
        role: file.relativePath.endsWith('.VBP') ? 'project' : 'code',
        bytes: file.bytes,
        profileEncoding: 'cp932',
      }).entry,
  );
  const manifest: SnapshotManifest = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId: randomUUID(),
    profileId: 'vb6-cp932-v1',
    decoderVersion: SOURCE_DECODER_VERSION,
    normalizationVersion: SOURCE_NORMALIZATION_VERSION,
    snapshotHash: 'b'.repeat(64),
    fileCount: entries.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes.byteLength, 0),
    entries,
    skipped: [],
  };
  const config = analyzeRunConfig(
    'vb6-cp932-v1',
    { defaultSchema: 'APP', status: 'assumed' },
    succeededRunFixture.config.limits,
  );
  if (!config) throw new Error('profile missing');
  const run: Run = { ...succeededRunFixture, config };
  return { run, manifest, files };
}

describe('worker inventory builder (B08)', { timeout: 60_000 }, () => {
  it('returns the same bytes as the in-process library', async () => {
    const input = corpus(3);
    const result = await createWorkerInventoryBuilder().build(
      input,
      new AbortController().signal,
    );
    const local = prepareRunInventory(input);
    if (result.status !== 'prepared' || local.status !== 'prepared')
      throw new Error('not prepared');
    expect(Buffer.from(result.bytes).equals(Buffer.from(local.bytes))).toBe(
      true,
    );
  });

  it('keeps the API thread responsive while a large corpus is analyzed', async () => {
    const input = corpus(60);
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    const started = performance.now();
    const result = await createWorkerInventoryBuilder().build(
      input,
      new AbortController().signal,
    );
    const elapsed = performance.now() - started;
    histogram.disable();
    expect(result.status).toBe('prepared');
    // The build itself takes on the order of a second; the event loop never
    // waits for it (only for copying the input and the transferred result).
    expect(histogram.max / 1e6).toBeLessThan(Math.max(300, elapsed / 3));
  });

  it('stops promptly when aborted in the middle of a build', async () => {
    const controller = new AbortController();
    const pending = createWorkerInventoryBuilder().build(
      corpus(120),
      controller.signal,
    );
    setTimeout(() => controller.abort(), 100);
    const started = performance.now();
    expect(await pending).toEqual({ status: 'stopped' });
    expect(performance.now() - started).toBeLessThan(2000);
    controller.abort();
  });

  it('does not start a worker for an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await createWorkerInventoryBuilder().build(corpus(1), controller.signal),
    ).toEqual({ status: 'stopped' });
  });

  it('answers failures of the analysis without publishing', async () => {
    const input = corpus(1);
    const result = await createWorkerInventoryBuilder().build(
      { ...input, manifest: { ...input.manifest, profileId: 'other' } },
      new AbortController().signal,
    );
    expect(result).toEqual({
      status: 'failed',
      errorCode: 'ANALYSIS_OUTPUT_INVALID',
    });
  });
});
