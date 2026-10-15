import { setTimeout } from 'node:timers/promises';
import type { AgentRunner } from '../../ports/agent-runner.js';

export function createFakeAgentRunner(
  options: {
    scenario?: 'success' | 'failure' | 'invalid-output';
    delayMs?: number;
  } = {},
): AgentRunner {
  const delayMs = options.delayMs ?? 0;
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60_000) {
    throw new Error(
      'Fake delay must be an integer from 0 to 60000 milliseconds.',
    );
  }
  return {
    async run(request) {
      if (request.signal.aborted) return { status: 'cancelled' };
      try {
        await setTimeout(delayMs, undefined, { signal: request.signal });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError')
          return { status: 'cancelled' };
        throw error;
      }
      if (request.signal.aborted) return { status: 'cancelled' };
      if (options.scenario === 'failure')
        return { status: 'failed', code: 'RUNNER_FAILED' };
      return {
        status: 'completed',
        rawOutput:
          options.scenario === 'invalid-output'
            ? '{broken-json'
            : JSON.stringify({ demo: true, runId: request.runId }),
      };
    },
  };
}
