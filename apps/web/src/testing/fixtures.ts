import type { LocalSessionClient } from '../shared/api/local-session';
import type { DemoProject, LocalProject } from '@portal/contracts';

export const project: DemoProject = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Dự án mẫu',
  fixtureId: 'sample-vb6',
  mode: 'demo',
  createdAt: '2026-10-15T00:00:00.000Z',
};
export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// A ready local credential without network, for tests about other behavior.
// Session/bootstrap behavior is tested with createLocalSession.
export const testToken = 'T'.repeat(43);
export const testCredentials: LocalSessionClient = {
  current: () => testToken,
  credential: () => Promise.resolve(testToken),
  invalidate: () => undefined,
  getStatus: () => 'ready',
  subscribe: () => () => undefined,
  retry: () => undefined,
};

export function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

export const localProject: LocalProject = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Dự án mã nguồn',
  mode: 'local',
  createdAt: '2026-10-27T00:00:00.000Z',
};
