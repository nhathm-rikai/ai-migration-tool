import { expect, test } from '@playwright/test';

// Fails on purpose. Only `npm run e2e:self-check` selects it, to prove a
// failing assertion exits nonzero with a trace and report.
test('intentional failure', { tag: '@self-check' }, async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'not on this page' }),
  ).toBeVisible({
    timeout: 1_000,
  });
});
