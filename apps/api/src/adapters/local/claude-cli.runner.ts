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

// Claude Code in print mode. The CLI gets only the read tools (no Bash, no
// Write/Edit, no web), no settings files, no MCP servers, no slash commands
// and no saved session. It reads files of its working directory and answers;
// the Portal writes the output. Output is stream-json.

// Tools a session may have. Verified with Claude Code 2.1.x: the init event
// reports exactly these tools and mcp_servers=[] with the argv below.
export const CLAUDE_READ_TOOLS = ['Read', 'Glob', 'Grep'] as const;

// Locked argv.
export function claudeCliArgs(
  model: string | undefined,
  effort?: string,
): string[] {
  return [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    // Text deltas as they are generated (stream_event), for live progress.
    '--include-partial-messages',
    // 'default' = the model configured for the CLI.
    ...(model && model !== 'default' ? ['--model', model] : []),
    ...(effort ? ['--effort', effort] : []),
    '--tools',
    CLAUDE_READ_TOOLS.join(','),
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk',
  ];
}

export const claudeDialect: CliDialect = {
  args: (model, effort) => claudeCliArgs(model ?? 'sonnet', effort),
  createParser(emit) {
    let result: CliOutcome | undefined;
    return {
      line(line) {
        const event = parseJsonObject(line);
        if (!event) return 'invalid';
        if (event.type === 'system' && event.subtype === 'init') {
          const tools = Array.isArray(event.tools)
            ? event.tools.map(String)
            : null;
          const mcp = Array.isArray(event.mcp_servers)
            ? event.mcp_servers.length
            : -1;
          emit({
            kind: 'system',
            text: `init model=${String(event.model)} tools=${tools?.join(',') ?? '?'} mcp=${mcp}`,
          });
          // AI-03: stop at once if the CLI did not honour the lockdown.
          const allowed: readonly string[] = CLAUDE_READ_TOOLS;
          return !tools ||
            tools.some((tool) => !allowed.includes(tool)) ||
            mcp !== 0
            ? 'lockdown'
            : undefined;
        }
        if (event.type === 'stream_event') {
          const inner = (event.event ?? {}) as {
            type?: unknown;
            delta?: { type?: unknown; text?: unknown };
          };
          // A new message or content block starts on its own line: text
          // blocks are not separated by newlines in the stream.
          if (
            inner.type === 'message_start' ||
            inner.type === 'content_block_start'
          )
            emit({ kind: 'delta', text: '\n' });
          if (
            inner.type === 'content_block_delta' &&
            inner.delta?.type === 'text_delta' &&
            typeof inner.delta.text === 'string'
          )
            emit({ kind: 'delta', text: inner.delta.text });
          return undefined;
        }
        if (event.type === 'assistant') {
          const message = event.message as { content?: unknown } | undefined;
          if (Array.isArray(message?.content))
            for (const part of message.content as unknown[]) {
              const block = part as {
                type?: unknown;
                text?: unknown;
                name?: unknown;
                input?: unknown;
              };
              if (block.type === 'text' && typeof block.text === 'string')
                emitText(emit, block.text);
              if (block.type === 'tool_use') {
                const name = typeof block.name === 'string' ? block.name : '';
                const input = (block.input ?? {}) as Record<string, unknown>;
                const target = [input.file_path, input.pattern, input.path]
                  .filter((value) => typeof value === 'string')
                  .join(' ');
                // What the agent read: shown for review.
                emit({
                  kind: 'system',
                  text: clip(`${name} ${target}`.trim()),
                });
                // Defence in depth: only the read tools may be called.
                const allowed: readonly string[] = CLAUDE_READ_TOOLS;
                if (!allowed.includes(name)) return 'lockdown';
              }
            }
          return undefined;
        }
        if (event.type === 'result') {
          const usage = (event.usage ?? {}) as Record<string, unknown>;
          result = {
            isError: event.is_error === true || event.subtype !== 'success',
            text: typeof event.result === 'string' ? event.result : '',
            usage: {
              inputTokens:
                count(usage.input_tokens) +
                count(usage.cache_creation_input_tokens) +
                count(usage.cache_read_input_tokens),
              outputTokens: count(usage.output_tokens),
            },
          };
        }
        return undefined;
      },
      result: () => result,
    };
  },
};

export function createClaudeCliRunner(options: CliRunnerOptions): AgentRunner {
  return createCliAgentRunner({ ...options, dialect: claudeDialect });
}
