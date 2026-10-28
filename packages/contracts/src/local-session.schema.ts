import { Type, type Static } from 'typebox';

// Local request protection (B01/F00). The trusted UI bootstraps a per-process
// credential from POST /api/v1/session and sends it only in the Authorization
// header. Never put it in a URL, query string, cookie or log.
export const LOCAL_SESSION_PATH = '/api/v1/session';
export const LOCAL_CREDENTIAL_SCHEME = 'Bearer';
// 32 random bytes in base64url without padding.
export const LOCAL_CREDENTIAL_LENGTH = 43;

export const LocalCredentialSchema = Type.String({
  minLength: LOCAL_CREDENTIAL_LENGTH,
  maxLength: LOCAL_CREDENTIAL_LENGTH,
  pattern: '^[A-Za-z0-9_-]+$',
});
export const LocalSessionSchema = Type.Object(
  { token: LocalCredentialSchema },
  { additionalProperties: false },
);
export type LocalSession = Static<typeof LocalSessionSchema>;
