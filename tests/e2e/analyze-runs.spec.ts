import { expect, test } from '@playwright/test';

// PF03 flow on the fixture runtime: an explicit Start is accepted (202) and
// reaches a terminal state and opens the analysis step (UI04); reloading
// reads the run back without starting another one; a second run can be
// cancelled and stays on the source step.
test(
  'start, finish, reload and cancel an analyze run',
  { tag: '@smoke' },
  async ({ page }, testInfo) => {
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
    // UI04: existing projects are reopened from "Dự án gần đây" (search by
    // name).
    const recent = page.getByRole('complementary', { name: 'Dự án gần đây' });
    await recent.getByLabel('Tìm dự án theo tên').fill(seedName);
    await recent
      .getByRole('link', { name: new RegExp(seedName) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/source$/);
    await expect(
      page.getByRole('heading', { name: 'Đã chọn thư mục' }),
    ).toBeVisible();
    expect(runMutations).toEqual([]);

    const start = page.getByRole('button', { name: 'Quét source' });
    await start.click();
    // UI04: the scan card follows the run, then the analysis step opens.
    await expect(
      page.getByRole('heading', { name: 'Tiến trình' }),
    ).toBeVisible();
    // PF08: the demo run reports simulated per-file progress (labelled DEMO)
    // over the event stream: a share and the latest files read.
    await expect(page.locator('.scan-percent')).toHaveText(/^\s*\d+%$/);
    await expect(
      page.getByRole('heading', { name: /File đang đọc/ }),
    ).toContainText('DEMO');
    await page.screenshot({
      path: testInfo.outputPath('pf08-scanning-vi.png'),
      fullPage: true,
    });
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    expect(runMutations).toHaveLength(1);
    expect(runMutations[0]?.status).toBe(202);
    expect(runMutations[0]?.key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);

    // Back on the source step and after a reload the run is read back; a run
    // that already finished never opens the analysis step by itself.
    await page.goBack();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/source$/);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Xem kết quả lần quét gần nhất' }),
    ).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/\/projects\/[^/]+\/source$/);
    expect(runMutations).toHaveLength(1);

    await start.click();
    await page.getByRole('button', { name: 'Hủy lượt chạy' }).click();
    await expect(
      page.getByRole('heading', { name: 'Đã hủy lượt quét' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chạy lại' })).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/source$/);
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
