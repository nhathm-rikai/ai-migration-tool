import { useSyncExternalStore } from 'react';
import type { LocalSessionClient } from '../shared/api/local-session';
import { useLocale } from '../shared/i18n/locale-context';

// Bootstrap state of the local credential. Reading it never starts a
// bootstrap; requests and the explicit retry button do.
export function SessionStatus({ session }: { session: LocalSessionClient }) {
  const { messages } = useLocale();
  const copy = messages.app.session;
  const status = useSyncExternalStore(session.subscribe, session.getStatus);
  if (status === 'pending')
    return (
      <p role="status" className="session-status">
        {copy.pending}
      </p>
    );
  if (status === 'expired')
    return (
      <p role="status" className="session-status">
        {copy.expired}
      </p>
    );
  if (status !== 'failed') return null;
  return (
    <div className="session-status">
      <p role="alert" className="error">
        {copy.failed}
      </p>
      <button className="button small" onClick={session.retry}>
        {copy.retry}
      </button>
    </div>
  );
}
