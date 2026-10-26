import { LOCAL_SESSION_PATH, LocalSessionSchema } from '@portal/contracts';
import { defaultFetcher, sendRequest } from './api-client';
import { ApiError } from './api-error';

export type LocalSessionStatus =
  'idle' | 'pending' | 'ready' | 'failed' | 'expired';

// What the API client needs: a credential for one request, and a way to
// drop one the backend rejected (for example after a backend restart).
export type CredentialSource = {
  // The credential already bootstrapped, so a request starts synchronously.
  current: () => string | undefined;
  credential: (signal: AbortSignal) => Promise<string>;
  invalidate: (token: string) => void;
};

export type LocalSessionClient = CredentialSource & {
  getStatus: () => LocalSessionStatus;
  subscribe: (listener: () => void) => () => void;
  retry: () => void;
};

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    // Callers rethrow the signal's own reason via signal.throwIfAborted().
    const abort = () =>
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}

// Trusted bootstrap of the per-process local credential. The token stays in
// memory only: no URL, storage, cookie or log. Concurrent callers share one
// bootstrap, and a caller that aborts does not cancel it for the others, so
// re-renders (StrictMode, locale change) never bootstrap twice.
export function createLocalSession(
  fetcher: typeof fetch = defaultFetcher,
): LocalSessionClient {
  let status: LocalSessionStatus = 'idle';
  let token: string | undefined;
  let pending: Promise<string> | undefined;
  const listeners = new Set<() => void>();
  const setStatus = (next: LocalSessionStatus) => {
    if (status === next) return;
    status = next;
    for (const listener of listeners) listener();
  };
  function bootstrap(): Promise<string> {
    if (pending) return pending;
    setStatus('pending');
    const attempt = sendRequest(
      fetcher,
      LOCAL_SESSION_PATH,
      LocalSessionSchema,
      new AbortController().signal,
      { method: 'POST' },
    ).then(
      (session) => {
        token = session.token;
        pending = undefined;
        setStatus('ready');
        return session.token;
      },
      (error: unknown) => {
        pending = undefined;
        setStatus('failed');
        // The protected request was never sent, so it is not an unknown outcome.
        throw new ApiError(
          'credential',
          'POST',
          error instanceof ApiError ? error.status : undefined,
          error instanceof ApiError ? error.code : undefined,
          error instanceof ApiError ? error.requestId : undefined,
        );
      },
    );
    pending = attempt;
    return attempt;
  }
  return {
    current: () => token,
    credential(signal) {
      if (token !== undefined) return Promise.resolve(token);
      return untilAborted(bootstrap(), signal);
    },
    invalidate(rejected) {
      if (token !== rejected) return;
      token = undefined;
      setStatus('expired');
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retry() {
      if (token !== undefined) return;
      // The failure is kept in the status, which the UI renders.
      bootstrap().catch(() => undefined);
    },
  };
}

export const localSession = createLocalSession();
