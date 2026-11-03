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
