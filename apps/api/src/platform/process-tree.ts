import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

// Stops a child process and everything it started (JOB-04). Windows has no
// process groups: taskkill /T walks the tree from the PID, which stays ours
// while Node holds the child's handle (it has not been reaped). POSIX children
// are spawned detached as their own group, so the group is signalled.

export type SpawnTreeOptions = { detached: boolean };

// Spawn option that makes the child the root of a killable tree.
export function treeSpawnOptions(
  platform: NodeJS.Platform = process.platform,
): SpawnTreeOptions {
  return { detached: platform !== 'win32' };
}

function windowsTaskkill(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.SystemRoot ?? env.windir ?? 'C:\\Windows';
  return join(root, 'System32', 'taskkill.exe');
}

// Resolves true once `closed` settles (the caller's promise for the child's
// 'close' event: it exited and every stdio pipe, inherited by descendants,
// ended), false if that did not happen within `deadlineMs`.
export function stopProcessTree(
  child: ChildProcess,
  closed: Promise<void>,
  deadlineMs: number,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  const pid = child.pid;
  if (pid === undefined) return Promise.resolve(true);
  let escalate: NodeJS.Timeout | undefined;
  if (platform === 'win32') {
    const killer = spawn(windowsTaskkill(), ['/PID', String(pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    });
    killer.on('error', () => {
      // The child may already be gone; the deadline still decides.
    });
  } else {
    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-pid, signal);
      } catch {
        // ESRCH: the group is gone.
      }
    };
    signalGroup('SIGTERM');
    escalate = setTimeout(
      () => signalGroup('SIGKILL'),
      Math.min(2000, deadlineMs / 2),
    );
  }
  let deadline: NodeJS.Timeout | undefined;
  return Promise.race([
    closed.then(() => true),
    new Promise<boolean>((resolve) => {
      deadline = setTimeout(() => resolve(false), deadlineMs);
    }),
  ]).finally(() => {
    clearTimeout(deadline);
    clearTimeout(escalate);
  });
}

// Startup check of a PID a previous backend recorded: true only when the OS
// says no such process exists. A live PID may have been reused, so it is
// never killed here (JOB-05: no kill without proven ownership).
export function isProcessGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}
