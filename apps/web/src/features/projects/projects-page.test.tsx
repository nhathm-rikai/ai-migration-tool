import {
  act,
  fireEvent,
  render as renderWithLibrary,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './projects-page';
import { ProjectDetail } from './project-detail';
import { createProjectsApi } from '../../shared/api/projects-api';
import {
  json,
  localProject,
  project,
  testCredentials,
} from '../../testing/fixtures';
import type { Project } from '@portal/contracts';
import type { ReactElement } from 'react';
import { LocaleProvider } from '../../shared/i18n/locale-provider';

function render(ui: ReactElement) {
  return renderWithLibrary(ui, { wrapper: LocaleProvider });
}

describe('Projects UI', () => {
  it('opens projects from the navigation, collapses branches and returns to creation', async () => {
    const second: Project = {
      ...project,
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Dự án thứ hai',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((url) =>
        Promise.resolve(
          json(
            typeof url === 'string' && url.endsWith(project.id)
              ? project
              : typeof url === 'string' && url.endsWith(second.id)
                ? second
                : { items: [project, second], nextCursor: null },
          ),
        ),
      );
    render(<ProjectsPage api={createProjectsApi(fetcher, testCredentials)} />);
    const navigation = screen.getByRole('navigation', { name: 'Cây dự án' });
    const firstNode = await within(navigation).findByRole('button', {
      name: project.name,
    });
    expect(firstNode.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(firstNode);
    await screen.findByText(project.id);
    expect(firstNode.getAttribute('aria-expanded')).toBe('true');
    expect(
      within(navigation)
        .getByRole('button', { name: 'Tổng quan dự án' })
        .getAttribute('aria-current'),
    ).toBe('page');
    fireEvent.click(firstNode);
    expect(
      within(navigation).queryByRole('button', { name: 'Tổng quan dự án' }),
    ).toBeNull();
    expect(screen.getByText(project.id)).toBeTruthy();
    fireEvent.click(
      within(navigation).getByRole('button', { name: second.name }),
    );
    await screen.findByText(second.id);
    expect(screen.queryByText(project.id)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án mới' }));
    expect(screen.getByLabelText('Tên dự án')).toBeTruthy();
    expect(screen.queryByText(second.id)).toBeNull();
    expect(
      within(navigation)
        .getByRole('button', { name: 'Tổng quan dự án' })
        .hasAttribute('aria-current'),
    ).toBe(false);
  });
  it('shows loading then empty state and validates before POST', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ items: [], nextCursor: null }));
    render(<ProjectsPage api={createProjectsApi(fetcher, testCredentials)} />);
    expect(screen.getByText('Đang tải dự án…')).toBeTruthy();
    await screen.findByText('Chưa có dự án');
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án' }));
    expect(screen.getByRole('alert').textContent).toContain('1 đến 120');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('creates once, shows pending, refreshes and loads the persisted detail', async () => {
    let finish: ((value: Response) => void) | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ items: [], nextCursor: null }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation((url) =>
        Promise.resolve(
          typeof url === 'string' && url.endsWith(project.id)
            ? json(project)
            : json({ items: [project], nextCursor: null }),
        ),
      );
    render(<ProjectsPage api={createProjectsApi(fetcher, testCredentials)} />);
    await screen.findByText('Chưa có dự án');
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: project.name },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án' }));
    const pending = screen.getByRole('button', { name: 'Đang tạo…' });
    expect(pending.hasAttribute('disabled')).toBe(true);
    fireEvent.click(pending);
    await act(async () => {
      finish?.(json(project, 201));
      await Promise.resolve();
    });
    await screen.findByText(project.id);
    expect(screen.getByText('Đã tạo dự án.')).toBeTruthy();
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
  it('creates a local source project without a fixture and opens it', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((url, init) =>
        Promise.resolve(
          init?.method === 'POST'
            ? json(localProject, 201)
            : typeof url === 'string' && url.endsWith(localProject.id)
              ? json(localProject)
              : json({ items: [], nextCursor: null }),
        ),
      );
    render(<ProjectsPage api={createProjectsApi(fetcher, testCredentials)} />);
    await screen.findByText('Chưa có dự án');
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: localProject.name },
    });
    fireEvent.click(screen.getByLabelText(/Mã nguồn trên máy này/));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án' }));
    await screen.findByText(localProject.id);
    const post = fetcher.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(
      typeof post?.[1]?.body === 'string' ? JSON.parse(post[1].body) : null,
    ).toEqual({ name: localProject.name, mode: 'local' });
    expect(screen.getByText('LOCAL')).toBeTruthy();
  });

  it('recovers a list failure and paginates using the server cursor', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json({ items: [project], nextCursor: project.id }))
      .mockResolvedValueOnce(json({ items: [], nextCursor: null }));
    render(<ProjectsPage api={createProjectsApi(fetcher, testCredentials)} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại danh sách' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Trang tiếp' }));
    await screen.findByText('Không còn dự án ở trang này');
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      '/api/v1/projects?cursor=' + project.id,
    );
  });
  it('ignores late detail responses after switching projects', async () => {
    let finishOld: ((value: Response) => void) | undefined;
    const second: Project = {
      ...project,
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Dự án mới',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(json(second));
    const api = createProjectsApi(fetcher, testCredentials);
    const view = render(
      <ProjectDetail
        key={project.id}
        id={project.id}
        api={api}
        onClose={() => undefined}
      />,
    );
    view.rerender(
      <ProjectDetail
        key={second.id}
        id={second.id}
        api={api}
        onClose={() => undefined}
      />,
    );
    await screen.findByText(second.id);
    await act(async () => {
      finishOld?.(json(project));
      await Promise.resolve();
    });
    expect(screen.queryByText(project.id)).toBeNull();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it('keeps the input after a create failure and permits explicit retry', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ items: [], nextCursor: null }))
      .mockRejectedValueOnce(new Error('offline'));
    render(<ProjectsPage api={createProjectsApi(fetcher, testCredentials)} />);
    await screen.findByText('Chưa có dự án');
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: 'Giữ tên này' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án' }));
    await screen.findByRole('alert');
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Tạo dự án' })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    expect(screen.getByDisplayValue('Giữ tên này')).toBeTruthy();
    expect(
      screen.getByLabelText('Tên dự án').getAttribute('aria-invalid'),
    ).toBe('false');
    expect(screen.getByRole('alert').textContent).toContain(
      'Làm mới danh sách',
    );
  });

  it('keeps an uncertain create visible as a submission error without marking the name invalid', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(json({ stored: true }, 201));
    render(<ProjectsPage api={createProjectsApi(fetcher, testCredentials)} />);
    await screen.findByText('Chưa có dự án');
    fireEvent.change(screen.getByLabelText('Tên dự án'), {
      target: { value: 'Tên hợp lệ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Tạo dự án$/ }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Làm mới danh sách',
    );
    expect(
      screen.getByLabelText('Tên dự án').getAttribute('aria-invalid'),
    ).toBe('false');
    expect(screen.getByDisplayValue('Tên hợp lệ')).toBeTruthy();
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
});
