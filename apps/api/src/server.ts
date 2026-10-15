import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import {
  createStartupDiagnostic,
  getErrorReason,
} from './shared/error-diagnostics.js';

async function start(): Promise<void> {
  const config = loadConfig();
  const app = buildApp(config);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void app.close().catch((error: unknown) => {
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
    await app.close();
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
