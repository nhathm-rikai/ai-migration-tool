import { expect, test } from '@playwright/test';
import { openNewDemoProject } from './demo-project.js';
import { syntheticCorpusFixture } from '@portal/contracts/fixtures';

// UI03-EXT01: the call graph tab of one program's detail lays out its procedures,
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

    await openNewDemoProject(page, `UI03-EXT01 graph ${Date.now()}`);
    // UI04: Start on the scan card; the analysis step opens by itself.
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
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
    // The view zooms to the procedure and what it calls: all inside the
    // canvas.
    await expect
      .poll(async () => {
        const area = await canvas.boundingBox();
        const boxes = await Promise.all(
          [load, canvas.getByRole('button', { name: /Cmn00Run/ })].map((node) =>
            node.boundingBox(),
          ),
        );
        return (
          area !== null &&
          boxes.every(
            (box) =>
              box !== null &&
              box.x >= area.x - 1 &&
              box.y >= area.y - 1 &&
              box.x + box.width <= area.x + area.width + 1 &&
              box.y + box.height <= area.y + area.height + 1,
          )
        );
      })
      .toBe(true);
    const card = detail.getByRole('complementary', {
      name: 'Procedure đang chọn',
    });
    await expect(card.getByText('Gọi tới')).toBeVisible();
    await expect(card.getByText('Bảng truy cập')).toBeVisible();
    await expect(
      card.getByRole('button', { name: /Cmn00Run/ }).first(),
    ).toBeVisible();
    await detail.screenshot({ path: testInfo.outputPath('ui04-detail.png') });

    // Picked from the search, the node is shown at full size: its kind,
    // file and name all fit inside it (nothing clipped).
    await detail.getByLabel('Tìm procedure, API, bảng').fill('Cmn00Run');
    await detail
      .getByRole('list', { name: 'Kết quả tìm' })
      .getByRole('button', { name: /Cmn00Run/ })
      .click();
    const shared = canvas.getByRole('button', {
      name: 'Làm nổi bật Function Cmn00Run',
    });
    await page.waitForTimeout(400);
    const fits = await shared.evaluate((button) => {
      const box = button.getBoundingClientRect();
      return [...button.querySelectorAll('span')].every((span) => {
        const inner = span.getBoundingClientRect();
        return inner.top >= box.top - 0.5 && inner.bottom <= box.bottom + 0.5;
      });
    });
    expect(fits).toBe(true);
    await shared.screenshot({ path: testInfo.outputPath('ui04-node.png') });

    // Full screen over the page; Escape clears the focus, then leaves.
    await detail.getByRole('button', { name: 'Xem toàn màn hình' }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Sơ đồ gọi giữa các procedure',
    });
    await expect(dialog).toBeVisible();
    const viewport = page.viewportSize();
    const frame = await dialog.boundingBox();
    if (!viewport || !frame) throw new Error('no box');
    expect(frame.width).toBeGreaterThan(viewport.width - 40);
    // A modal: focus moves in and stays in; the page behind is inert.
    await expect(dialog.getByLabel('Tìm procedure, API, bảng')).toBeFocused();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab');
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') !== null,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.getElementById('root')?.inert),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
      detail.getByRole('button', { name: 'Xem toàn màn hình' }),
    ).toBeFocused();
  },
);
