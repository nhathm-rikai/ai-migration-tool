import { expect, test } from '@playwright/test';
import { openNewDemoProject } from './demo-project.js';

// Deleting an old project from "Dự án gần đây": a confirm dialog first, then
// the project is gone from the list and its URL answers not found.
test(
  'delete a project after confirming',
  { tag: '@smoke' },
  async ({ page }) => {
    const name = `E2E xóa dự án ${Date.now()}`;
    const projectId = await openNewDemoProject(page, name);
    await page.goto('/projects/new');
    const recent = page.getByRole('complementary', { name: 'Dự án gần đây' });
    await recent.getByLabel('Tìm dự án theo tên').fill(name);
    await expect(
      recent.getByRole('link', { name: new RegExp(name) }),
    ).toBeVisible();

    // Cancel keeps the project.
    await recent.getByRole('button', { name: `Xóa dự án ${name}` }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('Xóa dự án này?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Hủy' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      recent.getByRole('link', { name: new RegExp(name) }),
    ).toBeVisible();

    // Confirm removes it.
    await recent.getByRole('button', { name: `Xóa dự án ${name}` }).click();
    await dialog.getByRole('button', { name: 'Xóa vĩnh viễn' }).click();
    await expect(dialog).toBeHidden();
    await expect(recent.getByText('Không có dự án nào khớp.')).toBeVisible();

    const status = await page.evaluate(async (id) => {
      const session = await fetch('/api/v1/session', { method: 'POST' });
      const { token } = (await session.json()) as { token: string };
      const response = await fetch(`/api/v1/projects/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return response.status;
    }, projectId);
    expect(status).toBe(404);
  },
);

// The delete button has its own column inside the card: it never covers the status chip, in
// either language and at the narrowest desktop width.
for (const locale of ['vi', 'ja'] as const) {
  test(
    `delete button does not overlap the status chip (${locale})`,
    { tag: '@smoke' },
    async ({ page }) => {
      await page.addInitScript((code) => {
        window.localStorage.setItem('portal.locale', code);
      }, locale);
      await openNewDemoProject(page, `E2E bố cục ${locale} ${Date.now()}`);
      await page.goto('/projects/new');
      for (const width of [1280, 1024]) {
        await page.setViewportSize({ width, height: 800 });
        const item = page.locator('.recent-item').first();
        await expect(item).toBeVisible();
        const [button, chip, card] = await Promise.all(
          ['.recent-delete', '.recent-status', '.recent-card'].map(
            async (selector) => item.locator(selector).boundingBox(),
          ),
        );
        expect(button && chip && card).toBeTruthy();
        // Inside the card border, right of every piece of content.
        expect(button!.x).toBeGreaterThan(card!.x);
        expect(button!.x + button!.width).toBeLessThanOrEqual(
          card!.x + card!.width,
        );
        expect(button!.x).toBeGreaterThanOrEqual(chip!.x + chip!.width);
        // The confirm overlay covers the whole viewport, not just the page box.
        await item.locator('.recent-delete').click();
        const backdrop = page.locator('.modal-backdrop');
        await expect(backdrop).toBeVisible();
        expect(await backdrop.boundingBox()).toEqual({
          x: 0,
          y: 0,
          width,
          height: 800,
        });
        const dialogBox = await page.getByRole('alertdialog').boundingBox();
        expect(dialogBox!.x + dialogBox!.width / 2).toBeCloseTo(width / 2, 0);
        expect(dialogBox!.y + dialogBox!.height / 2).toBeCloseTo(400, 0);
        await page.screenshot({
          path: `${process.env.E2E_OUTPUT_DIR}/recent-delete-dialog-${locale}-${width}.png`,
        });
        await page.keyboard.press('Escape');
        await expect(backdrop).toBeHidden();
      }
      await page
        .locator('.recent-item')
        .first()
        .screenshot({
          path: `${process.env.E2E_OUTPUT_DIR}/recent-delete-${locale}.png`,
        });
    },
  );
}
