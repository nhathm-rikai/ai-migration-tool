import type { AgentEffort, AgentModel } from '@portal/contracts';

// What the agent printed while running, already split into complete lines.
// Untrusted text: it is only stored and shown escaped.
export type AgentEvent =
  | { kind: 'text'; text: string }
  | { kind: 'stderr'; text: string }
  | { kind: 'system'; text: string }
  // Raw piece of the answer as it streams (not logged; used to follow the
  // answer's structure). Not split into lines.
  | { kind: 'delta'; text: string };

export type AgentRequest = {
  runId: string;
  prompt: string;
  signal: AbortSignal;
  model?: AgentModel;
  // Omitted: the CLI's own default.
  effort?: AgentEffort;
  // Working directory of this call; the runner's default otherwise.
  workingDirectory?: string;
  // Bytes of final output accepted; more fails with AGENT_OUTPUT_INVALID.
  maxOutputBytes?: number;
  onEvent?: (event: AgentEvent) => void;
  // A real process started / was confirmed gone (JOB-05 ledger).
  onProcess?: (
    event: { kind: 'started'; pid: number } | { kind: 'exited' },
  ) => void;
};

export type AgentFailureCode =
  | 'RUNNER_FAILED'
  | 'AGENT_UNAVAILABLE'
  | 'AGENT_AUTH_FAILED'
  | 'AGENT_QUOTA_EXCEEDED'
  | 'AGENT_OUTPUT_INVALID';

export type AgentUsage = { inputTokens: number; outputTokens: number };

// The runner transports output. Callers validate the content separately.
// `cancelled` is returned only once the process (tree) is confirmed stopped;
// an unconfirmed stop never resolves and the dispatcher's deadline decides.
export type AgentResult =
  | { status: 'completed'; rawOutput: string; usage?: AgentUsage }
  | { status: 'failed'; code: AgentFailureCode; usage?: AgentUsage }
  | { status: 'cancelled' };

export interface AgentRunner {
  run(request: AgentRequest): Promise<AgentResult>;
}
