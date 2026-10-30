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

const nodeTable = () => {
  fireEvent.click(screen.getByText('Bảng node (thay cho graph)'));
  return screen.getByRole('table');
};

describe('UI03 call graph tab', () => {
  beforeEach(() => window.localStorage.clear());

  it('lists every node with the same fan-in and fan-out as the graph', () => {
    render(<DependencyGraphView inventory={corpus} />);
    const table = nodeTable();
    expect(
      screen.getByText(`${graph.nodes.length} / ${graph.nodes.length} node`),
    ).toBeTruthy();
    const shared = graph.nodes.find(
      (node) => node.id === fileNodeId('common/Cmn01.bas'),
    );
    if (!shared) throw new Error('fixture');
    const row = table.querySelector(`tr[data-node="${shared.id}"]`);
    if (!(row instanceof HTMLElement)) throw new Error('row');
    const cells = within(row).getAllByRole('cell');
    expect(cells[2]?.textContent).toBe(String(shared.fanIn));
    expect(cells[3]?.textContent).toBe(String(shared.fanOut));
  });

  it('marks programs that were not analysed in the table', () => {
    render(<DependencyGraphView inventory={corpus} />);
    nodeTable();
    fireEvent.change(screen.getByLabelText('Tìm node'), {
      target: { value: 'F010049' },
    });
    const row = screen.getByRole('table').querySelector('tbody tr');
    if (!(row instanceof HTMLElement)) throw new Error('row');
    expect(within(row).getByText('Chưa phân tích')).toBeTruthy();
  });

  it('focuses a node from the table by keyboard and clears it with Escape', () => {
    render(<DependencyGraphView inventory={corpus} />);
    nodeTable();
    fireEvent.change(screen.getByLabelText('Loại node'), {
      target: { value: 'shared-module' },
    });
    const button = screen.getAllByRole('button', {
      name: 'Làm nổi bật Dùng chung Cmn01.bas',
    })[0];
    if (!button) throw new Error('button');
    button.focus();
    fireEvent.click(button);
    const card = screen.getByRole('region', { name: 'Node đang chọn' });
    expect(within(card).getByText('Cmn01.bas')).toBeTruthy();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Node đang chọn' })).toBeNull();
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
      screen.getByLabelText(/Hiện 2 module\/COM được hơn 80% program dùng/),
    ).toBeTruthy();
  });

  it('switches to Japanese without losing the focused node', () => {
    render(<DependencyGraphView inventory={corpus} />);
    nodeTable();
    const button = screen.getAllByRole('button', {
      name: /^Làm nổi bật Dùng chung Cmn02\.bas$/,
    })[0];
    if (!button) throw new Error('button');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    const card = screen.getByRole('region', { name: '選択中のノード' });
    expect(within(card).getByText('Cmn02.bas')).toBeTruthy();
    expect(screen.getByText('共通モジュール（ファンイン）')).toBeTruthy();
  });

  it('draws program states on the canvas and focuses a clicked node', () => {
    render(<DependencyGraphView inventory={corpus} />);
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
});
