import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ANALYZE_API_OPERATIONS,
  RUN_EVENT_NAME,
  TERMINAL_RUN_STATUSES,
  type RunEvent,
  type RunStatus,
} from '@portal/contracts';
import { AppError } from '../../shared/app-error.js';
import type { JobService } from './job.service.js';
import type { RunEventHub } from './run-events.js';

// SSE stream of one run (B09). Credential and Host/Origin are checked before
// this handler (local-security onRequest), so the client sends the token in
// the Authorization header of a fetch stream, never in the URL. The first
// event is the committed state now; later events follow commits. The stream
// ends after a terminal state, on client disconnect (the run goes on) and
// on shutdown. GET run stays authoritative.

export const HEARTBEAT_MS = 15_000;
const TERMINAL: readonly RunStatus[] = TERMINAL_RUN_STATUSES;

export function registerRunEventRoutes(
  instance: FastifyInstance,
  service: JobService,
  hub: RunEventHub,
): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const op = ANALYZE_API_OPERATIONS.streamRunEvents;
  app.get(
    op.path,
    { schema: { params: op.params, querystring: op.querystring } },
    (request, reply) => {
      const run = service.get(request.params.projectId, request.params.runId);
      const raw = reply.raw;
      let open = true;
      let heartbeat: NodeJS.Timeout | undefined = undefined;
      const finish = () => {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe?.();
        raw.end();
      };
      const send = (event: RunEvent) => {
        if (!open) return;
        raw.write(
          `event: ${RUN_EVENT_NAME}\nid: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`,
        );
        if (TERMINAL.includes(event.status)) finish();
      };
      // Subscribed before the first event, so no commit falls in between;
      // hub events arrive on a later tick, after the headers below.
      const unsubscribe = hub.subscribe(run.id, { event: send, end: finish });
      if (!unsubscribe) throw new AppError('RUN_EVENTS_LIMIT');
      reply.hijack();
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      });
      raw.on('close', finish);
      heartbeat = setInterval(() => {
        if (open) raw.write(': keep-alive\n\n');
      }, HEARTBEAT_MS);
      send(hub.snapshot(run));
    },
  );
}
