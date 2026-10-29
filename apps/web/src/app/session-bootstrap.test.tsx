import { LOCAL_SESSION_PATH } from '@portal/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './app';
import { json, requestUrl } from '../testing/fixtures';
import { createLocalSession } from '../shared/api/local-session';
import { createProjectsApi } from '../shared/api/projects-api';

const token = 'C'.repeat(43);

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

// The real session client and API client over one fetcher.
function renderApp(
  session: () => Promise<Response>,
  api: () => Promise<Response> = () =>
    Promise.resolve(json({ items: [], nextCursor: null })),
) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation((input) =>
      requestUrl(input) === LOCAL_SESSION_PATH ? session() : api(),
    );
  const localSession = createLocalSession(fetcher);
  render(
    <StrictMode>
      <App
        api={createProjectsApi(fetcher, localSession)}
        session={localSession}
      />
    </StrictMode>,
  );
  const calls = (predicate: (url: string, method?: string) => boolean) =>
    fetcher.mock.calls.filter(([url, init]) =>
      predicate(requestUrl(url), init?.method),
    );
  return {
    sessionCalls: () => calls((url) => url === LOCAL_SESSION_PATH),
    posts: () =>
      calls((url, method) => url !== LOCAL_SESSION_PATH && method === 'POST'),
  };
}

// F00-AC01
it('shows a bootstrap failure, sends no POST on submit and recovers by explicit retry', async () => {
  let online = false;
  const app = renderApp(() =>
    online
      ? Promise.resolve(json({ token }))
      : Promise.reject(new TypeError('offline')),
  );
  expect(
    await screen.findByText(
      'Không khởi tạo được phiên làm việc với backend cục bộ. Chưa có dữ liệu nào được gửi.',
    ),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Tên dự án'), {
    target: { value: 'Không được gửi' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Tạo dự án$/ }));
  expect(
    await screen.findByText(
      'Chưa kết nối được phiên làm việc với backend nên yêu cầu chưa được gửi. Thử kết nối lại.',
    ),
  ).toBeTruthy();
  expect(app.posts()).toHaveLength(0);
  expect(screen.getByDisplayValue('Không được gửi')).toBeTruthy();
  const bootstrapsBeforeRetry = app.sessionCalls().length;
  online = true;
  fireEvent.click(screen.getByRole('button', { name: 'Thử kết nối lại' }));
  await vi.waitFor(() => {
    expect(
      screen.queryByRole('button', { name: 'Thử kết nối lại' }),
    ).toBeNull();
  });
  expect(app.sessionCalls()).toHaveLength(bootstrapsBeforeRetry + 1);
  // Recovery does not replay the failed submission.
  expect(app.posts()).toHaveLength(0);
});

// F00-AC03
it('does not bootstrap or mutate again when the locale changes while bootstrap is pending', async () => {
  let answer: (response: Response) => void = () => undefined;
  const app = renderApp(
    () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
  );
  expect(await screen.findByText('Đang kết nối backend cục bộ…')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: '日本語' }));
  expect(
    screen.getByText('ローカルバックエンドに接続しています…'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Tiếng Việt' }));
  // StrictMode mounts effects twice; both share the same bootstrap.
  expect(app.sessionCalls()).toHaveLength(1);
  await act(async () => {
    answer(json({ token }));
    await Promise.resolve();
  });
  expect(await screen.findByText('Chưa có dự án')).toBeTruthy();
  expect(screen.queryByText('Đang kết nối backend cục bộ…')).toBeNull();
  expect(app.sessionCalls()).toHaveLength(1);
  expect(app.posts()).toHaveLength(0);
});
