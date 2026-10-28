import { AnalyzeApiErrorCodeSchema } from '@portal/contracts';
import { Check } from 'typebox/value';
import { ApiError } from '../../shared/api/api-error';
import type { Messages } from '../../shared/i18n/vi';
import { projectErrorMessage } from '../projects/project-messages';

// Message of a failed run request: analyze codes from the run catalog, the
// shared catalog for the rest. An unconfirmed mutation has its own copy at the
// call site because the next step differs for Start and Cancel.
type RunErrorMessages = Messages['runs']['errors'];

function hasRunMessage(
  messages: RunErrorMessages,
  code: string,
): code is keyof RunErrorMessages {
  return Object.hasOwn(messages, code);
}

export function runRequestErrorMessage(
  error: unknown,
  messages: Messages,
): string {
  if (
    error instanceof ApiError &&
    error.kind === 'http' &&
    Check(AnalyzeApiErrorCodeSchema, error.code) &&
    hasRunMessage(messages.runs.errors, error.code)
  )
    return messages.runs.errors[error.code];
  return projectErrorMessage(error, 'runs', messages.errors);
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof ApiError && error.kind === 'http' && error.code === code
  );
}
