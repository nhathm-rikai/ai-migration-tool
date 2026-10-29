import { expect, test } from '@playwright/test';

// Projects smoke on the fixture API: list the seeded project, create one in
// the UI, reload on the project's URL, then reopen it from the list.
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
    await expect(page).toHaveURL(/\/projects$/);
    const projects = page.getByRole('navigation', { name: 'Danh sách dự án' });
    await expect(projects.getByRole('link', { name: seedName })).toBeVisible();

    await page.getByLabel('Tên dự án').fill(name);
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await expect(page.getByText('Đã tạo dự án.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/source$/);
    const projectUrl = page.url();

    // Reload opens the same project and step.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    expect(page.url()).toBe(projectUrl);

    await page.getByLabel('Dự án', { exact: true }).selectOption('');
    await expect(page).toHaveURL(/\/projects$/);
    await expect(projects.getByRole('link', { name: seedName })).toBeVisible();
    await projects.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

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

// UI01: every step has a URL, steps 3–5 say why they are unavailable, an
// unknown project gets a not-found page, keyboard opens steps and reduced
// motion turns the entrance animation off.
test(
  'step URLs, unavailable steps, not-found and reduced motion',
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
    await page
      .getByRole('navigation', { name: 'Danh sách dự án' })
      .getByRole('link', { name: seedName })
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
      page.getByRole('heading', { name: 'Chưa khả dụng' }),
    ).toBeVisible();
    await expect(steps.getByRole('link', { name: /Báo giá/ })).toContainText(
      'Chưa khả dụng',
    );
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Chưa khả dụng' }),
    ).toBeVisible();
    expect(
      await page
        .locator('.page > *')
        .first()
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none');

    await page.getByRole('radio', { name: '日本語' }).check();
    await expect(
      page.getByRole('heading', { name: 'まだ利用できません' }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/projects/00000000-0000-4000-8000-00000000dead/analysis');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Không tìm thấy dự án' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Về danh sách dự án' }).click();
    await expect(page).toHaveURL(/\/projects$/);
    expect(starts).toBe(0);
  },
);
