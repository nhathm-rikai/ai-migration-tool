import { expect, test } from '@playwright/test';
import { syntheticCorpusFixture } from '@portal/contracts/fixtures';

// UI03-AC03/AC04: the call graph of a synthetic corpus (~300 programs, 30
// shared modules, 200 tables; generated, not customer source) is laid out
// in a Web Worker while the page keeps answering input, and changing the
// focused node repaints in under 300 ms. The demo run's inventory is
// swapped for the corpus on the way to the browser.
const FOCUS_BUDGET_MS = 300;
const LONG_TASK_BUDGET_MS = 500;

test(
  'call graph lays out a large corpus without freezing the page',
  {
    tag: '@smoke',
  },
  async ({ page }, testInfo) => {
    const corpus = syntheticCorpusFixture({
      programs: 300,
      sharedModules: 30,
      tables: 200,
      folders: 10,
      components: 8,
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
    await page.getByLabel('Tên dự án').fill(`UI03 graph ${Date.now()}`);
    await page.getByRole('radio', { name: /Demo với dữ liệu mẫu/ }).check();
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    const panel = page.getByRole('region', { name: /Phân tích \(demo\)/ });
    await panel.getByRole('button', { name: 'Bắt đầu phân tích' }).click();
    await expect(
      panel.getByRole('status').filter({ hasText: 'Hoàn tất (demo)' }),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Xem kết quả phân tích' }).click();
    const assessment = page.getByRole('region', { name: 'Đánh giá tổng quan' });
    await expect(assessment.getByTestId('unique-code-lines')).toBeVisible();

    // Main-thread stalls from opening the tab until the graph is drawn.
    await page.evaluate(() => {
      const tasks: number[] = [];
      Object.defineProperty(window, 'portalLongTasks', { value: tasks });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) tasks.push(entry.duration);
      }).observe({ type: 'longtask' });
    });
    await assessment.getByRole('tab', { name: /^Call graph/ }).click();
    const canvas = assessment.getByRole('group', {
      name: 'Call graph toàn dự án',
    });
    // The node table's search answers while the layout runs.
    await assessment.getByText('Bảng node (thay cho graph)').click();
    const search = assessment.getByLabel('Tìm node');
    await search.fill('Cmn05');
    await expect(search).toHaveValue('Cmn05');
    await expect(assessment.getByText(/^1 \/ \d+ node$/)).toBeVisible();
    await expect(canvas.getByText('Đang sắp xếp graph…')).toBeHidden({
      timeout: 20_000,
    });
    await expect(canvas.getByText('Không sắp xếp được')).toHaveCount(0);
    const node = canvas.getByRole('button', {
      name: 'Làm nổi bật Dùng chung Cmn05.bas',
    });
    await expect(node).toBeVisible();
    expect(workers.some((url) => /worker/i.test(url))).toBe(true);
    const longTasks = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'portalLongTasks');
      return Array.isArray(value)
        ? value.filter((item): item is number => typeof item === 'number')
        : [];
    });
    // Layout runs in the worker; what is left on the page (drawing the
    // graph) must not freeze it for long.
    expect(Math.max(0, ...longTasks)).toBeLessThan(LONG_TASK_BUDGET_MS);
    testInfo.annotations.push({
      type: 'long tasks (ms)',
      description: longTasks.map((value) => Math.round(value)).join(', '),
    });

    // Focus change: click to the next painted frame.
    const elapsed = await node.evaluate(async (element) => {
      const start = performance.now();
      if (element instanceof HTMLElement) element.click();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const canvasElement = element.closest('.dep-graph-canvas');
      if (!canvasElement?.classList.contains('has-focus'))
        throw new Error('focus not applied');
      return performance.now() - start;
    });
    testInfo.annotations.push({
      type: 'focus change (ms)',
      description: String(Math.round(elapsed)),
    });
    expect(elapsed).toBeLessThan(FOCUS_BUDGET_MS);
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await expect(
      assessment.getByRole('region', { name: 'Node đang chọn' }),
    ).toContainText('Cmn05.bas');
    await page.screenshot({
      path: testInfo.outputPath('ui03-call-graph-vi.png'),
      fullPage: true,
    });

    // Keyboard: Escape clears; the table's focus button works from the keys.
    await node.focus();
    await page.keyboard.press('Escape');
    await expect(node).toHaveAttribute('aria-pressed', 'false');
    const focusButton = assessment
      .getByRole('table')
      .getByRole('button', { name: 'Làm nổi bật Dùng chung Cmn05.bas' });
    await focusButton.focus();
    await page.keyboard.press('Enter');
    await expect(focusButton).toHaveAttribute('aria-pressed', 'true');
    // The table brings the node into view.
    await expect(node).toBeInViewport();
    await canvas.screenshot({ path: testInfo.outputPath('ui03-focus.png') });

    // Reduced motion: the related edges stop their dash animation.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animation = await canvas
      .locator('.react-flow__edge.linked path.react-flow__edge-path')
      .first()
      .evaluate((path) => getComputedStyle(path).animationName);
    expect(animation).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.getByRole('radio', { name: '日本語' }).check();
    await expect(
      page.getByRole('group', { name: 'プロジェクト全体のコールグラフ' }),
    ).toBeVisible();
    await expect(page.getByText('共通モジュール（ファンイン）')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('ui03-call-graph-ja.png'),
      fullPage: true,
    });
  },
);

// Review regression: when the ELK worker script cannot load, the graph
// leaves "laying out", says so and is drawn in simple lanes.
test(
  'call graph falls back to simple lanes when the layout worker fails to load',
  { tag: '@smoke' },
  async ({ page }) => {
    await page
      .context()
      .route(/elk-worker[^/]*\.js/, (route) => route.abort('failed'));
    await page.goto('/');
    await page.getByLabel('Tên dự án').fill(`UI03 fallback ${Date.now()}`);
    await page.getByRole('radio', { name: /Demo với dữ liệu mẫu/ }).check();
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    const panel = page.getByRole('region', { name: /Phân tích \(demo\)/ });
    await panel.getByRole('button', { name: 'Bắt đầu phân tích' }).click();
    await expect(
      panel.getByRole('status').filter({ hasText: 'Hoàn tất (demo)' }),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Xem kết quả phân tích' }).click();
    const assessment = page.getByRole('region', { name: 'Đánh giá tổng quan' });
    await assessment.getByRole('tab', { name: /^Call graph/ }).click();
    const canvas = assessment.getByRole('group', {
      name: 'Call graph toàn dự án',
    });
    await expect(canvas.getByText(/Không sắp xếp được graph/)).toBeVisible();
    await expect(canvas.getByText('Đang sắp xếp graph…')).toHaveCount(0);
    const node = canvas.getByRole('button', { name: /^Làm nổi bật Program / });
    await node.first().click();
    await expect(node.first()).toHaveAttribute('aria-pressed', 'true');
  },
);
