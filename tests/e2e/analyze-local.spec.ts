import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  ArtifactListSchema,
  SourceInventoryArtifactSchema,
  type ArtifactRef,
} from '@portal/contracts';
import { Check } from 'typebox/value';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; run npm run e2e.`);
  return value;
};

async function treeHash(root: string): Promise<string> {
  const hash = createHash('sha256');
  const entries = (
    await readdir(root, { recursive: true, withFileTypes: true })
  )
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const path of entries)
    hash
      .update(relative(root, path).split(sep).join('/'))
      .update('\0')
      .update(await readFile(path));
  return hash.digest('hex');
}

// PF07: a local run reads the registered fixture folder through its snapshot,
// publishes the analyzer's inventory and the program detail shows LoC per
// procedure, members and calls; reopening reads the same version back.
test(
  'local run publishes an inventory and shows the program detail',
  { tag: '@smoke' },
  async ({ page }, testInfo) => {
    const sourceRoot = required('E2E_ANALYZE_SOURCE_ROOT');
    const dataDir = required('E2E_DATA_DIR');
    const before = await treeHash(sourceRoot);
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

    const projectName = `PF07 local ${Date.now()}`;
    await page.goto('/');
    await page.getByLabel('Tên dự án').fill(projectName);
    await page.getByRole('radio', { name: /Mã nguồn trên máy này/ }).check();
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    const source = page.getByRole('region', { name: 'Mã nguồn LOCAL' });
    await source.getByLabel('Đường dẫn thư mục (tuyệt đối)').fill(sourceRoot);
    await source
      .getByLabel('Schema mặc định của tên bảng')
      .selectOption('assumed');
    await source.getByLabel('Tên schema', { exact: true }).fill('APP');
    const registered = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        /\/source$/.test(response.url()),
    );
    await source.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    const registration = await registered;
    expect(registration.status()).toBe(200);
    const authorization = registration.request().headers()['authorization'];
    if (!authorization) throw new Error('Source mutation has no credential.');

    const runPanel = page.getByRole('region', {
      name: 'Phân tích',
      exact: true,
    });
    await runPanel.getByRole('button', { name: 'Bắt đầu phân tích' }).click();
    await expect(
      runPanel.getByRole('status').filter({ hasText: 'Hoàn tất' }),
    ).toBeVisible({ timeout: 20_000 });
    await runPanel
      .getByRole('button', { name: 'Xem kết quả phân tích' })
      .click();

    const assessment = page.getByRole('region', { name: 'Đánh giá tổng quan' });
    await expect(
      assessment.getByRole('tab', { name: /^Danh sách program/ }),
    ).toBeVisible();
    await assessment.getByText('Thông tin kỹ thuật').click();
    await expect(
      assessment.getByText('Kiểm kê từ bản chụp mã nguồn trên máy này'),
    ).toBeVisible();
    const ref = listed;
    if (!ref) throw new Error('no artifact listed');
    expect(ref).toMatchObject({ version: 1, mode: 'local' });
    // Hand-labelled totals of the fixture (see source-inventory.test.ts).
    await expect(assessment.getByTestId('unique-code-lines')).toHaveText('52');
    await expect(assessment.getByTestId('coverage')).toHaveText('4 / 4');
    await expect(assessment.getByText('MEMBER_UNRESOLVED')).toBeVisible();

    await assessment.getByRole('tab', { name: /^Danh sách program/ }).click();
    await assessment.getByRole('button', { name: 'SAMPLE' }).click();
    const detail = assessment.getByRole('region', {
      name: 'Chi tiết program SAMPLE',
    });
    await detail.getByRole('tab', { name: /^File/ }).click();
    await expect(detail.getByText('File của SAMPLE')).toBeVisible();
    await expect(
      detail.getByRole('row').filter({ hasText: 'MISSING.BAS' }),
    ).toContainText('Không tìm thấy');
    await expect(
      detail.getByRole('row').filter({ hasText: 'MISSING.BAS' }),
    ).toContainText('Chưa phân tích');
    await detail.getByRole('tab', { name: /^Procedure/ }).click();
    await expect(
      detail.getByRole('row').filter({ hasText: 'CalcTotal' }),
    ).toContainText('programs/SAMPLE/SAMPLE.BAS');
    await expect(detail.getByText('Procedure và LoC')).toBeVisible();
    await detail.getByRole('tab', { name: /^Lời gọi/ }).click();
    await expect(detail.getByText('Lời gọi', { exact: true })).toBeVisible();
    await detail.getByRole('tab', { name: /^CRUD/ }).click();
    // The mapped view opens first; its line names the assumed schema.
    await expect(
      detail.getByText(/Giả định, cần người quản lý DB xác nhận/),
    ).toBeVisible();
    await expect(
      detail.getByText('Không phát hiện truy cập bảng.'),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('pf07-desktop-vi.png'),
      fullPage: true,
    });

    // The published version reads back schema-valid and names the snapshot.
    const versionUrl = `/api/v1/projects/${ref.projectId}/artifacts/${ref.id}/versions/1`;
    const first: unknown = await (
      await page.request.get(versionUrl, { headers: { authorization } })
    ).json();
    if (!Check(SourceInventoryArtifactSchema, first))
      throw new Error('Artifact does not match the contract.');
    expect(first.payload.programs[0]).toMatchObject({
      name: 'SampleProject',
      complete: false,
    });
    expect(first.payload.tableNames).toMatchObject({
      defaultSchema: 'APP',
      status: 'assumed',
    });
    expect(await readdir(join(dataDir, 'artifacts', '.staging'))).toEqual([]);

    await page.getByRole('radio', { name: '日本語' }).check();
    await expect(page.getByText('プログラム SAMPLE の詳細')).toBeVisible();
    // Desktop only (D7): Japanese labels do not overflow at 1280px.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    // Reload: same version and bytes, nothing started again.
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/);
    await page.reload();
    const ja = page.getByRole('region', { name: 'アセスメント概要' });
    await expect(ja.getByTestId('unique-code-lines')).toHaveText('52');
    const again: unknown = await (
      await page.request.get(versionUrl, { headers: { authorization } })
    ).json();
    expect(again).toEqual(first);
    expect(new Set(artifactReads)).toEqual(new Set([versionUrl]));
    expect(starts).toBe(1);
    expect(await treeHash(sourceRoot)).toBe(before);
  },
);
