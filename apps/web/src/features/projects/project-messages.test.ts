import { expect, it } from 'vitest';
import { ApiError } from '../../shared/api/api-error';
import {
  projectErrorMessage as resolveProjectErrorMessage,
  type ProjectOperation,
} from './project-messages';
import { viMessages } from '../../shared/i18n/vi';
import { jaMessages } from '../../shared/i18n/ja';

const projectErrorMessage = (error: unknown, operation: ProjectOperation) =>
  resolveProjectErrorMessage(error, operation, viMessages.errors);

it('localizes Japanese error and recovery messages without translating backend codes', () => {
  expect(
    resolveProjectErrorMessage(
      new ApiError('http', 'GET', 404, 'PROJECT_NOT_FOUND'),
      'get',
      jaMessages.errors,
    ),
  ).toBe('プロジェクトが見つかりません。');
  expect(
    resolveProjectErrorMessage(
      new ApiError('network', 'POST'),
      'create',
      jaMessages.errors,
    ),
  ).toContain('再作成する前に');
  expect(
    resolveProjectErrorMessage(
      new ApiError('http', 'GET', 404, 'UNKNOWN_ERROR'),
      'get',
      jaMessages.errors,
    ),
  ).toContain('リクエストを完了できません');
});

it('distinguishes a missing route from a missing project at the same HTTP status', () => {
  expect(
    projectErrorMessage(
      new ApiError('http', 'GET', 404, 'PROJECT_NOT_FOUND'),
      'get',
    ),
  ).toBe('Không tìm thấy dự án này.');
  expect(
    projectErrorMessage(
      new ApiError('http', 'GET', 404, 'ROUTE_NOT_FOUND'),
      'get',
    ),
  ).toContain('API');
});

it.each(['list', 'get', 'create'] as const)(
  'gives operation-specific input guidance for %s',
  (operation) => {
    const message = projectErrorMessage(
      new ApiError('http', 'GET', 400, 'INVALID_INPUT'),
      operation,
    );
    expect(message).not.toContain('Kiểm tra tên');
    if (operation === 'get') expect(message).toContain('Mã dự án');
    if (operation === 'list')
      expect(message).toContain('Tham số tải danh sách');
    if (operation === 'create')
      expect(message).toContain('Thông tin tạo dự án');
  },
);

it('falls back for absent/unknown error codes without claiming the project is missing', () => {
  for (const code of [undefined, 'FUTURE_ERROR', 'private-path-secret']) {
    const message = projectErrorMessage(
      new ApiError('http', 'GET', 404, code),
      'get',
    );
    expect(message).toContain('Không thể hoàn tất');
    expect(message).not.toMatch(/private|Không tìm thấy dự án/);
  }
});

it.each(['network', 'timeout', 'invalid-response', 'http'] as const)(
  'gives recovery guidance for an uncertain create after %s',
  (kind) => {
    expect(
      projectErrorMessage(new ApiError(kind, 'POST', 500), 'create'),
    ).toContain('Làm mới danh sách');
  },
);

it('does not diagnose malformed success JSON as a connection failure', () => {
  expect(
    projectErrorMessage(new ApiError('invalid-response', 'GET', 200), 'get'),
  ).toContain('Phản hồi không đúng định dạng');
  expect(projectErrorMessage(new ApiError('network', 'GET'), 'get')).toContain(
    'Không kết nối',
  );
  expect(projectErrorMessage(new ApiError('timeout', 'GET'), 'get')).toContain(
    'quá hạn',
  );
});
