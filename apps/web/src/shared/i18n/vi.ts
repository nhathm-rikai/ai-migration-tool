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
      documents: 'Tạo tài liệu',
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
      choose: 'Chọn thư mục',
      cancel: 'Hủy',
      saving: 'Đang kiểm tra…',
      demoFolder: (fixtureId: string) => `${fixtureId} (bộ mẫu)`,
      language: 'Ngôn ngữ phân tích (chọn 1)',
      languageRequired: 'Chọn ngôn ngữ phân tích trước khi quét.',
      comingSoon: 'Sắp hỗ trợ',
    },
    recent: {
      title: 'Dự án gần đây',
      all: 'Xem tất cả',
      loading: 'Đang tải dự án gần đây…',
      failed: 'Không tải được danh sách dự án.',
      empty: 'Chưa có dự án nào.',
      open: 'Đang mở',
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
        codeLines: 'LoC + dùng chung',
        procedures: 'Procedure riêng',
        tables: 'Số bảng',
        complexity: 'Độ phức tạp',
      },
      columnHints: {
        codeLines:
          'LoC gồm cả file dùng chung (file dùng chung tính ở mỗi program khai báo nó)',
        complexity: 'Độ phức tạp tham khảo, không dùng để tính công sức',
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
    errors: {
      ARTIFACT_NOT_FOUND:
        'Không tìm thấy phiên bản kết quả này trong dự án. Tải lại lượt chạy.',
      mismatch:
        'Kết quả nhận được không khớp phiên bản đã yêu cầu. Tải lại kết quả.',
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
      update:
        'Thông tin dự án không hợp lệ. Kiểm tra tên dự án và khách hàng rồi thử lại.',
      source:
        'Thông tin mã nguồn không hợp lệ: đường dẫn phải là đường dẫn tuyệt đối trên máy này.',
    },
  },
};

export type Messages = typeof viMessages;
