import { mkdir, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openNewDemoProject } from './demo-project.js';

// AR01-AC07: the technical workbook has no button in the UI any more (the
// step shows only the Assessment report buttons) but its route still serves it.
test(
  'technical report route still serves the workbook, without a UI button',
  { tag: '@smoke' },
  async ({ page }) => {
    await openNewDemoProject(page, `AR01 export ${Date.now()}`);
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Xuất Excel' })).toBeEnabled({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: /kỹ thuật/i })).toHaveCount(
      0,
    );
    const ids = /\/projects\/([^/]+)\/analysis\/([^/]+)$/.exec(page.url());
    if (!ids) throw new Error('step URL');
    const served = await page.evaluate(
      async ([projectId, runId]) => {
        const session = await fetch('/api/v1/session', { method: 'POST' });
        const { token } = (await session.json()) as { token: string };
        const headers = { authorization: `Bearer ${token}` };
        const listed = (await (
          await fetch(`/api/v1/projects/${projectId}/runs/${runId}/artifacts`, {
            headers,
          })
        ).json()) as { items: { id: string; version: number }[] };
        const artifact = listed.items[0];
        if (!artifact) throw new Error('no artifact');
        const response = await fetch(
          `/api/v1/projects/${projectId}/artifacts/${artifact.id}/versions/${artifact.version}/report?format=xlsx`,
          { headers },
        );
        const bytes = new Uint8Array(await response.arrayBuffer());
        return {
          status: response.status,
          disposition: response.headers.get('content-disposition') ?? '',
          signature: String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0),
          size: bytes.length,
        };
      },
      [ids[1], ids[2]] as [string | undefined, string | undefined],
    );
    expect(served.status).toBe(200);
    expect(served.signature).toBe('PK');
    expect(served.size).toBeGreaterThan(0);
    expect(served.disposition).toContain('assessment-');
  },
);

// AR02-AC07: the Assessment report Excel is its own file with six worksheets.
test(
  'analysis step exports the six-sheet customer report as a separate file',
  { tag: '@smoke' },
  async ({ page }) => {
    await openNewDemoProject(page, `AR02 export ${Date.now()}`);
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    const customer = page.getByRole('button', { name: 'Xuất Excel' });
    await expect(customer).toBeEnabled({ timeout: 20_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      customer.click(),
    ]);
    // The Portal is in Vietnamese: so is the report (Japanese with the
    // Japanese UI, see the next test).
    expect(download.suggestedFilename()).toMatch(
      /^Bao-cao-Assessment_AR02 export \d+_\d{8}\.xlsx$/,
    );
    const bytes = await readFile(await download.path());
    await mkdir('test-results/customer-report-vi', { recursive: true });
    await download.saveAs('test-results/customer-report-vi/report-vi.xlsx');
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    for (let sheet = 1; sheet <= 7; sheet++)
      expect(
        bytes.includes(Buffer.from(`xl/worksheets/sheet${sheet}.xml`)),
      ).toBe(true);
    expect(bytes.includes(Buffer.from('xl/worksheets/sheet8.xml'))).toBe(false);

    await expect(page.getByRole('alert')).toHaveCount(0);
  },
);

// AR03-AC05: the customer PDF of the demo project: a real PDF of 3 to 8 A4
// pages. The file is also kept under test-results/ar03-demo for a human check.
test(
  'analysis step exports the customer report as a PDF',
  { tag: '@smoke' },
  async ({ page }) => {
    await openNewDemoProject(page, `AR03 export ${Date.now()}`);
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    const pdf = page.getByRole('button', { name: 'Xuất PDF' });
    await expect(pdf).toBeEnabled({ timeout: 20_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      pdf.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^Bao-cao-Assessment_AR03_export_\d+_\d{8}\.pdf$/,
    );
    const path = await download.path();
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const text = bytes.toString('latin1');
    const pages = Number(/\/Type \/Pages \/Count (\d+)/.exec(text)?.[1]);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(pages).toBeLessThanOrEqual(8);
    // A4: 595.5 x 842.25 pt, the same page size as the quote.
    expect(text).toContain('/MediaBox [0 0 595.50 842.25]');
    await mkdir('test-results/ar03-demo', { recursive: true });
    await download.saveAs('test-results/ar03-demo/customer-report-demo.pdf');
    await mkdir('test-results/customer-report-vi', { recursive: true });
    await download.saveAs('test-results/customer-report-vi/report-vi.pdf');
    // Sharp pages: at most a few MB for the demo.
    expect(bytes.length).toBeLessThan(12 * 1024 * 1024);
    await expect(pdf).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  },
);

// The report follows the language of the Portal: with the Japanese UI the
// Excel and the PDF are Japanese (the customer's language).
test(
  'analysis step exports the Japanese report when the UI is Japanese',
  { tag: '@smoke' },
  async ({ page }) => {
    await openNewDemoProject(page, `AR02 ja ${Date.now()}`);
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    await page.getByRole('radio', { name: '日本語' }).check({ force: true });
    const excel = page.getByRole('button', { name: 'Excel出力' });
    await expect(excel).toBeEnabled({ timeout: 20_000 });
    const [xlsx] = await Promise.all([
      page.waitForEvent('download'),
      excel.click(),
    ]);
    expect(xlsx.suggestedFilename()).toMatch(
      /^アセスメント報告書_AR02 ja \d+_\d{8}\.xlsx$/,
    );
    await mkdir('test-results/customer-report-vi', { recursive: true });
    await xlsx.saveAs('test-results/customer-report-vi/report-ja.xlsx');
    const pdf = page.getByRole('button', { name: 'PDF出力' });
    await expect(pdf).toBeEnabled();
    const [file] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      pdf.click(),
    ]);
    expect(file.suggestedFilename()).toMatch(
      /^アセスメント報告書_AR02_ja_\d+_\d{8}\.pdf$/,
    );
    await file.saveAs('test-results/customer-report-vi/report-ja.pdf');
    await expect(page.getByRole('alert')).toHaveCount(0);
  },
);
