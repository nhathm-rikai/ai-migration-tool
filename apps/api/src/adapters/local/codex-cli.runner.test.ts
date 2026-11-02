import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../ports/agent-runner.js';
import { codexCliArgs, createCodexCliRunner } from './codex-cli.runner.js';

// Codex dialect over the shared CLI runner, against a Node script that
// prints `codex exec --json` events.

const FAKE_CLI = fileURLToPath(
  new URL('../../testing/fake-agent-cli.ts', import.meta.url),
);

describe('codex CLI runner', { timeout: 20_000 }, () => {
  let workdir: string;
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'portal-codex-'));
  });
  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  function run(scenario: string, signal = new AbortController().signal) {
    const events: AgentEvent[] = [];
    const result = createCodexCliRunner({
      executable: process.execPath,
      prefixArgs: [FAKE_CLI],
      workingDirectory: workdir,
      env: { ...process.env, FAKE_AGENT_SCENARIO: scenario },
      stopDeadlineMs: 5000,
      maxLineBytes: 64 * 1024,
    }).run({
      runId: 'r1',
      prompt: 'Viết tài liệu',
      signal,
      model: 'default',
      maxOutputBytes: 10_000,
      onEvent: (event) => events.push(event),
    });
    return { result, events };
  }

  it('locks Codex down: read-only sandbox, tool features, web and MCP off', () => {
    const args = codexCliArgs('default');
    expect(args.slice(0, 2)).toEqual(['exec', '--json']);
    expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only');
    // Codex reads files through the shell, which needs the code-mode host.
    expect(args).not.toContain('code_mode_host');
    // The shell stays: it is how Codex reads files; the sandbox denies writes.
    expect(args).not.toContain('shell_tool');
    expect(args).toEqual(
      expect.arrayContaining([
        'web_search="disabled"',
        'mcp_servers={}',
        '--ephemeral',
      ]),
    );
    expect(args).not.toContain('-m');
    expect(args.at(-1)).toBe('-');
    expect(args).not.toContain('danger-full-access');
    expect(codexCliArgs('default', 'medium')).toEqual(
      expect.arrayContaining(['-c', 'model_reasoning_effort="medium"']),
    );
    expect(codexCliArgs('gpt-x')).toEqual(
      expect.arrayContaining(['-m', 'gpt-x']),
    );
  });

  it('returns the last agent message and usage', async () => {
    const { result, events } = run('success');
    expect(await result).toEqual({
      status: 'completed',
      rawOutput: `# Tài liệu\n\nprompt bytes: ${Buffer.byteLength('Viết tài liệu')}`,
      usage: { inputTokens: 20, outputTokens: 9 },
    });
    expect(events).toContainEqual({
      kind: 'system',
      text: 'Code Mode is unavailable',
    });
    expect(events).toContainEqual({ kind: 'text', text: '# Tài liệu' });
  });

  it('stops at once on a file change or any non-shell tool item', async () => {
    const { result, events } = run('tools');
    expect(await result).toEqual({ status: 'failed', code: 'RUNNER_FAILED' });
    expect(events).toContainEqual({
      kind: 'system',
      text: 'tool item: file_change',
    });
  });

  it('classifies a failed turn', async () => {
    expect(await run('auth').result).toMatchObject({
      status: 'failed',
      code: 'AGENT_AUTH_FAILED',
    });
  });

  it('cancel stops the whole process tree', async () => {
    const controller = new AbortController();
    const { result, events } = run('tree', controller.signal);
    await expect
      .poll(() => events.some((event) => event.kind === 'text'))
      .toBe(true);
    controller.abort();
    expect(await result).toEqual({ status: 'cancelled' });
  });
});
