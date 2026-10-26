import {
  ErrorResponseSchema,
  LOCAL_CREDENTIAL_SCHEME,
} from '@portal/contracts';
import type { Static, TSchema } from 'typebox';
import { Check } from 'typebox/value';
import { ApiError, type ApiMethod } from './api-error';
import type { CredentialSource } from './local-session';

export const API_REQUEST_TIMEOUT_MS = 15_000;
const API_BASE_PATH = '/api/v1';

export const defaultFetcher: typeof fetch = (input, init) => fetch(input, init);

// One HTTP exchange: timeout including the body read, caller cancellation,
// and validation of success/error bodies from unknown. No retry here.
export async function sendRequest<T extends TSchema>(
  fetcher: typeof fetch,
  url: string,
  schema: T,
  signal: AbortSignal,
  options: {
    method: ApiMethod;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<Static<T>> {
  signal.throwIfAborted();
  const { method } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);
  try {
    const headers = {
      ...options.headers,
      ...(options.body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    };
    const response = await fetcher(url, {
      method,
      signal: controller.signal,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
    signal.throwIfAborted();
    let value: unknown;
    try {
      value = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (response.ok)
        throw new ApiError('invalid-response', method, response.status);
      // A non-JSON proxy/error page still has HTTP semantics; never render its body.
    }
    signal.throwIfAborted();
    if (timedOut) throw new ApiError('timeout', method);
    if (!response.ok) {
      if (Check(ErrorResponseSchema, value)) {
        throw new ApiError(
          'http',
          method,
          response.status,
          value.error.code,
          value.error.requestId,
        );
      }
      throw new ApiError('http', method, response.status);
    }
    if (!Check(schema, value))
      throw new ApiError('invalid-response', method, response.status);
    return value;
  } catch (error) {
    signal.throwIfAborted();
    if (timedOut) throw new ApiError('timeout', method);
    if (error instanceof ApiError) throw error;
    throw new ApiError('network', method);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

function isCredentialRejected(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.code === 'CREDENTIAL_INVALID'
  );
}

// Protected API transport: the credential goes only in the Authorization
// header, and nothing is sent without one. A rejected credential is
// invalidated; a GET is retried once with a fresh one, a POST never is.
export function createApiClient(
  credentials: CredentialSource,
  fetcher: typeof fetch = defaultFetcher,
) {
  async function authorize(signal: AbortSignal, method: ApiMethod) {
    try {
      return await credentials.credential(signal);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ApiError && error.kind === 'credential') throw error;
      throw new ApiError('credential', method);
    }
  }
  return async function request<T extends TSchema>(
    path: string,
    schema: T,
    signal: AbortSignal,
    options: { method?: ApiMethod; body?: unknown } = {},
  ): Promise<Static<T>> {
    const method = options.method ?? 'GET';
    const send = (token: string) =>
      sendRequest(fetcher, API_BASE_PATH + path, schema, signal, {
        method,
        body: options.body,
        headers: { Authorization: `${LOCAL_CREDENTIAL_SCHEME} ${token}` },
      });
    const token = credentials.current() ?? (await authorize(signal, method));
    try {
      return await send(token);
    } catch (error) {
      if (!isCredentialRejected(error)) throw error;
      credentials.invalidate(token);
      if (method !== 'GET') throw error;
    }
    // One GET retry only; a credential it also has rejected is dropped too.
    const retryToken = await authorize(signal, method);
    try {
      return await send(retryToken);
    } catch (error) {
      if (isCredentialRejected(error)) credentials.invalidate(retryToken);
      throw error;
    }
  };
}
