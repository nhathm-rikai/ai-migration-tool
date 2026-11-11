import {
  PROJECT_NAME_MIN_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  type DocumentRunErrorCode,
} from '@portal/contracts';
import type {
  AnalyzeApiErrorCode,
  AnalyzeStage,
  FolderPickerUnavailableReason,
  ApiErrorCode,
  RunErrorCode,
  RunStatus,
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
import type { QuoteFormulaFacts } from '../../features/quote/quote-model';

export const viMessages = {
  app: {
    skipToContent: 'Đến nội dung chính',
    utExcel: {
      download: 'Tải Excel (単体テスト仕様書)',
      busy: 'Đang xuất…',
      failed:
        'Không xuất được Excel của test case UT. Thử lại sau; không có file nào được lưu.',
    },
    itExcel: {
      download: 'Tải Excel (結合テスト仕様書)',
      busy: 'Đang xuất…',
      failed:
        'Không xuất được Excel của test case IT. Thử lại sau; không có file nào được lưu.',
    },
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
    newProject: 'Dự án mới',
    chooseProject: 'Chọn thư mục source để bắt đầu',
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
      back: 'Về trang Nạp source',
    },
  },
  projects: {
    results: 'Kết quả phân tích',
    fixture: 'Dữ liệu mẫu',
    demoBadge: 'DEMO',
    localBadge: 'LOCAL',
    assessmentSteps: 'Các bước đánh giá',
    create: {
      nameInvalid: `Nhập tên dự án từ ${PROJECT_NAME_MIN_LENGTH} đến ${PROJECT_NAME_MAX_LENGTH} ký tự, không chỉ chứa khoảng trắng.`,
    },
  },
  source: {
    loading: 'Đang tải thông tin mã nguồn…',
    reload: 'Tải lại mã nguồn',
    form: {
      rootPathHelp:
        'Ví dụ C:\\work\\order-module hoặc /home/dev/order-module. Backend kiểm tra thư mục và quyền đọc; nội dung chỉ được đọc khi chạy phân tích.',
      rootPathInvalid: 'Nhập đường dẫn thư mục mã nguồn.',
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
  },
  sourceStep: {
    lead: 'Chọn thư mục chứa source cũ. Mọi xử lý chạy trên máy này, source không rời khỏi máy của bạn.',
    hero: {
      chooseTitle: 'Chọn thư mục source',
      chosenTitle: 'Đã chọn thư mục',
      chosenHelp: 'Kiểm tra thông tin dự án bên dưới rồi bấm “Quét source”.',
      demoHelp:
        'Dự án demo quét bộ mẫu đi kèm ứng dụng, không đọc thư mục nào trên máy.',
      unreadableHelp:
        'Không đọc được thư mục đã chọn. Kiểm tra thư mục hoặc chọn thư mục khác.',
      scan: 'Quét source',
      changeFolder: 'Đổi thư mục',
      queuedTitle: 'Đang chờ bắt đầu…',
      scanningTitle: 'Đang quét thư mục…',
      cancellingTitle: 'Đang hủy lượt quét…',
      progressDone: 'Tiến độ quét',
      files: (done: number, total: number) => `${done} / ${total} file`,
      megabytes: (value: string) => `${value} MB`,
      readingFiles: 'File đang đọc',
      progressLabel: 'Đang quét, chưa biết tổng số file',
      stage: (stage: string) => `Bước hiện tại: ${stage}`,
      doneTitle: 'Quét xong · đang chuyển sang Phân tích…',
      goNow: 'Xem kết quả ngay',
      endedTitle: {
        failed: 'Quét source thất bại',
        cancelled: 'Đã hủy lượt quét',
        interrupted: 'Lượt quét bị gián đoạn',
      },
      cancelledHelp: 'Lượt quét đã dừng theo yêu cầu, chưa có kết quả mới.',
      lastResult: 'Xem kết quả lần quét gần nhất',
      target: 'Đang quét',
      targetFolder: 'Thư mục',
      targetLanguage: 'Ngôn ngữ',
      noFileCount:
        'Số file và phần trăm sẽ hiện khi backend báo tiến độ theo file.',
    },
    steps: {
      title: 'Tiến trình',
      items: [
        'Đọc cây thư mục',
        'Chụp & băm nội dung',
        'Phân tích (decode, SQL, call graph)',
        'Lưu kết quả',
      ],
      state: { done: 'đã xong', active: 'đang làm', todo: 'chưa làm' },
    },
    form: {
      title: 'Thông tin dự án',
      name: 'Tên dự án',
      folder: 'Đường dẫn thư mục source (tuyệt đối)',
      pick: 'Chọn thư mục',
      picking: 'Đang mở hộp thoại…',
      pickingHelp:
        'Hộp thoại chọn thư mục đã mở trên máy này. Chọn thư mục rồi bấm OK.',
      useFolder: 'Dùng thư mục này',
      pickerUnavailable: {
        'no-tool':
          'Máy này không có hộp thoại chọn thư mục. Nhập đường dẫn thư mục bên dưới.',
        failed:
          'Không mở được hộp thoại chọn thư mục. Nhập đường dẫn thư mục bên dưới.',
        timeout:
          'Hộp thoại đã đóng vì quá lâu không chọn. Bấm lại hoặc nhập đường dẫn bên dưới.',
      } satisfies Record<FolderPickerUnavailableReason, string>,
      cancel: 'Hủy',
      saving: 'Đang kiểm tra…',
      demoFolder: (fixtureId: string) => `${fixtureId} (bộ mẫu)`,
      language: 'Ngôn ngữ phân tích (chọn 1)',
      languageRequired: 'Chọn ngôn ngữ phân tích trước khi quét.',
      comingSoon: 'Sắp hỗ trợ',
    },
    recent: {
      title: 'Dự án gần đây',
      search: 'Tìm dự án theo tên',
      noMatch: 'Không có dự án nào khớp.',
      new: '+ Dự án mới',
      loading: 'Đang tải dự án gần đây…',
      failed: 'Không tải được danh sách dự án.',
      empty: 'Chưa có dự án nào.',
      open: 'Đang mở',
      delete: {
        action: (name: string) => `Xóa dự án ${name}`,
        title: 'Xóa dự án này?',
        body: (name: string) =>
          `Dự án "${name}" sẽ bị xóa vĩnh viễn cùng toàn bộ lượt chạy, kết quả phân tích, tài liệu, nhận xét và bản chụp mã nguồn của dự án. Thư mục mã nguồn gốc của bạn không bị ảnh hưởng. Không thể hoàn tác.`,
        confirm: 'Xóa vĩnh viễn',
        deleting: 'Đang xóa…',
        cancel: 'Hủy',
        busy: 'Dự án đang có lượt chạy. Hủy hoặc chờ lượt chạy kết thúc rồi xóa lại.',
      },
      updated: (date: string) => `Cập nhật ${date}`,
      status: {
        none: 'Chưa phân tích',
        active: 'Đang phân tích',
        succeeded: 'Đã phân tích',
        failed: 'Thất bại',
        cancelled: 'Đã hủy',
        interrupted: 'Bị gián đoạn',
        unknown: 'Không đọc được trạng thái',
      },
    },
  },
  runs: {
    demoNotice:
      'Lượt chạy demo dùng bộ thực thi mô phỏng trên dữ liệu mẫu: không đọc mã nguồn, chỉ công bố kết quả kiểm kê mẫu đi kèm ứng dụng.',
    localNotice:
      'Lượt chạy tạo bản chụp bất biến của thư mục đã đăng ký (chỉ đọc) rồi kiểm kê tĩnh trên bản chụp đó. Hiểu nghiệp vụ chưa có trong bản này; báo cáo kỹ thuật xuất Excel ở bước Phân tích.',
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
      RUN_EVENTS_LIMIT:
        'Đang mở quá nhiều luồng theo dõi lượt chạy. Trạng thái vẫn được cập nhật định kỳ.',
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
      reports: 'Report (帳票)',
    },
    screenReport: {
      kpis: {
        screens: 'Màn hình (画面)',
        screensSub: (shared: string) => `${shared} dùng chung, tính một lần`,
        reports: 'Report theo quy ước Assessment',
        reportsSub: (crystal: string, print: string, exports: string) =>
          `Crystal ${crystal} · In bằng code ${print} · CSV/Excel ${exports}`,
        reportsMissing: (missing: string) => `Thiếu file .rpt: ${missing}`,
        batches: 'Batch (バッチ)',
        batchesSub: 'Program không có form, khởi động bằng Sub Main',
        noData: 'Chưa có dữ liệu',
        noDataHelp:
          'Kết quả phân tích này được tạo trước khi có đếm màn hình, report và batch. Cần phân tích lại để có số liệu; Portal không hiện 0 thay cho dữ liệu chưa có.',
      },
      distribution: {
        title: 'Độ phức tạp của report',
        help: 'Độ phức tạp tính từ code tạo report (số nhánh, dòng thực thi, bảng truy cập, SQL động, lời gọi), chưa gồm thiết kế layout.',
        byLevel: 'Theo mức phức tạp',
        total: 'Tổng',
        level: {
          low: 'Thấp',
          medium: 'Trung bình',
          high: 'Cao',
          'very-high': 'Rất cao',
          unrated: 'Chưa đánh giá',
        },
      },
      reports: {
        title: 'Danh sách report',
        help: 'Mỗi dòng là một đơn vị report theo Cơ sở tính.',
        none: 'Không tìm thấy report nào.',
        originFilter: 'Tạo bằng',
        columns: {
          name: 'Report',
          origin: 'Tạo bằng',
          status: 'File thiết kế',
          programs: 'Program',
          uses: 'Nơi dùng',
          complexity: 'Phức tạp',
          details: 'Chi tiết nơi dùng',
        },
        origin: {
          crystal: 'Crystal Reports',
          'data-report': 'DataReport',
          print: 'In bằng code',
          export: 'Xuất CSV/Excel',
        },
        status: {
          'design-file': 'Có file',
          'missing-file': 'Thiếu file',
        },
      },
      dataFiles: {
        title: 'Ghi file dữ liệu (không tính report)',
        help: 'Không tính vào tổng (xem Cơ sở tính).',
        excluded: (count: string) =>
          `Đã loại ${count} chỗ ghi log/file tạm theo quy tắc nhận diện.`,
        none: 'Không có.',
        columns: {
          program: 'Program',
          kind: 'Loại',
          location: 'Bằng chứng (file:dòng)',
          procedure: 'Procedure',
        },
        kind: {
          'file-output': 'Ghi file',
          unknown: 'Thư viện report, không kèm mẫu',
        },
      },
      usage: {
        program: 'Program',
        file: 'File',
        line: 'Dòng',
        procedure: 'Procedure',
      },
      list: {
        title: 'Danh sách report',
        count: (shown: string, total: string) =>
          `Đang hiển thị ${shown} / ${total} report`,
        search: 'Tìm report',
        levelFilter: 'Mức phức tạp',
        kindFilter: 'Loại',
        confidenceFilter: 'Độ tin cậy',
        all: 'Tất cả',
        confidenceCounted: 'Phát hiện + tham chiếu',
        none: 'Không có report nào.',
        noMatch: 'Không có report khớp bộ lọc.',
        columns: {
          program: 'Program',
          module: 'Module',
          kind: 'Loại',
          name: 'Tên',
          location: 'File:dòng',
          confidence: 'Tin cậy',
          complexity: 'Phức tạp',
        },
        sortBy: (label: string) => `Sắp xếp theo ${label}`,
        morePrograms: (count: string) => `và ${count} program khác`,
        sharedFile: 'File dùng chung',
        factorsTitle: 'Yếu tố chấm điểm',
        noFactors: 'Không có yếu tố nào được chấm.',
        page: (current: string, pages: string) => `Trang ${current} / ${pages}`,
        previous: 'Trang trước',
        next: 'Trang sau',
      },
      complexityDetail: {
        title: 'Cách xác định độ phức tạp',
        factor: 'Yếu tố',
        measured: 'Giá trị đo',
        points: 'Điểm cộng',
        score: (score: string) => `Tổng điểm: ${score}`,
        scope: {
          title: 'Procedure được chấm',
          procedure: 'Tên procedure',
          file: 'File',
          tier: 'Vị trí',
          tiers: {
            '0': 'Gốc (tạo/gọi report)',
            '1': 'Được gọi, tầng 1',
            '2': 'Được gọi, tầng 2',
          } as Record<string, string>,
          unresolved: (count: string) =>
            `Lời gọi chưa phân giải (không suy đoán, không đổi điểm): ${count}`,
          printOps: (content: string, drawing: string, position: string) =>
            `Lệnh in/vẽ: in nội dung ${content}, vẽ đường/khung ${drawing}, đặt vị trí ${position} (không cộng điểm)`,
        },
      },
      reasons: {
        NO_PROCEDURE:
          'Không xác định được procedure chứa dòng report nên không chấm',
        DESIGN_NOT_ANALYZED_FLOOR:
          'Chưa phân tích thiết kế .rpt nên mức tối thiểu là Trung bình',
      } as Record<string, string>,
      factors: {
        decisionPoints: 'Điểm rẽ nhánh',
        executableLines: 'Dòng thực thi',
        tables: 'Bảng truy cập',
        dynamicSql: 'SQL động / ghép chuỗi',
        calls: 'Lời gọi procedure khác',
        printDensity: 'Mật độ lệnh in/vẽ',
        'design-not-analyzed': 'Thiết kế chưa phân tích',
      } as Record<string, string>,
      warnings: {
        REPORT_FILE_MISSING: 'Thiếu file .rpt trong source',
        SCREEN_FILE_MISSING: 'Thiếu file form trong source',
        SCREEN_FILE_NOT_ANALYZED: 'File form chưa phân tích được',
      } as Record<string, string>,
      programTypes: {
        screen: 'Có màn hình',
        batch: 'Batch',
        unknown: 'Chưa xác định',
      },
      detail: {
        screensTitle: 'Màn hình',
        reportsTitle: 'Report',
        noScreens: 'Program không khai báo màn hình.',
        noReports: 'Không tìm thấy report.',
        sharedScreen: 'Dùng chung',
        columns: {
          screen: 'Màn hình',
          file: 'File',
          kind: 'Loại',
          name: 'Tên',
          location: 'File:dòng',
          confidence: 'Tin cậy',
          complexity: 'Phức tạp',
          notes: 'Ghi chú',
        },
      },
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
        highSub: (analyzed: string) => `trên ${analyzed} program đã phân tích`,
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
      notAnalyzed: (count: string) => `${count} program chưa phân tích`,
      sectionLabel: 'Chi tiết phân tích',
      graph: {
        loading: 'Đang tải call graph…',
        empty: 'Kết quả kiểm kê không có program nào để vẽ graph.',
        lanes: {
          program: 'Program',
          own: 'Module riêng',
          shared: 'Module dùng chung',
          tables: 'Bảng DB · COM',
        },
        kinds: {
          program: 'Program',
          'own-module': 'Module riêng',
          'shared-module': 'Dùng chung',
          table: 'Bảng DB',
          component: 'COM',
        },
        summary: (nodes: string, edges: string, calls: string) =>
          `${nodes} node · ${edges} cạnh · ${calls} lượt gọi giữa các file`,
        tableView: {
          mapped: 'Bảng theo tên sau ánh xạ',
          raw: 'Bảng theo tên trong source',
        },
        showCommon: (count: string) =>
          `Hiện module hầu hết program đều dùng (${count})`,
        showCommonTitle:
          'Module/COM được hơn 80% program khai báo, thường là hằng số hoặc hàm tiện ích. Chúng nối tới gần như mọi program nên được ẩn để graph gọn; panel Common module vẫn liệt kê và ghi "đang ẩn".',
        lanesLabel: 'Thứ tự làn từ trái sang phải',
        layoutPending: 'Đang sắp xếp graph…',
        layoutFailed:
          'Không sắp xếp được graph tự động; đang hiển thị theo làn đơn giản.',
        canvasLabel: 'Call graph toàn dự án',
        rootGroup: '(thư mục gốc)',
        groupCount: (count: string) => `${count} program`,
        boxCount: (count: string) => `${count} node`,
        folderType: 'Thư mục',
        expandFolder: (folder: string, count: string) =>
          `Mở thư mục ${folder} (${count})`,
        collapseFolder: (folder: string) => `Thu gọn thư mục ${folder}`,
        expandBox: (box: string, count: string) => `Mở ${box} (${count})`,
        collapseBox: (box: string) => `Thu gọn ${box}`,
        collapse: 'Thu gọn',
        focusBox: (box: string, count: string) =>
          `Làm nổi bật đường nối của ${box} (${count})`,
        openBox: 'Mở ra',
        fullScreen: 'Xem toàn màn hình',
        exitFullScreen: 'Thoát toàn màn hình',
        openBoxes: 'Đang mở',
        showBox: (box: string) => `Đưa ${box} vào khung nhìn`,
        expandAll: 'Mở tất cả thư mục',
        collapseAll: 'Thu gọn tất cả',
        search: 'Tìm program, module, bảng',
        searchResults: 'Kết quả tìm',
        searchNone: 'Không tìm thấy node nào.',
        state: {
          complete: 'Đầy đủ',
          partial: 'Chưa đầy đủ',
          unsupported: 'Chưa phân tích',
        } satisfies Record<ProgramState, string>,
        unknownDependencies: 'Chưa phân tích nên chưa biết phụ thuộc',
        missingMembers: (count: string) =>
          `${count} file khai báo không tìm thấy`,
        focusNode: (kind: string, label: string) =>
          `Làm nổi bật ${kind} ${label}`,
        calls: (count: string) => `${count} lượt gọi`,
        commonTitle: 'Common module (fan-in)',
        commonNote:
          'Fan-in = số program khai báo file. Module fan-in cao ảnh hưởng nhiều program nhất khi sửa, nên tài liệu hoá trước.',
        commonHidden: 'đang ẩn',
        commonNone: 'Không có module dùng chung.',
        focusedTitle: 'Node đang chọn',
        clearFocus: 'Bỏ chọn',
        fanIn: 'Fan-in',
        fanOut: 'Fan-out',
        callers: 'File gọi tới',
        flow: {
          controls: 'Điều khiển zoom',
          zoomIn: 'Phóng to',
          zoomOut: 'Thu nhỏ',
          fitView: 'Vừa khung',
          minimap: 'Bản đồ thu nhỏ',
        },
      },
      tablesNone: 'Không phát hiện truy cập bảng.',
      tablesPagination: 'Phân trang bảng DB',
      columns: {
        table: 'Bảng',
        programs: 'Program',
        locations: 'Vị trí truy cập',
        top: 'Program truy cập nhiều nhất',
      },
      createDocs: 'Tạo tài liệu cho program này',
      detailColumn: 'Mở chi tiết',
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
    tableSchema: {
      assumed: (schema: string, inferred: boolean) =>
        inferred
          ? `Tên bảng được gộp theo schema giả định ${schema} (tiền tố xuất hiện nhiều nhất trong mã nguồn).`
          : `Tên bảng được gộp theo schema giả định ${schema}.`,
      none: 'Chưa có schema mặc định: tên bảng giữ như trong mã nguồn.',
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
      SCREEN_REPORT_OUTDATED:
        'Kết quả phân tích này dùng bộ nhận diện report cũ: chưa có số CSV/Excel, chưa loại log/file tạm và chưa có độ phức tạp của report in bằng code, hoặc độ phức tạp report chưa chấm theo phạm vi call graph hiện hành. Cần phân tích lại.',
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
      rawTables: (count: string) => `(gốc: ${count})`,
      outputShort: (count: string) => `+${count} in/xuất`,
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
        codeLines: 'LoC + chung',
        procedures: 'Procedure',
        tables: 'Bảng',
        screens: 'Màn hình',
        reports: 'Report',
        complexity: 'Độ phức tạp',
      },
      columnHints: {
        codeLines:
          'LoC + dùng chung: LoC gồm cả file dùng chung (file dùng chung tính ở mỗi program khai báo nó)',
        procedures: 'Procedure riêng',
        tables: 'Số bảng',
        complexity:
          'Độ phức tạp của program; báo giá nháp dùng mức này làm hệ số',
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
        graph: 'Sơ đồ gọi',
        reports: 'Màn hình và report',
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
      graph: {
        loading: 'Đang tải sơ đồ gọi…',
        empty:
          'Program này không có procedure nào trong các file đã phân tích.',
        lanes: {
          own: 'Procedure riêng',
          shared: 'Procedure dùng chung',
          api: 'API ngoài',
          tables: 'Bảng DB',
        },
        kinds: { api: 'API ngoài', table: 'Bảng DB' },
        fileLevel: 'Ngoài procedure',
        shared: 'Dùng chung',
        summary: (own: string, shared: string, edges: string) =>
          `${own} procedure riêng · ${shared} procedure dùng chung gọi tới được · ${edges} liên kết`,
        tableView: {
          mapped: 'Bảng theo tên sau ánh xạ',
          raw: 'Bảng theo tên trong source',
        },
        showIsolated: (count: string) =>
          `Hiện ${count} procedure không gọi và không được gọi`,
        layoutPending: 'Đang sắp xếp sơ đồ…',
        layoutFailed:
          'Không sắp xếp được sơ đồ tự động; đang hiển thị theo làn đơn giản.',
        canvasLabel: 'Sơ đồ gọi giữa các procedure',
        fullScreen: 'Xem toàn màn hình',
        exitFullScreen: 'Thoát toàn màn hình',
        sideLabel: 'Procedure đang chọn',
        sideHint:
          'Chọn một procedure trên sơ đồ hoặc qua ô tìm để xem nơi gọi, lời gọi và bảng nó truy cập.',
        note: 'Phân tích theo tên, không chạy chương trình. Nét đứt là lời gọi chưa xác định (nhiều procedure trùng tên). Lời gọi qua object (Form1.Foo) không nối được. Bảng đầy đủ ở tab Lời gọi.',
        search: 'Tìm procedure, API, bảng',
        searchResults: 'Kết quả tìm',
        searchNone: 'Không tìm thấy node nào.',
        focusNode: (kind: string, label: string) =>
          `Làm nổi bật ${kind} ${label}`,
        uses: (count: string) => `${count} lần`,
        dynamicSql: (count: string) => `${count} SQL động`,
        ambiguous: 'chưa xác định',
        candidate: 'Ứng viên',
        candidateNote:
          'Chỉ là ứng viên của một lời gọi chưa xác định (nhiều procedure trùng tên): chưa chắc program gọi tới, nên những gì nó gọi hoặc truy cập không được vẽ tiếp.',
        focusedTitle: 'Procedure đang chọn',
        clearFocus: 'Bỏ chọn',
        codeLines: 'LoC',
        decisions: 'Điểm rẽ nhánh',
        callers: 'Nơi gọi',
        calledBy: 'Được gọi bởi',
        callsTo: 'Gọi tới',
        tables: 'Bảng truy cập',
        noEdges: 'Không gọi, không được gọi và không truy cập bảng.',
        flow: {
          controls: 'Điều khiển zoom',
          zoomIn: 'Phóng to',
          zoomOut: 'Thu nhỏ',
          fitView: 'Vừa khung',
          minimap: 'Bản đồ thu nhỏ',
        },
      },
    },
    report: {
      groupTitle: 'Báo cáo Assessment',
      exportCustomer: 'Xuất Excel',
      exportCustomerPdf: 'Xuất PDF',
      pdfFailed: 'Không tạo được PDF. Thử lại sau; không có file nào được lưu.',
      exporting: 'Đang xuất…',
      tooLarge:
        'Báo cáo quá lớn để xếp vào một sheet Excel. Hãy tải bản JSON bằng nút bên cạnh.',
      downloadJson: 'Tải bản JSON',
      failed:
        'Không xuất được báo cáo. Thử lại sau; không có file nào được lưu.',
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
      'security-audit': {
        name: 'Security audit',
        detail: 'Rủi ro bảo mật của program, review tĩnh có evidence',
      },
      'ut-test-spec': {
        name: 'Test case UT (単体テスト仕様書)',
        detail:
          'Agent liệt kê case mức nhánh theo checklist của Portal; có Excel',
      },
      'it-test-spec': {
        name: 'Test case IT (結合テスト仕様書)',
        detail:
          'Agent viết scenario tích hợp theo checklist của Portal (module dùng chung, chuỗi DB, report, program khác); có Excel',
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
  review: {
    loading: 'Đang tải tài liệu…',
    emptyTitle: 'Chưa có tài liệu để review',
    emptyHelp: 'Tạo tài liệu cho một program ở bước 3, kết quả sẽ hiện ở đây.',
    emptyAction: 'Sang Tạo tài liệu',
    createQuote: 'Tạo báo giá',
    previewQuote: 'Xem trước báo giá',
    listLabel: 'Danh sách tài liệu',
    preview: 'Xem trước tài liệu',
    reviewLabel: 'Đánh giá',
    noDocuments: 'Không có tài liệu nào ở trạng thái này.',
    filters: { all: 'Tất cả', pending: 'Chờ duyệt', approved: 'Đã duyệt' },
    status: { pending: 'Chờ duyệt', approved: 'Đã duyệt' },
    setOf: (total: number) => `Bộ tài liệu · ${total} tài liệu`,
    downloadSet: (name: string) => `Tải bộ tài liệu ${name}`,
    approvedOf: (done: number, total: number) => `${done}/${total} đã duyệt`,
    unresolved: (count: number) =>
      `Có ${count} điểm chưa xác định trong tài liệu này.`,
    seeUnresolved: 'Xem',
    docNames: {
      'business-rules': 'Business rules',
      'basic-design': 'Thiết kế cơ bản',
      'detail-design': 'Thiết kế chi tiết',
      'db-design': 'Thiết kế CSDL',
      'security-audit': 'Security audit',
      'ut-test-spec': 'Test case UT',
      'it-test-spec': 'Test case IT',
    },
    comments: 'Nhận xét',
    noComments: 'Chưa có nhận xét.',
    commentPlaceholder: 'Viết nhận xét…',
    send: 'Gửi',
    approve: 'Duyệt tài liệu',
    errors: {
      REVIEW_STALE:
        'Tài liệu này đã có phiên bản mới hơn. Tải lại trang để review đúng phiên bản.',
    },
  },
  quote: {
    title: (project: string) => `Báo giá chuyển đổi ${project}`,
    loading: 'Đang tải dữ liệu báo giá…',
    loadFailed: 'Không đọc được kết quả phân tích để lập báo giá.',
    emptyTitle: 'Chưa có kết quả phân tích',
    emptyHelp: 'Báo giá tính trên toàn bộ program của lần phân tích mới nhất.',
    emptyAction: 'Sang Phân tích',
    lead: (programs: number, loc: number, skipped: number) =>
      `Dựa trên toàn bộ ${programs} program, ${loc.toLocaleString('en-US')} LoC của lần phân tích mới nhất` +
      (skipped > 0
        ? ` · ${skipped} program không phân tích được, chưa tính`
        : ''),
    exportPdf: 'Xuất PDF',
    exportExcel: 'Xuất Excel',
    send: 'Gửi khách hàng',
    sendLater: 'Chưa có trong bản này',
    totalCost: 'Tổng chi phí',
    costNote: 'Chưa gồm VAT · đã áp dụng AI assistance',
    totalEffort: 'Tổng effort',
    effortNote: (dev: string, mgmt: string) =>
      `Dev ${dev} MM + PM/BrSE/Comtor ${mgmt} MM`,
    duration: 'Thời gian dự kiến',
    months: (months: number) => `${months} tháng`,
    durationNote: (devs: number, saved: string) =>
      `Team ${devs} dev · AI giảm ${saved} MM`,
    paramsTitle: 'Tham số',
    validity: (days: number) => `Hiệu lực ${days} ngày`,
    quoteNumber: 'Số báo giá',
    validityDays: 'Hiệu lực (ngày)',
    scopeTitle: 'Hạng mục',
    scopeHelp: '% effort so với Coding (100%)',
    aiTitle: 'AI assistance',
    aiHelp: 'giảm effort theo phase',
    aiCode: 'DD & Coding',
    aiTest: 'Kiểm thử (QA / QC)',
    saved: (saved: string) => `Tiết kiệm ${saved} MM · BD không áp dụng giảm`,
    devs: 'Số dev',
    devsHelp: 'Dùng để tính timeline',
    devsLess: 'Giảm số dev',
    devsMore: 'Tăng số dev',
    rolesTitle: 'Vai trò & đơn giá',
    role: 'Vai trò',
    rate: 'Đơn giá',
    roles: {
      pm: 'PM',
      brse: 'BrSE',
      comtor: 'Comtor',
      sa: 'SA (BD, DD)',
      dev: 'Dev / QA / QC',
    },
    rolesHelp:
      '% effort của PM / BrSE / Comtor tính trên effort dev (tài liệu + coding + kiểm thử).',
    formulaTitle: 'Cách tính',
    formula: (f: QuoteFormulaFacts) => {
      const n = (value: number) => value.toFixed(2);
      const w = f.weights;
      const shared = f.shared
        ? ` Hiện có ${f.shared.lines.toLocaleString('en-US')} dòng dùng chung × (${n(f.shared.programMM)} MM Coding gốc ÷ ${f.shared.programLines.toLocaleString('en-US')} dòng của các program) = ${n(f.shared.mm)} MM Coding gốc.`
        : '';
      return [
        `Coding gốc của program = Σ (số lượng từng thành phần × ngày công, xem bảng dưới) ÷ ${f.daysPerMM} ngày/MM. Ví dụ: ${f.lines.toLocaleString('en-US')} dòng + ${f.decisions} nhánh + ${f.tables} bảng = ${n(f.days)} ngày ÷ ${f.daysPerMM} = ${n(f.coding)} MM.`,
        `Các hạng mục khác là % của Coding gốc: BD ${w.BD}%, DD ${w.DD}%, UT ${w.UT}%, IT ${w.IT}%, UAT ${w['UAT support']}% (chỉnh được ở phần Điều chỉnh công thức).`,
        `AI assistance giảm công: DD và Coding giảm ${f.aiCode}%, UT / IT / UAT giảm ${f.aiTest}% (hai thanh trượt AI); BD không giảm. Cộng BD + DD + Coding + UT + IT + UAT sau giảm là effort Dev.`,
        'PM, BrSE, Comtor mỗi vai = % × effort Dev, không bị AI giảm thêm.',
        'Chi phí = effort từng hạng mục × đơn giá: SA cho BD và DD, Dev / QA / QC cho Coding, UT, IT, UAT; mỗi vai quản lý một đơn giá riêng.',
        `Thời gian = effort Dev ÷ số dev, làm tròn lên tháng; các giai đoạn làm nối tiếp. Ví dụ: ${n(f.dev)} MM ÷ ${f.devs} dev = ${n(f.months)} tháng, làm tròn thành ${Math.max(1, Math.ceil(f.months))} tháng.`,
        'Effort và chi phí của mỗi module hoặc program lấy đúng phần của nó trong tổng, theo tỷ lệ Coding gốc của nó.',
        `Code dùng chung là các file nhiều program cùng dùng (như GLOBAL.BAS), không thuộc program nào nên không có số nhánh, bảng... riêng. Coding gốc = số dòng dùng chung × effort trung bình mỗi dòng của các program (tổng Coding gốc ÷ tổng dòng). Sau đó chạy qua các bước 2 đến 6 như một program.${shared}`,
      ];
    },
    phaseTitle: 'Effort theo giai đoạn',
    phases: {
      doc: 'Tài liệu',
      code: 'Coding (migrate)',
      test: 'Kiểm thử',
      mgmt: 'PM / BrSE / Comtor',
    },
    scheduleTitle: 'Lịch triển khai dự kiến',
    monthsShort: (months: number) => `${Math.round(months)} th`,
    suggestDevs: (devs: number) =>
      `Thời gian dài: cần khoảng ${devs} dev để xong trong 12 tháng.`,
    scheduleNote: (devs: number, months: number) =>
      `Team ${devs} dev · ${months} tháng`,
    moduleTitle: 'Chi tiết theo module',
    shareNote:
      'Bấm module để xem các program, bấm program (hoặc dòng đầu trong module) để xem effort theo hạng mục. Complexity không được dùng làm hệ số tính effort.',
    itemsTitle: 'Effort theo hạng mục',
    toggleRow: 'mở / đóng chi tiết',
    items: {
      BD: 'BD',
      DD: 'DD',
      coding: 'Coding (migrate)',
      UT: 'UT',
      IT: 'IT',
      'UAT support': 'UAT support',
      pm: 'PM',
      brse: 'BrSE',
      comtor: 'Comtor',
    },
    programFilter: 'Lọc theo tên program hoặc module',
    programTitle: 'Program',
    sharedModule: 'Dùng chung (chưa thuộc program nào)',
    module: 'Module',
    programCount: 'Program',
    complexity: 'Complexity TB',
    effort: 'Effort (MM)',
    cost: 'Chi phí',
    shareColumn: 'Tỷ trọng',
    total: 'Tổng',
    assumptionsTitle: 'Giả định & phạm vi',
    unitsTitle: 'Ngày công mỗi đơn vị (bước đầu của cách tính)',
    adjustTitle: 'Điều chỉnh công thức',
    unitDaysTitle: 'Ngày công mỗi đơn vị',
    unitDaysHelp: 'sau công cụ chuyển đổi, trước AI',
    resetDefaults: 'Đặt lại tỷ lệ và ngày công về mặc định',
    unitColumns: { part: 'Thành phần', unit: 'Đơn vị', days: 'Ngày công' },
    units: {
      lines: { part: 'Dòng code riêng (LoC)', unit: '100 dòng' },
      decisions: { part: 'Điểm rẽ nhánh', unit: '100 điểm' },
      tables: { part: 'Bảng DB truy cập', unit: '1 bảng' },
      sql: { part: 'SQL ghép chuỗi', unit: '1 câu (SQL động tính ×3)' },
      components: { part: 'Component / OCX', unit: '1 component' },
      apis: { part: 'API ngoài', unit: '1 API' },
    },
    assumptions: () => [
      'Đơn giá ngày công của từng thành phần (bảng trên) là giả định, chưa được kiểm chứng trên dự án thực tế.',
      'Hạng mục tài liệu và kiểm thử tính theo % so với Coding. Không gồm di trú CSDL, nền tảng dùng chung, chuyển đổi vận hành hay buffer.',
      'Không bao gồm thay đổi nghiệp vụ, chỉ chuyển đổi tương đương chức năng.',
    ],
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
      FOLDER_PICKER_BUSY:
        'Hộp thoại chọn thư mục đang mở. Chọn thư mục trong hộp thoại đó hoặc đóng nó rồi thử lại.',
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
      remove: 'Mã dự án không hợp lệ. Làm mới danh sách rồi chọn lại dự án.',
      create:
        'Thông tin tạo dự án không hợp lệ. Kiểm tra dữ liệu và phiên bản ứng dụng rồi thử lại.',
      get: 'Mã dự án không hợp lệ. Làm mới danh sách rồi chọn lại dự án.',
      list: 'Tham số tải danh sách không hợp lệ. Làm mới danh sách rồi thử lại.',
      runs: 'Yêu cầu lượt chạy không hợp lệ. Tải lại lượt chạy rồi thử lại.',
      update:
        'Thông tin dự án không hợp lệ. Kiểm tra tên dự án và khách hàng rồi thử lại.',
      source:
        'Thông tin mã nguồn không hợp lệ: đường dẫn phải là đường dẫn tuyệt đối trên máy này.',
    },
  },
};

export type Messages = typeof viMessages;
