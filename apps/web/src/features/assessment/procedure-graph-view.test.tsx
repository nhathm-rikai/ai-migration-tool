import {
  fireEvent,
  render as renderWithLibrary,
  screen,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { useLocale } from '../../shared/i18n/locale-context';
import {
  PROCEDURE_PROGRAM,
  procedureCorpus,
} from '../../testing/inventory-fixtures';
import { ProgramDetail } from './program-detail';
import { ProcedureGraphView } from './procedure-graph-view';

// UI04: the call graph tab of the program detail opens lazily, says what
// it draws, and the side card lists callers, callees and tables as
// buttons usable by keyboard; VI/JA.

function LocaleSwitch() {
  const { setLocale } = useLocale();
  return <button onClick={() => setLocale('ja')}>ja</button>;
}

function render(ui: ReactElement) {
  return renderWithLibrary(
    <LocaleProvider>
      <LocaleSwitch />
      {ui}
    </LocaleProvider>,
  );
}

afterEach(() => window.localStorage.clear());

describe('UI04 procedure call graph tab', () => {
  it('opens from the program detail and summarises the graph', async () => {
    render(
      <ProgramDetail
        inventory={procedureCorpus()}
        projectPath={PROCEDURE_PROGRAM}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Sơ đồ gọi' }));
    const summary = await screen.findByTestId('procedure-graph-summary');
    expect(summary.textContent).toBe(
      '4 procedure riêng · 4 procedure dùng chung gọi tới được · 10 liên kết · Bảng theo tên sau ánh xạ',
    );
    expect(
      screen.getByLabelText('Hiện 1 procedure không gọi và không được gọi'),
    ).toBeTruthy();
  });

  it('focuses a procedure from the search and lists its relations', () => {
    render(
      <ProcedureGraphView
        inventory={procedureCorpus()}
        projectPath={PROCEDURE_PROGRAM}
      />,
    );
    fireEvent.change(screen.getByLabelText('Tìm procedure, API, bảng'), {
      target: { value: 'utilrun' },
    });
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Kết quả tìm' })).getByRole(
        'button',
        { name: /UtilRun/ },
      ),
    );
    const card = screen.getByRole('complementary', {
      name: 'Procedure đang chọn',
    });
    expect(within(card).getByText('Được gọi bởi')).toBeTruthy();
    expect(within(card).getByText('Gọi tới')).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: /GetTickCount.*3 lần/ }),
    ).toBeTruthy();

    // Picking a callee from the card moves the focus there.
    fireEvent.click(within(card).getByRole('button', { name: /UtilDb/ }));
    expect(within(card).getByText('Bảng truy cập')).toBeTruthy();
    expect(within(card).getByRole('button', { name: /LOGS.*C/ })).toBeTruthy();

    fireEvent.keyDown(card, { key: 'Escape' });
    expect(within(card).queryByText('Bảng truy cập')).toBeNull();
  });

  it('shows a hidden procedure when it is picked and switches to Japanese', () => {
    render(
      <ProcedureGraphView
        inventory={procedureCorpus()}
        projectPath={PROCEDURE_PROGRAM}
      />,
    );
    const toggle = screen.getByLabelText(
      'Hiện 1 procedure không gọi và không được gọi',
    );
    if (!(toggle instanceof HTMLInputElement)) throw new Error('checkbox');
    expect(toggle.checked).toBe(false);
    fireEvent.change(screen.getByLabelText('Tìm procedure, API, bảng'), {
      target: { value: 'Isolated' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Isolated/ }));
    expect(toggle.checked).toBe(true);
    expect(
      screen.getByText('Không gọi, không được gọi và không truy cập bảng.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(
      screen.getByText('呼び出し・被呼び出し・テーブルアクセスはありません。'),
    ).toBeTruthy();
  });

  it('says so when the program has no procedure', () => {
    const inventory = procedureCorpus();
    inventory.files = [];
    render(
      <ProcedureGraphView
        inventory={inventory}
        projectPath={PROCEDURE_PROGRAM}
      />,
    );
    expect(
      screen.getByText(
        'Program này không có procedure nào trong các file đã phân tích.',
      ),
    ).toBeTruthy();
  });
});
