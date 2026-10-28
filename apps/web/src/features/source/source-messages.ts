import { AnalyzeApiErrorCodeSchema } from '@portal/contracts';
import { Check } from 'typebox/value';
import { ApiError } from '../../shared/api/api-error';
import type { Messages } from '../../shared/i18n/vi';
import { projectErrorMessage } from '../projects/project-messages';

// Message of a failed source request: source codes from the source catalog,
// the shared catalog for the rest. Never the server's raw message.
type SourceErrorMessages = Messages['source']['errors'];

function hasSourceMessage(
  messages: SourceErrorMessages,
  code: string,
): code is keyof SourceErrorMessages {
  return Object.hasOwn(messages, code);
}

export function sourceErrorMessage(error: unknown, messages: Messages): string {
  if (error instanceof ApiError && error.outcomeUnknown)
    return messages.source.outcomeUnknown;
  if (
    error instanceof ApiError &&
    error.kind === 'http' &&
    Check(AnalyzeApiErrorCodeSchema, error.code) &&
    hasSourceMessage(messages.source.errors, error.code)
  )
    return messages.source.errors[error.code];
  return projectErrorMessage(error, 'source', messages.errors);
}
