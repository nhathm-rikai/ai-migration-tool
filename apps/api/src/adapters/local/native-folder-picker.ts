import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import {
  FOLDER_PICKER_PATH_MAX_LENGTH,
  type FolderPickerResult,
} from '@portal/contracts';
import type { FolderPicker } from '../../ports/folder-picker.js';

// Native folder dialog of each OS (UI05), run as a child process with a fixed
// argv: nothing from a request reaches the command line, there is no shell,
// and the chosen path is neither logged nor written anywhere.
//
// - Windows: Windows PowerShell in STA mode, WinForms FolderBrowserDialog
//   owned by a topmost form so it opens in front. The path goes back as
//   base64 of UTF-8 so console code pages cannot change it.
// - macOS: osascript `choose folder` (cancel exits 1 with error -128).
// - Linux: zenity, else kdialog (cancel exits 1).
//
// A tool that is not installed is skipped (spawn ENOENT); none left means
// `no-tool`. Abort or timeout kills the process, which closes its dialog.

export type DialogCommand = {
  file: string;
  args: readonly string[];
  // Reads the finished process. Null: unusable answer (`failed`).
  parse: (output: {
    code: number | null;
    stdout: string;
  }) => DialogOutcome | null;
};
type DialogOutcome =
  { status: 'selected'; path: string } | { status: 'cancelled' };

const WINDOWS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Windows.Forms',
  '$owner = New-Object System.Windows.Forms.Form',
  '$owner.TopMost = $true',
  '$owner.ShowInTaskbar = $false',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
  '$dialog.ShowNewFolderButton = $false',
  'if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {',
  "  'OK:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.SelectedPath))",
  '} else {',
  "  'CANCEL'",
  '}',
  '$owner.Dispose()',
].join('\n');

function windowsCommand(): DialogCommand {
  return {
    file: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      WINDOWS_SCRIPT,
    ],
    parse({ code, stdout }) {
      const line = stdout.trim();
      if (code !== 0) return null;
      if (line === 'CANCEL') return { status: 'cancelled' };
      if (!line.startsWith('OK:')) return null;
      const path = Buffer.from(line.slice(3), 'base64').toString('utf8');
      return { status: 'selected', path };
    },
  };
}

// zenity and kdialog print the path and exit 0, or exit 1 on cancel.
function lineCommand(file: string, args: readonly string[]): DialogCommand {
  return {
    file,
    args,
    parse({ code, stdout }) {
      if (code === 1) return { status: 'cancelled' };
      if (code !== 0) return null;
      return { status: 'selected', path: stdout.replace(/\r?\n$/, '') };
    },
  };
}

export function dialogCommands(platform: NodeJS.Platform): DialogCommand[] {
  if (platform === 'win32') return [windowsCommand()];
  if (platform === 'darwin')
    return [lineCommand('osascript', ['-e', 'POSIX path of (choose folder)'])];
  return [
    lineCommand('zenity', ['--file-selection', '--directory']),
    lineCommand('kdialog', ['--getexistingdirectory']),
  ];
}

// A trailing separator (macOS `POSIX path`) is dropped except on a root.
function normalizeChosen(path: string): string | null {
  const trimmed =
    path.length > 1 && /[\\/]$/.test(path) && !/^[A-Za-z]:\\$/.test(path)
      ? path.slice(0, -1)
      : path;
  if (
    trimmed.length === 0 ||
    trimmed.length > FOLDER_PICKER_PATH_MAX_LENGTH ||
    trimmed.includes('\0') ||
    !isAbsolute(trimmed)
  )
    return null;
  return trimmed;
}

// Output beyond this is not a path; the process is treated as failed.
const MAX_OUTPUT_BYTES = 256 * 1024;

type RunOutcome =
  | { kind: 'missing' }
  | { kind: 'aborted' }
  | { kind: 'timeout' }
  | { kind: 'exited'; code: number | null; stdout: string }
  | { kind: 'failed' };

function runOnce(
  command: DialogCommand,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve({ kind: 'aborted' });
      return;
    }
    const child = spawn(command.file, [...command.args], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    let ending: RunOutcome | null = null;
    const finish = (outcome: RunOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(outcome);
    };
    // Kill, then answer once the process is gone.
    const stop = (outcome: RunOutcome) => {
      ending ??= outcome;
      if (child.exitCode === null && child.signalCode === null) child.kill();
    };
    const onAbort = () => stop({ kind: 'aborted' });
    const timer = setTimeout(() => stop({ kind: 'timeout' }), timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) stop({ kind: 'failed' });
      else chunks.push(chunk);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(
        error.code === 'ENOENT' ? { kind: 'missing' } : { kind: 'failed' },
      );
    });
    child.on('close', (code) => {
      finish(
        ending ?? {
          kind: 'exited',
          code,
          stdout: Buffer.concat(chunks).toString('utf8'),
        },
      );
    });
  });
}

export function createNativeFolderPicker(options: {
  commands: readonly DialogCommand[];
  timeoutMs: number;
}): FolderPicker {
  return {
    async pick(signal) {
      for (const command of options.commands) {
        const outcome = await runOnce(command, signal, options.timeoutMs);
        if (outcome.kind === 'missing') continue;
        if (outcome.kind === 'aborted') return { status: 'cancelled' };
        if (outcome.kind === 'timeout')
          return { status: 'unavailable', reason: 'timeout' };
        if (outcome.kind === 'failed')
          return { status: 'unavailable', reason: 'failed' };
        const parsed = command.parse(outcome);
        if (!parsed) return { status: 'unavailable', reason: 'failed' };
        if (parsed.status === 'cancelled') return parsed;
        const path = normalizeChosen(parsed.path);
        return path
          ? { status: 'selected', path }
          : { status: 'unavailable', reason: 'failed' };
      }
      return {
        status: 'unavailable',
        reason: 'no-tool',
      } satisfies FolderPickerResult;
    },
  };
}
