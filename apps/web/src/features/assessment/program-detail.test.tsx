import {
  fireEvent,
  render as renderWithLibrary,
  screen,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mappedInventoryFixture,
  partialInventoryFixture,
  unmappedInventoryFixture,
} from '@portal/contracts/fixtures';
import type { SourceInventoryDocument } from '@portal/contracts';
import { ProgramDetail } from './program-detail';
import { programDetail } from './program-detail-model';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { LOCALE_STORAGE_KEY } from '../../shared/i18n/locale';

type Inventory = SourceInventoryDocument;
const PATH = 'programs/Order/Order.vbp';

function render(ui: ReactElement) {
  return renderWithLibrary(ui, { wrapper: LocaleProvider });
}

function clone(inventory: Inventory): Inventory {
  return structuredClone(inventory);
}

function firstProgram(inventory: Inventory) {
  const [program] = inventory.programs;
  if (!program) throw new Error('fixture has a program');
  return program;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('Program detail (F04)', () => {
  it('F04-AC01 toggles raw/mapped CRUD without changing the raw metrics', () => {
    render(
      <ProgramDetail inventory={mappedInventoryFixture} projectPath={PATH} />,
    );
    const raw = screen.getByTestId('crud-raw');
    expect(within(raw).getByText('APP.ORDERS')).toBeTruthy();
    expect(within(raw).getByText('ORDERS')).toBeTruthy();
    expect(screen.getByTestId('detail-raw-complexity').textContent).toContain(
      'Thấp (12)',
    );
    expect(screen.getByRole('note').textContent).toContain(
      'Giả định, cần người quản lý DB xác nhận (APP)',
    );

    fireEvent.click(screen.getByLabelText('Sau ánh xạ tên bảng'));
    const mapped = screen.getByTestId('crud-mapped');
    const row = within(mapped).getByText('ORDERS').closest('tr');
    expect(row?.textContent).toContain('APP.ORDERS, ORDERS');
    expect(row?.textContent).toContain('R U');
    expect(screen.queryByTestId('crud-raw')).toBeNull();
    // The raw score is the analyzer's and does not follow the toggle.
    expect(screen.getByTestId('detail-raw-complexity').textContent).toContain(
      'Thấp (12)',
    );
    expect(screen.getByText('Độ phức tạp sau ánh xạ')).toBeTruthy();
    expect(screen.getByTestId('detail-own-code-lines').textContent).toBe('6');

    fireEvent.click(screen.getByLabelText('Tên như trong mã nguồn'));
    expect(screen.getByTestId('crud-raw')).toBeTruthy();
  });

  it('falls back to the names as written, labelled, when the mapped view is absent', () => {
    render(
      <ProgramDetail inventory={unmappedInventoryFixture} projectPath={PATH} />,
    );
    fireEvent.click(screen.getByLabelText('Sau ánh xạ tên bảng'));
    expect(screen.getByTestId('crud-raw')).toBeTruthy();
    expect(screen.queryByTestId('crud-mapped')).toBeNull();
    expect(screen.getByText(/không có góc nhìn sau ánh xạ/)).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain(
      'Không có (kiểm kê cũ',
    );
    expect(screen.queryByText('Độ phức tạp sau ánh xạ')).toBeNull();
  });

  it('F04-AC02 shows ambiguous calls as undetermined, never as a guessed link', () => {
    const inventory = clone(mappedInventoryFixture);
    const analysis = firstProgram(inventory).analysis;
    if (!analysis) throw new Error('fixture is analyzed');
    analysis.calls = [
      {
        from: 'cmn/OrderRules.bas#Function:LoadOrders',
        name: 'Recalc',
        resolution: 'ambiguous',
        targets: ['a/A.bas#Sub:Recalc', 'b/B.bas#Sub:Recalc'],
        line: 7,
        count: 2,
      },
      {
        from: 'cmn/OrderRules.bas#file',
        name: 'GetTickCount',
        resolution: 'external',
        targets: ['cmn/OrderRules.bas#declare:GetTickCount'],
        line: 2,
        count: 1,
      },
    ];
    const { container } = render(
      <ProgramDetail inventory={inventory} projectPath={PATH} />,
    );
    const row = screen.getByText('Recalc').closest('tr');
    expect(row?.textContent).toContain('Chưa xác định');
    expect(row?.textContent).toContain(
      'a/A.bas#Sub:Recalc, b/B.bas#Sub:Recalc',
    );
    expect(screen.getByText('API ngoài')).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
  });

  it('F04-AC02 shows an unanalyzed program and files as unavailable, not zero', () => {
    const inventory = clone(partialInventoryFixture);
    const program = firstProgram(inventory);
    program.analysis = null;
    program.members.push({
      kind: 'Class',
      name: 'Legacy',
      declaredPath: 'Legacy.cls',
      relativePath: 'programs/Order/Legacy.cls',
      resolution: 'resolved',
      fileStatus: 'unsupported',
      shared: false,
    });
    render(<ProgramDetail inventory={inventory} projectPath={PATH} />);
    expect(
      screen.getByText(/chưa được phân tích nên không có LoC/),
    ).toBeTruthy();
    expect(screen.queryByTestId('detail-own-code-lines')).toBeNull();
    expect(screen.queryByText('CRUD theo bảng')).toBeNull();
    const missing = screen.getByText('frmOrderEdit.frm').closest('tr');
    expect(missing?.textContent).toContain('Không tìm thấy');
    expect(missing?.textContent).toContain('Chưa phân tích');
    expect(missing?.textContent).not.toMatch(/\b0\b/);
    const legacy = screen.getByText('programs/Order/Legacy.cls').closest('tr');
    expect(legacy?.textContent).toContain('UNBALANCED_BLOCK');
    expect(legacy?.textContent).toContain('Chưa phân tích');
    expect(screen.getByText(/Program chưa đầy đủ/)).toBeTruthy();
  });

  it('F04-AC03 renders source text with HTML/script as escaped text', () => {
    const inventory = clone(mappedInventoryFixture);
    const program = firstProgram(inventory);
    const payload =
      '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
    program.name = payload;
    const analysis = program.analysis;
    if (!analysis) throw new Error('fixture is analyzed');
    analysis.crud = analysis.crud.map((entry) => ({
      ...entry,
      table: payload,
    }));
    analysis.crud.length = 1;
    analysis.calls = [
      {
        from: payload,
        name: payload,
        resolution: 'ambiguous',
        targets: [payload],
        line: 1,
        count: 1,
      },
    ];
    const { container } = render(
      <ProgramDetail inventory={inventory} projectPath={PATH} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain(payload);
    expect((window as { __xss?: number }).__xss).toBeUndefined();
  });

  it('lists procedures per member file once and keeps shared and own LoC apart', () => {
    const inventory = clone(mappedInventoryFixture);
    const program = firstProgram(inventory);
    // The same file declared twice and shared with another program.
    const member = program.members[0];
    if (!member) throw new Error('fixture has a member');
    program.members = [
      { ...member, shared: true },
      { ...member, declaredPath: 'OrderRules.bas', shared: true },
    ];
    const detail = programDetail(inventory, PATH);
    expect(detail?.analysis?.procedures).toHaveLength(1);
    expect(detail?.analysis?.procedures[0]).toMatchObject({
      name: 'LoadOrders',
      codeLines: 5,
      shared: true,
    });
    // Both values come from the inventory; nothing is added up here.
    expect(detail?.analysis).toMatchObject({ ownCodeLines: 6, codeLines: 6 });
    expect(detail?.members.map((row) => row.codeLines)).toEqual([6, 6]);
    expect(programDetail(inventory, 'not/a/program.vbp')).toBeNull();
  });

  it('renders the Japanese catalog and keeps the view toggle keyboard reachable', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ja');
    render(
      <ProgramDetail inventory={mappedInventoryFixture} projectPath={PATH} />,
    );
    expect(screen.getByText('プログラム Order の詳細')).toBeTruthy();
    const mapped = screen.getByRole('radio', {
      name: 'テーブル名マッピング後',
    });
    mapped.focus();
    expect(document.activeElement).toBe(mapped);
    fireEvent.click(mapped);
    expect(screen.getByTestId('crud-mapped')).toBeTruthy();
    expect(screen.getByText('プロシージャとLoC')).toBeTruthy();
  });
});
