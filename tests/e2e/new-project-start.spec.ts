import { expect, test } from '@playwright/test';
import { RunListSchema, RunSchema, type Run } from '@portal/contracts';
import { Check } from 'typebox/value';

test(
  'first Start retries the same intent after losing a committed response, even after the run finishes',
  { tag: '@smoke' },
  async ({ page }) => {
    const sourceRoot = process.env.E2E_ANALYZE_SOURCE_ROOT;
    if (!sourceRoot)
      throw new Error('Run npm run e2e with its isolated fixture source.');
    const posts: { key: string | undefined; body: string | null }[] = [];
    let accepted: Run | undefined;
    let runsUrl = '';
    let authorization = '';
    let creates = 0;
    let registrations = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/projects$/.test(request.url()))
        creates++;
      if (request.method() === 'PUT' && /\/source$/.test(request.url()))
        registrations++;
    });
    await page.route('**/api/v1/local/folder-picker', (route) =>
      route.fulfill({ json: { status: 'selected', path: sourceRoot } }),
    );
    await page.route('**/api/v1/projects/*/runs', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      posts.push({
        key: request.headers()['idempotency-key'],
        body: request.postData(),
      });
      const response = await route.fetch();
      if (posts.length === 1) {
        expect(response.status()).toBe(202);
        const run: unknown = await response.json();
        if (!Check(RunSchema, run)) throw new Error('Invalid committed run.');
        accepted = run;
        runsUrl = request.url();
        authorization = request.headers()['authorization'] ?? '';
        await route.abort('failed');
      } else await route.fulfill({ response });
    });
    await page.goto('/projects/new');
    await page.getByRole('button', { name: 'Chọn thư mục' }).click();
    await page.getByRole('radio', { name: 'VB6' }).check();
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Chưa xác nhận được backend đã nhận yêu cầu chạy',
    );
    await expect(page).toHaveURL(/\/projects\/new$/);
    await expect(page.getByLabel('Tên dự án')).toBeDisabled();
    const first = accepted;
    if (!first || !authorization) throw new Error('No committed Start.');
    // This is the dangerous case: the first run is no longer active, so a
    // different key would successfully create a second one.
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`${runsUrl}/${first.id}`, {
            headers: { authorization },
          });
          const run: unknown = await response.json();
          return Check(RunSchema, run) ? run.status : null;
        },
        { timeout: 20_000 },
      )
      .toBe('succeeded');
    await page.getByRole('button', { name: 'Gửi lại yêu cầu' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/source$/);
    expect(posts).toHaveLength(2);
    expect(posts[0]?.key).toMatch(/^[\w-]{16,}$/);
    expect(posts[1]).toEqual(posts[0]);
    expect(creates).toBe(1);
    expect(registrations).toBe(1);
    const response = await page.request.get(runsUrl, {
      headers: { authorization },
    });
    const history: unknown = await response.json();
    if (!Check(RunListSchema, history)) throw new Error('Invalid run history.');
    expect(history.items.map((run) => run.id)).toEqual([first.id]);
  },
);
