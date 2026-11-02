import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Response } from '@playwright/test';
import {
  CurrentRunResponseSchema,
  ProjectSchema,
  ProjectSourceResponseSchema,
} from '@portal/contracts';
import type { Static, TSchema } from 'typebox';
import { Check } from 'typebox/value';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; run npm run e2e.`);
  return value;
};
const sha = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');

async function payload<T extends TSchema>(
  response: Response,
  schema: T,
): Promise<Static<T>> {
  const value: unknown = await response.json();
  if (!Check(schema, value)) throw new Error('Unexpected E2E API payload.');
  return value;
}

// PF05: source registration is a cheap check, execution takes an immutable
// snapshot, and reopening never starts a second run. All paths are owned by
// the harness; no customer source or personal data is used.
test(
  'register local source, reject stale updates, snapshot and reopen',
  { tag: '@smoke' },
  async ({ page }, testInfo) => {
    const sourceRoot = required('E2E_SOURCE_ROOT');
    const dataDir = required('E2E_DATA_DIR');
    const sourceFiles = [
      'MAIN.BAS',
      'BOM.BAS',
      'FORM.FRX',
      join('.claude', 'settings.json'),
    ];
    const before = await Promise.all(
      sourceFiles.map(async (name) =>
        sha(await readFile(join(sourceRoot, name))),
      ),
    );
    let starts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/runs$/.test(request.url()))
        starts++;
    });
    const projectName = `PF05 local ${Date.now()}`;
    await page.goto('/');
    await page.getByLabel('Tên dự án').fill(projectName);
    await page.getByRole('radio', { name: /Mã nguồn trên máy này/ }).check();
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/projects$/.test(response.url()),
    );
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    const project = await payload(await created, ProjectSchema);
    expect(project.mode).toBe('local');
    // UI04: the scan card asks for the folder, then offers "Quét source".
    const card = page.getByRole('region', { name: /thư mục/ });
    const folder = page.getByLabel('Đường dẫn thư mục source (tuyệt đối)');
    const scan = page.getByRole('button', { name: 'Quét source' });
    const choose = page.getByRole('heading', { name: 'Chọn thư mục source' });
    await expect(choose).toBeVisible();
    await expect(scan).toHaveCount(0);

    const save = async (expectedStatus: number) => {
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          /\/source$/.test(response.url()),
      );
      await page.getByRole('button', { name: 'Chọn thư mục' }).click();
      const response = await pending;
      expect(response.status()).toBe(expectedStatus);
      const text = await response.text();
      expect(text).not.toContain(sourceRoot);
      expect(text).not.toContain(dataDir);
      return response;
    };

    // Rejected writes keep the input and register nothing.
    await folder.fill('relative/source');
    await save(400);
    await expect(folder).toHaveValue('relative/source');
    for (const forbidden of [required('E2E_REPOSITORY_ROOT'), dataDir]) {
      await folder.fill(forbidden);
      await save(422);
      await expect(card.getByRole('alert')).toContainText(
        'Không được dùng thư mục này',
      );
      await expect(choose).toBeVisible();
    }
    await folder.fill(sourceRoot + '-missing');
    await save(422);
    await expect(card.getByRole('alert')).toContainText(
      'Thư mục không tồn tại',
    );
    await folder.fill(sourceRoot);
    const registered = await save(200);
    const registration = await payload(registered, ProjectSourceResponseSchema);
    expect(registration.source).toMatchObject({
      kind: 'local',
      revision: 1,
      status: 'ready',
      // Table-name mapping is not shown (02/11/2026): a new source stays
      // unconfigured.
      tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
    });
    const authorization = registered.request().headers()['authorization'];
    if (!authorization) throw new Error('Source mutation has no credential.');
    const headers = { authorization };
    const url = `/api/v1/projects/${project.id}/source`;
    await expect(
      page.getByRole('heading', { name: 'Đã chọn thư mục' }),
    ).toBeVisible();
    await expect(scan).toBeEnabled();
    expect(starts).toBe(0);

    // Another client advances the revision while the folder is being changed.
    await page.getByRole('button', { name: 'Đổi thư mục' }).click();
    await folder.fill(sourceRoot);
    const concurrent = await page.request.put(url, {
      headers,
      data: {
        rootPath: sourceRoot,
        profileId: 'vb6-cp932-v1',
        tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
        expectedSourceRevision: 1,
      },
    });
    expect(concurrent.status()).toBe(200);
    await save(409);
    await expect(card.getByRole('alert')).toContainText(
      'Mã nguồn vừa được cập nhật',
    );
    await expect(folder).toHaveValue(sourceRoot);
    const refreshed = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /\/source$/.test(response.url()),
    );
    await card.getByRole('button', { name: 'Tải lại mã nguồn' }).click();
    expect(
      (await payload(await refreshed, ProjectSourceResponseSchema)).source
        ?.revision,
    ).toBe(2);
    const updated = await payload(await save(200), ProjectSourceResponseSchema);
    // The mapping set elsewhere is kept as it was.
    expect(updated.source).toMatchObject({
      revision: 3,
      tableNameMapping: { defaultSchema: 'APP', status: 'assumed' },
    });

    // "Quét source" needs the analysis language of a new source.
    await scan.click();
    await expect(
      page.getByText('Chọn ngôn ngữ phân tích trước khi quét.'),
    ).toBeVisible();
    expect(starts).toBe(0);
    await page.getByRole('radio', { name: 'VB6' }).check();
    await scan.click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/analysis\/[^/]+$/, {
      timeout: 20_000,
    });
    const currentResponse = await page.request.get(
      `/api/v1/projects/${project.id}/runs/current`,
      { headers },
    );
    const current: unknown = await currentResponse.json();
    if (
      !Check(CurrentRunResponseSchema, current) ||
      current.run?.status !== 'succeeded'
    )
      throw new Error('Local run did not publish its snapshot.');
    const run = current.run;
    expect(run.source).toMatchObject({ kind: 'local', revision: 3 });
    expect(starts).toBe(1);
    const snapshot = join(dataDir, 'snapshots', run.sourceSnapshotId);
    const normalized = "Sub Main()\n' あ\nEnd Sub\n";
    const raw = await readFile(join(sourceRoot, 'MAIN.BAS'));
    expect(await readFile(join(snapshot, 'raw', 'MAIN.BAS'))).toEqual(raw);
    expect(
      await readFile(join(snapshot, 'normalized', 'MAIN.BAS'), 'utf8'),
    ).toBe(normalized);
    const manifest: unknown = JSON.parse(
      await readFile(join(snapshot, 'manifest.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      schemaVersion: 'source-snapshot-v1',
      snapshotId: run.sourceSnapshotId,
      fileCount: 3,
      entries: expect.arrayContaining([
        {
          relativePath: 'MAIN.BAS',
          role: 'code',
          byteLength: raw.length,
          rawSha256: sha(raw),
          kind: 'text',
          encoding: 'cp932',
          encodingSource: 'profile',
          normalizedSha256: sha(normalized),
          lineCount: 3,
          newlineStyle: 'crlf',
        },
      ]),
      skipped: expect.arrayContaining([
        expect.objectContaining({
          relativePath: '.claude/settings.json',
          reason: 'excluded',
        }),
      ]),
    });
    expect(await readdir(join(dataDir, 'snapshots', '.staging'))).toEqual([]);
    expect(
      await Promise.all(
        sourceFiles.map(async (name) =>
          sha(await readFile(join(sourceRoot, name))),
        ),
      ),
    ).toEqual(before);
    // Back on the source step: the scan card offers the last result.
    await page.goBack();
    await expect(
      page.getByRole('button', { name: 'Xem kết quả lần quét gần nhất' }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('pf05-desktop-vi.png'),
      fullPage: true,
    });

    await page.getByRole('radio', { name: '日本語' }).check();
    const lastJa = page.getByRole('button', {
      name: '前回のスキャン結果を見る',
    });
    await expect(lastJa).toBeVisible();
    // Desktop only (D7): Japanese labels do not overflow at 1280px.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // Reload stays on the project's source step and starts nothing.
    await page.reload();
    await expect(lastJa).toBeVisible();
    await expect(page.getByRole('radio', { name: 'VB6' })).toBeChecked();
    expect(starts).toBe(1);
    expect(page.url()).not.toContain(sourceRoot);
  },
);
