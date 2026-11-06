import type { Project } from '@portal/contracts';
import { describe, expect, it, vi } from 'vitest';
import { demoInventory } from '../../adapters/fake/demo-inventory.js';
import { AppError } from '../../shared/app-error.js';
import { createReportDownloadService } from './report-download.service.js';

// Review finding 5: a table that cannot fit an Excel worksheet is a clear
// 422 for xlsx, while the JSON report of the same inventory still works.
vi.mock('./inventory-report-workbook.js', () => ({
  inventoryReportSheets: () => [
    {
      name: 'Big',
      columns: [{ header: 'A' }],
      // Only the length is read before the guard refuses the sheet.
      rows: { length: 2_000_000 },
    },
  ],
}));

describe('report download past the worksheet limit', () => {
  const service = createReportDownloadService({
    projects: { get: () => ({ name: 'P' }) as Project },
    artifacts: {
      getVersion: () =>
        Promise.resolve({
          payload: demoInventory,
          mode: 'demo',
          projectId: 'p',
          runId: 'r',
          id: 'a',
          version: 1,
          createdAt: '2026-11-06T00:00:00.000Z',
        } as never),
    },
    now: () => new Date('2026-11-06T00:00:00Z'),
  });

  it('answers REPORT_TOO_LARGE for xlsx and still builds the JSON', async () => {
    await expect(service.build('p', 'a', '1', 'xlsx')).rejects.toMatchObject({
      constructor: AppError,
      code: 'REPORT_TOO_LARGE',
    });
    const json = await service.build('p', 'a', '1', 'json');
    expect(String(json.body)).toContain('inventory-report-v1');
  });
});
