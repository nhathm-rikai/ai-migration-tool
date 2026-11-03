import { Type, type Static } from 'typebox';

// Native folder dialog (UI05). The backend opens the operating system's
// folder dialog on the machine it runs on (always loopback) and answers with
// the chosen absolute path. Choosing copies nothing and stores nothing: the
// UI registers the path with PUT .../source as before (B03).
export const LOCAL_FOLDER_PICKER_PATH = '/api/v1/local/folder-picker';

// Longest a dialog may stay open; the request is answered `timeout` then.
export const FOLDER_PICKER_TIMEOUT_MS = 5 * 60 * 1000;
// Upper bound of a returned path (characters), as long Windows paths.
export const FOLDER_PICKER_PATH_MAX_LENGTH = 32_767;

export const FolderPickerResultSchema = Type.Union([
  Type.Object(
    {
      status: Type.Literal('selected'),
      path: Type.String({
        minLength: 1,
        maxLength: FOLDER_PICKER_PATH_MAX_LENGTH,
      }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { status: Type.Literal('cancelled') },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      status: Type.Literal('unavailable'),
      // no-tool: no dialog tool on this machine (e.g. Linux without
      // zenity/kdialog); failed: the tool did not start or answered something
      // unusable; timeout: nobody answered within FOLDER_PICKER_TIMEOUT_MS.
      reason: Type.Union([
        Type.Literal('no-tool'),
        Type.Literal('failed'),
        Type.Literal('timeout'),
      ]),
    },
    { additionalProperties: false },
  ),
]);

export type FolderPickerResult = Static<typeof FolderPickerResultSchema>;
export type FolderPickerUnavailableReason = Extract<
  FolderPickerResult,
  { status: 'unavailable' }
>['reason'];
