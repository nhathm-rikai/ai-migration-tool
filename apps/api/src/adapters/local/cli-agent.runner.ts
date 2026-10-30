import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { AgentEffort, AgentModel } from '@portal/contracts';
import type {
  AgentEvent,
  AgentFailureCode,
  AgentResult,
  AgentRunner,
  AgentUsage,
} from '../../ports/agent-runner.js';
import {
  stopProcessTree,
  treeSpawnOptions,
} from '../../platform/process-tree.js';

// Runs an agent CLI as one non-interactive process per call (LIVE,
// JOB-04/07/08, AI-02/03): no shell, prompt on stdin, JSON events on stdout
// read line by line, the whole process tree stopped on cancel. What differs
// between CLIs (argv lockdown, event format) is a dialect.

export type CliOutcome = {
  isError: boolean;
  text: string;
  usage: AgentUsage | undefined;
};

// 'invalid' = not an event of this CLI; 'lockdown' = the CLI reports or
// attempts a tool the lockdown should have removed: stop at once.
export type LineVerdict = 'invalid' | 'lockdown' | undefined;

export interface CliDialect {
  args(
    model: AgentModel | undefined,
    effort: AgentEffort | undefined,
  ): string[];
  createParser(emit: (event: AgentEvent) => void): {
    line(line: string): LineVerdict;
    // The final answer once the CLI reported one.
    result(): CliOutcome | undefined;
  };
}

export type CliRunnerOptions = {
  executable: string;
  // Extra argv before the dialect's argv (tests run a script through node).
  prefixArgs?: string[];
  workingDirectory: string;
  env?: NodeJS.ProcessEnv;
  // How long a stop may take before it counts as unconfirmed.
  stopDeadlineMs: number;
  // Longest stdout line (one JSON event) accepted.
  maxLineBytes: number;
  platform?: NodeJS.Platform;
};

const MAX_EVENT_TEXT = 2000;
const MAX_STDERR_LINES = 50;

const AUTH_PATTERN =
  /authenticat|log ?in|oauth|api key|unauthori[sz]ed|\b401\b|credential/i;
const QUOTA_PATTERN =
  /rate.?limit|quota|usage limit|credit balance|\b429\b|overloaded|limit reached/i;

export function classifyAgentFailure(text: string): AgentFailureCode {
  if (QUOTA_PATTERN.test(text)) return 'AGENT_QUOTA_EXCEEDED';
  if (AUTH_PATTERN.test(text)) return 'AGENT_AUTH_FAILED';
  return 'RUNNER_FAILED';
}

// Terminal colour codes some CLIs print on stderr.
// eslint-disable-next-line no-control-regex -- matching ESC is the point
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export function clip(raw: string): string {
  const text = raw.replace(ANSI, '');
  return text.length > MAX_EVENT_TEXT
    ? `${text.slice(0, MAX_EVENT_TEXT - 1)}…`
    : text;
}

// Shown text of an answer: one event per non-empty line.
export function emitText(emit: (event: AgentEvent) => void, text: string) {
  for (const line of text.split('\n'))
    if (line.trim()) emit({ kind: 'text', text: clip(line) });
}

export function parseJsonObject(
  line: string,
): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

// Splits a byte stream into complete UTF-8 lines; a chunk may end inside a
// character or a line. Returns false once a line exceeds the limit.
export function createLineSplitter(
  maxLineBytes: number,
  onLine: (line: string) => void,
) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let overflow = false;
  const take = (text: string) => {
    if (overflow) return;
    pending += text;
    let index = pending.indexOf('\n');
    while (index !== -1) {
      const line = pending.slice(0, index).replace(/\r$/, '');
      pending = pending.slice(index + 1);
      if (Buffer.byteLength(line) > maxLineBytes) {
        overflow = true;
        return;
      }
      if (line.trim()) onLine(line);
      index = pending.indexOf('\n');
    }
    if (Buffer.byteLength(pending) > maxLineBytes) overflow = true;
  };
  return {
    push(chunk: Buffer): boolean {
      take(decoder.write(chunk));
      return !overflow;
    },
    end(): boolean {
      take(decoder.end());
      if (!overflow && pending.trim()) {
        onLine(pending);
        pending = '';
      }
      return !overflow;
    },
  };
}

export function createCliAgentRunner(
  options: CliRunnerOptions & { dialect: CliDialect },
): AgentRunner {
  const platform = options.platform ?? process.platform;
  const { dialect } = options;
  return {
    run(request) {
      return new Promise<AgentResult>((resolve) => {
        if (request.signal.aborted) {
          resolve({ status: 'cancelled' });
          return;
        }
        const emit = (event: AgentEvent) => request.onEvent?.(event);
        const parser = dialect.createParser(emit);
        const child = spawn(
          options.executable,
          [
            ...(options.prefixArgs ?? []),
            ...dialect.args(request.model, request.effort),
          ],
          {
            cwd: request.workingDirectory ?? options.workingDirectory,
            env: options.env ?? process.env,
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            ...treeSpawnOptions(platform),
          },
        );
        let settled = false;
        let stopping = false;
        let invalid = false;
        let lockdownBroken = false;
        let spawnFailed = false;
        const stderrLines: string[] = [];
        const finish = (value: AgentResult) => {
          if (settled) return;
          settled = true;
          request.signal.removeEventListener('abort', onAbort);
          resolve(value);
        };
        let markClosed: () => void = () => {};
        const closed = new Promise<void>((done) => {
          markClosed = done;
        });
        const stdout = createLineSplitter(options.maxLineBytes, (line) => {
          const verdict = parser.line(line);
          if (verdict === 'invalid') invalid = true;
          else if (verdict === 'lockdown') {
            lockdownBroken = true;
            emit({ kind: 'system', text: 'lockdown broken: stopping agent' });
            stop(false);
          }
        });
        const stderr = createLineSplitter(options.maxLineBytes, (line) => {
          if (stderrLines.length < MAX_STDERR_LINES) {
            stderrLines.push(line);
            emit({ kind: 'stderr', text: clip(line) });
          }
        });
        // `cancel` = the caller aborted. Unconfirmed: never resolve; the
        // dispatcher's deadline marks the run STOP_UNCONFIRMED and blocks
        // dispatch.
        const stop = (cancel: boolean) => {
          if (stopping) return;
          stopping = true;
          void stopProcessTree(
            child,
            closed,
            options.stopDeadlineMs,
            platform,
          ).then((stopped) => {
            if (!stopped) return;
            finish(
              cancel
                ? { status: 'cancelled' }
                : { status: 'failed', code: 'RUNNER_FAILED' },
            );
          });
        };
        const onAbort = () => stop(true);
        request.signal.addEventListener('abort', onAbort, { once: true });
        child.on('error', (error: NodeJS.ErrnoException) => {
          spawnFailed = true;
          emit({
            kind: 'system',
            text: `spawn failed: ${error.code ?? 'unknown'}`,
          });
          // A process that never started has nothing to stop.
          if (child.pid === undefined) {
            markClosed();
            finish({ status: 'failed', code: 'AGENT_UNAVAILABLE' });
          }
        });
        if (child.pid !== undefined)
          request.onProcess?.({ kind: 'started', pid: child.pid });
        child.stdout.on('data', (chunk: Buffer) => {
          if (!stdout.push(chunk)) invalid = true;
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr.push(chunk);
        });
        child.stdin.on('error', () => {
          // EPIPE when the CLI exits before reading the prompt; exit decides.
        });
        child.stdin.end(request.prompt, 'utf8');
        child.on('close', (code) => {
          markClosed();
          if (!stdout.end()) invalid = true;
          stderr.end();
          if (child.pid !== undefined) request.onProcess?.({ kind: 'exited' });
          if (request.signal.aborted) {
            finish({ status: 'cancelled' });
            return;
          }
          if (lockdownBroken || stopping) {
            finish({ status: 'failed', code: 'RUNNER_FAILED' });
            return;
          }
          if (spawnFailed) {
            finish({ status: 'failed', code: 'AGENT_UNAVAILABLE' });
            return;
          }
          const result = parser.result();
          const usage = result?.usage;
          const withUsage = <T extends object>(value: T) =>
            usage ? { ...value, usage } : value;
          if (!result || result.isError || code !== 0) {
            const text = [result?.text ?? '', ...stderrLines].join('\n');
            if (result?.isError || code !== 0) {
              finish(
                withUsage({
                  status: 'failed' as const,
                  code: classifyAgentFailure(text),
                }),
              );
            } else {
              finish({ status: 'failed', code: 'AGENT_OUTPUT_INVALID' });
            }
            return;
          }
          if (
            invalid ||
            !result.text.trim() ||
            (request.maxOutputBytes !== undefined &&
              Buffer.byteLength(result.text) > request.maxOutputBytes)
          ) {
            finish(
              withUsage({
                status: 'failed' as const,
                code: 'AGENT_OUTPUT_INVALID',
              }),
            );
            return;
          }
          finish(
            withUsage({ status: 'completed' as const, rawOutput: result.text }),
          );
        });
      });
    },
  };
}
