import {
  fireEvent,
  render as renderWithLibrary,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIXTURE_IDS,
  artifactListFixture,
  mappedInventoryArtifactFixture,
} from '@portal/contracts/fixtures';
import type {
  ArtifactEnvelope,
  ArtifactList,
  SourceInventoryDocument,
} from '@portal/contracts';
import { AssessmentOverview } from './assessment-overview';
import { createArtifactsApi } from '../../shared/api/artifacts-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { useLocale } from '../../shared/i18n/locale-context';
import { json, requestUrl, testCredentials } from '../../testing/fixtures';
import { screenReportCorpus } from '../../testing/inventory-fixtures';

const projectId = FIXTURE_IDS.project;
const runId = FIXTURE_IDS.runs.succeeded;
const listUrl = `/api/v1/projects/${projectId}/runs/${runId}/artifacts`;
const versionUrl = `/api/v1/projects/${projectId}/artifacts/${FIXTURE_IDS.artifact}/versions/1`;

function JaSwitch() {
  const { setLocale } = useLocale();
  return <button onClick={() => setLocale('ja')}>ja</button>;
}

function render(ui: ReactElement) {
  return renderWithLibrary(
    <>
      <JaSwitch />
      {ui}
    </>,
    { wrapper: LocaleProvider },
  );
}

async function open(payload: SourceInventoryDocument) {
  const artifact = { ...mappedInventoryArtifactFixture, payload };
  const list: ArtifactList = {
    items: [{ ...artifactListFixture.items[0], id: artifact.id }],
  };
  const fetcher = vi.fn<typeof fetch>((input) => {
    const url = requestUrl(input);
    if (url === listUrl) return Promise.resolve(json(list));
    if (url === versionUrl)
      return Promise.resolve(json(artifact as ArtifactEnvelope));
    return Promise.resolve(json({ error: 'no route' }, 500));
  });
  render(
    <AssessmentOverview
      api={createArtifactsApi(fetcher, testCredentials)}
      projectId={projectId}
      runId={runId}
    />,
  );
  await screen.findByText('Danh sách program');
}

const kpi = (key: string) => {
  const card = document.querySelector(`[data-kpi="${key}"]`);
  if (!(card instanceof HTMLElement)) throw new Error(`kpi ${key}`);
  return card;
};

afterEach(() => {
  window.localStorage.clear();
});

describe('AR04-AC06 KPI cards and program columns', () => {
  it('matches the inventory: 3 screens (1 shared), 3 reports, 1 batch', async () => {
    await open(screenReportCorpus());
    expect(within(kpi('screens')).getByText('3')).toBeTruthy();
    expect(kpi('screens').textContent).toContain('1 dùng chung');
    expect(within(kpi('reports')).getByText('3')).toBeTruthy();
    expect(kpi('reports').textContent).toContain(
      '2 program nghi có xuất report',
    );
    expect(within(kpi('batches')).getByText('1')).toBeTruthy();
  });

  it('shows screens and reports per program, suspected apart, and sorts', async () => {
    await open(screenReportCorpus());
    const rowOf = (name: string) => {
      const row = screen.getByRole('button', { name }).closest('tr');
      if (!row) throw new Error(name);
      return row;
    };
    const cell = (name: string, col: string) =>
      rowOf(name).querySelector(`[data-col="${col}"]`)?.textContent ?? '';
    expect(cell('Order', 'screens')).toBe('2');
    expect(cell('Order', 'reports')).toBe('2');
    expect(cell('Invoice', 'reports')).toContain('2');
    expect(cell('Invoice', 'reports')).toContain('+1?');
    expect(cell('Batch', 'screens')).toBe('0');
    fireEvent.click(
      screen.getByRole('button', { name: 'Sắp xếp theo Màn hình' }),
    );
    const order = () =>
      screen
        .getAllByRole('button')
        .map((button) => button.textContent)
        .filter((text) => ['Order', 'Invoice', 'Batch'].includes(text ?? ''));
    // Descending first: Order and Invoice (2) before Batch (0).
    expect(order().at(-1)).toBe('Batch');
  });

  it('lists screens and reports with file:line and confidence in the program tab', async () => {
    await open(screenReportCorpus());
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    fireEvent.click(screen.getByRole('tab', { name: /^Màn hình và report/ }));
    const screens = screen.getByTestId('program-screens');
    expect(within(screens).getByText('frmInvoice')).toBeTruthy();
    expect(within(screens).getByText('Dùng chung')).toBeTruthy();
    const reports = screen.getByTestId('program-reports');
    expect(
      within(reports).getByText('programs/Invoice/Invoice.bas:20'),
    ).toBeTruthy();
    expect(
      within(reports).getByText(/Thiếu file \.rpt trong source/),
    ).toBeTruthy();
    expect(within(reports).getByText('Tham chiếu')).toBeTruthy();
    expect(within(reports).getByText('Nghi có')).toBeTruthy();
  });

  it('shows the same figures in Japanese', async () => {
    await open(screenReportCorpus());
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    await waitFor(() => expect(kpi('screens').textContent).toContain('画面'));
    expect(kpi('screens').textContent).toContain('共通 1 件');
    expect(kpi('reports').textContent).toContain('帳票（検出分）');
    expect(kpi('batches').textContent).toContain('バッチ');
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    fireEvent.click(screen.getByRole('tab', { name: /^画面と帳票/ }));
    const reports = screen.getByTestId('program-reports');
    expect(within(reports).getByText('参照')).toBeTruthy();
    expect(within(reports).getByText('疑い')).toBeTruthy();
    expect(
      within(reports).getByText(/ソースに \.rpt がありません/),
    ).toBeTruthy();
  });
});

describe('AR04-AC05 inventory without screen/report data', () => {
  it('says no data and never shows 0', async () => {
    await open(structuredClone(mappedInventoryArtifactFixture.payload));
    expect(screen.getByTestId('screen-report-nodata').textContent).toContain(
      'Chưa có dữ liệu',
    );
    for (const key of ['screens', 'reports', 'batches']) {
      expect(kpi(key).textContent).toContain('—');
      expect(within(kpi(key)).queryByText('0')).toBeNull();
    }
    const row = screen.getByRole('button', { name: 'Order' }).closest('tr');
    expect(row?.querySelector('[data-col="screens"]')?.textContent).toBe(
      'Chưa phân tích',
    );
    // The detail tab explains instead of listing nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Order' }));
    fireEvent.click(screen.getByRole('tab', { name: /^Màn hình và report/ }));
    expect(screen.getByTestId('program-screen-nodata')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Report \(帳票\)/ }));
    expect(screen.getByTestId('reports-nodata')).toBeTruthy();
  });
});

describe('AR04-AC11/AC12 report distribution and list', () => {
  const openReports = async () => {
    await open(screenReportCorpus());
    fireEvent.click(screen.getByRole('tab', { name: /^Report \(帳票\)/ }));
  };

  it('keeps total by kind, by level and in the list equal, labelled as reference with its version', async () => {
    await openReports();
    expect(screen.getByTestId('report-rows-by-level').textContent).toBe('5');
    expect(screen.getByTestId('report-rows-by-kind').textContent).toBe('5');
    expect(
      screen.getByTestId('report-table').querySelectorAll('tbody tr'),
    ).toHaveLength(5);
    expect(screen.getByTestId('report-reference').textContent).toContain(
      'Tham khảo · mô hình report-complexity-v1-draft',
    );
    const unrated = document.querySelector('[data-level="unrated"]');
    expect(unrated?.textContent).toContain('Chưa đánh giá');
    expect(unrated?.textContent).toContain('2');
  });

  it('lists every report with file:line, confidence, level, score and factors in the tooltip', async () => {
    await openReports();
    const table = screen.getByTestId('report-table');
    expect(within(table).getByText('programs/Order/Order.bas:12')).toBeTruthy();
    const high = within(table).getByText(/^Cao · 7/);
    expect(high.getAttribute('title')).toContain('Điểm rẽ nhánh: 30 → +3');
    expect(high.getAttribute('title')).toContain('Thiết kế chưa phân tích');
    // A shared report appears once, for both programs.
    expect(within(table).getAllByText('common.rpt')).toHaveLength(1);
    expect(within(table).getByText('Order, Invoice')).toBeTruthy();
    const unrated = within(table).getAllByText(/^Chưa đánh giá/)[0];
    expect(unrated?.textContent).toContain('Chỉ là dấu hiệu');
  });

  it('filters by level and kind and sorts by complexity with unrated last', async () => {
    await openReports();
    const table = () => screen.getByTestId('report-table');
    const names = () =>
      Array.from(table().querySelectorAll('tbody tr')).map(
        (row) => row.querySelectorAll('td')[2]?.textContent,
      );
    expect(names()).toEqual([
      'common.rpt',
      'order.rpt',
      'bill.rpt',
      'Excel.Application',
      'Printer',
    ]);
    fireEvent.change(screen.getByLabelText('Mức phức tạp'), {
      target: { value: 'high' },
    });
    expect(names()).toEqual(['order.rpt']);
    fireEvent.change(screen.getByLabelText('Mức phức tạp'), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByLabelText('Độ tin cậy'), {
      target: { value: 'suspected' },
    });
    expect(names()).toEqual(['Excel.Application', 'Printer']);
    fireEvent.change(screen.getByLabelText('Độ tin cậy'), {
      target: { value: 'all' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Sắp xếp theo Phức tạp (tham khảo)' }),
    );
    // Ascending: lowest score first, unrated still last.
    expect(names()).toEqual([
      'bill.rpt',
      'order.rpt',
      'common.rpt',
      'Excel.Application',
      'Printer',
    ]);
  });

  it('shows the list in Japanese', async () => {
    await openReports();
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    await waitFor(() =>
      expect(screen.getByTestId('report-reference').textContent).toContain(
        '参考値',
      ),
    );
    expect(screen.getByTestId('report-reference').textContent).toContain(
      '参考値 · モデル report-complexity-v1-draft',
    );
    const table = screen.getByTestId('report-table');
    expect(within(table).getAllByText(/^未評価/)).toHaveLength(2);
    expect(within(table).getByText(/^高 · 7/)).toBeTruthy();
  });
});
