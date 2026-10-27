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
    fireEvent.click(screen.getByRole('button', { name: 'Order' }));
    expect(screen.getByText('Không tìm thấy')).toBeTruthy();
  });

  it('reads an inventory written before table name mapping', async () => {
    const server = serve(unmappedInventoryArtifactFixture);
    render(
      <AssessmentOverview
        api={server.api}
        projectId={projectId}
        runId={runId}
      />,
    );
    expect(
      await screen.findByText(
        'Không có (kiểm kê cũ, chỉ có tên như trong mã nguồn)',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/sau ánh xạ/)).toBeNull();
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
    expect(invoice.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('File của Invoice')).toBeTruthy();
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
    expect(await screen.findByText(/chưa có kết quả kiểm kê/)).toBeTruthy();
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
    expect(await screen.findByText(/chưa có kết quả kiểm kê/)).toBeTruthy();
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
    expect(screen.getByText('ソース全体の合計（重複なし）')).toBeTruthy();
    expect(server.calls).toHaveLength(2);
  });
});
