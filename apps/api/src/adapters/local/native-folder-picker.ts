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
// - Windows: Windows PowerShell in STA mode, the Explorer folder dialog
//   (IFileOpenDialog) owned by a topmost form so it opens in front. The path goes back as
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

// The Explorer-style folder dialog of Windows Vista+ (IFileOpenDialog with
// FOS_PICKFOLDERS: address bar, search, navigation pane), declared through
// COM interop because Windows PowerShell 5.1 has no managed wrapper for it.
// Only the methods up to GetResult are declared, in vtable order.
const WINDOWS_DIALOG_TYPE = `
using System;
using System.Runtime.InteropServices;
public static class PortalFolderDialog {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  private class FileOpenDialog {}
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
  }
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileDialog {
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(uint count, IntPtr types);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem item);
    void SetFolder(IShellItem item);
    void GetFolder(out IShellItem item);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }
  private const uint FOS_PICKFOLDERS = 0x20;
  private const uint FOS_FORCEFILESYSTEM = 0x40;
  private const uint FOS_PATHMUSTEXIST = 0x800;
  private const uint SIGDN_FILESYSPATH = 0x80058000;
  private const int ERROR_CANCELLED = unchecked((int)0x800704C7);
  // The chosen folder, or null when the dialog was cancelled.
  public static string Pick(IntPtr owner) {
    IFileDialog dialog = (IFileDialog)new FileOpenDialog();
    uint options;
    dialog.GetOptions(out options);
    dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
    int result = dialog.Show(owner);
    if (result == ERROR_CANCELLED) return null;
    Marshal.ThrowExceptionForHR(result);
    IShellItem item;
    dialog.GetResult(out item);
    string path;
    item.GetDisplayName(SIGDN_FILESYSPATH, out path);
    return path;
  }
}
`;

const WINDOWS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Windows.Forms',
  "Add-Type -TypeDefinition @'",
  WINDOWS_DIALOG_TYPE.trim(),
  "'@",
  // A topmost owner window keeps the dialog in front of the browser.
  '$owner = New-Object System.Windows.Forms.Form',
  '$owner.TopMost = $true',
  '$owner.ShowInTaskbar = $false',
  '$path = [PortalFolderDialog]::Pick($owner.Handle)',
  '$owner.Dispose()',
  'if ($path) {',
  "  'OK:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($path))",
  '} else {',
  "  'CANCEL'",
  '}',
].join('\n');

function windowsCommand(): DialogCommand {
  return {
    file: 'powershell.exe',
    // The script goes as UTF-16LE base64: no quoting of the C# source.
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64'),
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
