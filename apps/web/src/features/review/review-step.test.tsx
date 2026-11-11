import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReviewBoard } from '@portal/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentsApi } from '../../shared/api/documents-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { ReviewStep } from './review-step';
import { countUnresolvedPoints } from './unresolved-points';

afterEach(cleanup);

function board(
  overrides: Partial<ReviewBoard['programs'][number]['documents'][number]> = {},
): ReviewBoard {
  return {
    programs: [
      {
        program: 'src/P.vbp',
        name: 'P',
        runId: '11111111-1111-4111-8111-111111111111',
        item: 0,
        specPack: 'pack',
        documents: [
          {
            name: 'business-rules.md',
            sha256: 'a'.repeat(64),
            status: 'pending',
            comments: [],
            ...overrides,
          },
        ],
      },
    ],
  };
}
function setup(
  initial: ReviewBoard,
  content = '# Tài liệu\n<b>raw</b>\n',
  program: string | null = null,
) {
  const api = {
    reviewBoard: vi.fn().mockResolvedValue(initial),
    addReview: vi.fn().mockResolvedValue(initial),
    packageFile: vi.fn().mockResolvedValue({
      runId: 'r',
      program: 'src/P.vbp',
      name: 'business-rules.md',
      sha256: 'a'.repeat(64),
      byteLength: 3,
      content,
    }),
  };
  render(
    <LocaleProvider>
      <ReviewStep
        projectId="p"
        program={program}
        api={api as unknown as DocumentsApi}
      />
    </LocaleProvider>,
  );
  return api;
}

describe('ReviewStep', () => {
  it('offers the Excel only for the unit test specification (TC01)', async () => {
    const api = setup(board({ name: 'ut-test-spec.md' }));
    api.packageFile.mockResolvedValue({
      runId: 'r',
      program: 'src/P.vbp',
      name: 'ut-test-spec.md',
      sha256: 'a'.repeat(64),
      byteLength: 3,
      content: '# UT',
    });
    await screen.findByRole('heading', { level: 1, name: 'UT' });
    expect(screen.getByTestId('ut-excel')).toBeTruthy();
  });

  it('offers the integration Excel for the integration test specification (TC02)', async () => {
    const api = setup(board({ name: 'it-test-spec.md' }));
    api.packageFile.mockResolvedValue({
      runId: 'r',
      program: 'src/P.vbp',
      name: 'it-test-spec.md',
      sha256: 'a'.repeat(64),
      byteLength: 3,
      content: '# IT',
    });
    await screen.findByRole('heading', { level: 1, name: 'IT' });
    expect(screen.getByTestId('it-excel')).toBeTruthy();
    expect(screen.queryByTestId('ut-excel')).toBeNull();
  });

  it('has no Excel button for other documents', async () => {
    setup(board());
    await screen.findByRole('heading', { level: 1, name: 'Tài liệu' });
    expect(screen.queryByTestId('ut-excel')).toBeNull();
    expect(screen.queryByTestId('it-excel')).toBeNull();
  });

  it('points to step 3 when no document exists', async () => {
    setup({ programs: [] });
    expect(await screen.findByText('Chưa có tài liệu để review')).toBeTruthy();
  });

  it('shows the document and approves it', async () => {
    const api = setup(board());
    await screen.findByRole('heading', { level: 1, name: 'Tài liệu' });
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt tài liệu' }));
    expect(api.addReview.mock.calls[0]?.[1]).toMatchObject({
      kind: 'approve',
      file: 'business-rules.md',
      sha256: 'a'.repeat(64),
    });
  });

  it('reminds of unresolved points without blocking approval', async () => {
    const initial = board();
    const api = setup(
      initial,
      '# T\n\n## Điểm chưa xác định\n\n- **U-01** — a\n- **U-02** — b\n',
    );
    expect(await screen.findByText(/Có 2 điểm chưa xác định/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt tài liệu' }));
    expect(api.addReview).toHaveBeenCalledTimes(1);
  });

  it('shows only the chosen program and hides what the filter excludes', async () => {
    const two = board();
    const first = two.programs[0]!;
    two.programs.push({ ...first, program: 'src/Q.vbp', name: 'Q' });
    setup(two, undefined, 'src/Q.vbp');
    expect((await screen.findAllByText('Q')).length).toBeGreaterThan(0);
    expect(screen.queryByText('P')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Đã duyệt/ }));
    expect(screen.queryAllByText('Q')).toHaveLength(0);
    expect(
      screen.getAllByText('Không có tài liệu nào ở trạng thái này.').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Duyệt tài liệu' })).toBeNull();
  });

  it('says so when the chosen program has no documents', async () => {
    setup(board(), undefined, 'src/OTHER.vbp');
    expect(await screen.findByText('Chưa có tài liệu để review')).toBeTruthy();
  });

  it('counts no point when the section says none', () => {
    expect(countUnresolvedPoints('# T\n\n## 未確定事項\n\nなし\n')).toBe(0);
    expect(countUnresolvedPoints('- a\n\n## Other\n- b\n')).toBe(0);
  });
});
