import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  failedRunFixture,
  runningRunFixture,
  succeededRunFixture,
} from '@portal/contracts/fixtures';
import type { LocalProject, Project, Run } from '@portal/contracts';
import { RecentProjects } from './recent-projects';
import { createProjectsApi } from '../../shared/api/projects-api';
import { createRunsApi } from '../../shared/api/runs-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { json, requestUrl, testCredentials } from '../../testing/fixtures';

const at = (id: number, createdAt: string): LocalProject => ({
  id: `00000000-0000-4000-8000-0000000000${String(id).padStart(2, '0')}`,
  name: `Dự án ${id}`,
  mode: 'local',
  createdAt,
});
const projects: Project[] = [
  at(1, '2026-10-01T00:00:00.000Z'),
  at(2, '2026-10-02T00:00:00.000Z'),
  { ...at(3, '2026-10-03T00:00:00.000Z'), name: 'Payroll' },
  at(4, '2026-10-04T00:00:00.000Z'),
  at(5, '2026-10-05T00:00:00.000Z'),
];
// Last run per project; project 4's cannot be read.
const runs: Record<string, Run | null | 'error'> = {
  [projects[0]!.id]: {
    ...succeededRunFixture,
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
  [projects[1]!.id]: {
    ...runningRunFixture,
    updatedAt: '2026-10-31T00:00:00.000Z',
  },
  [projects[2]!.id]: {
    ...failedRunFixture,
    updatedAt: '2026-10-29T00:00:00.000Z',
  },
  [projects[3]!.id]: 'error',
  [projects[4]!.id]: null,
};

// The API pages by ID: two pages here, both read.
function backend() {
  return vi.fn<typeof fetch>((input, init) => {
    expect(init?.method ?? 'GET').toBe('GET');
    const url = requestUrl(input);
    const current = /projects\/([^/]+)\/runs\/current$/.exec(url)?.[1];
    if (current !== undefined) {
      const run = runs[current];
      if (run === 'error') return Promise.resolve(json({ error: 'x' }, 500));
      return Promise.resolve(json({ run: run ?? null }));
    }
    return Promise.resolve(
      url.includes('cursor=')
        ? json({ items: projects.slice(3), nextCursor: null })
        : json({ items: projects.slice(0, 3), nextCursor: projects[2]!.id }),
    );
  });
}

function show(openProjectId: string | null) {
  const fetcher = backend();
  render(
    <LocaleProvider>
      <RecentProjects
        api={createProjectsApi(fetcher, testCredentials)}
        runsApi={createRunsApi(fetcher, testCredentials)}
        openProjectId={openProjectId}
        version=""
      />
    </LocaleProvider>,
  );
  return fetcher;
}

const cards = () =>
  within(screen.getByRole('complementary', { name: 'Dự án gần đây' }))
    .getAllByRole('link')
    .filter((link) => link.classList.contains('recent-card'));

describe('Recent projects (UI04)', () => {
  it('lists every project by last activity with the real last-run state, read only', async () => {
    const fetcher = show(projects[0]!.id);
    await waitFor(() => expect(cards()).toHaveLength(5));
    expect(
      cards().map((card) => card.querySelector('.recent-title')?.textContent),
    ).toEqual(['Dự án 2', 'Dự án 1', 'Payroll', 'Dự án 5', 'Dự án 4']);
    expect(
      cards().map((card) => card.querySelector('.recent-status')?.textContent),
    ).toEqual([
      'Đang phân tích',
      'Đã phân tích',
      'Thất bại',
      'Chưa phân tích',
      'Không đọc được trạng thái',
    ]);
    expect(cards()[1]?.getAttribute('aria-current')).toBe('page');
    expect(cards()[0]?.getAttribute('href')).toBe(
      `/projects/${projects[1]!.id}/source`,
    );
    // Two list pages and one current run per project.
    expect(fetcher).toHaveBeenCalledTimes(7);
    // "+ Dự án mới" is a button-styled link to a new project.
    expect(
      screen.getByRole('link', { name: '+ Dự án mới' }).getAttribute('href'),
    ).toBe('/projects/new');
    expect(screen.queryByText('Xem tất cả')).toBeNull();
  });

  it('searches by name', async () => {
    show(null);
    await waitFor(() => expect(cards()).toHaveLength(5));
    fireEvent.change(screen.getByLabelText('Tìm dự án theo tên'), {
      target: { value: 'payroll' },
    });
    expect(cards()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Tìm dự án theo tên'), {
      target: { value: 'không có' },
    });
    expect(screen.getByText('Không có dự án nào khớp.')).toBeTruthy();
    // On a new project's step there is no "+ Dự án mới".
    expect(screen.queryByRole('link', { name: '+ Dự án mới' })).toBeNull();
  });

  it('says when the list cannot be read', async () => {
    render(
      <LocaleProvider>
        <RecentProjects
          api={createProjectsApi(
            () => Promise.resolve(json({ error: 'x' }, 500)),
            testCredentials,
          )}
          runsApi={createRunsApi(
            () => Promise.reject(new Error('x')),
            testCredentials,
          )}
          openProjectId={null}
          version=""
        />
      </LocaleProvider>,
    );
    expect(
      await screen.findByText('Không tải được danh sách dự án.'),
    ).toBeTruthy();
  });
});
