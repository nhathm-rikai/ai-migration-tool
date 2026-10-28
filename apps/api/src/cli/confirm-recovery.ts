// Operator command for the runbook in apps/api/README.md: after checking by
// hand that no backend or job process of this data directory is still
// running, reset the instance owner record so the next start dispatches
// again. It takes the instance lock, so it refuses while a backend runs. It
// never stops processes, changes runs or opens portal.db.
//
//   PORTAL_DATA_DIR=<dir> node apps/api/dist/cli/confirm-recovery.js --confirm
//
// The data directory is resolved like the backend does (PORTAL_DATA_DIR or
// the platform default).
import { main } from './confirm-recovery-command.js';

process.exitCode = main(process.argv.slice(2));
