// Testable body of confirm-recovery.ts.
import { loadConfig } from '../config.js';
import { confirmInstanceRecovery } from '../platform/instance-lock.js';
import { getErrorReason } from '../shared/error-diagnostics.js';

export function main(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (args.length !== 1 || args[0] !== '--confirm') {
    console.error(
      JSON.stringify({
        code: 'CONFIRMATION_REQUIRED',
        message:
          'Check that no backend or job process of this data directory runs, then pass --confirm.',
      }),
    );
    return 2;
  }
  try {
    const previousOwner = confirmInstanceRecovery(loadConfig(env).dataDir);
    console.log(JSON.stringify({ code: 'RECOVERY_CONFIRMED', previousOwner }));
    return 0;
  } catch (error) {
    // Paths stay out of the output, as in the startup diagnostic.
    console.error(
      JSON.stringify({
        code: 'RECOVERY_CONFIRM_FAILED',
        reason: getErrorReason(error),
      }),
    );
    return 1;
  }
}
