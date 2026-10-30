import {
  PROJECT_NAME_MIN_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  type DocumentRunErrorCode,
} from '@portal/contracts';
import type {
  AnalyzeApiErrorCode,
  AnalyzeStage,
  ApiErrorCode,
  RunErrorCode,
  RunStatus,
  SourceProfileId,
  TableNameMapping,
} from '@portal/contracts';
import type { ApiFailureKind } from '../api/api-error';
import type {
  AssessmentWarning,
  ComplexityLevel,
  MemberFileStatus,
  MemberResolution,
  ProgramState,
} from '../../features/assessment/assessment-summary';
import type {
  CallResolution,
  CrudView,
} from '../../features/assessment/program-detail-model';

export const viMessages = {
  app: {
    skipToContent: 'Đến nội dung chính',
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
  shell: {
    project: 'Dự án',
    allProjects: 'Tất cả dự án',
    chooseProject: 'Chọn dự án để bắt đầu',
    projectDetail: {
      demo: 'VB6 · dữ liệu mẫu',
      local: 'VB6 · mã nguồn trên máy này',
      noSource: 'Chưa chọn source',
    },
    pageTitles: {
      source: 'Nạp source code của khách hàng',
      analysis: 'Phân tích source code',
      documents: 'Generate tài liệu với Agent CLI',
      review: 'Review & duyệt tài liệu',
      quote: 'Báo giá',
    },
    stepsTitle: 'Quy trình',
    steps: {
      source: 'Nạp source',
      analysis: 'Phân tích',
      documents: 'Tạo tài liệu',
      review: 'Review & duyệt',
      quote: 'Báo giá',
    },
    stepState: {
      done: 'Đã xong',
      todo: 'Chưa làm',
      unavailable: 'Chưa khả dụng',
    },
    selectProjectFirst: 'Chọn hoặc tạo dự án để mở các bước.',
    projectLoading: 'Đang mở dự án…',
    retry: 'Thử lại',
    stepEyebrow: (index: number) => `Bước ${index} / 5`,
    unavailable: {
      title: 'Chưa khả dụng',
      reasons: {
        documents:
          'Tạo tài liệu bằng AI chưa có trong bản này. Khi có, bước này dùng kết quả phân tích ở bước 2 và tạo tài liệu cho từng program.',
        review:
          'Review & duyệt cần tài liệu từ bước Tạo tài liệu, chưa có trong bản này.',
        quote:
          'Báo giá từ kết quả phân tích chưa có trong bản này: mô hình ước tính chưa được cấu hình và duyệt.',
      },
      back: 'Về bước Phân tích',
    },
    analysis: {
      loading: 'Đang tìm kết quả phân tích…',
      loadFailed: 'Không đọc được trạng thái phân tích của dự án.',
      empty: 'Chưa có kết quả phân tích',
      emptyHelp:
        'Bắt đầu phân tích ở bước Nạp source. Kết quả hiện ở đây khi lượt chạy hoàn tất và có kiểm kê.',
      goSource: 'Đến bước Nạp source',
      olderRun: 'Đang xem kết quả của một lượt chạy cụ thể.',
      latest: 'Xem kết quả mới nhất',
    },
    notFound: {
      title: 'Không tìm thấy trang',
      help: 'Địa chỉ này không có trong ứng dụng.',
      projectTitle: 'Không tìm thấy dự án',
      projectHelp: 'Dự án trong địa chỉ không tồn tại hoặc đã bị xóa.',
      back: 'Về danh sách dự án',
    },
  },
  projects: {
    workspace: 'Không gian làm việc',
    title: 'Dự án của bạn',
    refresh: 'Làm mới dự án',
    createNew: 'Tạo dự án mới',
    listTitle: 'Danh sách dự án',
    loading: 'Đang tải dự án…',
    retryList: 'Thử lại danh sách',
    noMore: 'Không còn dự án ở trang này',
    empty: 'Chưa có dự án',
    emptyHelp: 'Tạo dự án để bắt đầu không gian làm việc.',
    results: 'Kết quả phân tích',
    pageCount: (count: number) => `${count} dự án trong trang`,
    firstPage: 'Về trang đầu',
    nextPage: 'Trang tiếp',
    fixture: 'Dữ liệu mẫu',
    demoBadge: 'DEMO',
    localBadge: 'LOCAL',
    localData: 'Mã nguồn trên máy này',
    assessmentSteps: 'Các bước đánh giá',
    created: 'Đã tạo dự án.',
    footer:
      'Dự án và kết quả được lưu trên máy này. Đã có: đăng ký mã nguồn và phân tích tĩnh. Sắp có: hiểu nghiệp vụ bằng AI, rà soát và xuất báo cáo.',
    create: {
      eyebrow: 'Không gian làm việc',
      description:
        'Khởi tạo dự án để quản lý thông tin và chuẩn bị đánh giá hệ thống cũ.',
      name: 'Tên dự án',
      placeholder: 'Ví dụ: Hệ thống quản lý bán hàng',
      nameInvalid: `Nhập tên dự án từ ${PROJECT_NAME_MIN_LENGTH} đến ${PROJECT_NAME_MAX_LENGTH} ký tự, không chỉ chứa khoảng trắng.`,
      nameHelp: `Tối đa ${PROJECT_NAME_MAX_LENGTH} ký tự.`,
      sample: 'Dữ liệu mẫu VB6',
      sampleDescription: 'Chỉ lưu thông tin dự án, chưa đọc mã nguồn.',
      kind: 'Loại dự án',
      kindDemo: 'Demo với dữ liệu mẫu',
      kindLocal: 'Mã nguồn trên máy này',
      kindLocalDescription:
        'Đăng ký thư mục mã nguồn sau khi tạo dự án. Mã nguồn chỉ được đọc khi chạy phân tích.',
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
      technical: 'Thông tin kỹ thuật',
      unavailable:
        'Phân tích mã nguồn thật, rà soát và tạo báo cáo chưa khả dụng trong bản này; lượt chạy phân tích bên dưới là demo.',
    },
  },
  source: {
    title: 'Mã nguồn',
    technical: 'Thông tin kỹ thuật',
    loading: 'Đang tải thông tin mã nguồn…',
    reload: 'Tải lại mã nguồn',
    unregistered:
      'Dự án chưa đăng ký thư mục mã nguồn. Đăng ký trước khi chạy phân tích.',
    fixture: (fixtureId: string) =>
      `Dự án demo dùng bộ mẫu ${fixtureId} đi kèm ứng dụng; không đăng ký được thư mục khác.`,
    fields: {
      folder: 'Thư mục',
      revision: 'Lần đăng ký',
      profile: 'Hồ sơ phân tích',
      defaultSchema: 'Schema mặc định',
      status: 'Trạng thái',
      checkedAt: 'Kiểm tra lúc',
    },
    status: {
      ready: 'Đọc được (mới kiểm tra thư mục, chưa đọc nội dung)',
      unreadable:
        'Không đọc được thư mục đã đăng ký. Kiểm tra thư mục rồi đăng ký lại.',
    },
    mappingStatus: {
      unconfigured: 'Chưa cấu hình',
      assumed: 'Giả định, chưa xác nhận',
      confirmed: 'Đã được người quản lý DB xác nhận',
    } satisfies Record<TableNameMapping['status'], string>,
    profiles: {
      'vb6-cp932-v1': 'VB6 · CP932 (vb6-cp932-v1)',
    } satisfies Record<SourceProfileId, string>,
    form: {
      titleNew: 'Đăng ký mã nguồn',
      titleEdit: 'Đổi mã nguồn',
      rootPath: 'Đường dẫn thư mục (tuyệt đối)',
      rootPathHelp:
        'Ví dụ C:\\work\\order-module hoặc /home/dev/order-module. Backend kiểm tra thư mục và quyền đọc; nội dung chỉ được đọc khi chạy phân tích.',
      rootPathInvalid: 'Nhập đường dẫn thư mục mã nguồn.',
      profile: 'Hồ sơ phân tích',
      mappingStatus: 'Schema mặc định của tên bảng',
      defaultSchema: 'Tên schema',
      defaultSchemaHelp:
        'Schema mà tên bảng không có tiền tố trỏ tới (ví dụ user đăng nhập). Chỉ chọn “đã xác nhận” khi người quản lý DB đã xác nhận.',
      defaultSchemaInvalid:
        'Nhập tên schema bắt đầu bằng chữ cái hoặc “_”, chỉ gồm chữ, số, _, $, #.',
      submit: 'Đăng ký',
      update: 'Lưu thay đổi',
      pending: 'Đang kiểm tra…',
      edit: 'Đổi mã nguồn',
      cancelEdit: 'Hủy',
      saved: 'Đã lưu mã nguồn.',
    },
    errors: {
      SOURCE_FORBIDDEN:
        'Không được dùng thư mục này: thư mục mạng, thư mục của ứng dụng hoặc chứa thư mục dữ liệu của ứng dụng.',
      SOURCE_UNREADABLE:
        'Thư mục không tồn tại hoặc ứng dụng không có quyền đọc.',
      SOURCE_REVISION_CONFLICT:
        'Mã nguồn vừa được cập nhật ở nơi khác. Tải lại mã nguồn rồi lưu lại; dữ liệu bạn nhập vẫn được giữ.',
      SOURCE_PROFILE_UNSUPPORTED: 'Hồ sơ phân tích không được bản này hỗ trợ.',
      PROJECT_MODE_CONFLICT:
        'Dự án demo không đăng ký được thư mục mã nguồn. Tạo dự án mã nguồn trên máy này.',
    } satisfies Partial<Record<AnalyzeApiErrorCode, string>>,
    outcomeUnknown:
      'Chưa xác nhận được backend đã lưu mã nguồn. Tải lại mã nguồn để kiểm tra trước khi gửi lại.',
    startBlocked:
      'Cần đăng ký một thư mục mã nguồn đọc được trước khi chạy phân tích.',
  },
  runs: {
    title: 'Phân tích (demo)',
    titleLocal: 'Phân tích',
    demoNotice:
      'Lượt chạy demo dùng bộ thực thi mô phỏng trên dữ liệu mẫu: không đọc mã nguồn, chỉ công bố kết quả kiểm kê mẫu đi kèm ứng dụng.',
    localNotice:
      'Lượt chạy tạo bản chụp bất biến của thư mục đã đăng ký (chỉ đọc) rồi kiểm kê tĩnh trên bản chụp đó. Hiểu nghiệp vụ và báo cáo chưa có trong bản này.',
    localSucceeded: 'Hoàn tất',
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
    openResults: 'Xem kết quả phân tích',
    technical: 'Thông tin kỹ thuật',
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
  assessment: {
    title: 'Đánh giá tổng quan',
    tabsLabel: 'Các phần của kết quả phân tích',
    tabs: {
      programs: 'Danh sách program',
      graph: 'Call graph',
      tables: 'Bảng DB',
    },
    dashboard: {
      kpis: {
        programs: 'Program',
        programsSub: (complete: string) => `${complete} đầy đủ`,
        physical: 'Physical LoC',
        physicalSub: 'Code',
        procedures: 'Procedure',
        proceduresSub: 'File code đã phân tích',
        perProgram: 'Cộng theo program (tính trùng file dùng chung)',
        sql: 'Vị trí truy cập SQL',
        sqlSub: (count: string) => `${count} chuỗi SQL ghép giá trị runtime`,
        sqlSubOld: 'Dòng có truy cập bảng, mỗi file một lần',
        tables: 'Bảng được truy cập',
        tablesMapped: 'Sau ánh xạ tên bảng',
        tablesInferred: (schema: string) =>
          `Sau ánh xạ · giả định schema ${schema}`,
        tablesRaw: 'Tên như trong source',
        high: 'Program High + Very High',
        highSub: (analyzed: string) =>
          `trên ${analyzed} program đã phân tích · tham khảo`,
      },
      analysedAt: (time: string) => `Phân tích xong lúc ${time}`,
      files: (count: string) => `${count} file`,
      sharedFiles: (count: string) => `${count} file dùng chung`,
      locTitle: 'Phân bổ dòng code',
      locTotal: 'Physical LoC',
      loc: {
        code: 'Code',
        comment: 'Comment',
        blank: 'Dòng trống',
        designer: 'Designer + metadata',
        unclassified: 'Chưa phân loại',
      },
      histogramTitle: 'Phân bố complexity',
      histogramPrograms: (count: string) => `${count} program`,
      histogramNote: (version: string) => `Tham khảo · ${version}`,
      notAnalyzed: (count: string) => `${count} program chưa phân tích`,
      sectionLabel: 'Chi tiết phân tích',
      graphSoon:
        'Call graph toàn dự án sẽ có ở bước tiếp theo. Lời gọi của từng program xem ở tab Lời gọi trong chi tiết program.',
      tablesNone: 'Không phát hiện truy cập bảng.',
      tablesPagination: 'Phân trang bảng DB',
      columns: {
        table: 'Bảng',
        programs: 'Program',
        locations: 'Vị trí truy cập',
        top: 'Program truy cập nhiều nhất',
      },
      createDocs: 'Tạo tài liệu cho program này',
      expand: (program: string) => `Mở chi tiết ${program}`,
      kinds: {
        form: 'Form',
        module: 'Module',
        class: 'Class',
        'user-control': 'UserControl',
        'property-page': 'PropertyPage',
        'user-document': 'UserDocument',
        designer: 'Designer',
      } as Record<string, string>,
    },
    technical: 'Thông tin kỹ thuật',
    programCount: (count: string) => `${count} program`,
    showPrograms: 'Xem danh sách',
    moreMissing: (count: string) => `và ${count} file khác`,
    loading: 'Đang tải kết quả kiểm kê…',
    retry: 'Tải lại kết quả',
    empty:
      'Lượt chạy này không có kết quả kiểm kê (lượt chạy mã nguồn trên máy tạo bởi bản trước chỉ chụp nguồn). Chạy lại để có kiểm kê.',
    demoData: 'Kết quả mẫu đi kèm ứng dụng, không phải mã nguồn thật',
    localData: 'Kiểm kê từ bản chụp mã nguồn trên máy này',
    partialTitle: 'Kiểm kê chưa đầy đủ.',
    partialHelp:
      'Một số file hoặc program chưa phân tích được; các số liệu bên dưới không bao gồm phần đó.',
    warningsTitle: 'Cảnh báo',
    fields: {
      mode: 'Dữ liệu',
      artifact: 'Kết quả (phiên bản)',
      snapshot: 'Bản chụp nguồn',
      createdAt: 'Tạo lúc',
      versions: 'Phiên bản đếm',
      tableMapping: 'Ánh xạ tên bảng',
    },
    mapping: {
      unconfigured: 'Chưa cấu hình (chỉ gộp hoa/thường)',
      assumed: 'Giả định, cần người quản lý DB xác nhận',
      confirmed: 'Đã xác nhận',
      absent: 'Không có (kiểm kê cũ, chỉ có tên như trong mã nguồn)',
    } satisfies Record<TableNameMapping['status'] | 'absent', string>,
    mappingInferred: (schema: string) =>
      `Giả định schema ${schema} (tiền tố xuất hiện nhiều nhất trong mã nguồn), chưa được xác nhận`,
    totals: {
      coverageValue: (analyzed: string, total: string) =>
        `${analyzed} / ${total}`,
    },
    warnings: {
      PROGRAM_UNSUPPORTED: 'Có program không phân tích được.',
      PROGRAM_INCOMPLETE: 'Có program thiếu file hoặc có file chưa phân tích.',
      MEMBER_UNRESOLVED:
        'Có file khai báo trong project (.vbp) không tìm thấy hoặc không xác định được trong thư mục nguồn.',
      FILE_ERROR: 'Có file không giải mã được.',
      FILE_UNSUPPORTED: 'Có file code không được hỗ trợ.',
      FILES_SKIPPED:
        'Có file bị bỏ qua (liên kết, quá lớn hoặc không đọc được).',
      UNCLASSIFIED_LINES: 'Có dòng chưa phân loại được.',
      TABLE_NAMES_NOT_CONFIRMED: 'Ánh xạ tên bảng chưa được xác nhận.',
      COMPLEXITY_DRAFT: 'Công thức độ phức tạp là bản nháp.',
    } satisfies Record<AssessmentWarning, string>,
    programs: {
      title: 'Danh sách program',
      search: 'Tìm program',
      stateFilter: 'Trạng thái',
      levelFilter: 'Độ phức tạp',
      all: 'Tất cả',
      count: (shown: number, total: number) =>
        `Đang hiển thị ${shown} / ${total} program`,
      noMatch: 'Không có program khớp bộ lọc.',
      none: 'Kiểm kê không có program nào.',
      notAnalyzed: 'Chưa phân tích',
      mappedTables: (count: string) => `(sau ánh xạ: ${count})`,
      draft: 'Nháp',
      declaredName: (name: string) => `Tên trong project: ${name}`,
      sortBy: (column: string) => `Sắp xếp theo ${column}`,
      pageSize: 'Số dòng mỗi trang',
      page: (page: number, pages: number) => `Trang ${page} / ${pages}`,
      previous: 'Trang trước',
      next: 'Trang sau',
      pagination: 'Phân trang danh sách program',
      columns: {
        program: 'Program',
        kind: 'Loại',
        state: 'Trạng thái',
        ownCodeLines: 'LoC riêng',
        codeLines: 'LoC gồm file dùng chung',
        procedures: 'Procedure riêng',
        tables: 'Số bảng',
        complexity: 'Độ phức tạp (tham khảo)',
      },
      state: {
        complete: 'Đầy đủ',
        partial: 'Chưa đầy đủ',
        unsupported: 'Không phân tích được',
      } satisfies Record<ProgramState, string>,
      level: {
        low: 'Thấp',
        medium: 'Trung bình',
        high: 'Cao',
        'very-high': 'Rất cao',
      } satisfies Record<ComplexityLevel, string>,
    },
    members: {
      title: (program: string) => `File của ${program}`,
      issue: 'Lý do không phân tích được:',
      none: 'Không có file khai báo.',
      shared: 'Dùng chung',
      resolution: {
        'case-mismatch': 'Sai hoa/thường',
        ambiguous: 'Không xác định',
        missing: 'Không tìm thấy',
        'outside-root': 'Ngoài thư mục nguồn',
        'absolute-path': 'Đường dẫn tuyệt đối',
      } satisfies Record<Exclude<MemberResolution, 'resolved'>, string>,
      fileStatus: {
        unsupported: 'Không hỗ trợ',
        error: 'Lỗi đọc',
        other: 'Không phải code',
      } satisfies Record<Exclude<MemberFileStatus, 'analyzed'>, string>,
    },
    detail: {
      title: (program: string) => `Chi tiết program ${program}`,
      tabsLabel: 'Các phần của chi tiết program',
      tabs: {
        summary: 'Tóm tắt',
        files: 'File',
        procedures: 'Procedure',
        crud: 'CRUD',
        calls: 'Lời gọi',
      },
      rowRange: (from: string, to: string, total: string) =>
        `Dòng ${from}–${to} / ${total}`,
      rowsPagination: 'Phân trang bảng',
      issue: 'Lý do không phân tích được:',
      incomplete:
        'Program chưa đầy đủ: có file thiếu, không hỗ trợ hoặc dòng chưa phân loại. Số liệu chỉ gồm phần đã phân tích.',
      unavailable:
        'Program này chưa được phân tích nên không có LoC, CRUD hay lời gọi (không hiển thị 0).',
      notAnalyzed: 'Chưa phân tích',
      ownCodeLines: 'LoC riêng',
      codeLines: 'LoC gồm file dùng chung',
      ownProcedures: 'Procedure riêng',
      rawComplexity: 'Độ phức tạp (tên bảng gốc)',
      mappedComplexity: 'Độ phức tạp sau ánh xạ',
      proceduresTitle: 'Procedure và LoC',
      proceduresHelp:
        'LoC từng procedure theo phiên bản đếm của kiểm kê. Procedure trong file dùng chung cũng thuộc các program khác.',
      noProcedures: 'Không có procedure trong các file đã phân tích.',
      crudTitle: 'CRUD theo bảng',
      showRaw: 'Xem tên gốc',
      showMapped: 'Xem sau ánh xạ',
      crudViews: {
        raw: 'Tên như trong mã nguồn',
        mapped: 'Sau ánh xạ tên bảng',
      } satisfies Record<CrudView, string>,
      noCrud: 'Không phát hiện truy cập bảng.',
      viaShared: 'Chỉ qua file dùng chung',
      callsTitle: 'Lời gọi',
      callsHelp:
        'Phân tích theo tên (không chạy chương trình). Tên khớp nhiều procedure được để là chưa xác định, không đoán.',
      noCalls: 'Không có lời gọi được ghi nhận.',
      ambiguousTarget: 'Chưa xác định',
      candidates: 'Ứng viên:',
      resolution: {
        local: 'Trong cùng file',
        program: 'Trong program',
        ambiguous: 'Chưa xác định',
        external: 'API ngoài',
      } satisfies Record<CallResolution, string>,
      externalTitle: 'Phụ thuộc bên ngoài',
      noExternal: 'Không có tham chiếu hoặc API ngoài.',
      externalUnknown:
        'Chưa phân tích nên chưa xác định được API ngoài; chỉ liệt kê tham chiếu đã đọc được từ file project (nếu có).',
      externalPartial:
        'Program chưa đầy đủ: danh sách chỉ gồm phần đã phân tích, có thể còn phụ thuộc chưa phát hiện.',
      externalApi: 'API ngoài',
      referenceKind: {
        reference: 'Tham chiếu',
        component: 'Component',
      },
      columns: {
        file: 'File',
        kind: 'Loại',
        codeLines: 'LoC',
        procedures: 'Procedure',
        procedure: 'Procedure',
        lines: 'Dòng',
        decisions: 'Điểm rẽ nhánh',
        table: 'Bảng',
        sourceNames: 'Tên trong mã nguồn',
        operations: 'Thao tác',
        evidence: 'Dẫn chứng',
        caller: 'Nơi gọi',
        callee: 'Tên được gọi',
        resolution: 'Xác định',
        targets: 'Đích',
        uses: 'Số lần',
      },
    },
    errors: {
      ARTIFACT_NOT_FOUND:
        'Không tìm thấy phiên bản kết quả này trong dự án. Tải lại lượt chạy.',
      mismatch:
        'Kết quả nhận được không khớp phiên bản đã yêu cầu. Tải lại kết quả.',
    },
  },
  documents: {
    lead: 'Tạo tài liệu theo bộ specification-design cho program đã chọn ở bước Phân tích: chọn tài liệu cần tạo, Agent CLI viết gói tài liệu cho program đó.',
    configLabel: 'Cấu hình',
    runLabel: 'Tiến trình generate',
    programTitle: 'Program',
    changeProgram: 'Đổi program',
    chooseProgram: 'Chọn program',
    noProgram:
      'Chưa chọn program. Ở bước Phân tích, mở một program rồi bấm "Tạo tài liệu cho program này".',
    programMissing: (key: string) =>
      `Program ${key} không có trong lượt phân tích mới nhất. Chọn lại ở bước Phân tích.`,
    programFacts: (files: number, forms: number, shared: number) =>
      `${files} file riêng · ${forms} form · ${shared} module dùng chung`,
    programsLoading: 'Đang đọc thông tin program…',
    programsFailed: 'Không đọc được kết quả phân tích của program.',
    documentsTitle: 'Tài liệu cần tạo',
    documentsCount: (selected: number, total: number) =>
      `Đã chọn ${selected} / ${total}`,
    specDocs: {
      'business-rules': {
        name: 'Business rules',
        detail: 'Quy tắc nghiệp vụ hiện trạng, có evidence',
      },
      'basic-design': {
        name: 'Thiết kế cơ bản',
        detail: 'Màn hình, item, chức năng (kèm BR)',
      },
      'detail-design': {
        name: 'Thiết kế chi tiết',
        detail: 'Xử lý theo function (kèm BR, Basic, DB)',
      },
      'db-design': {
        name: 'Thiết kế CSDL',
        detail: 'Bảng, CRUD, SQL theo call site',
      },
    },
    companion: 'sinh kèm',
    always:
      'Tài liệu tham chiếu được sinh kèm theo SD-CT-07. Trạng thái sinh, phạm vi đã đọc và câu hỏi mở nằm ngay trong từng tài liệu.',
    agentTitle: 'Cấu hình Agent',
    model: 'Model',
    outputLanguage: 'Ngôn ngữ đầu ra',
    languages: { vi: 'Tiếng Việt', ja: '日本語', en: 'English' },
    defaultModel: 'Mặc định của CLI',
    fakeRunner:
      'Backend đang dùng runner giả: không gọi AI, gói tài liệu tạo ra là bản DEMO.',
    codexRunner:
      'Backend đang dùng Codex CLI: chỉ dành cho dev/test với dữ liệu demo hoặc fixture sạch. Môi trường thật dùng Claude Code CLI.',
    draftPack: (pack: string) =>
      `Bộ specification-design ${pack} đang DRAFT, chưa duyệt: output chỉ là bản nháp calibration.`,
    ready: 'sẵn sàng',
    ringLabel: (done: number, total: number) =>
      `Đã xong ${done} / ${total} tài liệu`,
    readyTitle: (name: string) => `Sẵn sàng tạo tài liệu cho ${name}`,
    plan: (files: number) =>
      `Agent viết một gói ${files} file Markdown cho program này.`,
    runTitles: {
      queued: (_done: number, total: number) =>
        `Đang chờ tạo ${total} tài liệu`,
      running: (done: number, total: number) =>
        `Agent đang viết tài liệu… · ${done} / ${total}`,
      cancelling: () => 'Đang dừng Agent…',
      succeeded: (done: number) => `Đã tạo xong ${done} tài liệu`,
      failed: (done: number, total: number) =>
        `Chưa tạo xong tài liệu · ${done} / ${total}`,
      cancelled: () => 'Đã hủy generate',
      interrupted: () => 'Generate bị gián đoạn',
    },
    runState: {
      queued: 'đang chờ',
      running: 'đang chạy',
      cancelling: 'đang dừng',
      succeeded: 'hoàn tất',
      failed: 'có lỗi',
      cancelled: 'đã hủy',
      interrupted: 'gián đoạn',
    },
    itemStatus: {
      pending: 'Chờ',
      running: 'Đang phân tích…',
      succeeded: 'Xong',
      failed: 'Lỗi',
      skipped: 'Bỏ qua',
      stopped: 'Đã dừng',
    },
    elapsed: 'Thời gian',
    tokens: 'Token',
    filesWritten: 'File đã ghi',
    start: 'Bắt đầu generate',
    rerun: 'Chạy lại',
    goReview: 'Sang review',
    starting: 'Đang gửi…',
    cancel: 'Dừng',
    cancelling: 'Đang dừng…',
    queueTitle: 'Program trong lượt chạy',
    noneSelected: 'Chọn program ở bước Phân tích và ít nhất một tài liệu.',
    otherActive: (name: string) =>
      `Dự án đang có lượt tạo tài liệu cho ${name}; chờ lượt đó xong rồi mới bắt đầu.`,
    openOther: 'Mở lượt đó',
    reading: 'Agent đang đọc phiếu input, bộ spec và source…',
    docStatus: {
      pending: 'Chờ',
      writing: 'Đang viết',
      written: 'Đã viết · chờ kiểm',
      done: 'Hoàn tất',
      notWritten: 'Không tạo',
    },
    view: 'Xem',
    demoNoSource:
      'Dự án demo không có file source, mà bộ specification-design yêu cầu đọc source: Agent CLI sẽ không tạo được tài liệu hoàn tất. Hãy dùng dự án có source (mã nguồn trên máy này).',
    working: 'Agent đang đọc và viết tài liệu…',
    codexProgress:
      'Codex trả cả gói tài liệu một lần ở cuối, nên trạng thái từng tài liệu chỉ cập nhật khi Codex trả lời xong.',
    downloadMd: 'Tải .md',
    close: 'Đóng',
    draftNotice:
      'Bản nháp do AI viết theo bộ specification-design DRAFT, chưa review: cần TL kiểm tra trước khi dùng.',
    documentLoading: 'Đang mở file…',
    loading: 'Đang đọc trạng thái tạo tài liệu…',
    loadFailed: 'Không đọc được trạng thái tạo tài liệu.',
    connectionLost:
      'Mất kết nối với backend; đang thử lại. Lượt chạy không bị hủy.',
    startUnknown:
      'Chưa rõ yêu cầu generate đã được nhận chưa. Bấm lại để gửi lại đúng yêu cầu đó.',
    recovery:
      'Có tiến trình Agent của lần chạy trước có thể vẫn đang sống. Hãy tắt tiến trình đó rồi khởi động lại backend.',
    needAnalysis: {
      title: 'Chưa có kết quả phân tích',
      help: 'Danh sách program lấy từ kết quả phân tích ở bước 2. Chạy phân tích thành công trước.',
      action: 'Đến bước Phân tích',
    },
    runErrors: {
      AGENT_UNAVAILABLE:
        'Không tìm thấy Agent CLI trên máy này (cần file thực thi, ví dụ claude.exe trên PATH hoặc PORTAL_AGENT_CLI).',
      AGENT_AUTH_FAILED:
        'Agent CLI chưa đăng nhập hoặc phiên đăng nhập đã hết hạn. Mở terminal, đăng nhập lại CLI đang dùng (claude, hoặc codex login) rồi thử lại.',
      AGENT_QUOTA_EXCEEDED:
        'Agent CLI đã hết hạn mức sử dụng. Thử lại sau khi hạn mức được làm mới.',
      AGENT_FAILED: 'Agent CLI dừng với lỗi. Xem log bên dưới.',
      AGENT_OUTPUT_INVALID:
        'Agent không trả về đúng gói file theo yêu cầu. Xem log rồi thử lại.',
      PACKAGE_INCOMPLETE:
        'Có tài liệu chưa "hoàn tất": gói chưa được gửi review. Chạy lại program này.',
      INPUT_UNAVAILABLE:
        'Không đọc được kết quả phân tích hoặc snapshot source của program.',
      ARTIFACT_WRITE_FAILED:
        'Không ghi được file tài liệu vào thư mục dữ liệu.',
      TIMEOUT: 'Generate quá thời gian cho phép và đã bị dừng.',
      STOP_UNCONFIRMED:
        'Không xác nhận được tiến trình Agent đã dừng. Khởi động lại backend sau khi kiểm tra.',
      INTERNAL_ERROR: 'Backend gặp lỗi khi tạo tài liệu.',
    } satisfies Record<DocumentRunErrorCode, string>,
    requestErrors: {
      ANALYSIS_REQUIRED:
        'Lượt phân tích này chưa có kết quả kiểm kê. Chạy phân tích lại rồi thử.',
      DOCUMENT_NOT_FOUND: 'File này không có hoặc gói chưa hoàn tất.',
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
      source:
        'Thông tin mã nguồn không hợp lệ: đường dẫn phải là đường dẫn tuyệt đối trên máy này.',
    },
  },
};

export type Messages = typeof viMessages;
