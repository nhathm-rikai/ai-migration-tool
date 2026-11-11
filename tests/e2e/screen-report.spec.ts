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

    // 3 distinct forms (LOGIN is shared by ORDER and REPORT) and one total of
    // 6 reports: 3 Crystal / DataReport (order.rpt is named in two procedures
    // and counts once; 1 has no design file), 1 form that prints in code, 2
    // that export CSV / Excel; a log file is left out; 1 batch (CUSTOMER).
    const kpi = (name: string) => assessment.locator(`[data-kpi="${name}"]`);
    await expect(kpi('screens')).toContainText('3');
    await expect(kpi('screens')).toContainText('1 dùng chung');
    await expect(kpi('reports')).toContainText('6');
    await expect(kpi('reports')).toContainText(
      'Crystal 3 · In bằng code 1 · CSV/Excel 2',
    );
    await expect(kpi('reports')).toContainText('Thiếu file .rpt: 1');
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
    // order.rpt is one report although two procedures name it.
    await expect(row('ORDER').locator('[data-col="reports"]')).toHaveText('1');
    await expect(row('CUSTOMER').locator('[data-col="screens"]')).toHaveText(
      '0',
    );

    // Detail tab of REPORT: its reports with their uses (file:line).
    await assessment
      .getByRole('button', { name: 'REPORT', exact: true })
      .click();
    await assessment.getByRole('tab', { name: /^Màn hình và report/ }).click();
    const reports = assessment.getByTestId('program-reports');
    await expect(reports).toContainText('summary.rpt');
    await expect(reports).toContainText('Có file');
    await expect(reports).toContainText('Thiếu file');
    // The uses open from the row.
    await reports.getByRole('button', { name: 'summary.rpt' }).click();
    await expect(reports).toContainText('programs/REPORT/REPORT.BAS');
    await programsTab.click();

    // Project-wide tab: one histogram and one list with a row per report;
    // file output that is not a report stays in a folded section.
    await assessment.getByRole('tab', { name: /^Report \(帳票\)/ }).click();
    await expect(assessment.getByTestId('report-rows-by-level')).toHaveText(
      '6',
    );
    const table = assessment.getByTestId('report-template-table');
    await expect(table.locator('tbody tr.program-row')).toHaveCount(6);
    await expect(assessment.getByTestId('excluded-functions')).toBeHidden();
    await assessment.getByText('Ghi file dữ liệu (không tính report)').click();
    await expect(assessment.getByTestId('excluded-functions')).toContainText(
      '1 chỗ ghi log/file tạm',
    );
    await assessment.getByLabel('Tìm report').fill('order');
    await expect(table.locator('tbody tr.program-row')).toHaveCount(1);
  },
);
