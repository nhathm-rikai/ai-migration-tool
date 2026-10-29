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
  errorResponseFixture,
  mappedInventoryArtifactFixture,
  partialInventoryArtifactFixture,
  unmappedInventoryArtifactFixture,
} from '@portal/contracts/fixtures';
import type {
  ArtifactEnvelope,
  ArtifactList,
  SourceInventoryDocument,
} from '@portal/contracts';
import { AssessmentOverview } from './assessment-overview';
import { inferredCorpus } from '../../testing/inventory-fixtures';
import { summarizeInventory } from './assessment-summary';
import { createArtifactsApi } from '../../shared/api/artifacts-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { useLocale } from '../../shared/i18n/locale-context';
import { json, requestUrl, testCredentials } from '../../testing/fixtures';

const projectId = FIXTURE_IDS.project;
const runId = FIXTURE_IDS.runs.succeeded;
const listUrl = (run: string) =>
  `/api/v1/projects/${projectId}/runs/${run}/artifacts`;
const versionUrl = (id: string, version = 1) =>
  `/api/v1/projects/${projectId}/artifacts/${id}/versions/${version}`;

type Handler = () => Response | Promise<Response>;

function createServer(routes: Record<string, Handler>) {
  const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const handler = routes[url];
    if (!handler) return Promise.resolve(json({ error: 'no route' }, 500));
    return Promise.resolve(handler());
  });
  return { api: createArtifactsApi(fetcher, testCredentials), calls };
}

function render(ui: ReactElement) {
  return renderWithLibrary(ui, { wrapper: LocaleProvider });
}

function serve(artifact: ArtifactEnvelope) {
  const list: ArtifactList = {
    items: [{ ...artifactListFixture.items[0], id: artifact.id }],
  };
  return createServer({
    [listUrl(runId)]: () => json(list),
    [versionUrl(artifact.id)]: () => json(artifact),
  });
}

// Two programs declaring the same shared module: per-program LoC counts it
// twice, the unique corpus total once.
type Inventory = SourceInventoryDocument;
function sharedInventory(): Inventory {
  const base: Inventory = structuredClone(
    mappedInventoryArtifactFixture.payload,
  );
  const [program] = base.programs;
  if (!program) throw new Error('fixture has a program');
  const shared = program.members.map((member) => ({ ...member, shared: true }));
  const second = {
    ...structuredClone(program),
    projectPath: 'programs/Invoice/Invoice.vbp',
    name: 'Invoice',
    members: shared,
  };
  return {
    ...base,
    programs: [{ ...program, members: shared }, second],
  };
}

const openPrograms = () =>
  fireEvent.click(screen.getByRole('tab', { name: /^Danh sách program/ }));

afterEach(() => {
  window.localStorage.clear();
});

describe('Assessment overview (F03)', () => {
  it('shows loading, then the exact version header, unique totals and program list', async () => {
    let release: () => void = () => undefined;
    const server = createServer({
      [listUrl(runId)]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(artifactListFixture));
        }),
      [versionUrl(FIXTURE_IDS.artifact)]: () =>
        json(mappedInventoryArtifactFixture),
    });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Đang tải kết quả kiểm kê',
    );
    release();
    expect(await screen.findByText('Danh sách program')).toBeTruthy();
    expect(
      screen.getByText(`${FIXTURE_IDS.artifact.slice(0, 8)} · v1`),
    ).toBeTruthy();
    expect(
      screen.getByText('Giả định, cần người quản lý DB xác nhận'),
    ).toBeTruthy();
    expect(screen.getByTestId('unique-code-lines').textContent).toContain('6');
    expect(screen.getByTestId('coverage').textContent).toContain('1 / 1');
    // Draft complexity is labelled, never presented as final.
    expect(screen.getAllByText('Nháp').length).toBeGreaterThan(0);
    expect(server.calls).toEqual([
      `GET ${listUrl(runId)}`,
      `GET ${versionUrl(FIXTURE_IDS.artifact)}`,
    ]);
  });

  it('keeps unique and per-program totals apart when a file is shared (F03-AC02)', async () => {
    const payload = sharedInventory();
    const summary = summarizeInventory(payload);
    expect(summary.unique.codeLines).toBe(
      payload.totals.uniqueCounters.codeLines,
    );
    expect(summary.perProgramCodeLines).toBe(
      2 * payload.totals.uniqueCounters.codeLines,
    );
    expect(summary.unique.sharedFiles).toBe(1);
    const server = serve({ ...mappedInventoryArtifactFixture, payload });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    expect(
      (await screen.findByTestId('unique-code-lines')).textContent,
    ).toContain('6');
    expect(screen.getByTestId('per-program-code-lines').textContent).toContain(
      '12',
    );
    openPrograms();
    fireEvent.click(screen.getByRole('button', { name: 'Order' }));
    expect(screen.getAllByText('Dùng chung').length).toBeGreaterThan(0);
  });

  it('warns on a partial inventory and never shows an unanalysed program as 0 (F03-AC01)', async () => {
    const partial = structuredClone(
      partialInventoryArtifactFixture,
    ) as ArtifactEnvelope;
    partial.payload.programs.push({
      projectPath: 'programs/Broken/Broken.vbp',
      status: 'unsupported',
      issue: { reason: 'PROJECT_NOT_DECODED', line: null },
      name: null,
      members: [],
      externalReferences: [],
      counters: partial.payload.programs[0]?.counters ?? {
        physicalLines: 0,
        designerLines: 0,
        metadataLines: 0,
        blankLines: 0,
        commentOnlyLines: 0,
        codeLines: 0,
        unclassifiedLines: 0,
      },
      complete: false,
      analysis: null,
    });
    const server = serve(partial);
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    expect(await screen.findByText('Kiểm kê chưa đầy đủ.')).toBeTruthy();
    for (const code of [
      'PROGRAM_UNSUPPORTED',
      'PROGRAM_INCOMPLETE',
      'MEMBER_UNRESOLVED',
      'FILE_ERROR',
      'FILE_UNSUPPORTED',
      'FILES_SKIPPED',
    ])
      expect(screen.getByText(code)).toBeTruthy();
    const row = screen
      .getByText('programs/Broken/Broken.vbp', { selector: 'span' })
      .closest('tr');
    if (!row) throw new Error('row');
    expect(within(row).getByText('Không phân tích được')).toBeTruthy();
    expect(within(row).getAllByText('Chưa phân tích')).toHaveLength(5);
    expect(within(row).queryByText('0')).toBeNull();
    // Members of the partial program show why it is incomplete.
    openPrograms();
    fireEvent.click(screen.getByRole('button', { name: 'Order' }));
    expect(screen.getByText('Không tìm thấy')).toBeTruthy();
  });

  it('assumes the most common schema prefix for an inventory without a configured schema', async () => {
    const server = serve(unmappedInventoryArtifactFixture);
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    expect(
      await screen.findByText('Sau ánh xạ · giả định schema APP'),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/Giả định schema APP \(tiền tố xuất hiện nhiều nhất/)
        .length,
    ).toBeGreaterThan(0);
    // The list counts tables on the inferred view (APP.ORDERS = ORDERS).
    expect(screen.getByText('(sau ánh xạ: 1)')).toBeTruthy();
  });

  it('searches, filters and selects programs', async () => {
    const server = serve({
      ...mappedInventoryArtifactFixture,
      payload: sharedInventory(),
    });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    await screen.findByText('Đang hiển thị 2 / 2 program');
    openPrograms();
    fireEvent.change(screen.getByLabelText('Tìm program'), {
      target: { value: 'invo' },
    });
    expect(screen.getByText('Đang hiển thị 1 / 2 program')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Order' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Tìm program'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Độ phức tạp'), {
      target: { value: 'high' },
    });
    expect(screen.getByText('Không có program khớp bộ lọc.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Độ phức tạp'), {
      target: { value: 'all' },
    });
    const invoice = screen.getByRole('button', { name: 'Invoice' });
    fireEvent.click(invoice);
    expect(invoice.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('File của Invoice')).toBeTruthy();
  });

  it('shows and filters the Very High level', async () => {
    const inventory = sharedInventory();
    const invoice = inventory.programs[1];
    if (!invoice?.analysis) throw new Error('fixture has an analysis');
    invoice.analysis.complexity = {
      ...invoice.analysis.complexity,
      version: 'complexity-v1',
      score: 78,
      level: 'very-high',
    };
    const server = serve({
      ...mappedInventoryArtifactFixture,
      payload: inventory,
    });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    await screen.findByText('Đang hiển thị 2 / 2 program');
    expect(screen.getByRole('button', { name: /Rất cao/ })).toBeTruthy();
    openPrograms();
    fireEvent.change(screen.getByLabelText('Độ phức tạp'), {
      target: { value: 'very-high' },
    });
    expect(screen.getByText('Đang hiển thị 1 / 2 program')).toBeTruthy();
    expect(screen.getByText('Rất cao · 78')).toBeTruthy();
  });

  it('shows an empty state when the run has no published inventory', async () => {
    const server = createServer({
      [listUrl(runId)]: () => json({ items: [] }),
    });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    expect(await screen.findByText(/không có kết quả kiểm kê/)).toBeTruthy();
    expect(server.calls).toHaveLength(1);
  });

  it('shows the artifact error by code and recovers on retry', async () => {
    let failing = true;
    const server = createServer({
      [listUrl(runId)]: () => json(artifactListFixture),
      [versionUrl(FIXTURE_IDS.artifact)]: () =>
        failing
          ? json(errorResponseFixture('ARTIFACT_NOT_FOUND'), 404)
          : json(mappedInventoryArtifactFixture),
    });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Không tìm thấy phiên bản kết quả này',
    );
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại kết quả' }));
    expect(await screen.findByText('Danh sách program')).toBeTruthy();
  });

  it('rejects an envelope that is not the version it asked for', async () => {
    const server = createServer({
      [listUrl(runId)]: () => json(artifactListFixture),
      [versionUrl(FIXTURE_IDS.artifact)]: () =>
        json({ ...mappedInventoryArtifactFixture, version: 2 }),
    });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'không khớp phiên bản',
    );
  });

  it('drops the late answer of a previous run', async () => {
    const otherRun = FIXTURE_IDS.runs.failed;
    let releaseOld: () => void = () => undefined;
    const server = createServer({
      [listUrl(runId)]: () =>
        new Promise<Response>((resolve) => {
          releaseOld = () => resolve(json(artifactListFixture));
        }),
      [listUrl(otherRun)]: () => json({ items: [] }),
      [versionUrl(FIXTURE_IDS.artifact)]: () =>
        json(mappedInventoryArtifactFixture),
    });
    const view = render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    view.rerender(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={otherRun}
      />,
    );
    expect(await screen.findByText(/không có kết quả kiểm kê/)).toBeTruthy();
    releaseOld();
    await waitFor(() => expect(server.calls).toHaveLength(2));
    expect(screen.queryByText('Danh sách program')).toBeNull();
  });

  it('switches labels to Japanese without reloading', async () => {
    const server = serve(mappedInventoryArtifactFixture);
    function LocaleSwitch() {
      const { setLocale } = useLocale();
      return <button onClick={() => setLocale('ja')}>ja</button>;
    }
    render(
      <>
        <LocaleSwitch />
        <AssessmentOverview
          api={server.api}
          projectId={projectId}
          runId={runId}
        />
      </>,
    );
    await screen.findByText('Danh sách program');
    fireEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(screen.getByText('プログラム一覧')).toBeTruthy();
    expect(screen.getByText('コード行の内訳')).toBeTruthy();
    expect(server.calls).toHaveLength(2);
  });

  it('pages and sorts a long program list, names programs by file', async () => {
    const base: Inventory = structuredClone(
      mappedInventoryArtifactFixture.payload,
    );
    const [program] = base.programs;
    const analysis = program?.analysis;
    if (!program || !analysis)
      throw new Error('fixture has an analyzed program');
    // 60 programs that all keep the IDE default name "Project1".
    const payload: Inventory = {
      ...base,
      programs: Array.from({ length: 60 }, (_, index) => ({
        ...structuredClone(program),
        projectPath: `programs/P${String(index).padStart(2, '0')}.vbp`,
        name: 'Project1',
        analysis: {
          ...structuredClone(analysis),
          complexity: { ...analysis.complexity, score: index },
        },
      })),
    };
    const server = serve({ ...mappedInventoryArtifactFixture, payload });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    await screen.findByText('Đang hiển thị 60 / 60 program');
    openPrograms();
    const names = () =>
      screen
        .getAllByRole('button', { expanded: false })
        .map((button) => button.textContent)
        .filter((text) => text?.startsWith('P'));
    // Default: highest complexity first, 50 rows per page.
    expect(names()).toHaveLength(50);
    expect(names()[0]).toBe('P59');
    expect(screen.getAllByText('Tên trong project: Project1').length).toBe(50);
    expect(screen.getByText('Trang 1 / 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(names()).toHaveLength(10);
    fireEvent.click(
      screen.getByRole('button', { name: 'Sắp xếp theo Program' }),
    );
    expect(screen.getByText('Trang 1 / 2')).toBeTruthy();
    expect(names()[0]).toBe('P00');
  });

  it('names missing member files and does not count a case-only difference as missing', async () => {
    const base: Inventory = structuredClone(
      mappedInventoryArtifactFixture.payload,
    );
    const [program] = base.programs;
    if (!program) throw new Error('fixture has a program');
    const member = (
      declaredPath: string,
      resolution: 'missing' | 'case-mismatch',
    ) => ({
      kind: 'module',
      name: null,
      declaredPath,
      relativePath: resolution === 'missing' ? null : 'cmn/Common.bas',
      resolution,
      fileStatus: resolution === 'missing' ? null : ('analyzed' as const),
      shared: false,
    });
    const payload: Inventory = {
      ...base,
      programs: [
        {
          ...structuredClone(program),
          projectPath: 'a/A.vbp',
          members: [
            ...program.members,
            member('..\\cmn\\SFTP.BAS', 'missing'),
            member('..\\cmn\\COMMON.BAS', 'case-mismatch'),
          ],
        },
        {
          ...structuredClone(program),
          projectPath: 'b/c/B.vbp',
          members: [
            ...program.members,
            member('..\\..\\cmn\\sftp.bas', 'missing'),
          ],
        },
        {
          ...structuredClone(program),
          projectPath: 'd/D.vbp',
          members: [
            ...program.members,
            member('..\\cmn\\COMMON.BAS', 'case-mismatch'),
          ],
        },
      ],
    };
    const summary = summarizeInventory(payload);
    // Two relative paths from different folders point to the same file.
    expect(summary.missingMembers).toEqual([
      { path: 'cmn/SFTP.BAS', resolution: 'missing', programs: 2 },
    ]);
    expect(
      summary.programs.find((row) => row.projectPath === 'd/D.vbp')
        ?.unresolvedMembers,
    ).toBe(0);
    const server = serve({ ...mappedInventoryArtifactFixture, payload });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    const item = (await screen.findByText('cmn/SFTP.BAS')).closest('li');
    expect(item?.textContent).toContain('2 program');
    expect(item?.textContent).toContain('không tìm thấy');
  });

  it('keeps missing files apart by folder and by reason, whatever the program order', () => {
    const base: Inventory = structuredClone(
      mappedInventoryArtifactFixture.payload,
    );
    const [program] = base.programs;
    if (!program) throw new Error('fixture has a program');
    const withMember = (
      projectPath: string,
      declaredPath: string,
      resolution: 'missing' | 'absolute-path',
    ) => ({
      ...structuredClone(program),
      projectPath,
      members: [
        ...program.members,
        {
          kind: 'module',
          name: null,
          declaredPath,
          relativePath: null,
          resolution,
          fileStatus: null,
          shared: false,
        },
      ],
    });
    const programs = [
      withMember('app/A.vbp', 'one-lib\\Common.bas', 'missing'),
      withMember('app/B.vbp', 'two-lib\\Common.bas', 'missing'),
      withMember('app/C.vbp', 'C:\\legacy\\Common.bas', 'absolute-path'),
    ];
    const expected = [
      { path: 'app/one-lib/Common.bas', resolution: 'missing', programs: 1 },
      { path: 'app/two-lib/Common.bas', resolution: 'missing', programs: 1 },
      {
        path: 'C:\\legacy\\Common.bas',
        resolution: 'absolute-path',
        programs: 1,
      },
    ];
    for (const order of [programs, [...programs].reverse()]) {
      const summary = summarizeInventory({ ...base, programs: order });
      expect(summary.missingMembers).toEqual(expect.arrayContaining(expected));
      expect(summary.missingMembers).toHaveLength(3);
    }
  });

  it('opens the list filtered from a warning of the overview', async () => {
    const server = serve(partialInventoryArtifactFixture);
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    await screen.findByText('Kiểm kê chưa đầy đủ.');
    const [show] = screen.getAllByRole('button', { name: 'Xem danh sách' });
    if (!show) throw new Error('warning links to the list');
    fireEvent.click(show);
    expect(
      screen
        .getByRole('tab', { name: /^Danh sách program/ })
        .getAttribute('aria-selected'),
    ).toBe('true');
    const state = screen.getByLabelText('Trạng thái');
    if (!(state instanceof HTMLSelectElement)) throw new Error('select');
    expect(state.value).not.toBe('all');
  });

  it('UI02 opens the program detail inline under its row and links to document generation', async () => {
    const server = serve(mappedInventoryArtifactFixture);
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    const toggle = await screen.findByRole('button', { name: 'Order' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const detail = screen.getByRole('region', {
      name: 'Chi tiết program Order',
    });
    // The detail row directly follows the program row.
    const row = toggle.closest('tr');
    expect(row?.nextElementSibling?.contains(detail)).toBe(true);
    expect(
      screen
        .getByRole('link', { name: /Tạo tài liệu cho program này/ })
        .getAttribute('href'),
    ).toBe(
      `/projects/${projectId}/documents?program=${encodeURIComponent('programs/Order/Order.vbp')}`,
    );
    fireEvent.click(toggle);
    expect(
      screen.queryByRole('region', { name: 'Chi tiết program Order' }),
    ).toBeNull();
  });

  it('UI02 shows KPI cards, the line split and the histogram filtering the list', async () => {
    const server = serve(mappedInventoryArtifactFixture);
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    await screen.findByText('Phân bổ dòng code');
    const kpi = (key: string) => {
      const card = document.querySelector(`[data-kpi="${key}"]`);
      if (!(card instanceof HTMLElement)) throw new Error(key);
      return card;
    };
    expect(within(kpi('programs')).getByText('1')).toBeTruthy();
    expect(within(kpi('physical')).getByText('9')).toBeTruthy();
    expect(within(kpi('sql')).getByText('2')).toBeTruthy();
    expect(within(kpi('tables')).getByText('Sau ánh xạ tên bảng')).toBeTruthy();
    expect(screen.getByTestId('loc-code').textContent).toBe('6');
    expect(screen.queryByTestId('loc-unclassified')).toBeNull();
    expect(screen.getByText(/Tham khảo · complexity-v0-draft/)).toBeTruthy();
    // Empty levels cannot be picked; a bar opens the list filtered on it.
    expect(
      screen
        .getByRole('button', { name: /^0Trung bình/ })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^1Thấp/ }));
    const level = screen.getByLabelText('Độ phức tạp');
    if (!(level instanceof HTMLSelectElement)) throw new Error('select');
    expect(level.value).toBe('low');
  });

  it('UI02 lists project-wide CRUD in the DB tab, raw and mapped', async () => {
    const server = serve(mappedInventoryArtifactFixture);
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    fireEvent.click(await screen.findByRole('tab', { name: /^Bảng DB/ }));
    const matrix = screen.getByRole('region', { name: 'Bảng DB' });
    expect(within(matrix).getAllByRole('row')).toHaveLength(2);
    expect(within(matrix).getByRole('rowheader').textContent).toBe('ORDERS');
    fireEvent.click(within(matrix).getByLabelText('Tên như trong mã nguồn'));
    expect(
      within(matrix)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['APP.ORDERS', 'ORDERS']);
  });

  it('UI02 shows one table in KPI, list and detail on an inferred schema, without the stored mapped score (review fix)', async () => {
    const payload = inferredCorpus();
    const server = serve({ ...mappedInventoryArtifactFixture, payload });
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    await screen.findByText('Sau ánh xạ · giả định schema HAN01');
    const tables = document.querySelector('[data-kpi="tables"]');
    if (!(tables instanceof HTMLElement)) throw new Error('kpi');
    expect(within(tables).getByText('1')).toBeTruthy();
    expect(screen.getByText('(sau ánh xạ: 1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Order' }));
    const detail = screen.getByRole('region', {
      name: 'Chi tiết program Order',
    });
    expect(within(detail).queryByText('Độ phức tạp sau ánh xạ')).toBeNull();
    fireEvent.click(within(detail).getByRole('tab', { name: /^CRUD/ }));
    expect(within(detail).getAllByRole('rowheader')).toHaveLength(1);
  });
});
