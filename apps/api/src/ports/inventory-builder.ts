import type {
  PreparedRunInventory,
  RunInventoryInput,
} from '../modules/analysis/run-inventory.js';

// Builds, validates and serializes the inventory of one run (B08) off the
// API thread: a large corpus takes seconds of CPU, during which HTTP
// requests (cancel, polling) would otherwise wait. Aborting the signal stops
// the work and settles `stopped`.
export type InventoryBuildResult = PreparedRunInventory | { status: 'stopped' };

export interface InventoryBuilder {
  build(
    input: RunInventoryInput,
    signal: AbortSignal,
  ): Promise<InventoryBuildResult>;
}
