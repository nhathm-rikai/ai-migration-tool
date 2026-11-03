import { parentPort } from 'node:worker_threads';
import {
  prepareRunInventory,
  type RunInventoryInput,
} from '../../modules/analysis/run-inventory.js';
import type { InventoryWorkerMessage } from './worker-inventory.builder.js';

// Worker thread entry of the inventory builder: one request, one answer,
// then the thread ends. Progress (files analyzed, the latest paths) goes out
// at most every PROGRESS_POST_MS; the serialized bytes are transferred, not
// copied.
if (!parentPort) throw new Error('Inventory worker must run in a worker.');
const port = parentPort;
const PROGRESS_POST_MS = 100;
const RECENT = 6;
port.once('message', (input: RunInventoryInput) => {
  let analyzed = 0;
  let recent: string[] = [];
  let last = 0;
  const post = (message: InventoryWorkerMessage) => port.postMessage(message);
  const result = prepareRunInventory(input, (relativePath) => {
    analyzed++;
    recent = [...recent, relativePath].slice(-RECENT);
    const now = Date.now();
    if (now - last < PROGRESS_POST_MS) return;
    last = now;
    post({ kind: 'progress', analyzed, recentPaths: recent });
  });
  post({ kind: 'progress', analyzed, recentPaths: recent });
  if (result.status === 'prepared')
    port.postMessage(
      { kind: 'result', result } satisfies InventoryWorkerMessage,
      [result.bytes.buffer as ArrayBuffer],
    );
  else post({ kind: 'result', result });
});
