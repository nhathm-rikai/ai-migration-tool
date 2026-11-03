import { expect, test } from '@playwright/test';

// Projects smoke on the fixture API (UI04): the app opens on step 1 of a
// new project; "Dự án gần đây" finds the seeded project and opens it; reload
// stays on the project's URL; the sidebar picker goes back to a new project.
test(
  'open a project from recent projects, reload it and go back to a new one',
  { tag: '@smoke' },
  async ({ page }) => {
    const seedName = process.env.E2E_SEED_PROJECT_NAME ?? '';
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
    await expect(page).toHaveURL(/\/projects\/new$/);
    await expect(page.getByText('Bước 1 / 5 · Dự án mới')).toBeVisible();
    // UI04: existing projects are reopened from "Dự án gần đây" (search by
    // name).
    const recent = page.getByRole('complementary', { name: 'Dự án gần đây' });
    await recent.getByLabel('Tìm dự án theo tên').fill(seedName);
    const firstCard = recent
      .getByRole('link', { name: new RegExp(seedName) })
      .first();
    await expect(firstCard).toBeVisible();
    await firstCard.hover();
    // The hover lift must stay inside the scrolling list (including its
    // top border), rather than being clipped at the first row.
    await expect
      .poll(async () =>
        firstCard.evaluate((card) => {
          const list = card.closest('.recent-list');
          if (!list) return false;
          return (
            card.getBoundingClientRect().top >= list.getBoundingClientRect().top
          );
        }),
      )
      .toBe(true);
    // Wait for the hover transition before checking the final geometry too.
    await expect(firstCard).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)');
    expect(
      await firstCard.evaluate((card) => {
        const list = card.closest('.recent-list');
        return (
          list !== null &&
          card.getBoundingClientRect().top >= list.getBoundingClientRect().top
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.E2E_OUTPUT_DIR}/ui04-recent-hover.png`,
    });
    await recent
      .getByRole('link', { name: new RegExp(seedName) })
      .first()
      .click();
    await expect(page.getByText(`Bước 1 / 5 · ${seedName}`)).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/source$/);
    const projectUrl = page.url();

    // Reload opens the same project and step.
    await page.reload();
    await expect(page.getByText(`Bước 1 / 5 · ${seedName}`)).toBeVisible();
    expect(page.url()).toBe(projectUrl);

    await page.getByLabel('Dự án', { exact: true }).selectOption('');
    await expect(page).toHaveURL(/\/projects\/new$/);
    await expect(
      page.getByRole('heading', { name: 'Chọn thư mục source' }),
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

// UI01: every step has a URL, an unknown project gets a not-found page,
// keyboard opens steps and reduced motion turns the entrance animation off.
// Steps 3–5 are implemented now, so each opens its own page. Desktop only
// (D7).
test(
  'step URLs, keyboard, not-found and reduced motion',
  { tag: '@smoke' },
  async ({ page }) => {
    const seedName = process.env.E2E_SEED_PROJECT_NAME ?? '';
    let starts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/runs$/.test(request.url()))
        starts++;
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/projects');
    // UI04: existing projects are reopened from "Dự án gần đây" (search by
    // name).
    const recent = page.getByRole('complementary', { name: 'Dự án gần đây' });
    await recent.getByLabel('Tìm dự án theo tên').fill(seedName);
    await recent
      .getByRole('link', { name: new RegExp(seedName) })
      .first()
      .click();
    const steps = page.getByRole('navigation', { name: 'Các bước đánh giá' });
    await expect(
      steps.getByRole('link', { name: /Nạp source/ }),
    ).toHaveAttribute('aria-current', 'step');

    // Keyboard: focus the quote step and open it with Enter.
    await steps.getByRole('link', { name: /Báo giá/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/quote$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Báo giá' }),
    ).toBeVisible();
    await expect(steps.getByRole('link', { name: /Báo giá/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    // Reload stays on the step.
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Báo giá' }),
    ).toBeVisible();
    expect(
      await page
        .locator('.page > *')
        .first()
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none');

    await page.getByRole('radio', { name: '日本語' }).check();
    await expect(
      page.getByRole('heading', { level: 1, name: '見積' }),
    ).toBeVisible();
    // Desktop only (D7): Japanese labels do not overflow at 1280px.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();

    await page.goto('/projects/00000000-0000-4000-8000-00000000dead/analysis');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Không tìm thấy dự án' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Về trang Nạp source' }).click();
    await expect(page).toHaveURL(/\/projects\/new$/);
    expect(starts).toBe(0);
  },
);
