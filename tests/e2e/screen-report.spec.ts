import { expect, test } from '@playwright/test';
import { openNewDemoProject } from './demo-project.js';

// AR04-AC07: the demo inventory has a form shared by two programs, one batch
// and one report per confidence level; step 2 shows exactly those numbers.
test(
  'step 2 shows screens, reports and batches of the demo inventory',
  { tag: '@smoke' },
  async ({ page }) => {
    await openNewDemoProject(page, `AR04 demo ${Date.now()}`);
    await page.getByRole('button', { name: 'Quét source' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    const assessment = page.getByRole('region', { name: 'Đánh giá tổng quan' });

    // 3 distinct forms (LOGIN is shared by ORDER and REPORT), 3 report
    // TEMPLATES (order.rpt is named in two procedures and counts once; 2 with a
    // design file, 1 missing), 3 print/export functions to confirm in 2
    // programs (a log file is left out), 1 batch (CUSTOMER).
    const kpi = (name: string) => assessment.locator(`[data-kpi="${name}"]`);
    await expect(kpi('screens')).toContainText('3');
    await expect(kpi('screens')).toContainText('1 dùng chung');
    await expect(kpi('reports')).toContainText('3');
    await expect(kpi('reports')).toContainText(
      'Có file thiết kế 2 · Thiếu file 1',
    );
    await expect(kpi('outputs')).toContainText('3');
    await expect(kpi('outputs')).toContainText('2 program');
    await expect(kpi('outputs')).toContainText(
      'đã loại 1 chỗ ghi log/file tạm',
    );
    await expect(kpi('batches')).toContainText('1');

    // Columns of the program list.
    const programsTab = assessment.getByRole('tab', {
      name: /^Danh sách program/,
    });
    await programsTab.click();
    const row = (name: string) =>
      assessment
        .getByRole('button', { name, exact: true })
        .locator('xpath=ancestor::tr');
    await expect(row('ORDER').locator('[data-col="screens"]')).toHaveText('2');
    // order.rpt is one template although two procedures name it.
    await expect(row('ORDER').locator('[data-col="reports"]')).toHaveText('1');
    await expect(row('CUSTOMER').locator('[data-col="screens"]')).toHaveText(
      '0',
    );
    await expect(row('REPORT').locator('[data-col="reports"]')).toContainText(
      '2',
    );

    // Detail tab of REPORT: its templates with their uses (file:line) and its
    // output functions.
    await assessment
      .getByRole('button', { name: 'REPORT', exact: true })
      .click();
    await assessment.getByRole('tab', { name: /^Màn hình và report/ }).click();
    const reports = assessment.getByTestId('program-reports');
    await expect(reports).toContainText('summary.rpt');
    await expect(reports).toContainText('programs/REPORT/REPORT.BAS:40');
    await expect(reports).toContainText('Có file thiết kế');
    await expect(reports).toContainText('Thiếu file (cần xin khách)');
    await expect(assessment.getByTestId('program-functions')).toContainText(
      'Xuất Excel',
    );
    await programsTab.click();

    // Project-wide tab: the levels add up to the templates, the template list
    // has one row per template, the functions are listed apart.
    await assessment.getByRole('tab', { name: /^Report \(帳票\)/ }).click();
    await expect(assessment.getByTestId('report-rows-by-level')).toHaveText(
      '3',
    );
    await expect(
      assessment.getByTestId('report-template-table').locator('tbody tr'),
    ).toHaveCount(3);
    await expect(
      assessment.getByTestId('output-function-table').locator('tbody tr'),
    ).toHaveCount(3);
    await expect(assessment.getByTestId('excluded-functions')).toContainText(
      '1 chỗ ghi log/file tạm',
    );
    await assessment.getByLabel('Tìm report').fill('order');
    await expect(
      assessment.getByTestId('report-template-table').locator('tbody tr'),
    ).toHaveCount(1);
  },
);
