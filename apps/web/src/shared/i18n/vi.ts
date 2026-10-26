import {
  PROJECT_NAME_MIN_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '@portal/contracts';
import type {
  AnalyzeApiErrorCode,
  AnalyzeStage,
  ApiErrorCode,
  RunErrorCode,
  RunStatus,
} from '@portal/contracts';
import type { ApiFailureKind } from '../api/api-error';

export const viMessages = {
  app: {
    skipToContent: 'Đến nội dung chính',
    subtitle: 'Đánh giá hệ thống cũ',
    demo: 'DEMO · dữ liệu mẫu',
    language: 'Ngôn ngữ',
    session: {
      pending: 'Đang kết nối backend cục bộ…',
      failed:
        'Không khởi tạo được phiên làm việc với backend cục bộ. Chưa có dữ liệu nào được gửi.',
      expired:
        'Phiên làm việc đã hết hạn (backend có thể vừa khởi động lại). Thao tác tiếp theo sẽ kết nối lại.',
      retry: 'Thử kết nối lại',
    },
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
        'Phân tích mã nguồn thật, rà soát và tạo báo cáo chưa khả dụng trong bản này; lượt chạy phân tích bên dưới là demo.',
    },
  },
  runs: {
    title: 'Phân tích (demo)',
    demoNotice:
      'Lượt chạy demo dùng bộ thực thi mô phỏng trên dữ liệu mẫu: chưa đọc mã nguồn và chưa tạo kết quả phân tích.',
    loading: 'Đang tải lượt chạy…',
    reload: 'Tải lại lượt chạy',
    start: 'Bắt đầu phân tích',
    starting: 'Đang gửi yêu cầu…',
    resend: 'Gửi lại yêu cầu',
    cancel: 'Hủy lượt chạy',
    cancelSending: 'Đang gửi yêu cầu hủy…',
    retry: 'Chạy lại',
    noRun: 'Chưa có lượt chạy nào cho dự án này.',
    current: 'Lượt chạy đang xem',
    history: 'Lịch sử lượt chạy',
    loadMore: 'Tải thêm',
    view: 'Xem',
    viewing: 'Đang xem',
    connectionLost:
      'Mất kết nối với backend, đang thử lại… Trạng thái lượt chạy vẫn là trạng thái cuối cùng đã nhận.',
    startUncertain:
      'Chưa xác nhận được backend đã nhận yêu cầu chạy. Nút “Gửi lại yêu cầu” dùng lại cùng yêu cầu nên không tạo lượt chạy thứ hai.',
    cancelUncertain:
      'Chưa xác nhận được yêu cầu hủy. Trạng thái đang được tải lại từ backend.',
    fields: {
      id: 'Mã lượt chạy',
      status: 'Trạng thái',
      stage: 'Bước hiện tại',
      createdAt: 'Tạo lúc',
      startedAt: 'Bắt đầu',
      finishedAt: 'Kết thúc',
      error: 'Lý do lỗi',
      retryOf: 'Chạy lại từ',
    },
    status: {
      queued: 'Đang chờ',
      running: 'Đang chạy',
      cancelling: 'Đang hủy…',
      succeeded: 'Hoàn tất (demo)',
      failed: 'Thất bại',
      cancelled: 'Đã hủy',
      interrupted: 'Bị gián đoạn',
    } satisfies Record<RunStatus, string>,
    stage: {
      snapshot: 'Chụp nguồn',
      inventory: 'Kiểm kê',
      publish: 'Công bố',
    } satisfies Record<AnalyzeStage, string>,
    interruptedHelp:
      'Backend đã dừng khi lượt chạy đang xử lý. Lượt chạy không tự chạy lại; dùng “Chạy lại” nếu cần.',
    runError: {
      SOURCE_UNREADABLE: 'Không đọc được mã nguồn.',
      SOURCE_FORBIDDEN: 'Không có quyền đọc mã nguồn.',
      SOURCE_CHANGED: 'Mã nguồn đã thay đổi trong lúc chạy.',
      SOURCE_LIMIT_EXCEEDED: 'Mã nguồn vượt giới hạn cho phép.',
      SOURCE_PROFILE_UNSUPPORTED: 'Hồ sơ mã nguồn không được hỗ trợ.',
      ANALYSIS_OUTPUT_INVALID: 'Kết quả phân tích không hợp lệ.',
      ARTIFACT_WRITE_FAILED: 'Không lưu được kết quả.',
      TIMEOUT: 'Lượt chạy quá thời gian cho phép.',
      STOP_UNCONFIRMED:
        'Không xác nhận được việc dừng xử lý. Khởi động lại backend trước khi chạy tiếp.',
      INTERNAL_ERROR: 'Backend gặp lỗi khi chạy.',
    } satisfies Record<RunErrorCode, string>,
    errors: {
      RUN_NOT_FOUND: 'Không tìm thấy lượt chạy này trong dự án.',
      RUN_ACTIVE_CONFLICT:
        'Dự án đang có lượt chạy khác. Đã mở lượt chạy đang hoạt động.',
      RUN_STATE_CONFLICT:
        'Trạng thái lượt chạy đã thay đổi. Đã tải lại trạng thái mới nhất.',
      IDEMPOTENCY_KEY_CONFLICT:
        'Yêu cầu chạy không khớp với yêu cầu đã gửi trước đó. Tải lại rồi thử lại.',
      SOURCE_REVISION_CONFLICT:
        'Mã nguồn của dự án đã thay đổi. Tải lại rồi thử lại.',
      SNAPSHOT_UNAVAILABLE: 'Lượt chạy cũ không có bản chụp nguồn để dùng lại.',
      SOURCE_PROFILE_UNSUPPORTED: 'Hồ sơ mã nguồn không được bản này hỗ trợ.',
      SOURCE_NOT_REGISTERED: 'Dự án chưa đăng ký mã nguồn.',
      RUNTIME_RECOVERY_REQUIRED:
        'Backend cần được khởi động lại sau một lượt chạy chưa dừng hẳn. Chưa có lượt chạy mới nào được tạo.',
    } satisfies Partial<Record<AnalyzeApiErrorCode, string>>,
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
      HOST_NOT_ALLOWED:
        'Backend từ chối địa chỉ truy cập. Mở ứng dụng bằng địa chỉ loopback đã cấu hình.',
      ORIGIN_NOT_ALLOWED:
        'Backend từ chối trang gửi yêu cầu. Mở ứng dụng bằng địa chỉ đã cấu hình.',
      CREDENTIAL_INVALID:
        'Phiên làm việc đã hết hạn nên yêu cầu chưa được xử lý. Vui lòng thử lại.',
    } satisfies Record<ApiErrorCode, string>,
    failure: {
      http: 'Không thể hoàn tất yêu cầu. Kiểm tra backend rồi thử lại.',
      network: 'Không kết nối được backend. Kiểm tra backend rồi thử lại.',
      timeout: 'Yêu cầu quá hạn. Kiểm tra backend rồi thử lại.',
      'invalid-response':
        'Phản hồi không đúng định dạng. Kiểm tra phiên bản frontend và backend.',
      credential:
        'Chưa kết nối được phiên làm việc với backend nên yêu cầu chưa được gửi. Thử kết nối lại.',
    } satisfies Record<ApiFailureKind, string>,
    invalidInput: {
      create:
        'Thông tin tạo dự án không hợp lệ. Kiểm tra dữ liệu và phiên bản ứng dụng rồi thử lại.',
      get: 'Mã dự án không hợp lệ. Làm mới danh sách rồi chọn lại dự án.',
      list: 'Tham số tải danh sách không hợp lệ. Làm mới danh sách rồi thử lại.',
      runs: 'Yêu cầu lượt chạy không hợp lệ. Tải lại lượt chạy rồi thử lại.',
    },
  },
};

export type Messages = typeof viMessages;
