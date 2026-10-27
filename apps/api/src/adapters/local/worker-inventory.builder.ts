import { Worker } from 'node:worker_threads';
import type {
  InventoryBuildResult,
  InventoryBuilder,
} from '../../ports/inventory-builder.js';

// Runs each inventory build in its own worker thread. Abort terminates the
// thread (the build is pure: nothing to clean up) and settles `stopped`; a
// crash of the thread rejects, which the dispatcher records INTERNAL_ERROR.
// From TypeScript sources (tests) the worker loads through tsx; the compiled
// build loads the sibling `.js` file.

const fromSource = import.meta.url.endsWith('.ts');
const entry = new URL(
  fromSource ? './inventory.worker.ts' : './inventory.worker.js',
  import.meta.url,
);

export function createWorkerInventoryBuilder(): InventoryBuilder {
  return {
    build(input, signal) {
      if (signal.aborted) return Promise.resolve({ status: 'stopped' });
      return new Promise<InventoryBuildResult>((resolve, reject) => {
        const worker = new Worker(entry, {
          ...(fromSource ? { execArgv: ['--import', 'tsx'] } : {}),
        });
        let settled = false;
        let stopping = false;
        const settle = (finish: () => void) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          finish();
        };
        // Settled once the thread is gone, so a stopped build never runs on.
        const onAbort = () => {
          stopping = true;
          void worker.terminate();
        };
        signal.addEventListener('abort', onAbort, { once: true });
        worker.once('message', (result: InventoryBuildResult) => {
          settle(() => resolve(result));
          void worker.terminate();
        });
        worker.once('error', (error: Error) => settle(() => reject(error)));
        worker.once('exit', (code) =>
          settle(() =>
            stopping
              ? resolve({ status: 'stopped' })
              : reject(new Error(`Inventory worker exited with code ${code}.`)),
          ),
        );
        worker.postMessage(input);
      });
    },
  };
}
