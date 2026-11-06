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

    const exportButton = page.getByRole('button', {
      name: 'Dữ liệu kỹ thuật (Excel, nội bộ)',
    });
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
      page.getByRole('button', { name: 'Dữ liệu kỹ thuật (Excel, nội bộ)' }),
    ).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  },
);

// AR02-AC07: the customer report is its own button and its own file with six
// worksheets; the technical file stays a separate download.
test(
  'analysis step exports the six-sheet customer report as a separate file',
  { tag: '@smoke' },
  async ({ page }) => {
    await openNewDemoProject(page, `AR02 export ${Date.now()}`);
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    const customer = page.getByRole('button', {
      name: 'Báo cáo cho khách (Excel)',
    });
    const technical = page.getByRole('button', {
      name: 'Dữ liệu kỹ thuật (Excel, nội bộ)',
    });
    await expect(customer).toBeEnabled({ timeout: 20_000 });
    await expect(technical).toBeEnabled();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      customer.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^アセスメント報告書_AR02 export \d+_\d{8}\.xlsx$/,
    );
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    for (let sheet = 1; sheet <= 6; sheet++)
      expect(
        bytes.includes(Buffer.from(`xl/worksheets/sheet${sheet}.xml`)),
      ).toBe(true);
    expect(bytes.includes(Buffer.from('xl/worksheets/sheet7.xml'))).toBe(false);

    const [technicalDownload] = await Promise.all([
      page.waitForEvent('download'),
      technical.click(),
    ]);
    expect(technicalDownload.suggestedFilename()).toMatch(/^assessment-/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  },
);
