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
    // The search answers while the layout runs.
    const search = assessment.getByLabel('Tìm program, module, bảng');
    await search.fill('Cmn05');
    await expect(search).toHaveValue('Cmn05');
    await expect(
      assessment
        .getByRole('list', { name: 'Kết quả tìm' })
        .getByRole('button', { name: /Cmn05\.bas/ }),
    ).toBeVisible();
    await search.fill('');
    await expect(canvas.getByText('Đang sắp xếp graph…')).toBeHidden({
      timeout: 20_000,
    });
    await expect(canvas.getByText('Không sắp xếp được')).toHaveCount(0);
    const node = canvas.getByRole('button', {
      name: 'Làm nổi bật Dùng chung Cmn05.bas',
    });
    await expect(node).toBeVisible();
    await canvas.screenshot({ path: testInfo.outputPath('ui03-overview.png') });
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

    // Keyboard: Escape clears; a search result picked with Enter focuses the
    // node again and brings it into view.
    await node.focus();
    await page.keyboard.press('Escape');
    await expect(node).toHaveAttribute('aria-pressed', 'false');
    await search.fill('Cmn05');
    const result = assessment
      .getByRole('list', { name: 'Kết quả tìm' })
      .getByRole('button', { name: /Cmn05\.bas/ });
    await result.focus();
    await page.keyboard.press('Enter');
    await expect(node).toHaveAttribute('aria-pressed', 'true');
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

// Feedback 30/10: an opened folder is brought into view and outlined, the
// open folders are listed, and the graph opens full screen over the page
// (not clipped by the panels around it); Escape leaves full screen.
test(
  'call graph opens a folder in view and goes full screen',
  { tag: '@smoke' },
  async ({ page }, testInfo) => {
    const corpus = syntheticCorpusFixture({
      programs: 120,
      sharedModules: 12,
      tables: 60,
      folders: 6,
    });
    await page.route(/\/artifacts\/[^/]+\/versions\/\d+$/, async (route) => {
      const response = await route.fetch();
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) throw new Error('body');
      await route.fulfill({ response, json: { ...body, payload: corpus } });
    });
    await page.goto('/');
    await page.getByLabel('Tên dự án').fill(`UI03 full ${Date.now()}`);
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
    await assessment.getByRole('button', { name: 'Xem toàn màn hình' }).click();
    const dialog = page.getByRole('dialog', { name: 'Call graph toàn dự án' });
    await expect(dialog).toBeVisible();
    const viewport = page.viewportSize();
    const box = await dialog.boundingBox();
    if (!viewport || !box) throw new Error('no box');
    expect(box.width).toBeGreaterThan(viewport.width - 40);
    expect(box.height).toBeGreaterThan(viewport.height - 40);
    const canvas = dialog.getByRole('group', { name: 'Call graph toàn dự án' });
    await expect(canvas.getByText('Đang sắp xếp graph…')).toBeHidden({
      timeout: 20_000,
    });
    // Opening a folder keeps it where it was on screen: its top-left corner
    // stays put and the view keeps its zoom.
    const closedFolder = canvas.getByRole('button', {
      name: /^Mở thư mục F03 /,
    });
    // Measured inside the canvas (the toolbar above may wrap).
    const inCanvas = async (box: { x: number; y: number } | null) => {
      const area = await canvas.boundingBox();
      if (!box || !area) throw new Error('no box');
      return { x: box.x - area.x, y: box.y - area.y };
    };
    const folderNode = canvas.locator(
      '.react-flow__node[data-id="folder:F03"]',
    );
    // Let the full-screen fit animation (250 ms) finish first.
    await page.waitForTimeout(600);
    const before = await inCanvas(await folderNode.boundingBox());
    await closedFolder.click();
    await expect(
      dialog
        .getByRole('list', { name: 'Đang mở' })
        .getByRole('button', { name: 'Đưa F03 vào khung nhìn' }),
    ).toBeVisible();
    const opened = canvas.locator('.react-flow__node.recent');
    await expect(opened).toBeVisible();
    await expect
      .poll(async () => {
        const after = await inCanvas(await folderNode.boundingBox());
        return Math.max(
          Math.abs(after.x - before.x),
          Math.abs(after.y - before.y),
        );
      })
      .toBeLessThan(3);
    // A program that was not analysed shows its type, state, name and note
    // inside the node (nothing clipped).
    const unanalysed = canvas.getByRole('button', {
      name: 'Làm nổi bật Program F030099',
    });
    const fits = await unanalysed.evaluate((button) => {
      const box = button.getBoundingClientRect();
      return [...button.children].every((child) => {
        const inner = child.getBoundingClientRect();
        return inner.top >= box.top - 0.5 && inner.bottom <= box.bottom + 0.5;
      });
    });
    expect(fits).toBe(true);
    // Resting edges stay thin; the opened folder's edges have their own style.
    const restingWidth = await canvas
      .locator(
        '.react-flow__edge:not(.dep-edge-opened) path.react-flow__edge-path',
      )
      .first()
      .evaluate((path) => parseFloat(getComputedStyle(path).strokeWidth));
    expect(restingWidth).toBeLessThanOrEqual(1);
    await expect(
      canvas.locator('.react-flow__edge.dep-edge-opened').first(),
    ).toBeAttached();
    // Toolbar is one row: the canvas starts right under it.
    const toolbar = await dialog.locator('.dep-graph-bar').boundingBox();
    if (!toolbar) throw new Error('toolbar');
    expect(toolbar.height).toBeLessThan(60);
    await page.screenshot({
      path: testInfo.outputPath('ui03-full-screen.png'),
    });
    // A program inside the open folder: its edges are drawn over the boxes
    // (resting edges stay under them), so they can be followed.
    await canvas
      .getByRole('button', { name: 'Làm nổi bật Program F030003' })
      .click();
    const layers = await canvas.evaluate((element) => ({
      linked: [...element.querySelectorAll('.react-flow__edge.linked')].map(
        (edge) => getComputedStyle(edge.closest('svg') ?? edge).zIndex,
      ),
      resting: getComputedStyle(
        element
          .querySelector('.react-flow__edge:not(.linked)')
          ?.closest('svg') ?? element,
      ).zIndex,
    }));
    expect(layers.linked.length).toBeGreaterThan(0);
    expect(new Set(layers.linked)).toEqual(new Set(['1000']));
    expect(layers.resting).not.toBe('1000');
    await page.keyboard.press('Escape');
    // Closing it from its header keeps it in the same place too, and the
    // folders stay evenly spaced.
    const openTop = await inCanvas(await folderNode.boundingBox());
    await canvas.getByRole('button', { name: 'Thu gọn thư mục F03' }).click();
    await expect(
      canvas.getByRole('button', { name: /^Mở thư mục F03 / }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const closed = await inCanvas(await folderNode.boundingBox());
        return Math.max(
          Math.abs(closed.x - openTop.x),
          Math.abs(closed.y - openTop.y),
        );
      })
      .toBeLessThan(3);
    const gaps = await canvas.evaluate((element) => {
      const tops = [...element.querySelectorAll('.react-flow__node-box')]
        .filter((node) => node.getAttribute('data-id')?.startsWith('folder:'))
        .map((node) => node.getBoundingClientRect())
        .sort((a, b) => a.top - b.top);
      return tops
        .slice(1)
        .map((box, i) => Math.round(box.top - (tops[i]?.bottom ?? 0)));
    });
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(2);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
      assessment.getByRole('group', { name: 'Call graph toàn dự án' }),
    ).toBeVisible();
  },
);

// elkjs EPL-2.0 decision: the served build carries the notices and the
// license text.
test(
  'the web build serves the third-party notices with the EPL-2.0 text',
  { tag: '@smoke' },
  async ({ request }) => {
    const notice = await request.get('/licenses/THIRD-PARTY-NOTICES.txt');
    expect(notice.ok()).toBe(true);
    const text = await notice.text();
    expect(text).toContain('elkjs 0.11.1');
    expect(text).toContain('https://github.com/kieler/elkjs/tree/0.11.1');
    const license = await request.get('/licenses/EPL-2.0.md');
    expect(license.ok()).toBe(true);
    expect(await license.text()).toContain('Eclipse Public License - v 2.0');
  },
);
