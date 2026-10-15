import { ErrorResponseSchema } from '@portal/contracts';
import type { Static, TSchema } from 'typebox';
import { Check } from 'typebox/value';
import { ApiError, type ApiMethod } from './api-error';

export const API_REQUEST_TIMEOUT_MS = 15_000;
const API_BASE_PATH = '/api/v1';

export function createApiClient(
  fetcher: typeof fetch = (input, init) => fetch(input, init),
) {
  return async function request<T extends TSchema>(
    path: string,
    schema: T,
    signal: AbortSignal,
    options: { method?: ApiMethod; body?: unknown } = {},
  ): Promise<Static<T>> {
    signal.throwIfAborted();
    const method = options.method ?? 'GET';
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, API_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(API_BASE_PATH + path, {
        method,
        signal: controller.signal,
        ...(options.body !== undefined
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(options.body),
            }
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
  };
}
