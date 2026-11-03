import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';

test(
  'file feed streams real paths from a large local snapshot instead of stopping at one line',
  { tag: ['@smoke', '@file-feed'] },
  async ({ page }) => {
    test.setTimeout(90_000);
    const dataDir = process.env.E2E_DATA_DIR;
    const sampleRoot = process.env.E2E_ANALYZE_SOURCE_ROOT;
    if (!dataDir || !sampleRoot || dirname(dataDir) !== dirname(sampleRoot))
      throw new Error(
        'Run through the E2E harness with its own temporary fixture directories.',
      );
    const sourceRoot = join(dirname(dataDir), 'source-file-feed');
    cpSync(sampleRoot, sourceRoot, { recursive: true });
    mkdirSync(join(sourceRoot, 'feed-modules'));
    for (let index = 0; index < 700; index++) {
      const name = `READ${String(index).padStart(4, '0')}`;
      writeFileSync(
        join(sourceRoot, 'feed-modules', `${name}.BAS`),
        `Attribute VB_Name = "${name}"\r\nPublic Sub ${name}()\r\nEnd Sub\r\n`,
      );
    }
    let starts = 0;
    let streams = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/runs$/.test(request.url()))
        starts++;
      if (/\/runs\/[^/]+\/events$/.test(request.url())) streams++;
    });
    await page.route('**/api/v1/local/folder-picker', (route) =>
      route.fulfill({ json: { status: 'selected', path: sourceRoot } }),
    );
    await page.goto('/projects/new');
    const observed = await page.evaluateHandle(() => {
      const samples: string[][] = [];
      const observer = new MutationObserver(() => {
        const paths = [
          ...document.querySelectorAll('.scan-files .file-path'),
        ].map((node) => node.textContent ?? '');
        if (
          paths.length &&
          JSON.stringify(paths) !== JSON.stringify(samples.at(-1))
        )
          samples.push(paths);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return { samples, stop: () => observer.disconnect() };
    });
    try {
      await page.getByRole('button', { name: 'Chọn thư mục' }).click();
      await page.getByRole('radio', { name: 'VB6' }).check();
      await page.getByRole('button', { name: 'Quét source' }).click();
      // Count/path assertions observe the actual DOM over time, not just a
      // screenshot or a single successful SSE frame. Old StrictMode feed = 1.
      await expect
        .poll(
          () =>
            observed.evaluate(({ samples }) =>
              Math.max(0, ...samples.map((paths) => paths.length)),
            ),
          { timeout: 60_000 },
        )
        .toBe(6);
      await expect
        .poll(
          () =>
            observed.evaluate(({ samples }) => new Set(samples.flat()).size),
          { timeout: 60_000 },
        )
        .toBeGreaterThanOrEqual(12);
      const samples = await observed.evaluate(({ samples }) => samples);
      expect(samples.every((paths) => paths.length <= 6)).toBe(true);
      expect(samples.some((paths) => paths.length >= 2)).toBe(true);
      for (const path of new Set(samples.flat()))
        expect(existsSync(join(sourceRoot, ...path.split('/'))), path).toBe(
          true,
        );
      expect(starts).toBe(1);
      expect(streams).toBeGreaterThan(0);
      await expect(
        page.getByRole('heading', { name: 'File đang đọc' }),
      ).toBeVisible();
      await page.screenshot({
        path: `${process.env.E2E_OUTPUT_DIR}/file-feed-${process.env.E2E_WEB_MODE}.png`,
      });
      const cancel = page.getByRole('button', { name: 'Hủy lượt chạy' });
      if (await cancel.isVisible()) {
        await cancel.click();
        await expect(cancel).toBeHidden();
      }
    } finally {
      await observed.evaluate(({ stop }) => stop());
      await observed.dispose();
    }
  },
);
