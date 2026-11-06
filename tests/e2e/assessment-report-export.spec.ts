import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openNewDemoProject } from './demo-project.js';

// AR01-AC07: the analysis step downloads the assessment workbook of the
// demo project.
test(
  'analysis step exports the assessment report as xlsx',
  { tag: '@smoke' },
  async ({ page }) => {
    await openNewDemoProject(page, `AR01 export ${Date.now()}`);
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });

    const exportButton = page.getByRole('button', { name: 'Xuất Excel' });
    await expect(exportButton).toBeEnabled({ timeout: 20_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportButton.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^assessment-AR01 export \d+-\d{8}\.xlsx$/,
    );
    const path = await download.path();
    const bytes = await readFile(path);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // ZIP signature, and the part names are stored in clear text in the
    // local and central headers.
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(bytes.includes(Buffer.from('xl/workbook.xml'))).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Xuất Excel' }),
    ).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  },
);
