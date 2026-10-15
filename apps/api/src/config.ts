import { homedir } from 'node:os';
import {
  resolveDefaultDataDirectory,
  validateDataDirectory,
} from './platform/data-directory.js';
import { RuntimeError } from './shared/runtime-error.js';

export type AppConfig = {
  host: '127.0.0.1';
  port: number;
  dataDir: string;
  mode: 'fixture';
  runner: 'fake';
  logLevel: 'info' | 'warn' | 'error' | 'silent';
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const portText = env.PORTAL_PORT ?? '4310';
  const port = Number(portText);
  if (
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new RuntimeError('INVALID_CONFIG');
  }
  if (
    (env.PORTAL_MODE ?? 'fixture') !== 'fixture' ||
    (env.PORTAL_RUNNER ?? 'fake') !== 'fake'
  ) {
    throw new RuntimeError('INVALID_CONFIG');
  }
  const logLevel = env.PORTAL_LOG_LEVEL ?? 'info';
  // Narrow explicitly so configuration never relies on a type assertion.
  if (
    logLevel !== 'info' &&
    logLevel !== 'warn' &&
    logLevel !== 'error' &&
    logLevel !== 'silent'
  ) {
    throw new RuntimeError('INVALID_CONFIG');
  }
  const dataDir = validateDataDirectory(
    env.PORTAL_DATA_DIR ??
      resolveDefaultDataDirectory({
        platform: process.platform,
        homeDir: homedir(),
        ...(env.LOCALAPPDATA !== undefined
          ? { localAppData: env.LOCALAPPDATA }
          : {}),
        ...(env.XDG_DATA_HOME !== undefined
          ? { xdgDataHome: env.XDG_DATA_HOME }
          : {}),
      }),
  );
  return {
    host: '127.0.0.1',
    port,
    dataDir,
    mode: 'fixture',
    runner: 'fake',
    logLevel,
  };
}
