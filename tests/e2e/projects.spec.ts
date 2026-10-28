import { expect, test } from '@playwright/test';

// Projects smoke on the fixture API: list the seeded project, create one in
// the UI, then reload the browser and reopen it from the list.
test(
  'create, list and reopen a project',
  { tag: '@smoke' },
  async ({ page }) => {
    const seedName = process.env.E2E_SEED_PROJECT_NAME ?? '';
    const name = `E2E project ${Date.now()}`;
    // The UI bootstraps a local credential through the preview proxy and
    // sends it only in the Authorization header.
    const tokens = new Set<string>();
    const apiRequests: { url: string; authorization: string | null }[] = [];
    page.on('response', async (response) => {
      if (!response.url().endsWith('/api/v1/session')) return;
      const body: unknown = await response.json().catch(() => null);
      if (
        typeof body === 'object' &&
        body !== null &&
        'token' in body &&
        typeof body.token === 'string'
      )
        tokens.add(body.token);
    });
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/projects'))
        apiRequests.push({
          url,
          authorization: request.headers()['authorization'] ?? null,
        });
    });

    await page.goto('/');
    const projects = page.getByRole('navigation', { name: 'Cây dự án' });
    await expect(
      projects.getByRole('button', { name: seedName }),
    ).toBeVisible();

    await page.getByLabel('Tên dự án').fill(name);
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await expect(page.getByText('Đã tạo dự án.')).toBeVisible();
    await expect(projects.getByRole('button', { name })).toBeVisible();

    await page.reload();
    await projects.getByRole('button', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(
      projects.getByRole('button', { name: seedName }),
    ).toBeVisible();

    expect(tokens.size).toBe(1);
    const [token] = [...tokens];
    expect(apiRequests.length).toBeGreaterThan(0);
    for (const request of apiRequests) {
      expect(request.authorization).toBe(`Bearer ${token}`);
      expect(request.url).not.toContain(token);
    }
    expect(page.url()).not.toContain(token);
  },
);
