import type { FolderPickerResult } from '@portal/contracts';
import type { FolderPicker } from '../../ports/folder-picker.js';
import { AppError } from '../../shared/app-error.js';

// One native folder dialog at a time (UI05). A second request while one is
// open answers FOLDER_PICKER_BUSY without starting anything; closing the app
// closes an open dialog (its process is killed) before the database closes.
export function createFolderPickerService(deps: { picker: FolderPicker }) {
  let open: { controller: AbortController; done: Promise<unknown> } | null =
    null;
  let closed = false;
  return {
    async pick(): Promise<FolderPickerResult> {
      if (open || closed) throw new AppError('FOLDER_PICKER_BUSY');
      const controller = new AbortController();
      const done = deps.picker.pick(controller.signal);
      open = { controller, done };
      try {
        return await done;
      } finally {
        open = null;
      }
    },
    async close(): Promise<void> {
      closed = true;
      if (!open) return;
      open.controller.abort();
      await open.done.catch(() => undefined);
    },
  };
}

export type FolderPickerService = ReturnType<typeof createFolderPickerService>;
