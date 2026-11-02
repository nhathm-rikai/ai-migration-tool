import { statSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join } from 'node:path';

// Finds the agent CLI executable without a shell (JOB-08). Windows accepts a
// native .exe only: .cmd/.bat wrappers need cmd.exe and its quoting rules,
// which this app does not use. POSIX accepts any executable file.

export type ExecutableLookup =
  | { status: 'found'; path: string }
  | { status: 'missing' }
  | { status: 'unsupported' };

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function resolveAgentExecutable(options: {
  configured?: string | undefined;
  name: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): ExecutableLookup {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const accept = (path: string): ExecutableLookup => {
    if (platform === 'win32' && extname(path).toLowerCase() !== '.exe')
      return { status: 'unsupported' };
    return isFile(path) ? { status: 'found', path } : { status: 'missing' };
  };
  if (options.configured !== undefined) {
    if (!isAbsolute(options.configured)) return { status: 'unsupported' };
    return accept(options.configured);
  }
  const fileName = platform === 'win32' ? `${options.name}.exe` : options.name;
  const pathValue = env.PATH ?? env.Path ?? '';
  for (const directory of pathValue.split(delimiter)) {
    if (!directory || !isAbsolute(directory)) continue;
    const candidate = join(directory, fileName);
    if (isFile(candidate)) return { status: 'found', path: candidate };
  }
  return { status: 'missing' };
}
