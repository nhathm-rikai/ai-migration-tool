import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  failedRunFixture,
  runningRunFixture,
  succeededRunFixture,
} from '@portal/contracts/fixtures';
import type { LocalProject, Project, Run } from '@portal/contracts';
import { RecentProjects } from './recent-projects';
import type { ProjectListControl } from './use-project-list';
import { createRunsApi } from '../../shared/api/runs-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { json, requestUrl, testCredentials } from '../../testing/fixtures';

const at = (id: number, createdAt: string): LocalProject => ({
  id: `00000000-0000-4000-8000-00000000001${id}`,
  name: `Dự án ${id}`,
  mode: 'local',
  createdAt,
});
const projects: Project[] = [
  at(1, '2026-10-01T00:00:00.000Z'),
  at(2, '2026-10-02T00:00:00.000Z'),
  at(3, '2026-10-03T00:00:00.000Z'),
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

function list(items: Project[]): ProjectListControl {
  return {
    state: { status: 'ready', page: { items, nextCursor: null } },
    cursor: null,
    refresh: () => undefined,
    retry: () => undefined,
    next: () => undefined,
  };
}

describe('Recent projects (UI04)', () => {
  it('orders by last activity, shows the real last-run state and reads only', async () => {
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      expect(init?.method ?? 'GET').toBe('GET');
      const id = /projects\/([^/]+)\/runs\/current$/.exec(url)?.[1] ?? '';
      const run = runs[id];
      if (run === 'error') return Promise.resolve(json({ error: 'x' }, 500));
      return Promise.resolve(json({ run: run ?? null }));
    });
    render(
      <LocaleProvider>
        <RecentProjects
          list={list(projects)}
          runsApi={createRunsApi(fetcher, testCredentials)}
          openProjectId={projects[0]!.id}
          version=""
        />
      </LocaleProvider>,
    );
    const aside = await screen.findByRole('complementary', {
      name: 'Dự án gần đây',
    });
    await waitFor(() =>
      expect(within(aside).getAllByRole('link')).toHaveLength(5),
    );
    // 4 cards plus "Xem tất cả".
    const cards = within(aside)
      .getAllByRole('link')
      .filter((link) => link.classList.contains('recent-card'));
    expect(
      cards.map((card) => card.querySelector('.recent-name')?.textContent),
    ).toEqual(['Dự án 2', 'Dự án 1', 'Dự án 3', 'Dự án 5']);
    expect(
      cards.map((card) => card.querySelector('.recent-status')?.textContent),
    ).toEqual(['Đang phân tích', 'Đã phân tích', 'Thất bại', 'Chưa phân tích']);
    expect(cards[1]?.getAttribute('aria-current')).toBe('page');
    expect(cards[0]?.getAttribute('href')).toBe(
      `/projects/${projects[1]!.id}/source`,
    );
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it('says when a run state cannot be read instead of showing it unanalysed', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(json({ error: 'x' }, 500)),
    );
    render(
      <LocaleProvider>
        <RecentProjects
          list={list([projects[3]!])}
          runsApi={createRunsApi(fetcher, testCredentials)}
          openProjectId="none"
          version=""
        />
      </LocaleProvider>,
    );
    expect(await screen.findByText('Không đọc được trạng thái')).toBeTruthy();
    expect(screen.queryByText('Chưa phân tích')).toBeNull();
  });
});
