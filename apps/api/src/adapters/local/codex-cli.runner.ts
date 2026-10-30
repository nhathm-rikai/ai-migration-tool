import type { AgentRunner } from '../../ports/agent-runner.js';
import {
  clip,
  count,
  createCliAgentRunner,
  emitText,
  parseJsonObject,
  type CliDialect,
  type CliOutcome,
  type CliRunnerOptions,
} from './cli-agent.runner.js';

// Codex CLI (`codex exec --json`), for development and tests only: the
// production agent is Claude Code. The agent reads files with its shell, so
// the lockdown is the read-only sandbox (no write anywhere, no network) plus
// every other tool feature disabled. Only shell commands and text items may
// appear; anything else stops the process at once (AI-03). Reads are not
// limited to the workspace: use only demo or clean fixture data.

// Verified with codex-cli 0.164.0 on Windows: in `read-only` the shell reads
// files, while writing into the workspace, next to it or into %TEMP% is
// denied and a web request fails. (`workspace-write` did NOT stop writes
// outside the workspace there.)
// `code_mode_host` stays on: in 0.164.0 the shell runs through it (with it
// off the agent could not read any file). Its JavaScript tool reaches the
// network, so a non-shell tool item (mcp_tool_call) stops the session.
const DISABLED_FEATURES = [
  'hooks',
  'plugins',
  'apps',
  'browser_use',
  'computer_use',
  'skill_search',
  'tool_suggest',
  'goals',
  'sleep_tool',
  'image_generation',
  'multi_agent',
] as const;

export function codexCliArgs(
  model: string | undefined,
  effort?: string,
): string[] {
  return [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--ephemeral',
    ...DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    // Values are TOML; argv goes to the process without a shell.
    '-c',
    'web_search="disabled"',
    '-c',
    'mcp_servers={}',
    // 'default' = the model configured for the CLI.
    ...(model && model !== 'default' ? ['-m', model] : []),
    ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []),
    // Prompt from stdin.
    '-',
  ];
}

// Items allowed in a session: text, and shell commands (reads; the sandbox
// denies writes). File changes, MCP/web/agent calls are not.
const TEXT_ITEMS = new Set([
  'agent_message',
  'reasoning',
  'todo_list',
  'error',
  'command_execution',
]);

export const codexDialect: CliDialect = {
  args: (model, effort) => codexCliArgs(model, effort),
  createParser(emit) {
    let message: string | undefined;
    let outcome: CliOutcome | undefined;
    return {
      line(line) {
        const event = parseJsonObject(line);
        if (!event || typeof event.type !== 'string') return 'invalid';
        if (event.type === 'item.started' || event.type === 'item.completed') {
          const item = (event.item ?? {}) as Record<string, unknown>;
          const type = typeof item.type === 'string' ? item.type : '';
          if (!TEXT_ITEMS.has(type)) {
            emit({ kind: 'system', text: `tool item: ${clip(type)}` });
            return 'lockdown';
          }
          if (event.type !== 'item.completed') return undefined;
          if (
            type === 'command_execution' &&
            typeof item.command === 'string'
          ) {
            // What the agent read: shown for review, never executed here.
            emit({ kind: 'system', text: clip(`$ ${item.command}`) });
          } else if (
            type === 'agent_message' &&
            typeof item.text === 'string'
          ) {
            // The last message is the answer.
            message = item.text;
            emit({ kind: 'delta', text: `${item.text}\n` });
            emitText(emit, item.text);
          } else if (type === 'error' && typeof item.message === 'string') {
            // Non-fatal notice, e.g. the disabled code-mode host.
            emit({ kind: 'system', text: clip(item.message) });
          }
          return undefined;
        }
        if (event.type === 'turn.completed') {
          // A reported error stays the outcome.
          if (outcome?.isError) return undefined;
          const usage = (event.usage ?? {}) as Record<string, unknown>;
          outcome = {
            isError: false,
            text: message ?? '',
            usage: {
              inputTokens: count(usage.input_tokens),
              outputTokens: count(usage.output_tokens),
            },
          };
          return undefined;
        }
        if (event.type === 'turn.failed' || event.type === 'error') {
          const error = (event.error ?? {}) as Record<string, unknown>;
          const text =
            typeof error.message === 'string'
              ? error.message
              : typeof event.message === 'string'
                ? event.message
                : 'agent error';
          emit({ kind: 'stderr', text: clip(text) });
          outcome = { isError: true, text, usage: outcome?.usage };
        }
        return undefined;
      },
      result: () => outcome,
    };
  },
};

export function createCodexCliRunner(options: CliRunnerOptions): AgentRunner {
  return createCliAgentRunner({ ...options, dialect: codexDialect });
}
