import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../ports/agent-runner.js';
import { isProcessGone } from '../../platform/process-tree.js';
import { claudeCliArgs, createClaudeCliRunner } from './claude-cli.runner.js';
import {
  classifyAgentFailure,
  createLineSplitter,
} from './cli-agent.runner.js';

// Process behaviour of the agent CLI adapter (JOB-04/07/08) against a Node
// script that prints stream-json. Runs on the host OS: the kill path is
// taskkill /T on Windows and a process group on POSIX.

const FAKE_CLI = fileURLToPath(
  new URL('../../testing/fake-agent-cli.ts', import.meta.url),
);

describe('claude CLI runner', { timeout: 20_000 }, () => {
  let workdir: string;
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'portal-agent-'));
  });
  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  function runner(scenario: string) {
    return createClaudeCliRunner({
      executable: process.execPath,
      prefixArgs: [FAKE_CLI],
      workingDirectory: workdir,
      env: { ...process.env, FAKE_AGENT_SCENARIO: scenario },
      stopDeadlineMs: 5000,
      maxLineBytes: 64 * 1024,
    });
  }

  function run(scenario: string, signal = new AbortController().signal) {
    const events: AgentEvent[] = [];
    const processes: string[] = [];
    const result = runner(scenario).run({
      runId: 'r1',
      prompt: 'Viết tài liệu',
      signal,
      model: 'haiku',
      maxOutputBytes: 10_000,
      onEvent: (event) => events.push(event),
      onProcess: (event) => processes.push(event.kind),
    });
    return { result, events, processes };
  }

  it('locks the CLI down: print mode, no tools, settings, MCP or session', () => {
    const args = claudeCliArgs('opus');
    expect(args).toEqual(
      expect.arrayContaining([
        '--print',
        '--strict-mcp-config',
        '--include-partial-messages',
      ]),
    );
    expect(args[args.indexOf('--tools') + 1]).toBe('Read,Glob,Grep');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
    expect(args[args.indexOf('--model') + 1]).toBe('opus');
    expect(claudeCliArgs('opus', 'medium')).toEqual(
      expect.arrayContaining(['--effort', 'medium']),
    );
    expect(args).not.toContain('--effort');
    expect(args).not.toContain('bypassPermissions');
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  it('returns the final text and usage; the prompt goes through stdin', async () => {
    const { result, events, processes } = run('success');
    expect(await result).toEqual({
      status: 'completed',
      rawOutput: `# Tài liệu\n\nprompt bytes: ${Buffer.byteLength('Viết tài liệu')}`,
      usage: { inputTokens: 15, outputTokens: 7 },
    });
    expect(events[0]).toEqual({
      kind: 'system',
      text: 'init model=fake tools=Read,Glob,Grep mcp=0',
    });
    expect(events).toContainEqual({ kind: 'text', text: '# Tài liệu' });
    // Deltas keep block boundaries as newlines, so markers stay on their own line.
    const streamed = events
      .filter((event) => event.kind === 'delta')
      .map((event) => event.text)
      .join('');
    expect(streamed).toContain('Reading done.\n=== FILE: a.md ===\n');
    expect(events).toContainEqual({
      kind: 'system',
      text: 'Read source/ORDER.BAS',
    });
    expect(processes).toEqual(['started', 'exited']);
  });

  it('classifies an auth error result', async () => {
    expect(await run('auth').result).toMatchObject({
      status: 'failed',
      code: 'AGENT_AUTH_FAILED',
    });
  });

  it('fails a non-zero exit and keeps stderr in the log', async () => {
    const { result, events } = run('crash');
    expect(await result).toMatchObject({
      status: 'failed',
      code: 'RUNNER_FAILED',
    });
    expect(events).toContainEqual({
      kind: 'stderr',
      text: 'fatal: something broke',
    });
  });

  it('fails an empty answer as invalid output (exit 0 is not enough)', async () => {
    expect(await run('invalid').result).toMatchObject({
      status: 'failed',
      code: 'AGENT_OUTPUT_INVALID',
    });
  });

  it('stops at once when the CLI reports tools despite the lockdown', async () => {
    const { result, events } = run('tools');
    expect(events).toBeDefined();
    expect(await result).toEqual({
      status: 'failed',
      code: 'RUNNER_FAILED',
    });
  });

  it('stops at once when the agent calls a tool other than the read tools', async () => {
    expect(await run('bash-call').result).toEqual({
      status: 'failed',
      code: 'RUNNER_FAILED',
    });
  });

  it('cancel stops the whole process tree and confirms it', async () => {
    const controller = new AbortController();
    const { result, events, processes } = run('tree', controller.signal);
    await expect
      .poll(() => events.some((event) => event.kind === 'text'))
      .toBe(true);
    controller.abort();
    expect(await result).toEqual({ status: 'cancelled' });
    expect(processes).toEqual(['started', 'exited']);
  });

  it('reports a missing executable as unavailable', async () => {
    const missing = createClaudeCliRunner({
      executable: join(workdir, 'no-such-cli.exe'),
      workingDirectory: workdir,
      stopDeadlineMs: 1000,
      maxLineBytes: 1024,
    });
    expect(
      await missing.run({
        runId: 'r',
        prompt: 'x',
        signal: new AbortController().signal,
      }),
    ).toEqual({ status: 'failed', code: 'AGENT_UNAVAILABLE' });
  });
});

describe('line splitter', () => {
  it('joins a UTF-8 character and a line cut across chunks', () => {
    const lines: string[] = [];
    const split = createLineSplitter(100, (line) => lines.push(line));
    const bytes = Buffer.from('{"a":"tài"}\r\n{"b":1}\n');
    split.push(bytes.subarray(0, 8));
    split.push(bytes.subarray(8, 15));
    split.push(bytes.subarray(15));
    expect(split.end()).toBe(true);
    expect(lines).toEqual(['{"a":"tài"}', '{"b":1}']);
  });

  it('refuses a line over the limit', () => {
    const split = createLineSplitter(4, () => {});
    expect(split.push(Buffer.from('12345\n'))).toBe(false);
  });
});

describe('failure classification', () => {
  it.each([
    ['Failed to authenticate: OAuth session expired', 'AGENT_AUTH_FAILED'],
    ['Please run /login', 'AGENT_AUTH_FAILED'],
    ['API Error: 429 rate_limit_error', 'AGENT_QUOTA_EXCEEDED'],
    ['Claude usage limit reached', 'AGENT_QUOTA_EXCEEDED'],
    ['socket hang up', 'RUNNER_FAILED'],
  ])('%s -> %s', (text, code) => {
    expect(classifyAgentFailure(text)).toBe(code);
  });
});

describe('process ledger check', () => {
  it('sees its own process alive', () => {
    expect(isProcessGone(process.pid)).toBe(false);
  });
});
