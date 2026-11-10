import { mkdir } from 'node:fs/promises';
import type { CustomerReportDocument } from '@portal/contracts';
import { expect, test } from '@playwright/test';
import { openNewDemoProject } from './demo-project.js';

// The customer PDF is laid out page by page in the DOM: no table row, card or
// heading is cut by a page edge, a long table splits between rows, and no
// page (but the last and the ones before the appendix) is mostly empty. The
// report JSON of the demo project is made long here (many modules, reports,
// risks, dependencies) to exercise the page breaks; the layout reports itself
// through the __a4Probe seam.

type Probe = {
  room: number;
  rowsBefore: number;
  rowsAfter: number;
  pages: { height: number; fill: number; overflow: number }[];
};

test(
  'a long customer PDF has no cut rows and no mostly empty page',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__a4Probe'] = (
        value: unknown,
      ) => {
        (window as unknown as Record<string, unknown>)['__probe'] = value;
      };
    });
    await page.route(/customer-report[?]format=json/, async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as CustomerReportDocument;
      // n copies of the rows, each edited to be different.
      const many = <T>(
        rows: readonly T[],
        count: number,
        edit: (row: T, index: number) => T,
      ): T[] =>
        rows.length === 0
          ? []
          : Array.from({ length: count }, (_, index) =>
              edit(structuredClone(rows[index % rows.length] as T), index),
            );
      json.modules = many(json.modules, 45, (row, i) => ({
        ...row,
        module: `programs/MODULE${i}`,
      }));
      json.items = many(
        json.items.filter((item) => item.confidence !== 'suspected'),
        140,
        (item, i) => ({ ...item, name: `item${i}`, file: `a/F${i}.BAS` }),
      );
      json.risks = many(json.risks, 30, (risk, i) => ({
        ...risk,
        code: `R${i}`,
        programs: Array.from({ length: 10 }, (_, k) => `PROGRAM${k}`),
        otherPrograms: 7,
        content: `${risk.content} ${risk.content}`,
      }));
      const deps = json.dependencies;
      deps.shared = many(deps.shared, 30, (row, i) => ({
        ...row,
        file: `cmn/S${i}.BAS`,
      }));
      deps.components = many(
        deps.components.length > 0
          ? deps.components
          : [
              {
                kind: 'component' as const,
                identifier: 'X',
                fileName: 'X.OCX',
                description: 'Control',
                programs: 2,
              },
            ],
        30,
        (row, i) => ({ ...row, identifier: `X${i}`, fileName: `X${i}.OCX` }),
      );
      deps.apis = many(
        deps.apis.length > 0
          ? deps.apis
          : [{ name: 'GetTickCount', library: 'kernel32', programs: 1 }],
        45,
        (row, i) => ({ ...row, name: `Api${i}` }),
      );
      json.database.tables = many(json.database.tables, 20, (row, i) => ({
        ...row,
        table: `TABLE${i}`,
      }));
      json.database.sqlByModule = many(
        json.database.sqlByModule,
        40,
        (row, i) => ({ ...row, module: `programs/MODULE${i}` }),
      );
      json.complexity.top = many(json.complexity.top, 20, (row, i) => ({
        ...row,
        program: `PROG${i}`,
      }));
      await route.fulfill({ response, json });
    });
    await openNewDemoProject(page, `Layout ${Date.now()}`);
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    const pdf = page.getByRole('button', { name: 'Xuất PDF' });
    await expect(pdf).toBeEnabled({ timeout: 20_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      pdf.click(),
    ]);
    await mkdir('test-results/customer-report-vi', { recursive: true });
    await download.saveAs('test-results/customer-report-vi/report-vi-long.pdf');
    const probe = (await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__probe'],
    )) as Probe;
    console.log(
      `PDF-LAYOUT pages=${probe.pages.length} rows=${probe.rowsBefore}/${probe.rowsAfter} fill=${probe.pages.map((p) => p.fill.toFixed(2)).join(',')} overflow=${probe.pages.map((p) => p.overflow).join(',')}`,
    );
    // Every table row is on exactly one page, and nothing runs past a page.
    expect(probe.rowsAfter).toBe(probe.rowsBefore);
    for (const entry of probe.pages) {
      expect(entry.overflow).toBe(0);
      expect(entry.height).toBeLessThanOrEqual(probe.room + 1);
    }
    expect(probe.pages.length).toBeGreaterThan(5);
    // Pages are used: all but the last (and the page before the appendix) are
    // at least three quarters full.
    const middle = probe.pages.slice(0, -2);
    for (const entry of middle) expect(entry.fill).toBeGreaterThanOrEqual(0.75);
  },
);
