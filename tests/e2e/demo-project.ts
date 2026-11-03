import type { Page } from '@playwright/test';
import { ProjectSchema } from '@portal/contracts';
import { Check } from 'typebox/value';

// The UI no longer creates demo projects (UI04, 02/11/2026): specs that run
// on the bundled fixture create one through the API, with the credential the
// page itself bootstraps on its trusted origin, then open its step 1.
export async function openNewDemoProject(
  page: Page,
  name: string,
): Promise<string> {
  await page.goto('/');
  const project: unknown = await page.evaluate(async (projectName) => {
    const session = await fetch('/api/v1/session', { method: 'POST' });
    const { token } = (await session.json()) as { token: string };
    const created = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: projectName, fixtureId: 'sample-vb6' }),
    });
    return (await created.json()) as unknown;
  }, name);
  if (!Check(ProjectSchema, project) || project.mode !== 'demo')
    throw new Error('Demo project was not created.');
  await page.goto(`/projects/${project.id}/source`);
  return project.id;
}
