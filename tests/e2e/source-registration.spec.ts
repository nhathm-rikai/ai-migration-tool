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
    // UI04: the source step has the scan card (Start) and the project
    // information form (folder, mapping, Save).
    const source = page.getByRole('form', { name: 'Thông tin dự án' });
    const folder = source.getByLabel('Thư mục source (đường dẫn tuyệt đối)');
    const start = page.getByRole('button', { name: 'Bắt đầu phân tích' });
    const noSource = page.getByRole('heading', {
      name: 'Chưa có thư mục source',
    });
    await expect(noSource).toBeVisible();
    await expect(start).toBeDisabled();

    const save = async (expectedStatus: number) => {
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          /\/source$/.test(response.url()),
      );
      await source.getByRole('button', { name: 'Lưu thông tin' }).click();
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
      await expect(source.getByRole('alert')).toContainText(
        'Không được dùng thư mục này',
      );
      await expect(noSource).toBeVisible();
    }
    await folder.fill(sourceRoot + '-missing');
    await save(422);
    await expect(source.getByRole('alert')).toContainText(
      'Thư mục không tồn tại',
    );
    await folder.fill(sourceRoot);
    await source.getByText('Ánh xạ tên bảng (tùy chọn)').click();
    await source
      .getByLabel('Schema mặc định của tên bảng')
      .selectOption('assumed');
    await source.getByLabel('Tên schema', { exact: true }).fill('APP');
    const registered = await save(200);
    const registration = await payload(registered, ProjectSourceResponseSchema);
    expect(registration.source).toMatchObject({
      kind: 'local',
      revision: 1,
      status: 'ready',
    });
    const authorization = registered.request().headers()['authorization'];
    if (!authorization) throw new Error('Source mutation has no credential.');
    const headers = { authorization };
    const url = `/api/v1/projects/${project.id}/source`;
    await expect(start).toBeEnabled();
    await expect(folder).toHaveValue('');
    expect(starts).toBe(0);

    // Another client advances the revision while this edit is open.
    await folder.fill(sourceRoot);
    await source
      .getByLabel('Schema mặc định của tên bảng')
      .selectOption('confirmed');
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
    await expect(source.getByRole('alert')).toContainText(
      'Mã nguồn vừa được cập nhật',
    );
    await expect(folder).toHaveValue(sourceRoot);
    await expect(source.getByLabel('Schema mặc định của tên bảng')).toHaveValue(
      'confirmed',
    );
    const refreshed = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /\/source$/.test(response.url()),
    );
    await source.getByRole('button', { name: 'Tải lại mã nguồn' }).click();
    expect(
      (await payload(await refreshed, ProjectSourceResponseSchema)).source
        ?.revision,
    ).toBe(2);
    const updated = await payload(await save(200), ProjectSourceResponseSchema);
    expect(updated.source).toMatchObject({
      revision: 3,
      tableNameMapping: { defaultSchema: 'APP', status: 'confirmed' },
    });

    // UI04-AC04: the customer is saved with the project before Start.
    await source.getByLabel('Khách hàng').fill('Khách hàng mẫu');
    await start.click();
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
    // Back on the source step: the run is in the history.
    await page.goBack();
    const done = page.locator('.run-history .run-status', {
      hasText: 'Hoàn tất',
    });
    await expect(done).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('pf05-desktop-vi.png'),
      fullPage: true,
    });

    await page.getByRole('radio', { name: '日本語' }).check();
    const doneJa = page.locator('.run-history .run-status', {
      hasText: '完了',
    });
    await expect(doneJa).toBeVisible();
    // Desktop only (D7): Japanese labels do not overflow at 1280px.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // Reload stays on the project's source step.
    await page.reload();
    await expect(doneJa).toBeVisible();
    await expect(page.getByLabel('顧客')).toHaveValue('Khách hàng mẫu');
    // The run ID is technical information, folded by default.
    await page.locator('.run-detail details.technical > summary').click();
    await expect(page.getByText(run.id, { exact: true }).first()).toBeVisible();
    expect(starts).toBe(1);
    expect(page.url()).not.toContain(sourceRoot);
  },
);
