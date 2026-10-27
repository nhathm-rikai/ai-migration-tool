import { expect, test } from '@playwright/test';

// Projects smoke on the fixture API: list the seeded project, create one in
// the UI, then reload the browser and reopen it from the list.
test(
  'create, list and reopen a project',
  { tag: '@smoke' },
  async ({ page }) => {
    const seedName = process.env.E2E_SEED_PROJECT_NAME ?? '';
    const name = `E2E project ${Date.now()}`;

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
  },
);
