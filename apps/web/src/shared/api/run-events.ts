import {
  LOCAL_CREDENTIAL_SCHEME,
  RUN_EVENT_NAME,
  RunEventSchema,
  type RunEvent,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { ApiError } from './api-error';
import { defaultFetcher } from './api-client';
import type { CredentialSource } from './local-session';

// Run event stream (F05): GET .../runs/:runId/events read with fetch, so the
// credential goes in the Authorization header (EventSource cannot send it).
// Resolves when the server ends the stream (terminal run, shutdown), rejects
// when it cannot open or breaks. Events that do not match the contract are
// dropped. Never retries: the caller falls back to GET and reconnects.

// Longest an event may take, heartbeats included (server: every 15 s).
export const RUN_EVENT_IDLE_TIMEOUT_MS = 40_000;

export function createRunEventStream(
  credentials: CredentialSource,
  fetcher: typeof fetch = defaultFetcher,
) {
  return async function stream(
    projectId: string,
    runId: string,
    signal: AbortSignal,
    onEvent: (event: RunEvent) => void,
  ): Promise<void> {
    const token =
      credentials.current() ?? (await credentials.credential(signal));
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(abort, RUN_EVENT_IDLE_TIMEOUT_MS);
    };
    try {
      arm();
      const response = await fetcher(
        `/api/v1/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/events`,
        {
          signal: controller.signal,
          headers: {
            Accept: 'text/event-stream',
            Authorization: `${LOCAL_CREDENTIAL_SCHEME} ${token}`,
          },
        },
      );
      if (!response.ok || !response.body) {
        if (response.status === 401) credentials.invalidate(token);
        throw new ApiError('http', 'GET', response.status);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        arm();
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = parseBlock(block);
          if (event) onEvent(event);
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ApiError) throw error;
      throw new ApiError('network', 'GET');
    } finally {
      clearTimeout(idle);
      signal.removeEventListener('abort', abort);
    }
  };
}

function parseBlock(block: string): RunEvent | null {
  let name = 'message';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (name !== RUN_EVENT_NAME || data.length === 0) return null;
  try {
    const value: unknown = JSON.parse(data.join('\n'));
    return Check(RunEventSchema, value) ? value : null;
  } catch {
    return null;
  }
}
