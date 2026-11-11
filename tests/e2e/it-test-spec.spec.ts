import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; run npm run e2e.`);
  return value;
};

// TC02-AC05: step 3 generates the integration test specification (fake
// runner, no AI), step 4 shows it and the Japanese Excel downloads. The
// workbook is kept under test-results/tc02-demo for a human check.
test(
  'step 3 generates the integration test specification and step 4 downloads its Excel',
  { tag: '@smoke' },
  async ({ page }) => {
    const sourceRoot = required('E2E_ANALYZE_SOURCE_ROOT');
    await page.route('**/api/v1/local/folder-picker', async (route) => {
      await route.fulfill({
        json: { status: 'selected', path: sourceRoot },
        headers: { 'cache-control': 'no-store' },
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Chọn thư mục' }).click();
    await page.getByLabel('Tên dự án').fill(`TC02 ${Date.now()}`);
    await page.getByRole('radio', { name: 'VB6' }).check();
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });

    const assessment = page.getByRole('region', { name: 'Đánh giá tổng quan' });
    await assessment.getByRole('tab', { name: /^Danh sách program/ }).click();
    await assessment.getByRole('button', { name: 'SAMPLE' }).click();
    await page
      .getByRole('link', { name: /Tạo tài liệu cho program này/ })
      .click();

    await expect(page).toHaveURL(/\/documents\?program=/);
    await page.getByRole('checkbox', { name: /Test case IT/ }).check();
    await page.getByRole('button', { name: 'Bắt đầu generate' }).click();
    await expect(page.getByText(/Đã tạo xong/)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('link', { name: 'Sang review' }).click();

    await expect(page).toHaveURL(/\/review/);
    await page.getByText('Test case IT').first().click();
    const button = page.getByRole('button', {
      name: 'Tải Excel (結合テスト仕様書)',
    });
    await expect(button).toBeEnabled({ timeout: 10_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^結合テスト仕様書_.+\.xlsx$/);
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    for (const sheet of [1, 2, 3])
      expect(
        bytes.includes(Buffer.from(`xl/worksheets/sheet${sheet}.xml`)),
      ).toBe(true);
    expect(bytes.includes(Buffer.from('xl/worksheets/sheet4.xml'))).toBe(false);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await mkdir('test-results/tc02-demo', { recursive: true });
    await writeFile('test-results/tc02-demo/it-test-spec-demo.xlsx', bytes);
  },
);
