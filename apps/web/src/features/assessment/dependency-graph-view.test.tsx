import {
  fireEvent,
  render as renderWithLibrary,
  screen,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { syntheticCorpusFixture } from '@portal/contracts/fixtures';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { useLocale } from '../../shared/i18n/locale-context';
import { buildDependencyGraph, fileNodeId } from './dependency-graph';
import { DependencyGraphView } from './dependency-graph-view';

// UI03-AC04: the node table carries the canvas numbers and is usable by
// keyboard; focus from the table or panel shows the node card; VI/JA.

const corpus = syntheticCorpusFixture({
  programs: 50,
  sharedModules: 6,
  tables: 10,
  folders: 3,
});
const graph = buildDependencyGraph(corpus);

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

// Picks a node through the search above the canvas (the only list of
// nodes since the node table was dropped).
const pick = (text: string, name: RegExp) => {
  fireEvent.change(screen.getByLabelText('Tìm program, module, bảng'), {
    target: { value: text },
  });
  const results = screen.getByRole('list', { name: 'Kết quả tìm' });
  const button = within(results).getByRole('button', { name });
  button.focus();
  fireEvent.click(button);
};

describe('UI03 call graph tab', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the fan-in and fan-out of a node picked in the search', () => {
    render(<DependencyGraphView inventory={corpus} />);
    const shared = graph.nodes.find(
      (node) => node.id === fileNodeId('common/Cmn01.bas'),
    );
    if (!shared) throw new Error('fixture');
    pick('Cmn01', /Cmn01\.bas/);
    const card = screen.getByRole('region', { name: 'Node đang chọn' });
    const numbers = within(card).getAllByRole('definition');
    expect(numbers[0]?.textContent).toBe(String(shared.fanIn));
    expect(numbers[1]?.textContent).toBe(String(shared.fanOut));
  });

  it('marks a program that was not analysed', () => {
    render(<DependencyGraphView inventory={corpus} />);
    pick('F010049', /F010049/);
    const card = screen.getByRole('region', { name: 'Node đang chọn' });
    expect(within(card).getByText(/Chưa phân tích/)).toBeTruthy();
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    expect(
      within(canvas).getAllByText('Chưa phân tích nên chưa biết phụ thuộc')
        .length,
    ).toBeGreaterThan(0);
  });

  it('focuses a node by keyboard and clears it with Escape', () => {
    render(<DependencyGraphView inventory={corpus} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở tất cả thư mục' }));
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    const button = within(canvas).getByRole('button', {
      name: 'Làm nổi bật Program F000000',
    });
    button.focus();
    fireEvent.click(button);
    const card = screen.getByRole('region', { name: 'Node đang chọn' });
    expect(within(card).getByText('F000000')).toBeTruthy();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Node đang chọn' })).toBeNull();
  });

  it('has no hint line and no node table, only the search', () => {
    render(<DependencyGraphView inventory={corpus} />);
    expect(screen.queryByText(/Bấm vào một node/)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByLabelText('Tìm program, module, bảng')).toBeTruthy();
  });

  it('shows common modules by fan-in and says which are hidden', () => {
    render(<DependencyGraphView inventory={corpus} />);
    const panel = screen.getByRole('complementary', {
      name: 'Common module (fan-in)',
    });
    const items = within(panel).getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('Cmn00.bas');
    expect(items[0]?.textContent).toContain('đang ẩn');
    expect(
      screen.getByLabelText('Hiện module hầu hết program đều dùng (2)'),
    ).toBeTruthy();
  });

  it('switches to Japanese without losing the focused node', () => {
    render(<DependencyGraphView inventory={corpus} />);
    pick('Cmn02', /Cmn02\.bas/);
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    const card = screen.getByRole('region', { name: '選択中のノード' });
    expect(within(card).getByText('Cmn02.bas')).toBeTruthy();
    expect(screen.getByText('共通モジュール（ファンイン）')).toBeTruthy();
  });

  it('starts with one node per folder and opens a folder on click', () => {
    render(<DependencyGraphView inventory={corpus} />);
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    // 50 programs in 3 folders: collapsed by default, no program drawn.
    expect(
      within(canvas).queryAllByRole('button', {
        name: /^Làm nổi bật Program /,
      }),
    ).toHaveLength(0);
    const folder = within(canvas).getByRole('button', {
      name: 'Mở thư mục F00 (17 program)',
    });
    fireEvent.click(folder);
    expect(
      within(canvas).getByRole('button', {
        name: 'Làm nổi bật Program F000000',
      }),
    ).toBeTruthy();
    expect(
      within(canvas).queryByRole('button', { name: /^Mở thư mục F00 / }),
    ).toBeNull();
    fireEvent.click(
      within(canvas).getByRole('button', { name: 'Thu gọn thư mục F00' }),
    );
    expect(
      within(canvas).getByRole('button', { name: /^Mở thư mục F00 / }),
    ).toBeTruthy();
  });

  it('draws many tables as one node until it is opened', () => {
    const many = syntheticCorpusFixture({
      programs: 35,
      sharedModules: 3,
      tables: 200,
    });
    render(<DependencyGraphView inventory={many} />);
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    expect(
      within(canvas).queryAllByRole('button', {
        name: /^Làm nổi bật Bảng DB /,
      }),
    ).toHaveLength(0);
    fireEvent.click(
      within(canvas).getByRole('button', { name: /^Mở Bảng DB \(\d+ node\)$/ }),
    );
    expect(
      within(canvas).getAllByRole('button', { name: /^Làm nổi bật Bảng DB / })
        .length,
    ).toBeGreaterThan(40);
    fireEvent.click(
      within(canvas).getByRole('button', { name: 'Thu gọn Bảng DB' }),
    );
    expect(
      within(canvas).queryAllByRole('button', {
        name: /^Làm nổi bật Bảng DB /,
      }),
    ).toHaveLength(0);
  });

  it('finds a program with the search and opens its folder', () => {
    render(<DependencyGraphView inventory={corpus} />);
    fireEvent.change(screen.getByLabelText('Tìm program, module, bảng'), {
      target: { value: 'F010004' },
    });
    const results = screen.getByRole('list', { name: 'Kết quả tìm' });
    fireEvent.click(within(results).getAllByRole('button')[0] as HTMLElement);
    const card = screen.getByRole('region', { name: 'Node đang chọn' });
    expect(within(card).getByText('F010004')).toBeTruthy();
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    expect(
      within(canvas)
        .getByRole('button', { name: 'Làm nổi bật Program F010004' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('draws program states on the canvas and focuses a clicked node', () => {
    render(<DependencyGraphView inventory={corpus} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở tất cả thư mục' }));
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    expect(
      within(canvas).getAllByText('Chưa phân tích nên chưa biết phụ thuộc')
        .length,
    ).toBeGreaterThan(0);
    const node = within(canvas).getByRole('button', {
      name: 'Làm nổi bật Program F000000',
    });
    fireEvent.click(node);
    expect(node.getAttribute('aria-pressed')).toBe('true');
    expect(canvas.className).toContain('has-focus');
    fireEvent.click(node);
    expect(canvas.className).not.toContain('has-focus');
  });

  it('lists open folders, outlines the last one and closes from the list', () => {
    render(<DependencyGraphView inventory={corpus} />);
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    expect(
      screen.queryByRole('button', { name: 'Đưa F01 vào khung nhìn' }),
    ).toBeNull();
    fireEvent.click(
      within(canvas).getByRole('button', { name: /^Mở thư mục F01 / }),
    );
    const open = screen.getByRole('list', { name: 'Đang mở' });
    const chip = within(open).getByRole('button', {
      name: 'Đưa F01 vào khung nhìn',
    });
    expect(chip.closest('li')?.className).toContain('recent');
    expect(
      canvas.querySelector('.react-flow__node.recent .dep-folder'),
    ).not.toBeNull();
    fireEvent.click(within(open).getByRole('button', { name: 'Thu gọn F01' }));
    expect(
      screen.queryByRole('button', { name: 'Đưa F01 vào khung nhìn' }),
    ).toBeNull();
    expect(
      within(canvas).getByRole('button', { name: /^Mở thư mục F01 / }),
    ).toBeTruthy();
  });

  it('opens full screen over the page and leaves it with Escape', () => {
    render(<DependencyGraphView inventory={corpus} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Xem toàn màn hình' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Call graph toàn dự án',
    });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe('hidden');
    // The same canvas, still drawn: nothing was remounted away.
    expect(
      within(dialog).getByRole('group', { name: 'Call graph toàn dự án' }),
    ).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(
      screen.getByRole('button', { name: 'Xem toàn màn hình' }),
    ).toBeTruthy();
  });

  it('highlights a closed folder on click and opens it from its own button', () => {
    render(<DependencyGraphView inventory={corpus} />);
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    const folder = within(canvas).getByRole('button', {
      name: 'Làm nổi bật đường nối của F01 (17 program)',
    });
    fireEvent.click(folder);
    expect(canvas.className).toContain('has-focus');
    expect(folder.getAttribute('aria-pressed')).toBe('true');
    // Still closed: no program of F01 drawn.
    expect(
      within(canvas).queryByRole('button', {
        name: 'Làm nổi bật Program F010004',
      }),
    ).toBeNull();
    const card = screen.getByRole('region', { name: 'Node đang chọn' });
    expect(within(card).getByText('F01')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Mở ra' }));
    // The opened folder is no longer one node: nothing stays focused and
    // the graph is not left dimmed.
    expect(canvas.className).not.toContain('has-focus');
    expect(screen.queryByRole('region', { name: 'Node đang chọn' })).toBeNull();
    expect(
      within(canvas).getByRole('button', {
        name: 'Làm nổi bật Program F010004',
      }),
    ).toBeTruthy();
  });

  it('starts with every box closed, even in a small corpus', () => {
    const small = syntheticCorpusFixture({
      programs: 6,
      sharedModules: 2,
      tables: 4,
      folders: 2,
      components: 2,
    });
    render(<DependencyGraphView inventory={small} />);
    const canvas = screen.getByRole('group', { name: 'Call graph toàn dự án' });
    expect(
      within(canvas).getByRole('button', { name: /^Mở Bảng DB / }),
    ).toBeTruthy();
    expect(
      within(canvas).getByRole('button', { name: /^Mở COM / }),
    ).toBeTruthy();
    expect(
      within(canvas).getAllByRole('button', { name: /^Mở thư mục / }),
    ).toHaveLength(2);
    expect(screen.queryByRole('list', { name: 'Đang mở' })).toBeNull();
  });
});
