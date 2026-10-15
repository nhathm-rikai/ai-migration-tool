export type AgentRequest = {
  runId: string;
  prompt: string;
  signal: AbortSignal;
};

// The runner transports output. Analysis will validate JSON/schema/evidence separately.
export type AgentResult =
  | { status: 'completed'; rawOutput: string }
  | { status: 'failed'; code: 'RUNNER_FAILED' }
  | { status: 'cancelled' };

export interface AgentRunner {
  run(request: AgentRequest): Promise<AgentResult>;
}
