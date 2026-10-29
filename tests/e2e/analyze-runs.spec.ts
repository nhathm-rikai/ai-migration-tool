import { expect, test } from '@playwright/test';

// PF03 flow on the fixture runtime: an explicit Start is accepted (202) and
// reaches a terminal state; reloading reads the run back without starting
// another one; a second run can be cancelled.
test(
  'start, finish, reload and cancel an analyze run',
  { tag: '@smoke' },
  async ({ page }) => {
    const seedName = process.env.E2E_SEED_PROJECT_NAME ?? '';
    const runMutations: { url: string; status: number; key: string | null }[] =
      [];
    page.on('response', (response) => {
      const request = response.request();
      if (request.method() === 'POST' && request.url().includes('/runs'))
        runMutations.push({
          url: request.url(),
          status: response.status(),
          key: request.headers()['idempotency-key'] ?? null,
        });
    });

    await page.goto('/');
    const projects = page.getByRole('navigation', { name: 'Danh sách dự án' });
    await projects.getByRole('link', { name: seedName }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/source$/);
    const panel = page.getByRole('region', { name: /Phân tích \(demo\)/ });
    await expect(panel.getByText('Chưa có lượt chạy nào')).toBeVisible();
    expect(runMutations).toEqual([]);

    await panel.getByRole('button', { name: 'Bắt đầu phân tích' }).click();
    // The stage is shown instead of a percentage while it runs.
    await expect(panel.getByText('Bước hiện tại')).toBeVisible();
    await expect(
      panel.getByRole('status').filter({ hasText: 'Hoàn tất (demo)' }),
    ).toBeVisible();
    expect(runMutations).toHaveLength(1);
    expect(runMutations[0]?.status).toBe(202);
    expect(runMutations[0]?.key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);

    // Reload stays on the project's source step and reads the run back.
    await page.reload();
    await expect(
      panel.getByRole('status').filter({ hasText: 'Hoàn tất (demo)' }),
    ).toBeVisible();
    await expect(panel.locator('.run-history > li')).toHaveCount(1);
    expect(runMutations).toHaveLength(1);

    await panel.getByRole('button', { name: 'Bắt đầu phân tích' }).click();
    await panel.getByRole('button', { name: 'Hủy lượt chạy' }).click();
    await expect(
      panel.getByRole('status').filter({ hasText: 'Đã hủy' }),
    ).toBeVisible();
    await expect(panel.locator('.run-history > li')).toHaveCount(2);
    const [first, second, ...cancels] = runMutations;
    expect([first?.status, second?.status]).toEqual([202, 202]);
    // A cancel sent with the version shown right after Start may meet a run
    // that just started (409); the UI re-reads it and cancels once more.
    expect(cancels.length).toBeGreaterThanOrEqual(1);
    expect(cancels.length).toBeLessThanOrEqual(2);
    for (const cancel of cancels) expect(cancel.url).toMatch(/\/cancel$/);
    expect([200, 202]).toContain(cancels.at(-1)?.status);
    expect(runMutations[1]?.key).not.toBe(runMutations[0]?.key);
  },
);
