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
import { deriveReportSummary } from '@portal/contracts';
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
    // Reports by template, with the design-file split; print and export
    // functions are a card of their own and are not added to the templates.
    const counts = deriveReportSummary(screenReportCorpus())?.counts;
    expect(within(kpi('reports')).getByText('3')).toBeTruthy();
    expect(kpi('reports').textContent).toContain(
      `Có file thiết kế ${counts?.designFile} · Thiếu file ${counts?.missingFile}`,
    );
    // Excel/CSV (Invoice) and print (Batch) are a card each.
    expect(within(kpi('exports')).getByText('1')).toBeTruthy();
    expect(kpi('exports').textContent).toContain('1 program');
    expect(within(kpi('prints')).getByText('1')).toBeTruthy();
    expect(kpi('prints').textContent).toContain('cần xác nhận');
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
    // One output function (Excel) next to the two templates.
    expect(cell('Invoice', 'reports')).toContain('+1 in/xuất');
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
    // The templates of the program with their uses (file:line), then its
    // output functions.
    const reports = screen.getByTestId('program-reports');
    expect(within(reports).getByText('common.rpt')).toBeTruthy();
    expect(within(reports).getByText('bill.rpt')).toBeTruthy();
    // The uses open from the row: file and line in their own columns.
    fireEvent.click(within(reports).getByRole('button', { name: 'bill.rpt' }));
    expect(
      within(reports).getAllByText('programs/Invoice/Invoice.bas').length,
    ).toBeGreaterThan(0);
    expect(within(reports).getAllByText('20').length).toBeGreaterThan(0);
    expect(within(reports).getAllByText('Thiếu file').length).toBeGreaterThan(
      0,
    );
    // The wording stays short: no request to the customer in the UI.
    expect(reports.textContent).not.toContain('xin khách');
    const functions = screen.getByTestId('program-functions');
    expect(within(functions).getByText('Xuất Excel')).toBeTruthy();
  });

  it('shows the same figures in Japanese', async () => {
    await open(screenReportCorpus());
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    await waitFor(() => expect(kpi('screens').textContent).toContain('画面'));
    expect(kpi('screens').textContent).toContain('共通 1 件');
    expect(kpi('reports').textContent).toContain('帳票（種類）');
    expect(kpi('exports').textContent).toContain('Excel/CSV出力');
    expect(kpi('prints').textContent).toContain('印刷・その他出力');
    expect(kpi('batches').textContent).toContain('バッチ');
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    fireEvent.click(screen.getByRole('tab', { name: /^画面と帳票/ }));
    const reports = screen.getByTestId('program-reports');
    expect(within(reports).getAllByText('ファイルなし').length).toBeGreaterThan(
      0,
    );
    const functions = screen.getByTestId('program-functions');
    expect(within(functions).getByText('Excel出力')).toBeTruthy();
  });
});

describe('AR04-AC05 inventory without screen/report data', () => {
  it('says no data and never shows 0', async () => {
    await open(structuredClone(mappedInventoryArtifactFixture.payload));
    expect(screen.getByTestId('screen-report-nodata').textContent).toContain(
      'Chưa có dữ liệu',
    );
    for (const key of ['screens', 'reports', 'exports', 'prints', 'batches']) {
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

describe('AR04-AC11/AC12 report templates and output functions', () => {
  const openReports = async () => {
    await open(screenReportCorpus());
    fireEvent.click(screen.getByRole('tab', { name: /^Report \(帳票\)/ }));
  };

  it('counts templates in the level chips and the list; the two function lists are apart', async () => {
    await openReports();
    expect(screen.getByTestId('report-rows-by-level').textContent).toBe('3');
    expect(
      screen.getByTestId('report-template-table').querySelectorAll('tbody tr'),
    ).toHaveLength(3);
    expect(
      screen.getByTestId('export-function-table').querySelectorAll('tbody tr'),
    ).toHaveLength(1);
    expect(
      screen.getByTestId('output-function-table').querySelectorAll('tbody tr'),
    ).toHaveLength(1);
    // A level without a template shows no empty chip for "not rated".
    const unrated = document.querySelector('[data-level="unrated"]');
    expect(unrated === null || /[1-9]/.test(unrated.textContent ?? '')).toBe(
      true,
    );
  });

  it('lists each template once with its design-file state, and opens its uses from the row', async () => {
    await openReports();
    const table = screen.getByTestId('report-template-table');
    // A shared template appears once, for both programs.
    expect(within(table).getAllByText('common.rpt')).toHaveLength(1);
    expect(within(table).getByText('Invoice, Order')).toBeTruthy();
    expect(within(table).getByText('Thiếu file')).toBeTruthy();
    const high = within(table).getByText(/^Cao · 7/);
    expect(high.getAttribute('title')).toContain('Điểm rẽ nhánh: 30 → +3');
    expect(high.getAttribute('title')).toContain('Thiết kế chưa phân tích');
    // No request to the customer and no model version in the UI.
    expect(document.body.textContent).not.toContain('xin khách');
    expect(document.body.textContent).not.toContain('report-complexity-v1');
    // The number of uses is a plain number; the row opens a small table.
    expect(within(table).queryByText(/nơi$/)).toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: 'common.rpt' }));
    expect(within(table).getAllByText(/.bas$/).length).toBeGreaterThan(0);
    expect(
      within(table).getByRole('columnheader', { name: 'Procedure' }),
    ).toBeTruthy();
    expect(
      within(table)
        .getByRole('button', { name: 'common.rpt' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('says what each function list is and that it is not counted as a report', async () => {
    await openReports();
    expect(
      screen.getByRole('heading', { name: /^Xuất Excel\/CSV/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /^In và ghi file khác/ }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('export-function-table')).getByText(
        'Xuất Excel',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('output-function-table')).getByText('In'),
    ).toBeTruthy();
  });

  it('finds a template by name', async () => {
    await openReports();
    fireEvent.change(screen.getByLabelText('Tìm report'), {
      target: { value: 'bill' },
    });
    const table = screen.getByTestId('report-template-table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(within(table).getByText('bill.rpt')).toBeTruthy();
  });

  it('shows the tab in Japanese', async () => {
    await openReports();
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Excel/CSV出力（要確認）' }),
      ).toBeTruthy(),
    );
    expect(
      screen.getByRole('heading', { name: '印刷・その他出力（要確認）' }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('export-function-table')).getByText(
        'Excel出力',
      ),
    ).toBeTruthy();
  });
});
