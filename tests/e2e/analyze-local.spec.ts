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
    // UI04: step 1 of a new project. "Chọn thư mục" asks the backend for
    // its folder dialog; the dialog's answer is stubbed (no window in a
    // headless run). Nothing is stored until "Quét source": then the project
    // is created, the folder registered and the first run started.
    let picks = 0;
    await page.route('**/api/v1/local/folder-picker', async (route) => {
      picks++;
      expect(route.request().headers()['authorization']).toMatch(/^Bearer /);
      await route.fulfill({
        json: { status: 'selected', path: sourceRoot },
        headers: { 'cache-control': 'no-store' },
      });
    });
    let creates = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/projects$/.test(request.url()))
        creates++;
    });
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\/new$/);
    await page.getByRole('button', { name: 'Chọn thư mục' }).click();
    await expect(
      page.getByRole('heading', { name: 'Đã chọn thư mục' }),
    ).toBeVisible();
    expect(picks).toBe(1);
    expect(creates).toBe(0);
    await page.getByLabel('Tên dự án').fill(projectName);
    await page.getByRole('radio', { name: 'VB6' }).check();
    const registered = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        /\/source$/.test(response.url()),
    );
    await page.getByRole('button', { name: 'Quét source' }).click();
    const registration = await registered;
    expect(registration.status()).toBe(200);
    expect(creates).toBe(1);
    expect(
      (registration.request().postDataJSON() as { rootPath: string }).rootPath,
    ).toBe(sourceRoot);
    const authorization = registration.request().headers()['authorization'];
    if (!authorization) throw new Error('Source mutation has no credential.');
    // The created project's step 1 follows the run; the analysis step opens
    // by itself.
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });

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
    // A new source has no table-name mapping (no UI for it on step 1).
    await expect(detail.getByText(/Chưa cấu hình/).first()).toBeVisible();
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
      defaultSchema: null,
      status: 'unconfigured',
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
