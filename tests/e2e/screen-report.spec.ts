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

    // 3 distinct forms (LOGIN is shared by ORDER and REPORT), 3 reports found
    // (2 suspected rows are not added), 1 batch (CUSTOMER).
    const kpi = (name: string) => assessment.locator(`[data-kpi="${name}"]`);
    await expect(kpi('screens')).toContainText('3');
    await expect(kpi('screens')).toContainText('1 dùng chung');
    await expect(kpi('reports')).toContainText('3');
    await expect(kpi('reports')).toContainText('2 program nghi có xuất report');
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
    await expect(row('ORDER').locator('[data-col="reports"]')).toHaveText('1');
    await expect(row('CUSTOMER').locator('[data-col="screens"]')).toHaveText(
      '0',
    );
    await expect(row('REPORT').locator('[data-col="reports"]')).toContainText(
      '2',
    );

    // Detail tab of REPORT: file:line and the three confidence labels.
    await assessment
      .getByRole('button', { name: 'REPORT', exact: true })
      .click();
    await assessment.getByRole('tab', { name: /^Màn hình và report/ }).click();
    const reports = assessment.getByTestId('program-reports');
    await expect(reports).toContainText('programs/REPORT/REPORT.BAS:40');
    await expect(reports).toContainText('Tham chiếu');
    await expect(reports).toContainText('Phát hiện');
    await expect(reports).toContainText('Nghi có');
    await expect(reports).toContainText('Thiếu file .rpt trong source');
    await programsTab.click();

    // Project-wide list: totals by kind and level equal the list rows.
    await assessment.getByRole('tab', { name: /^Report \(帳票\)/ }).click();
    await expect(assessment.getByTestId('report-rows-by-level')).toHaveText(
      '5',
    );
    await expect(assessment.getByTestId('report-rows-by-kind')).toHaveText('5');
    await expect(
      assessment.getByTestId('report-table').locator('tbody tr'),
    ).toHaveCount(5);
    await expect(assessment.getByTestId('report-reference')).toContainText(
      'report-complexity-v1-draft',
    );
    await assessment.getByLabel('Mức phức tạp').last().selectOption('high');
    await expect(
      assessment.getByTestId('report-table').locator('tbody tr'),
    ).toHaveCount(1);
  },
);
