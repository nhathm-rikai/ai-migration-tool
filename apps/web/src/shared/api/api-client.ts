import {
  ErrorResponseSchema,
  LOCAL_CREDENTIAL_SCHEME,
} from '@portal/contracts';
import type { Static, TSchema } from 'typebox';
import { Check } from 'typebox/value';
import { ApiError, type ApiMethod } from './api-error';
import type { CredentialSource } from './local-session';

export const API_REQUEST_TIMEOUT_MS = 15_000;
// Building a large report takes longer than a JSON read.
export const DOWNLOAD_TIMEOUT_MS = 60_000;
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
    // Longer than the default only for a request that waits on a person
    // (the native folder dialog).
    timeoutMs?: number;
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
  }, options.timeoutMs ?? API_REQUEST_TIMEOUT_MS);
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

export type Download = { blob: Blob; fileName: string | null };

// What a file answer must be before it is handed on: its media type, and
// optionally a check of the bytes. A 200 that is something else (an HTML
// page from a proxy, a truncated body) is an invalid response, not a file.
export type DownloadExpectation = {
  mediaType: string;
  isValid?: (blob: Blob) => Promise<boolean>;
  timeoutMs?: number;
};

const mediaTypeOf = (header: string | null) =>
  (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

// File name of a Content-Disposition header: `filename*` (RFC 5987, UTF-8)
// wins over the ASCII `filename`.
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // Fall through to the plain filename.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/i.exec(header);
  return plain?.[1] ?? null;
}

// One file download: like sendRequest (timeout including the body read,
// caller cancellation, error envelope validation) but the success body is
// kept as a Blob. Nothing is saved here.
export async function sendDownload(
  fetcher: typeof fetch,
  url: string,
  signal: AbortSignal,
  options: { headers: Record<string, string> } & DownloadExpectation,
): Promise<Download> {
  signal.throwIfAborted();
  const method = 'GET';
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      method,
      signal: controller.signal,
      headers: options.headers,
    });
    signal.throwIfAborted();
    if (!response.ok) {
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        // A non-JSON error page still has HTTP semantics.
      }
      signal.throwIfAborted();
      if (Check(ErrorResponseSchema, value))
        throw new ApiError(
          'http',
          method,
          response.status,
          value.error.code,
          value.error.requestId,
        );
      throw new ApiError('http', method, response.status);
    }
    if (
      mediaTypeOf(response.headers.get('content-type')) !==
      options.mediaType.toLowerCase()
    )
      throw new ApiError('invalid-response', method, response.status);
    const blob = await response.blob();
    signal.throwIfAborted();
    if (timedOut) throw new ApiError('timeout', method);
    if (options.isValid && !(await options.isValid(blob)))
      throw new ApiError('invalid-response', method, response.status);
    signal.throwIfAborted();
    return {
      blob,
      fileName: fileNameFromDisposition(
        response.headers.get('content-disposition'),
      ),
    };
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
// invalidated; a GET is retried once with a fresh one, a mutation never is.
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
  // Sends with the current credential; a rejected one is invalidated and a
  // GET is retried once with a fresh one, a mutation never is.
  async function withCredential<R>(
    method: ApiMethod,
    signal: AbortSignal,
    send: (token: string) => Promise<R>,
  ): Promise<R> {
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
  }
  async function request<T extends TSchema>(
    path: string,
    schema: T,
    signal: AbortSignal,
    options: {
      method?: ApiMethod;
      body?: unknown;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {},
  ): Promise<Static<T>> {
    const method = options.method ?? 'GET';
    return withCredential(method, signal, (token) =>
      sendRequest(fetcher, API_BASE_PATH + path, schema, signal, {
        method,
        body: options.body,
        ...(options.timeoutMs === undefined
          ? {}
          : { timeoutMs: options.timeoutMs }),
        headers: {
          ...options.headers,
          Authorization: `${LOCAL_CREDENTIAL_SCHEME} ${token}`,
        },
      }),
    );
  }
  // GET of a file: same credential handling as `request`.
  function download(
    path: string,
    signal: AbortSignal,
    expected: DownloadExpectation,
  ) {
    return withCredential('GET', signal, (token) =>
      sendDownload(fetcher, API_BASE_PATH + path, signal, {
        headers: { Authorization: `${LOCAL_CREDENTIAL_SCHEME} ${token}` },
        ...expected,
      }),
    );
  }
  return Object.assign(request, { download });
}
