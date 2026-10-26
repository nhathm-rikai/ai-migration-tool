// `credential`: the local credential bootstrap failed, so the request itself
// was never sent.
export type ApiFailureKind =
  'http' | 'network' | 'timeout' | 'invalid-response' | 'credential';
export type ApiMethod = 'GET' | 'POST';

export class ApiError extends Error {
  readonly outcomeUnknown: boolean;

  constructor(
    readonly kind: ApiFailureKind,
    readonly method: ApiMethod,
    readonly status?: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(`API ${kind} failure`);
    this.name = 'ApiError';
    // A lost/invalid success response or a server failure can follow a committed write.
    this.outcomeUnknown =
      method === 'POST' &&
      kind !== 'credential' &&
      !(
        kind === 'http' &&
        status !== undefined &&
        status >= 400 &&
        status < 500
      );
  }
}
