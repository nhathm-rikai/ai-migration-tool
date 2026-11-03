import type { FolderPickerResult } from '@portal/contracts';

// Opens one folder dialog on the machine running the backend. Aborting the
// signal closes the dialog and resolves; it never rejects for a dialog that
// failed or timed out (those are `unavailable` answers).
export interface FolderPicker {
  pick: (signal: AbortSignal) => Promise<FolderPickerResult>;
}
