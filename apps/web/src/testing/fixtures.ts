import type { Project } from '@portal/contracts';

export const project: Project = {
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
