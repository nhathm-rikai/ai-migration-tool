import {
  ApiErrorCodeSchema,
  PROJECT_NAME_MIN_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  type ApiErrorCode,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { ApiError, type ApiFailureKind } from '../../shared/api/api-error';

export const projectMessages = {
  nameInvalid: `Nhập tên dự án từ ${PROJECT_NAME_MIN_LENGTH} đến ${PROJECT_NAME_MAX_LENGTH} ký tự, không chỉ chứa khoảng trắng.`,
  nameHelp: `Tối đa ${PROJECT_NAME_MAX_LENGTH} ký tự. Chỉ dùng tên và dữ liệu mẫu.`,
  unexpected: 'Có lỗi khi xử lý yêu cầu. Vui lòng thử lại.',
  outcomeUnknown:
    'Chưa xác nhận được kết quả lưu. Làm mới danh sách để kiểm tra trước khi tạo lại.',
};

const HTTP_ERROR_MESSAGES = {
  INVALID_INPUT: 'Thông tin yêu cầu không hợp lệ. Kiểm tra dữ liệu và thử lại.',
  PROJECT_NOT_FOUND: 'Không tìm thấy dự án này.',
  ROUTE_NOT_FOUND:
    'Không tìm thấy API được yêu cầu. Kiểm tra phiên bản frontend và backend.',
  PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên vượt kích thước cho phép.',
  UNSUPPORTED_MEDIA_TYPE:
    'Định dạng gửi dữ liệu không được hỗ trợ. Kiểm tra phiên bản frontend và backend.',
  INTERNAL_ERROR: 'Backend gặp lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.',
} satisfies Record<ApiErrorCode, string>;

const FAILURE_MESSAGES = {
  http: 'Không thể hoàn tất yêu cầu. Kiểm tra backend rồi thử lại.',
  network: 'Không kết nối được backend. Kiểm tra backend rồi thử lại.',
  timeout: 'Yêu cầu quá hạn. Kiểm tra backend rồi thử lại.',
  'invalid-response':
    'Phản hồi không đúng định dạng. Kiểm tra phiên bản frontend và backend.',
} satisfies Record<ApiFailureKind, string>;

const INVALID_INPUT_MESSAGES = {
  create:
    'Thông tin tạo dự án không hợp lệ. Kiểm tra dữ liệu và phiên bản ứng dụng rồi thử lại.',
  get: 'Mã dự án không hợp lệ. Làm mới danh sách rồi chọn lại dự án.',
  list: 'Tham số tải danh sách không hợp lệ. Làm mới danh sách rồi thử lại.',
};

export function projectErrorMessage(
  error: unknown,
  operation: keyof typeof INVALID_INPUT_MESSAGES,
): string {
  if (!(error instanceof ApiError)) return projectMessages.unexpected;
  if (error.outcomeUnknown) return projectMessages.outcomeUnknown;
  if (error.kind === 'http' && Check(ApiErrorCodeSchema, error.code)) {
    return error.code === 'INVALID_INPUT'
      ? INVALID_INPUT_MESSAGES[operation]
      : HTTP_ERROR_MESSAGES[error.code];
  }
  return FAILURE_MESSAGES[error.kind];
}
