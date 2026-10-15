import {
  PROJECT_NAME_MIN_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '@portal/contracts';
import type { ApiErrorCode } from '@portal/contracts';
import type { ApiFailureKind } from '../api/api-error';

export const viMessages = {
  app: {
    skipToContent: 'Đến nội dung chính',
    subtitle: 'Đánh giá hệ thống cũ',
    demo: 'DEMO · dữ liệu mẫu',
    language: 'Ngôn ngữ',
  },
  projects: {
    workspace: 'Không gian làm việc',
    title: 'Dự án của bạn',
    refresh: 'Làm mới dự án',
    createNew: 'Tạo dự án mới',
    tree: 'Cây dự án',
    loading: 'Đang tải dự án…',
    retryList: 'Thử lại danh sách',
    noMore: 'Không còn dự án ở trang này',
    empty: 'Chưa có dự án',
    emptyHelp: 'Tạo dự án để bắt đầu không gian làm việc.',
    overview: 'Tổng quan dự án',
    unavailable: 'Chưa khả dụng',
    notAvailableYet: 'Chưa có',
    pageCount: (count: number) => `${count} dự án trong trang`,
    firstPage: 'Về trang đầu',
    nextPage: 'Trang tiếp',
    localWorkspace: 'Trên máy này',
    breadcrumb: 'Dự án',
    fixture: 'Dữ liệu mẫu',
    demoBadge: 'DEMO',
    assessmentSteps: 'Các bước đánh giá',
    stages: {
      analysis: {
        title: 'Phân tích AI',
        description: 'Bộ phân tích + tác nhân AI',
      },
      report: { title: 'Báo cáo đánh giá', description: 'Kết quả phân tích' },
      review: { title: 'Rà soát', description: 'SA/PM phê duyệt' },
      proposal: { title: 'Đề xuất', description: 'Bản nháp đề xuất' },
    },
    created: 'Đã tạo dự án.',
    footer:
      'Chế độ demo · Quản lý dự án trên máy này. Phân tích, rà soát và xuất báo cáo chưa khả dụng.',
    create: {
      eyebrow: 'Không gian làm việc',
      description:
        'Khởi tạo dự án để quản lý thông tin và chuẩn bị đánh giá hệ thống cũ.',
      name: 'Tên dự án',
      placeholder: 'Ví dụ: Hệ thống quản lý bán hàng',
      nameInvalid: `Nhập tên dự án từ ${PROJECT_NAME_MIN_LENGTH} đến ${PROJECT_NAME_MAX_LENGTH} ký tự, không chỉ chứa khoảng trắng.`,
      nameHelp: `Tối đa ${PROJECT_NAME_MAX_LENGTH} ký tự. Chỉ dùng tên và dữ liệu mẫu.`,
      sample: 'Dữ liệu mẫu VB6',
      sampleDescription: 'Chỉ lưu thông tin dự án, chưa đọc mã nguồn.',
      submit: 'Tạo dự án',
      pending: 'Đang tạo…',
      savedLocally:
        'Dự án được lưu trên máy này. Chọn dự án trong cây bên trái để mở lại thông tin.',
    },
    detail: {
      title: 'Chi tiết dự án',
      close: 'Đóng chi tiết',
      loading: 'Đang tải chi tiết…',
      retry: 'Thử lại chi tiết',
      description: 'Thông tin dự án đã lưu trên máy này.',
      id: 'Mã dự án',
      data: 'Dữ liệu',
      createdAt: 'Ngày tạo',
      ready: 'Sẵn sàng quản lý dự án',
      unavailable:
        'Phân tích mã nguồn, rà soát và tạo báo cáo chưa khả dụng trong bản này.',
    },
  },
  errors: {
    unexpected: 'Có lỗi khi xử lý yêu cầu. Vui lòng thử lại.',
    outcomeUnknown:
      'Chưa xác nhận được kết quả lưu. Làm mới danh sách để kiểm tra trước khi tạo lại.',
    http: {
      INVALID_INPUT:
        'Thông tin yêu cầu không hợp lệ. Kiểm tra dữ liệu và thử lại.',
      PROJECT_NOT_FOUND: 'Không tìm thấy dự án này.',
      ROUTE_NOT_FOUND:
        'Không tìm thấy API được yêu cầu. Kiểm tra phiên bản frontend và backend.',
      PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên vượt kích thước cho phép.',
      UNSUPPORTED_MEDIA_TYPE:
        'Định dạng gửi dữ liệu không được hỗ trợ. Kiểm tra phiên bản frontend và backend.',
      INTERNAL_ERROR:
        'Backend gặp lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.',
    } satisfies Record<ApiErrorCode, string>,
    failure: {
      http: 'Không thể hoàn tất yêu cầu. Kiểm tra backend rồi thử lại.',
      network: 'Không kết nối được backend. Kiểm tra backend rồi thử lại.',
      timeout: 'Yêu cầu quá hạn. Kiểm tra backend rồi thử lại.',
      'invalid-response':
        'Phản hồi không đúng định dạng. Kiểm tra phiên bản frontend và backend.',
    } satisfies Record<ApiFailureKind, string>,
    invalidInput: {
      create:
        'Thông tin tạo dự án không hợp lệ. Kiểm tra dữ liệu và phiên bản ứng dụng rồi thử lại.',
      get: 'Mã dự án không hợp lệ. Làm mới danh sách rồi chọn lại dự án.',
      list: 'Tham số tải danh sách không hợp lệ. Làm mới danh sách rồi thử lại.',
    },
  },
};

export type Messages = typeof viMessages;
