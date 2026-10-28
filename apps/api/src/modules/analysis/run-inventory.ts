import type { Run, SourceInventoryDocument } from '@portal/contracts';
import type { ExecutorErrorCode } from '../../ports/run-executor.js';
import type {
  SkippedEntry,
  SnapshotFile,
  SnapshotManifest,
} from '../../ports/workspace-provider.js';
import {
  prepareInventory,
  type PreparedInventory,
} from '../artifacts/artifact.service.js';
import { analyzeRunConfig } from '../jobs/analyze-run-config.js';
import { computeSnapshotHash } from './source-manifest.js';
import { buildSourceInventory } from './source-inventory.js';
import { findSourceProfile } from './source-profiles.js';
import { createTableNameMapping } from './table-names.js';

// Inventory of one analyze run (B08): the snapshot's raw bytes go through the
// same library the `analyze-source` command uses, with the profile and table
// name mapping the run locked at admission. Pure and synchronous, so it runs
// in the inventory worker (seconds of CPU on a large corpus); reading the
// bytes and publishing the result belong to the executor.

type Skipped = NonNullable<SourceInventoryDocument['skipped']>[number];

export type RunInventoryOutcome =
  | {
      status: 'built';
      inventory: SourceInventoryDocument;
      // What `inventory.snapshotHash` must be: the content hash of the
      // snapshot's entries (the snapshot hash also covers skipped files).
      contentHash: string;
    }
  | {
      status: 'failed';
      errorCode: Extract<
        ExecutorErrorCode,
        'SOURCE_PROFILE_UNSUPPORTED' | 'ANALYSIS_OUTPUT_INVALID'
      >;
    };

// Files seen in the source but not copied stay visible as coverage gaps.
// `excluded` files are not source of the profile (builds, logs, agent
// settings) and are left out, like the command line reader does.
function skippedForCoverage(entries: readonly SkippedEntry[]): Skipped[] {
  return entries.flatMap((entry): Skipped[] => {
    switch (entry.reason) {
      case 'link':
        return [{ relativePath: entry.relativePath, reason: 'symlink' }];
      case 'too-large':
      case 'unreadable':
      case 'special':
      case 'invalid-name':
        return [{ relativePath: entry.relativePath, reason: entry.reason }];
      case 'excluded':
        return [];
    }
  });
}

export function buildRunInventory(input: {
  run: Run;
  manifest: SnapshotManifest;
  files: readonly SnapshotFile[];
}): RunInventoryOutcome {
  const { config } = input.run;
  const profile = findSourceProfile(config.profileId);
  if (!profile)
    return { status: 'failed', errorCode: 'SOURCE_PROFILE_UNSUPPORTED' };
  // The run locked the analyzer versions at admission; a run queued under
  // another build would publish numbers its config does not describe.
  const current = analyzeRunConfig(
    config.profileId,
    config.tableNameMapping,
    config.limits,
  );
  const tableNames = createTableNameMapping(
    config.tableNameMapping.defaultSchema,
    config.tableNameMapping.status === 'confirmed',
  );
  if (
    !current ||
    !tableNames ||
    JSON.stringify(current.analyzer) !== JSON.stringify(config.analyzer) ||
    input.manifest.profileId !== profile.id
  )
    return { status: 'failed', errorCode: 'ANALYSIS_OUTPUT_INVALID' };
  const inventory = buildSourceInventory({
    profile,
    files: input.files,
    tableNames,
  });
  return {
    status: 'built',
    inventory: {
      ...inventory,
      skipped: skippedForCoverage(input.manifest.skipped),
    },
    contentHash: computeSnapshotHash(input.manifest.entries, profile.id),
  };
}

export type RunInventoryInput = Parameters<typeof buildRunInventory>[0];

export type PreparedRunInventory =
  PreparedInventory | Extract<RunInventoryOutcome, { status: 'failed' }>;

// Build, validate and serialize: everything that scales with the corpus, in
// one call the inventory worker runs off the API thread.
export function prepareRunInventory(
  input: RunInventoryInput,
): PreparedRunInventory {
  const built = buildRunInventory(input);
  if (built.status === 'failed') return built;
  const prepared = prepareInventory(built.inventory, built.contentHash);
  return prepared.status === 'prepared'
    ? prepared
    : { status: 'failed', errorCode: 'ANALYSIS_OUTPUT_INVALID' };
}
