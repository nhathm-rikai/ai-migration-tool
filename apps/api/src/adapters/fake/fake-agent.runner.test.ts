import { describe, expect, it } from 'vitest';
import { createFakeAgentRunner } from './fake-agent.runner.js';

describe('fake agent runner (no network or process)', () => {
  it('returns marked demo output without echoing the prompt', async () => {
    const result = await createFakeAgentRunner().run({
      runId: 'run-1',
      prompt: 'private input',
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: 'completed',
      rawOutput: '{"demo":true,"runId":"run-1"}',
    });
  });
  it('can simulate a transport failure', async () => {
    expect(
      await createFakeAgentRunner({ scenario: 'failure' }).run({
        runId: 'run-1',
        prompt: '',
        signal: new AbortController().signal,
      }),
    ).toEqual({ status: 'failed', code: 'RUNNER_FAILED' });
  });
  it('leaves invalid output to the future analysis validator', async () => {
    const result = await createFakeAgentRunner({
      scenario: 'invalid-output',
    }).run({
      runId: 'run-1',
      prompt: '',
      signal: new AbortController().signal,
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('Unexpected result');
    expect(() => {
      JSON.parse(result.rawOutput);
    }).toThrow();
  });
  it('honors cancellation before starting', async () => {
    expect(
      await createFakeAgentRunner().run({
        runId: 'run-1',
        prompt: '',
        signal: AbortSignal.abort(),
      }),
    ).toEqual({ status: 'cancelled' });
  });
  it('cancels during a delay without waiting for it to finish', async () => {
    const controller = new AbortController();
    const result = createFakeAgentRunner({ delayMs: 60_000 }).run({
      runId: 'run-1',
      prompt: '',
      signal: controller.signal,
    });
    controller.abort();
    expect(await result).toEqual({ status: 'cancelled' });
  });
  it('does not complete before its configured delay', async () => {
    // timers/promises uses native timers; a short real delay tests the public behavior.
    const start = performance.now();
    await createFakeAgentRunner({ delayMs: 30 }).run({
      runId: 'run-1',
      prompt: '',
      signal: new AbortController().signal,
    });
    expect(performance.now() - start).toBeGreaterThanOrEqual(20);
  });
});
