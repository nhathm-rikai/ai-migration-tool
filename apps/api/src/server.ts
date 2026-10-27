import { randomUUID } from 'node:crypto';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { acquireInstanceLock } from './platform/instance-lock.js';
import {
  createStartupDiagnostic,
  getErrorReason,
} from './shared/error-diagnostics.js';

async function start(): Promise<void> {
  const config = loadConfig();
  // Before the DB opens or the port listens: a second process on the same
  // data directory stops here with DATA_DIR_LOCKED.
  const lock = acquireInstanceLock(config.dataDir, {
    id: randomUUID(),
    pid: process.pid,
    now: () => new Date(),
  });
  let app: ReturnType<typeof buildApp>;
  try {
    app = buildApp(config, {
      recovery: { recoveryRequired: lock.previousOwner === 'unknown' },
    });
  } catch (error) {
    lock.release();
    throw error;
  }
  // Released only after the dispatcher stopped and the DB closed. If closing
  // fails the lock is left to process exit, so the next start sees an
  // unreleased owner.
  const close = async () => {
    await app.close();
    lock.release();
  };
  if (lock.previousOwner === 'unreleased')
    app.log.warn(
      { code: 'INSTANCE_PREVIOUS_UNRELEASED' },
      'The previous backend exited without shutting down; its executing runs are marked interrupted.',
    );
  if (lock.previousOwner === 'unknown')
    app.log.error(
      { code: 'INSTANCE_OWNER_UNKNOWN' },
      'The previous backend cannot be accounted for; runs are not dispatched until recovery is confirmed.',
    );
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void close().catch((error: unknown) => {
      app.log.error(
        { code: 'SHUTDOWN_FAILED', reason: getErrorReason(error) },
        'Could not close backend cleanly.',
      );
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  app.addHook('onClose', () => {
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
  });
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    await close();
    throw error;
  }
}

try {
  await start();
} catch (error) {
  // Config/SQLite errors may include private paths; keep the public diagnostic bounded.
  console.error(JSON.stringify(createStartupDiagnostic(error)));
  process.exitCode = 1;
}
