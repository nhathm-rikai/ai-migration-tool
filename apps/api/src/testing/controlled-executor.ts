import type {
  RunExecutionRequest,
  RunExecutionResult,
  RunExecutor,
} from '../ports/run-executor.js';

export type ControlledExecution = RunExecutionRequest & {
  finish(result: RunExecutionResult): void;
};

// Executor driven by the test: each execution waits until the test calls
// finish(). `stopOnAbort` settles `stopped` as soon as the signal aborts;
// without it the execution ignores the abort (late completion, hung stop).
export function createControlledExecutor(
  options: { stopOnAbort?: boolean } = {},
) {
  const executions: ControlledExecution[] = [];
  let running = 0;
  let maxConcurrent = 0;
  const executor: RunExecutor = {
    execute(request) {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      return new Promise<RunExecutionResult>((resolve) => {
        let settled = false;
        const finish = (result: RunExecutionResult) => {
          if (settled) return;
          settled = true;
          running--;
          resolve(result);
        };
        if (options.stopOnAbort)
          request.signal.addEventListener(
            'abort',
            () => finish({ status: 'stopped' }),
            { once: true },
          );
        executions.push({ ...request, finish });
      });
    },
  };
  return {
    executor,
    executions,
    maxConcurrent: () => maxConcurrent,
  };
}
