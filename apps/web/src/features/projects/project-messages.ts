import { ApiErrorCodeSchema } from '@portal/contracts';
import { Check } from 'typebox/value';
import { ApiError } from '../../shared/api/api-error';
import type { Messages } from '../../shared/i18n/vi';

export type ProjectOperation = keyof Messages['errors']['invalidInput'];

export function projectErrorMessage(
  error: unknown,
  operation: ProjectOperation,
  messages: Messages['errors'],
): string {
  if (!(error instanceof ApiError)) return messages.unexpected;
  if (error.outcomeUnknown) return messages.outcomeUnknown;
  if (error.kind === 'http' && Check(ApiErrorCodeSchema, error.code)) {
    return error.code === 'INVALID_INPUT'
      ? messages.invalidInput[operation]
      : messages.http[error.code];
  }
  return messages.failure[error.kind];
}
