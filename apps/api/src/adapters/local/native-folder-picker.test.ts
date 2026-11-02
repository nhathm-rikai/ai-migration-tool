import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createNativeFolderPicker,
  dialogCommands,
  type DialogCommand,
} from './native-folder-picker.js';

// The adapter's process handling with stand-in "dialogs": Node scripts that
// print, exit, hang or are missing. The real OS dialogs are covered by the
// native smoke (UI05-AC04), not by these tests.

const node = process.execPath;
const zenityLike = dialogCommands('linux')[0]!;
// A command that runs `script` with Node and parses like zenity/kdialog.
const script = (code: string): DialogCommand => ({
  file: node,
  args: ['-e', code],
  parse: zenityLike.parse,
});
const missing: DialogCommand = {
  file: 'portal-test-no-such-dialog-tool',
  args: [],
  parse: zenityLike.parse,
};

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('native folder picker adapter (UI05)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });
  const pidFile = () => {
    const dir = mkdtempSync(join(tmpdir(), 'portal-picker-test-'));
    dirs.push(dir);
    return join(dir, 'pid');
  };
  const open = (commands: DialogCommand[], timeoutMs = 10_000) =>
    createNativeFolderPicker({ commands, timeoutMs }).pick(
      new AbortController().signal,
    );

  it('UI05-AC01 returns the chosen absolute folder without its trailing separator', async () => {
    const chosen = join(tmpdir(), 'Thư mục có dấu');
    await expect(
      open([
        script(`process.stdout.write(${JSON.stringify(chosen + '/')} + '\\n')`),
      ]),
    ).resolves.toEqual({ status: 'selected', path: chosen });
  });

  it('UI05-AC01 a cancelled dialog answers cancelled', async () => {
    await expect(open([script('process.exit(1)')])).resolves.toEqual({
      status: 'cancelled',
    });
  });

  it.each([
    ['a relative path', "process.stdout.write('relative/folder')"],
    ['an empty answer', 'process.exit(0)'],
    ['an unexpected exit code', 'process.exit(3)'],
  ])('UI05-AC01 %s is unavailable (failed), never a path', async (_, code) => {
    await expect(open([script(code)])).resolves.toEqual({
      status: 'unavailable',
      reason: 'failed',
    });
  });

  it('UI05-AC01 skips a missing tool and says no-tool when none is installed', async () => {
    const chosen = tmpdir();
    await expect(
      open([
        missing,
        script(`process.stdout.write(${JSON.stringify(chosen)})`),
      ]),
    ).resolves.toEqual({ status: 'selected', path: chosen });
    await expect(open([missing, missing])).resolves.toEqual({
      status: 'unavailable',
      reason: 'no-tool',
    });
  });

  it('UI05-AC01 kills a dialog nobody answers and reports the timeout', async () => {
    const file = pidFile();
    const hang = script(
      `require('fs').writeFileSync(${JSON.stringify(file)}, String(process.pid)); setInterval(() => {}, 1000)`,
    );
    const result = await open([hang], 1500);
    expect(result).toEqual({ status: 'unavailable', reason: 'timeout' });
    const pid = Number(readFileSync(file, 'utf8'));
    expect(alive(pid)).toBe(false);
  });

  it('UI05-AC03 an abort (shutdown) kills the open dialog and resolves', async () => {
    const file = pidFile();
    const hang = script(
      `require('fs').writeFileSync(${JSON.stringify(file)}, String(process.pid)); setInterval(() => {}, 1000)`,
    );
    const controller = new AbortController();
    const picking = createNativeFolderPicker({
      commands: [hang],
      timeoutMs: 60_000,
    }).pick(controller.signal);
    await expect
      .poll(() => {
        try {
          return readFileSync(file, 'utf8').length > 0;
        } catch {
          return false;
        }
      })
      .toBe(true);
    controller.abort();
    await expect(picking).resolves.toEqual({ status: 'cancelled' });
    expect(alive(Number(readFileSync(file, 'utf8')))).toBe(false);
  });

  it('reads the Windows answer as UTF-8 base64 and the fixed argv per OS', () => {
    const [windows] = dialogCommands('win32');
    const path = 'D:\\dự án\\ソース';
    const encoded = Buffer.from(path, 'utf8').toString('base64');
    expect(windows?.parse({ code: 0, stdout: `OK:${encoded}\r\n` })).toEqual({
      status: 'selected',
      path,
    });
    expect(windows?.parse({ code: 0, stdout: 'CANCEL\r\n' })).toEqual({
      status: 'cancelled',
    });
    expect(windows?.parse({ code: 1, stdout: '' })).toBeNull();
    expect(windows?.file).toBe('powershell.exe');
    expect(windows?.args).toContain('-STA');
    expect(dialogCommands('darwin').map((command) => command.file)).toEqual([
      'osascript',
    ]);
    expect(dialogCommands('linux').map((command) => command.file)).toEqual([
      'zenity',
      'kdialog',
    ]);
  });
});
