import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  CurrentDocumentRunResponse,
  DocumentRun,
} from '@portal/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import type { DocumentsApi } from '../../shared/api/documents-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { DocumentsStep } from './documents-step';

afterEach(cleanup);

const PROJECT = '11111111-1111-4111-8111-111111111111';
const ANALYSIS = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const ARTIFACT = '44444444-4444-4444-8444-444444444444';
const PACKAGE = '55555555-5555-4555-8555-555555555555';

const programs = [
  { projectPath: 'src/ORDER.VBP', name: 'ORDER' },
  { projectPath: 'src/CUSTOMER.VBP', name: 'CUSTOMER' },
].map((program) => ({
  ...program,
  members: [{ kind: 'form', shared: false }],
}));

// Only the parts of the envelope the step reads.
const artifactsApi = {
  listForRun: vi.fn(() =>
    Promise.resolve({
      items: [
        { id: ARTIFACT, version: 1, kind: 'source-inventory', runId: ANALYSIS },
      ],
    }),
  ),
  getVersion: vi.fn(() =>
    Promise.resolve({
      id: ARTIFACT,
      version: 1,
      runId: ANALYSIS,
      projectId: PROJECT,
      payload: { programs },
    }),
  ),
} as unknown as ArtifactsApi;

function documentRun(overrides: Partial<DocumentRun> = {}): DocumentRun {
  return {
    id: RUN,
    projectId: PROJECT,
    status: 'succeeded',
    stateVersion: 3,
    analysisRunId: ANALYSIS,
    inventory: { artifactId: ARTIFACT, version: 1 },
    config: {
      programs: ['src/ORDER.VBP'],
      selected: ['business-rules'],
      generated: ['business-rules'],
      model: 'sonnet',
      outputLanguage: 'vi',
      runner: 'claude-cli',
      specPack:
        'spec-design-rules-0.8.0-draft + spec-design-templates-0.7.0-draft',
      promptVersion: 'spec-design-task-v1',
      limits: { timeoutMs: 1000, maxOutputBytes: 1000 },
    },
    items: [
      {
        program: 'src/ORDER.VBP',
        name: 'ORDER',
        status: 'succeeded',
        files: [
          { name: 'business-rules.md', byteLength: 20, sha256: 'a'.repeat(64) },
        ],
        packageId: PACKAGE,
        errorCode: null,
        outputTokens: 10,
        startedAt: '2026-10-29T00:00:00.000Z',
        finishedAt: '2026-10-29T00:00:05.000Z',
      },
    ],
    inputTokens: 100,
    outputTokens: 10,
    errorCode: null,
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:05.000Z',
    startedAt: '2026-10-29T00:00:00.000Z',
    finishedAt: '2026-10-29T00:00:05.000Z',
    ...overrides,
  };
}

const ready = {
  runner: 'claude-cli',
  runtime: { status: 'ready', reasonCode: null },
  specPack: 'spec-design-rules-0.8.0-draft + spec-design-templates-0.7.0-draft',
} as const;

function fakeApi(current: CurrentDocumentRunResponse) {
  return {
    current: vi.fn(() => Promise.resolve(current)),
    get: vi.fn(() => Promise.resolve(current.run ?? documentRun())),
    log: vi.fn(() =>
      Promise.resolve({
        items: [
          {
            sequence: 1,
            at: '2026-10-29T00:00:01.000Z',
            stream: 'agent' as const,
            program: 'ORDER',
            text: '<b>not html</b>',
          },
        ],
        last: 1,
      }),
    ),
    start: vi.fn<DocumentsApi['start']>(() =>
      Promise.resolve(documentRun({ status: 'queued', stateVersion: 1 })),
    ),
    cancel: vi.fn(),
    packageFile: vi.fn<DocumentsApi['packageFile']>(() =>
      Promise.resolve({
        runId: RUN,
        program: 'src/ORDER.VBP',
        name: 'business-rules.md',
        sha256: 'a'.repeat(64),
        byteLength: 20,
        content: '# Business rules\n<script>x</script>',
      }),
    ),
  } satisfies Record<keyof DocumentsApi, unknown>;
}

function renderStep(
  api: ReturnType<typeof fakeApi>,
  program: string | null = 'src/CUSTOMER.VBP',
  runId: string | null = ANALYSIS,
  projectMode: 'demo' | 'local' = 'local',
) {
  return render(
    <LocaleProvider>
      <DocumentsStep
        projectId={PROJECT}
        program={program}
        projectMode={projectMode}
        analysis={{ status: 'ready', runId }}
        onRetryAnalysis={() => {}}
        api={api as unknown as DocumentsApi}
        artifactsApi={artifactsApi}
      />
    </LocaleProvider>,
  );
}

describe('DocumentsStep', () => {
  it('asks for an analysis first', () => {
    renderStep(fakeApi({ run: null, ...ready }), 'src/ORDER.VBP', null);
    expect(screen.getByText('Chưa có kết quả phân tích')).toBeTruthy();
  });

  it('starts a run for the program picked on the analysis screen', async () => {
    const api = fakeApi({ run: null, ...ready });
    renderStep(api, 'src/CUSTOMER.VBP');
    expect(await screen.findByText('CUSTOMER')).toBeTruthy();
    expect(screen.getByText('src/CUSTOMER.VBP')).toBeTruthy();
    // No program list to choose from on this screen.
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Thiết kế chi tiết/));
    // Detail pulls DB and Basic in (BR is selected by default).
    expect(screen.getAllByText('sinh kèm')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu generate/ }));
    await waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
    expect(api.start.mock.calls[0]?.[2]).toEqual({
      analysisRunId: ANALYSIS,
      programs: ['src/CUSTOMER.VBP'],
      documents: ['business-rules', 'detail-design'],
      model: 'sonnet',
      outputLanguage: 'vi',
    });
  });

  it('sends back to the analysis screen when no program was picked', async () => {
    renderStep(fakeApi({ run: null, ...ready }), null);
    expect(await screen.findByText(/Chưa chọn program/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chọn program' })).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Bắt đầu generate/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('says when the program is not in the latest analysis', async () => {
    renderStep(fakeApi({ run: null, ...ready }), 'src/GONE.VBP');
    expect(
      await screen.findByText(/src\/GONE\.VBP không có trong lượt phân tích/),
    ).toBeTruthy();
  });

  it("does not start while another program's run is active", async () => {
    const other = documentRun({ status: 'running', finishedAt: null });
    renderStep(fakeApi({ run: other, ...ready }), 'src/CUSTOMER.VBP');
    expect(
      await screen.findByText(/đang có lượt tạo tài liệu cho ORDER/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Bắt đầu generate/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('shows a finished package, its log as text and a file as safe Markdown', async () => {
    const api = fakeApi({ run: documentRun(), ...ready });
    // Without ?program= the screen shows the latest run's program.
    const { container } = renderStep(api, null);
    await screen.findByText('Đã tạo xong 1 tài liệu');
    // A finished package shows a check instead of the percentage.
    expect(container.querySelector('.ring-check')).toBeTruthy();
    expect(await screen.findByText('<b>not html</b>')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    await screen.findByRole('heading', { level: 1, name: 'Business rules' });
    expect(api.packageFile.mock.calls[0]?.slice(0, 4)).toEqual([
      PROJECT,
      RUN,
      0,
      'business-rules.md',
    ]);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/chưa review/)).toBeTruthy();
  });

  it('explains an incomplete package per program', async () => {
    const run = documentRun({
      status: 'failed',
      errorCode: 'PACKAGE_INCOMPLETE',
    });
    const item = run.items[0];
    if (!item) throw new Error('item');
    renderStep(
      fakeApi({
        run: {
          ...run,
          items: [
            {
              ...item,
              status: 'failed',
              files: [],
              errorCode: 'PACKAGE_INCOMPLETE',
            },
          ],
        },
        ...ready,
      }),
      'src/ORDER.VBP',
    );
    expect(
      (await screen.findAllByText(/Có tài liệu chưa "hoàn tất"/)).length,
    ).toBe(2);
  });

  it('blocks Start while the runtime needs recovery', async () => {
    renderStep(
      fakeApi({
        ...ready,
        run: null,
        runtime: {
          status: 'recovery_required',
          reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED',
        },
      }),
    );
    expect(await screen.findByText(/vẫn đang sống/)).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Bắt đầu generate/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('shows each document live while the agent writes it', async () => {
    const base = documentRun();
    const item = base.items[0];
    if (!item) throw new Error('item');
    const running = documentRun({
      status: 'running',
      finishedAt: null,
      config: {
        ...base.config,
        selected: ['basic-design'],
        generated: ['business-rules', 'basic-design'],
      },
      items: [
        {
          ...item,
          status: 'running',
          files: [],
          packageId: null,
          documents: [
            { name: 'business-rules.md', status: 'written' },
            { name: 'basic-design.md', status: 'writing' },
          ],
        },
      ],
    });
    renderStep(fakeApi({ run: running, ...ready }), 'src/ORDER.VBP');
    expect(await screen.findByText('Đã viết · chờ kiểm')).toBeTruthy();
    expect(screen.getByText('Đang viết')).toBeTruthy();
    expect(
      await screen.findByText('50%', undefined, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem' })).toBeNull();
  });

  it('shows a stopped program and documents that were not written', async () => {
    const base = documentRun();
    const item = base.items[0];
    if (!item) throw new Error('item');
    renderStep(
      fakeApi({
        run: documentRun({
          status: 'interrupted',
          items: [
            {
              ...item,
              status: 'stopped',
              files: [],
              packageId: null,
              documents: [{ name: 'business-rules.md', status: 'pending' }],
            },
          ],
        }),
        ...ready,
      }),
      'src/ORDER.VBP',
    );
    expect(await screen.findByText('Đã dừng')).toBeTruthy();
    expect(screen.getByText('Không tạo')).toBeTruthy();
    expect(screen.queryByText(/Đang phân tích|Đang viết/)).toBeNull();
  });

  it('does not start a real agent on a demo project (no source)', async () => {
    const api = fakeApi({ run: null, ...ready });
    renderStep(api, 'src/CUSTOMER.VBP', ANALYSIS, 'demo');
    expect(
      await screen.findByText(/Dự án demo không có file source/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Bắt đầu generate/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('still runs the fake runner on a demo project', async () => {
    const api = fakeApi({ run: null, ...ready, runner: 'fake' });
    renderStep(api, 'src/CUSTOMER.VBP', ANALYSIS, 'demo');
    await screen.findByText('CUSTOMER');
    expect(screen.queryByText(/Dự án demo không có file source/)).toBeNull();
    expect(
      screen
        .getByRole('button', { name: /Bắt đầu generate/ })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('shows the agent at work with an indeterminate bar before any document', async () => {
    const base = documentRun();
    const item = base.items[0];
    if (!item) throw new Error('item');
    const { container } = renderStep(
      fakeApi({
        ...ready,
        runner: 'codex-cli',
        run: documentRun({
          status: 'running',
          finishedAt: null,
          items: [
            {
              ...item,
              status: 'running',
              files: [],
              packageId: null,
              documents: [{ name: 'business-rules.md', status: 'pending' }],
            },
          ],
        }),
      }),
      'src/ORDER.VBP',
    );
    expect(await screen.findByText(/Agent đang đọc/)).toBeTruthy();
    expect(container.querySelector('.program-working')).not.toBeNull();
    expect(screen.getByText(/Codex trả cả gói/)).toBeTruthy();
  });

  it('offers review and a rerun once the package is done', async () => {
    const api = fakeApi({ run: documentRun(), ...ready });
    renderStep(api, 'src/ORDER.VBP');
    const review = await screen.findByRole('link', { name: 'Sang review' });
    expect(review.getAttribute('href')).toBe(
      `/projects/${PROJECT}/review?program=src%2FORDER.VBP`,
    );
    fireEvent.click(screen.getByRole('button', { name: /Chạy lại/ }));
    await waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
    expect(api.start.mock.calls[0]?.[2]).toMatchObject({
      programs: ['src/ORDER.VBP'],
    });
  });

  it('offers only a rerun after a failed run', async () => {
    renderStep(
      fakeApi({
        run: documentRun({ status: 'failed', errorCode: 'AGENT_FAILED' }),
        ...ready,
      }),
      'src/ORDER.VBP',
    );
    expect(
      await screen.findByRole('button', { name: /Chạy lại/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sang review' })).toBeNull();
  });
});
