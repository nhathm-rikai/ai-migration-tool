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
  it('matches the inventory: 3 screens (1 shared), 5 reports, 1 batch', async () => {
    await open(screenReportCorpus());
    expect(within(kpi('screens')).getByText('3')).toBeTruthy();
    expect(kpi('screens').textContent).toContain('1 dùng chung');
    // One total over Crystal, code print and CSV/Excel export.
    expect(within(kpi('reports')).getByText('5')).toBeTruthy();
    expect(kpi('reports').textContent).toContain(
      'Crystal 3 · In bằng code 1 · CSV/Excel 1',
    );
    expect(kpi('reports').textContent).toContain('Thiếu file .rpt: 1');
    expect(within(kpi('batches')).getByText('1')).toBeTruthy();
    expect(document.querySelector('[data-kpi="exports"]')).toBeNull();
    expect(document.querySelector('[data-kpi="prints"]')).toBeNull();
  });

  it('shows screens and reports per program and sorts', async () => {
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
    // bill.rpt, common.rpt and the CSV/Excel export of the form.
    expect(cell('Invoice', 'reports')).toBe('3');
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

  it('lists the screens and the reports of a program in its tab', async () => {
    await open(screenReportCorpus());
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    fireEvent.click(screen.getByRole('tab', { name: /^Màn hình và report/ }));
    const screens = screen.getByTestId('program-screens');
    expect(within(screens).getByText('frmInvoice')).toBeTruthy();
    expect(within(screens).getByText('Dùng chung')).toBeTruthy();
    const reports = screen.getByTestId('program-reports');
    expect(within(reports).getByText('common.rpt')).toBeTruthy();
    expect(within(reports).getByText('bill.rpt')).toBeTruthy();
    expect(within(reports).getByText('Xuất CSV/Excel')).toBeTruthy();
    // The uses open from the row: file and line in their own columns.
    fireEvent.click(within(reports).getByRole('button', { name: 'bill.rpt' }));
    expect(
      within(reports).getAllByText('programs/Invoice/Invoice.bas').length,
    ).toBeGreaterThan(0);
    expect(within(reports).getAllByText('20').length).toBeGreaterThan(0);
    expect(within(reports).getAllByText('Thiếu file').length).toBeGreaterThan(
      0,
    );
  });

  it('shows the same figures in Japanese', async () => {
    await open(screenReportCorpus());
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    await waitFor(() => expect(kpi('screens').textContent).toContain('画面'));
    expect(kpi('screens').textContent).toContain('共通 1 件');
    expect(kpi('reports').textContent).toContain('帳票数（算定基準による）');
    expect(kpi('reports').textContent).toContain(
      'Crystal 3 · コード印刷 1 · CSV・Excel出力 1',
    );
    expect(kpi('batches').textContent).toContain('バッチ');
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    fireEvent.click(screen.getByRole('tab', { name: /^画面と帳票/ }));
    const reports = screen.getByTestId('program-reports');
    expect(within(reports).getAllByText('なし').length).toBeGreaterThan(0);
    expect(within(reports).getByText('CSV・Excel出力')).toBeTruthy();
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

describe('AR04-AC11/AC12 one list of reports', () => {
  const openReports = async () => {
    await open(screenReportCorpus());
    fireEvent.click(screen.getByRole('tab', { name: /^Report \(帳票\)/ }));
  };
  const rows = () =>
    screen
      .getByTestId('report-template-table')
      .querySelectorAll('tbody tr.program-row');

  it('counts every report once in the histogram and in the list', async () => {
    await openReports();
    expect(screen.getByTestId('report-rows-by-level').textContent).toBe('5');
    expect(rows()).toHaveLength(5);
  });

  it('a level raised by the missing design says so and shows no score as a rating', async () => {
    await openReports();
    const table = screen.getByTestId('report-template-table');
    fireEvent.click(within(table).getByRole('button', { name: 'bill.rpt' }));
    const detail = within(table).getByTestId('report-complexity-detail');
    expect(
      within(detail).getByTestId('report-complexity-reason').textContent,
    ).toBe('Chưa phân tích thiết kế .rpt nên mức tối thiểu là Trung bình');
    expect(within(detail).queryByTestId('report-complexity-score')).toBeNull();
    expect(within(detail).getByText('Bảng truy cập')).toBeTruthy();
  });

  it('lists a shared template once with its design-file state, and opens its uses from the row', async () => {
    await openReports();
    const table = screen.getByTestId('report-template-table');
    expect(within(table).getAllByText('common.rpt')).toHaveLength(1);
    expect(within(table).getByText('Invoice, Order')).toBeTruthy();
    expect(within(table).getByText('Thiếu file')).toBeTruthy();
    // The list shows the level only: no score, no factors.
    const high = within(table).getByText('Cao');
    expect(high.getAttribute('title')).toBeNull();
    expect(table.textContent).not.toMatch(/(Cao|Trung bình|Thấp) · [0-9]/);
    expect(document.body.textContent).not.toContain('report-complexity-v1');
    const highRow = high.closest('tr');
    if (!highRow) throw new Error('row');
    const toggle = within(highRow).getByRole('button');
    fireEvent.click(toggle);
    // The score and each factor (measured value and points) are in the detail.
    const detail = within(table).getByTestId('report-complexity-detail');
    expect(within(detail).getByText('Điểm rẽ nhánh')).toBeTruthy();
    expect(detail.textContent).toContain('30');
    expect(detail.textContent).toContain('+3');
    expect(
      within(detail).getByTestId('report-complexity-score').textContent,
    ).toBe('Tổng điểm: 7');
    expect(within(table).getAllByText(/.bas$/).length).toBeGreaterThan(0);
    expect(
      within(table).getByRole('columnheader', { name: 'Procedure' }),
    ).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('has one "Cơ sở tính" block with the conventions, and no word of doubt', async () => {
    await openReports();
    const basis = screen.getByTestId('report-basis');
    expect(basis.textContent).toContain('Cơ sở tính');
    for (const id of [
      'template',
      'file-unit',
      'overlap',
      'other-output',
      'log-temp',
      'complexity',
    ])
      expect(basis.querySelector(`[data-basis="${id}"]`)).not.toBeNull();
    expect(basis.textContent).toContain('sales/Detail.rpt');
    expect(basis.textContent).toContain('không bảo đảm loại hết');
    expect(basis.textContent).toContain('chưa gồm thiết kế layout');
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Giả định:');
    for (const word of ['tham khảo', 'cần xác nhận', 'chưa chứng minh'])
      expect(text).not.toContain(word);
    expect(text).not.toMatch(/(?<!\p{L})nghi(?!\p{L})/u);
  });

  it('filters by how the report is made and by name', async () => {
    await openReports();
    fireEvent.change(screen.getByLabelText('Tạo bằng'), {
      target: { value: 'print' },
    });
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Tạo bằng'), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByLabelText('Tìm report'), {
      target: { value: 'bill' },
    });
    expect(rows()).toHaveLength(1);
    expect(
      within(screen.getByTestId('report-template-table')).getByText('bill.rpt'),
    ).toBeTruthy();
  });

  it('keeps file output that is not a report in a folded section', async () => {
    await openReports();
    expect(screen.getByTestId('data-file-count').textContent).toBe('0');
  });

  it('shows the tab in Japanese', async () => {
    await openReports();
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    await waitFor(() =>
      expect(screen.getByTestId('report-basis').textContent).toContain(
        '算定基準',
      ),
    );
    expect(screen.getByTestId('report-basis').textContent).toContain(
      '換算単位',
    );
    expect(
      within(screen.getByTestId('report-template-table')).getByText(
        'コード印刷',
      ),
    ).toBeTruthy();
  });
});
