import { expect, test } from '@playwright/test';
import { syntheticCorpusFixture } from '@portal/contracts/fixtures';

// UI04: the call graph tab of one program's detail lays out its procedures,
// the shared procedures they call and the tables they access with ELK in a
// Web Worker (no fallback), and focusing a procedure lists its relations.
// The demo run's inventory is swapped for a synthetic corpus (generated,
// not customer source) on the way to the browser.
test(
  'program detail draws the procedure call graph',
  { tag: '@smoke' },
  async ({ page }, testInfo) => {
    const corpus = syntheticCorpusFixture({
      programs: 20,
      sharedModules: 6,
      tables: 12,
      folders: 2,
    });
    await page.route(/\/artifacts\/[^/]+\/versions\/\d+$/, async (route) => {
      const response = await route.fetch();
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) throw new Error('body');
      await route.fulfill({ response, json: { ...body, payload: corpus } });
    });
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));

    await page.goto('/');
    await page.getByLabel('Tên dự án').fill(`UI04 graph ${Date.now()}`);
    await page.getByRole('radio', { name: /Demo với dữ liệu mẫu/ }).check();
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    const panel = page.getByRole('region', { name: /Phân tích \(demo\)/ });
    await panel.getByRole('button', { name: 'Bắt đầu phân tích' }).click();
    await expect(
      panel.getByRole('status').filter({ hasText: 'Hoàn tất (demo)' }),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Xem kết quả phân tích' }).click();
    const assessment = page.getByRole('region', { name: 'Đánh giá tổng quan' });
    await assessment.getByLabel('Tìm program').fill('F000000');
    await assessment.getByRole('button', { name: 'F000000' }).click();
    const detail = assessment.getByRole('region', {
      name: 'Chi tiết program F000000',
    });
    await detail.getByRole('tab', { name: 'Sơ đồ gọi' }).click();

    const canvas = detail.getByRole('group', {
      name: 'Sơ đồ gọi giữa các procedure',
    });
    // The tab loads its libraries first, then lays out in the worker.
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    await expect(canvas.getByText('Đang sắp xếp sơ đồ…')).toBeHidden({
      timeout: 20_000,
    });
    await expect(canvas.getByText('Không sắp xếp được')).toHaveCount(0);
    expect(workers.some((url) => /worker/i.test(url))).toBe(true);
    const load = canvas.getByRole('button', {
      name: 'Làm nổi bật Sub Form_Load',
    });
    await expect(load).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Làm nổi bật Function Cmn00Run' }),
    ).toBeVisible();

    // Form_Load sits left of the shared procedure it calls.
    const from = await load.boundingBox();
    const to = await canvas
      .getByRole('button', { name: 'Làm nổi bật Function Cmn00Run' })
      .boundingBox();
    if (!from || !to) throw new Error('nodes not drawn');
    expect(from.x).toBeLessThan(to.x);

    await load.click();
    const card = detail.getByRole('complementary', {
      name: 'Procedure đang chọn',
    });
    await expect(card.getByText('Gọi tới')).toBeVisible();
    await expect(card.getByText('Bảng truy cập')).toBeVisible();
    await expect(
      card.getByRole('button', { name: /Cmn00Run/ }).first(),
    ).toBeVisible();
    await detail.screenshot({ path: testInfo.outputPath('ui04-detail.png') });
  },
);
