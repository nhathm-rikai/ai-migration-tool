import {
  get,
  type ClientRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import Fastify from 'fastify';
import { runningRunFixture } from '@portal/contracts/fixtures';
import { expect, it, vi } from 'vitest';
import { createRunEventHub, type RunEventListener } from './run-events.js';
import { registerRunEventRoutes } from './run-events.routes.js';

it('B09-AC02 disconnects a paused socket instead of buffering unlimited progress', async () => {
  const app = Fastify();
  let raw: ServerResponse | undefined;
  let listener: RunEventListener | undefined;
  let client: ClientRequest | undefined;
  let response: IncomingMessage | undefined;
  const unsubscribe = vi.fn();
  const hub = createRunEventHub({
    read: () => runningRunFixture,
    now: () => new Date(),
  });
  app.addHook('onRequest', (_request, reply, done) => {
    raw = reply.raw;
    done();
  });
  registerRunEventRoutes(
    app,
    { get: () => runningRunFixture },
    {
      ...hub,
      subscribe(_id, next) {
        listener = next;
        return unsubscribe;
      },
    },
  );
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    response = await new Promise<IncomingMessage>((resolve, reject) => {
      client = get(
        `${address}/api/v1/projects/${runningRunFixture.projectId}/runs/${runningRunFixture.id}/events`,
        resolve,
      );
      client.on('error', reject);
    });
    response.pause();
    response.on('error', () => undefined);
    expect(listener).toBeDefined();
    for (let sequence = 2; sequence <= 2501; sequence++) {
      listener?.event({
        ...hub.snapshot(runningRunFixture),
        sequence,
        progress: {
          phase: 'snapshot',
          filesSnapshotted: sequence,
          filesAnalyzed: 0,
          filesTotal: 3000,
          bytesDone: sequence,
          bytesTotal: 3000,
          recentPaths: Array.from(
            { length: 6 },
            (_, i) => `${'a'.repeat(900)}/${i}.bas`,
          ),
        },
      });
    }
    expect(raw?.writableLength).toBeLessThan(128 * 1024);
    expect(raw?.destroyed).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  } finally {
    client?.destroy();
    response?.destroy();
    hub.close();
    await app.close();
  }
}, 20_000);
