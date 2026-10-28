import { parentPort } from 'node:worker_threads';
import {
  prepareRunInventory,
  type RunInventoryInput,
} from '../../modules/analysis/run-inventory.js';

// Worker thread entry of the inventory builder: one request, one answer,
// then the thread ends. The serialized bytes are transferred, not copied.
if (!parentPort) throw new Error('Inventory worker must run in a worker.');
const port = parentPort;
port.once('message', (input: RunInventoryInput) => {
  const result = prepareRunInventory(input);
  if (result.status === 'prepared')
    port.postMessage(result, [result.bytes.buffer as ArrayBuffer]);
  else port.postMessage(result);
});
