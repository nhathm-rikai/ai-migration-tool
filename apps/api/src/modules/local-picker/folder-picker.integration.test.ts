import { readdirSync } from 'node:fs';
import {
  FolderPickerResultSchema,
  LOCAL_FOLDER_PICKER_PATH,
  type FolderPickerResult,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FolderPicker } from '../../ports/folder-picker.js';
import { createTestApp, trustedHeaders } from '../../testing/test-app.js';

// UI05 over HTTP with a fake dialog: the route only relays what the picker
// answers, one dialog at a time, behind the local credential and Origin.

type Pending = {
  signal: AbortSignal;
  resolve: (result: FolderPickerResult) => void;
};

function controlledPicker() {
  const calls: Pending[] = [];
  const picker: FolderPicker = {
    pick: vi.fn(
      (signal: AbortSignal) =>
        new Promise<FolderPickerResult>((resolve) => {
          calls.push({ signal, resolve });
          signal.addEventListener('abort', () =>
            resolve({ status: 'cancelled' }),
          );
        }),
    ),
  };
  return { picker, calls };
}

function dataDirEntries(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).sort();
}

describe('folder picker HTTP (UI05)', () => {
  let context: ReturnType<typeof createTestApp> | undefined;
  afterEach(async () => {
    await context?.cleanup();
    context = undefined;
  });

  it.each<FolderPickerResult>([
    { status: 'selected', path: 'C:\\work\\order-module' },
    { status: 'cancelled' },
    { status: 'unavailable', reason: 'no-tool' },
    { status: 'unavailable', reason: 'failed' },
    { status: 'unavailable', reason: 'timeout' },
  ])(
    'UI05-AC01 relays %j without caching it or touching the data directory',
    async (answer) => {
      const picker: FolderPicker = { pick: vi.fn(() => Promise.resolve(answer)) };
      context = createTestApp({}, { folderPicker: picker });
      await context.app.ready();
      const before = dataDirEntries(context.config.dataDir);
      const response = await context.inject({
        method: 'POST',
        url: LOCAL_FOLDER_PICKER_PATH,
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual(answer);
      expect(Check(FolderPickerResultSchema, response.json())).toBe(true);
      // UI05-AC05: choosing a folder writes nothing.
      expect(dataDirEntries(context.config.dataDir)).toEqual(before);
    },
  );

  it('answers a safe 500 when the picker itself throws', async () => {
    const picker: FolderPicker = {
      pick: () => Promise.reject(new Error('C:\\private\\path')),
    };
    context = createTestApp({}, { folderPicker: picker });
    const response = await context.inject({
      method: 'POST',
      url: LOCAL_FOLDER_PICKER_PATH,
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(response.body).not.toContain('private');
  });

  it('UI05-AC02 rejects a missing credential or a foreign Origin before opening a dialog', async () => {
    const { picker } = controlledPicker();
    context = createTestApp({}, { folderPicker: picker });
    const headers = trustedHeaders(context.config);
    const anonymous = await context.app.inject({
      method: 'POST',
      url: LOCAL_FOLDER_PICKER_PATH,
      headers,
    });
    expect(anonymous.statusCode).toBe(401);
    const foreign = await context.inject({
      method: 'POST',
      url: LOCAL_FOLDER_PICKER_PATH,
      headers: { origin: 'http://evil.example' },
    });
    expect(foreign.statusCode).toBe(403);
    const query = await context.inject({
      method: 'POST',
      url: `${LOCAL_FOLDER_PICKER_PATH}?path=C:/x`,
    });
    expect(query.statusCode).toBe(400);
    expect(picker.pick).not.toHaveBeenCalled();
  });

  it('UI05-AC03 opens one dialog at a time and closes it when the app shuts down', async () => {
    const { picker, calls } = controlledPicker();
    context = createTestApp({}, { folderPicker: picker });
    const first = context.inject({
      method: 'POST',
      url: LOCAL_FOLDER_PICKER_PATH,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const second = await context.inject({
      method: 'POST',
      url: LOCAL_FOLDER_PICKER_PATH,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: { code: 'FOLDER_PICKER_BUSY' },
    });
    expect(picker.pick).toHaveBeenCalledTimes(1);
    calls[0]?.resolve({ status: 'selected', path: '/home/dev/source' });
    expect((await first).json()).toEqual({
      status: 'selected',
      path: '/home/dev/source',
    });
    // Free again once answered.
    const third = context.inject({
      method: 'POST',
      url: LOCAL_FOLDER_PICKER_PATH,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    const closing = context.app.close();
    await vi.waitFor(() => expect(calls[1]?.signal.aborted).toBe(true));
    await closing;
    await third.catch(() => undefined);
  });
});
