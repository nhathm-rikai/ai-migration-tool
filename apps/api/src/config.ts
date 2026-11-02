import { homedir } from 'node:os';
import { isAbsolute } from 'node:path';
import {
  resolveDefaultDataDirectory,
  validateDataDirectory,
} from './platform/data-directory.js';
import { RuntimeError } from './shared/runtime-error.js';

export type AppConfig = {
  host: '127.0.0.1';
  port: number;
  // Loopback ports whose origin may call the API: the dev/preview UI behind
  // the Vite proxy. The API's own port is always trusted.
  webPorts: readonly number[];
  dataDir: string;
  mode: 'fixture';
  // Agent of document runs: fake (no network) or the local agent CLI.
  runner: 'fake' | 'claude-cli' | 'codex-cli';
  // Absolute path of the agent CLI; searched on PATH when absent.
  agentExecutable: string | undefined;
  logLevel: 'info' | 'warn' | 'error' | 'silent';
};

// Default Vite dev (5173) and preview (4173) ports, same as vite.config.ts.
const DEFAULT_WEB_PORTS = [5173, 4173] as const;

function parsePort(text: string): number {
  const port = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new RuntimeError('INVALID_CONFIG');
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = parsePort(env.PORTAL_PORT ?? '4310');
  const webPorts =
    env.PORTAL_WEB_PORT === undefined
      ? [...DEFAULT_WEB_PORTS]
      : [parsePort(env.PORTAL_WEB_PORT)];
  const runner = env.PORTAL_RUNNER ?? 'fake';
  if (
    (env.PORTAL_MODE ?? 'fixture') !== 'fixture' ||
    (runner !== 'fake' && runner !== 'claude-cli' && runner !== 'codex-cli')
  ) {
    throw new RuntimeError('INVALID_CONFIG');
  }
  const agentExecutable = env.PORTAL_AGENT_CLI;
  if (agentExecutable !== undefined && !isAbsolute(agentExecutable))
    throw new RuntimeError('INVALID_CONFIG');
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
    webPorts,
    dataDir,
    mode: 'fixture',
    runner,
    agentExecutable,
    logLevel,
  };
}
