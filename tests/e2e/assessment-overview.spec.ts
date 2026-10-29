import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ArtifactListSchema, type ArtifactRef } from '@portal/contracts';
import { Check } from 'typebox/value';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; run \`npm run e2e\`.`);
  return value;
};

// PF06: a demo run publishes the bundled inventory artifact; the Assessment
// overview reads that exact version, keeps unique and per-program totals
// apart, flags the partial program and survives reload/locale/mobile.
test(
  'demo run publishes an inventory and shows the assessment overview',
  { tag: '@smoke' },
  async ({ page }, testInfo) => {
    const dataDir = required('E2E_DATA_DIR');
    let starts = 0;
    const artifactReads: string[] = [];
    let listed: ArtifactRef | undefined;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/runs$/.test(request.url()))
        starts++;
    });
    page.on('response', async (response) => {
      const url = response.url();
      if (/\/artifacts\/[^/]+\/versions\/\d+$/.test(url))
        artifactReads.push(new URL(url).pathname);
      if (/\/runs\/[^/]+\/artifacts$/.test(url) && response.ok()) {
        const body: unknown = await response.json();
        if (Check(ArtifactListSchema, body) && body.items[0])
          listed = body.items[0];
      }
    });

    const projectName = `PF06 demo ${Date.now()}`;
    await page.goto('/');
    await page.getByLabel('Tên dự án').fill(projectName);
    await page.getByRole('radio', { name: /Demo với dữ liệu mẫu/ }).check();
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    const panel = page.getByRole('region', { name: /Phân tích \(demo\)/ });
    await panel.getByRole('button', { name: 'Bắt đầu phân tích' }).click();
    await expect(
      panel.getByRole('status').filter({ hasText: 'Hoàn tất (demo)' }),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Xem kết quả phân tích' }).click();

    const assessment = page.getByRole('region', { name: 'Đánh giá tổng quan' });
    await expect(
      assessment.getByRole('tab', { name: 'Danh sách program' }),
    ).toBeVisible();
    await assessment.getByText('Thông tin kỹ thuật').click();
    expect(listed).toBeDefined();
    const ref = listed;
    if (!ref) throw new Error('no artifact listed');
    expect(ref).toMatchObject({ version: 1, mode: 'demo' });
    expect(artifactReads).toEqual([
      `/api/v1/projects/${ref.projectId}/artifacts/${ref.id}/versions/1`,
    ]);
    // Header names the exact version and the demo data.
    await expect(
      assessment.getByText(`${ref.id.slice(0, 8)} · v1`),
    ).toBeVisible();
    await expect(
      assessment.getByText('Kết quả mẫu đi kèm ứng dụng', { exact: false }),
    ).toBeVisible();
    // Shared COMMON.BAS (120 LoC) is counted once in the unique total and in
    // each of ORDER/CUSTOMER in the per-program sum.
    await expect(assessment.getByTestId('unique-code-lines')).toHaveText('655');
    await expect(assessment.getByTestId('per-program-code-lines')).toHaveText(
      '775',
    );
    await expect(assessment.getByTestId('coverage')).toHaveText('4 / 5');
    await expect(assessment.getByText('Kiểm kê chưa đầy đủ.')).toBeVisible();
    await expect(assessment.getByText('PROGRAM_INCOMPLETE')).toBeVisible();
    await expect(
      assessment.getByText('TABLE_NAMES_NOT_CONFIRMED'),
    ).toBeVisible();

    const programsTab = assessment.getByRole('tab', {
      name: 'Danh sách program',
    });
    await programsTab.click();
    await assessment.getByLabel('Tìm program').fill('rep');
    await expect(
      assessment.getByText('Đang hiển thị 1 / 3 program'),
    ).toBeVisible();
    await assessment.getByRole('button', { name: 'REPORT' }).click();
    await assessment.getByRole('tab', { name: /^File/ }).click();
    await expect(assessment.getByText('File của REPORT')).toBeVisible();
    await expect(
      assessment.getByText('Không tìm thấy', { exact: true }),
    ).toBeVisible();
    await programsTab.click();
    await assessment.getByLabel('Tìm program').fill('');

    // Nothing half-written is left in the store.
    expect(await readdir(join(dataDir, 'artifacts', '.staging'))).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('pf06-desktop-vi.png'),
      fullPage: true,
    });

    await page.getByRole('radio', { name: '日本語' }).check();
    const ja = page.getByRole('region', { name: 'アセスメント概要' });
    await expect(ja.getByText('プログラム一覧')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('pf06-mobile-ja.png'),
      fullPage: true,
    });

    // Reload stays on this run's analysis URL, reads the same version back
    // and starts nothing.
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/);
    await page.reload();
    await expect(ja.getByText('プログラム一覧')).toBeVisible();
    await expect(ja.getByTestId('unique-code-lines')).toHaveText('655');
    expect(new Set(artifactReads)).toEqual(
      new Set([
        `/api/v1/projects/${ref.projectId}/artifacts/${ref.id}/versions/1`,
      ]),
    );
    const response = await page.evaluate(
      async (url) => (await fetch(url)).status,
      `/api/v1/projects/${ref.projectId}/artifacts/${ref.id}/versions/1`,
    );
    // Without the local credential the artifact is not readable.
    expect(response).toBe(401);
    expect(starts).toBe(1);
  },
);
