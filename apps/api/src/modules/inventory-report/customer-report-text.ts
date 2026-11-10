import type { CustomerReportLang } from '@portal/contracts';

// Every customer-facing sentence of the customer report (Excel, JSON, and the
// PDF that is drawn from the JSON) in the two report languages: Japanese (the
// default, for the customer) and Vietnamese (for review on our side). Both
// languages have the same keys (the type forces it; a test compares the risk
// catalog). The builder and the workbook have no sentences of their own.
// Internal codes (risk severity 高/中/低, item type 画面/帳票/...) stay Japanese
// in code and are translated at the end with `severity` and `itemType`.

export type Lang = CustomerReportLang;
export const LANGS: readonly Lang[] = ['ja', 'vi'];

export type SeverityCode = '高' | '中' | '低';
export type ItemTypeCode = '画面' | '帳票' | 'バッチ' | '出力機能';

export type ReportText = {
  customerProvidedCount: string;
  notAnalyzed: string;
  notApplicable: string;
  unrated: string;
  sharedModule: string;
  unassignedModule: string;
  recommendations: readonly string[];
  // Sheet names (Excel limit: 31 characters, none of []:*?/\).
  sheetNames: readonly [string, string, string, string, string, string];
  sheetNotes: readonly (readonly string[])[];
  sheetTitleSuffix: string;
  reportKindLabels: Record<string, string>;
  levelLabels: Record<string, string>;
  confidenceLabels: Record<string, string>;
  reasonLabels: Record<string, string>;
  factorLabels: Record<string, string>;
  severity: Record<SeverityCode, string>;
  itemType: Record<ItemTypeCode, string>;
  templateStatus: { 'design-file': string; 'missing-file': string };
  originLabels: Record<string, string>;
  warningLabels: Record<string, string>;
  items: {
    sep: string;
    batchKind: string;
    screenKind: string;
    dataFileKind: string;
    dataFileConfidence: string;
    dataFileNote: string;
    usages: (count: number) => string;
    morePrograms: (labels: readonly string[], more: number) => string;
  };
  wb: {
    colItem: string;
    colValue: string;
    colNote: string;
    origin: string;
    dataKind: string;
    demo: string;
    real: string;
    project: string;
    analysedOn: string;
    analysisNo: (version: number) => string;
    scale: string;
    programs: string;
    ofComplete: (count: number) => string;
    files: string;
    ofAnalyzed: (count: number) => string;
    codeLines: string;
    sharedOnce: string;
    commentLines: string;
    blankLines: string;
    physicalLines: string;
    procedures: string;
    dbTables: string;
    screens: string;
    ofShared: (count: number) => string;
    reportTotal: string;
    reportParts: (crystal: number, print: number, exports: number) => string;
    crystalRow: string;
    designSplit: (design: number, missing: number) => string;
    printRow: string;
    exportRow: string;
    dataFilesRow: string;
    excluded: (count: number) => string;
    batches: string;
    customerCount: string;
    breakdownByKind: string;
    kindHeader: readonly [string, string];
    breakdownByLevel: string;
    levelHeader: readonly [string, string];
    byModule: string;
    moduleHeader: readonly string[];
    total: string;
    basis: string;
    nextSteps: string;
    // Sheet 2
    programLevels: string;
    programLevelHeader: readonly [string, string, string];
    notAnalyzedLabel: string;
    notApplicableLevel: string;
    reportLevels: string;
    reportLevelHeader: readonly [string, string];
    topPrograms: string;
    topHeader: readonly string[];
    // Sheet 3
    sharedHeading: string;
    sharedHeader: readonly string[];
    componentsHeading: string;
    componentsHeader: readonly string[];
    referenceTag: string;
    componentTag: string;
    apisHeading: string;
    apisHeader: readonly string[];
    // Sheet 4
    tablesRaw: string;
    tablesNormalized: string;
    schemaAssumed: string;
    tablesHeader: readonly string[];
    sqlHeading: (dynamic: number, concat: number | string) => string;
    sqlHeader: readonly string[];
    // Sheet 5
    riskColumns: readonly [string, string, string, string, string, string];
    wholeSystem: string;
    joinPrograms: string;
    otherPrograms: (count: number) => string;
    // Sheet 6
    itemColumns: readonly string[];
  };
};

const JA: ReportText = {
  customerProvidedCount: 'お客様提示数：未入力',
  notAnalyzed: '未解析（再解析が必要）',
  notApplicable: '該当なし',
  unrated: '未評価',
  sharedModule: '共通',
  unassignedModule: 'プログラム未所属',
  recommendations: [
    '本報告は静的解析（ソースコードの機械的な読み取り）の結果です。数え方の前提は各シートに記載しています。',
    '「5_リスク・確認事項」の各項目（特に重要度「高」）について、必要に応じてソース等のご提供をお願いします。',
    '確認後の数値を基に、移行範囲・順序（移行単位）を協議し、見積りを確定します。',
  ],
  sheetNames: [
    '1_規模概要',
    '2_複雑度',
    '3_依存関係',
    '4_データベース',
    '5_リスク・確認事項',
    '6_画面・帳票一覧',
  ],
  sheetNotes: [
    [
      'このシートの見方：ソースコードの解析結果から求めた移行対象の規模です。数値は解析時点のものです。',
      '共通モジュールのファイルは「共通」の行に1回だけ集計し、合計はソース全体の実数に一致します。',
      '帳票数の算定基準は、このシート末尾の「算定基準」に記載しています。',
    ],
    [
      'このシートの見方：プログラムと帳票の複雑度の分布です。工数や金額ではありません。',
      '前提：複雑度は、処理の分岐数・実行行数・アクセステーブル数・動的SQL・呼び出し数を点数化し、低・中・高・非常に高の4段階に分類します。範囲は「1_規模概要」の算定基準に記載しています。',
    ],
    [
      'このシートの見方：複数のプログラムから参照される共通部品と、外部コンポーネント（COM/OCX）・Windows API の一覧です。',
      '参照元の多い共通部品は、変更時の影響範囲が広くなります。',
    ],
    [
      'このシートの見方：アクセスされるテーブルと、動的SQL・文字列連結SQLの箇所数です。',
    ],
    [
      'このシートの見方：解析で判断できなかった点・注意が必要な点を、重要度別にまとめています。',
      '「お客様への確認事項」の列に、ご回答をお願いする内容を記載しています。',
    ],
    [
      'このシートの見方：画面・帳票・バッチを1行ずつ列挙した一覧です。お客様の台帳との照合にご利用ください。',
      '帳票の設計ファイル：あり＝ソース内に定義ファイルがある、なし＝コード上に名前のみ（設計ファイルなし）。',
      '帳票の数え方は「1_規模概要」の算定基準によります（コード印刷・CSV・Excel出力は、該当するソースファイル1つを1件とする換算単位）。',
    ],
  ],
  sheetTitleSuffix: '（アセスメント報告書）',
  reportKindLabels: {
    'data-report': 'DataReport / ActiveReports',
    crystal: 'Crystal Reports',
    excel: 'CSV・Excel出力',
    print: 'コード印刷',
    'file-output': 'ファイル出力（帳票に含めない）',
    unknown: '帳票ライブラリのみ（帳票に含めない）',
  },
  levelLabels: {
    low: '低',
    medium: '中',
    high: '高',
    'very-high': '非常に高',
    unrated: '未評価',
  },
  confidenceLabels: {
    detected: '検出',
    referenced: '参照（定義ファイル不足）',
    suspected: '帳票に含めない',
  },
  reasonLabels: {
    SUSPECTED: '帳票に含めない',
    NO_PROCEDURE: '帳票を呼び出す処理を特定できないため評価不可',
    DESIGN_NOT_ANALYZED_FLOOR: '定義ファイル未解析のため最低でも「中」',
  },
  factorLabels: {
    decisionPoints: '分岐数',
    executableLines: '実行行数',
    tables: 'アクセステーブル数',
    dynamicSql: '動的SQL',
    calls: '呼び出し数',
    'design-not-analyzed': '定義ファイル未解析',
  },
  severity: { 高: '高', 中: '中', 低: '低' },
  itemType: {
    画面: '画面',
    帳票: '帳票',
    バッチ: 'バッチ',
    出力機能: '出力機能',
  },
  templateStatus: {
    'design-file': '設計ファイルあり',
    'missing-file': '設計ファイルなし',
  },
  originLabels: { print: 'コード印刷', export: 'CSV・Excel出力' },
  warningLabels: {
    SCREEN_FILE_MISSING: '画面ファイルがソースにありません',
    SCREEN_FILE_NOT_ANALYZED:
      '画面ファイルを解析できません（画面数には含みます）',
    REPORT_FILE_MISSING: '帳票定義ファイル(.rpt)がソースにありません',
  },
  items: {
    sep: '；',
    batchKind: 'バッチ（Sub Main 起動・画面なし）',
    screenKind: '画面（フォーム）',
    dataFileKind: 'ファイル出力（帳票に含めない）',
    dataFileConfidence: '帳票に含めない',
    dataFileNote: '算定基準：CSV・Excel以外のファイル出力は帳票に数えません。',
    usages: (count) => `使用箇所 ${count} か所`,
    morePrograms: (labels, more) => `${labels.join('、')} 他${more}件`,
  },
  wb: {
    colItem: '項目',
    colValue: '値',
    colNote: '補足',
    origin: 'データの出所',
    dataKind: 'データ区分',
    demo: 'DEMO：同梱のサンプルデータです（お客様のシステムではありません）',
    real: 'お客様ソースの解析結果',
    project: 'プロジェクト',
    analysedOn: '解析日時',
    analysisNo: (version) => `解析 #${version}`,
    scale: '規模',
    programs: 'プログラム数',
    ofComplete: (count) => `うち完全に解析 ${count}`,
    files: 'ファイル数',
    ofAnalyzed: (count) => `うち解析済みコード ${count}`,
    codeLines: 'コード行数',
    sharedOnce: '共通ファイルは1回のみ集計',
    commentLines: 'コメント行数',
    blankLines: '空白行数',
    physicalLines: '物理行数',
    procedures: 'プロシージャ数',
    dbTables: 'DBテーブル数',
    screens: '画面',
    ofShared: (count) => `うち共通 ${count}（1回のみ集計）`,
    reportTotal: '帳票数（算定基準による）',
    reportParts: (crystal, print, exports) =>
      `Crystal ${crystal}／コード印刷 ${print}／CSV・Excel出力 ${exports}`,
    crystalRow: '　Crystal Reports / DataReport',
    designSplit: (design, missing) =>
      `設計ファイルあり ${design}／なし ${missing}`,
    printRow: '　コードによる印刷',
    exportRow: '　CSV・Excel出力',
    dataFilesRow: 'データファイル出力（帳票に含めない）',
    excluded: (count) => `ログ・一時ファイルとして除外 ${count} 件`,
    batches: 'バッチ',
    customerCount: '画面・帳票（お客様提示）',
    breakdownByKind: '帳票の内訳（作成方法別）',
    kindHeader: ['種別', '件数'],
    breakdownByLevel: '帳票の内訳（複雑度）',
    levelHeader: ['複雑度', '件数'],
    byModule: 'モジュール別（共通は別行）',
    moduleHeader: [
      'モジュール',
      'プログラム数',
      '画面',
      '帳票',
      'バッチ',
      'ファイル',
      'コード行数',
    ],
    total: '合計',
    basis: '算定基準',
    nextSteps: '今後の進め方',
    programLevels: 'プログラムの複雑度の分布',
    programLevelHeader: ['レベル', 'プログラム数', '割合(%)'],
    notAnalyzedLabel: '未解析',
    notApplicableLevel: '対象外',
    reportLevels: '帳票の複雑度の分布',
    reportLevelHeader: ['レベル', '帳票数'],
    topPrograms: '複雑なプログラム上位20',
    topHeader: [
      'プログラム',
      'モジュール',
      'レベル',
      '点数',
      'コード行数',
      '画面',
      '帳票',
    ],
    sharedHeading: '共通部品（参照プログラム数の多い順・上位15）',
    sharedHeader: [
      'ファイル',
      '参照プログラム数',
      'プロシージャ数',
      'コード行数',
    ],
    componentsHeading: '外部コンポーネント（COM / OCX）',
    componentsHeader: ['識別子', 'ファイル名', '説明', '参照プログラム数'],
    referenceTag: '【参照設定】',
    componentTag: '【コンポーネント】',
    apisHeading: 'Windows API など外部ライブラリの関数',
    apisHeader: ['関数名', 'ライブラリ', '呼び出しプログラム数'],
    tablesRaw: 'アクセスされるテーブル（ソース上の名称・上位30）',
    tablesNormalized: 'アクセスされるテーブル（名称統一後・上位30）',
    schemaAssumed: '※スキーマは仮定（DB管理者の確認前）',
    tablesHeader: [
      'テーブル',
      '参照プログラム数',
      '操作（C=作成 R=参照 U=更新 D=削除 X=DDL）',
    ],
    sqlHeading: (dynamic, concat) =>
      `動的SQL・文字列連結SQLの箇所数（動的 ${dynamic} / 連結 ${concat}）`,
    sqlHeader: [
      'モジュール',
      '動的SQL（テーブル名が実行時決定）',
      '文字列連結SQL',
    ],
    riskColumns: [
      '区分',
      '重要度',
      '件数',
      '内容',
      '影響プログラム',
      'お客様への確認事項',
    ],
    wholeSystem: '（全体）',
    joinPrograms: '、',
    otherPrograms: (count) => ` 他${count}件`,
    itemColumns: [
      '区分',
      '種別',
      'プログラム',
      'モジュール',
      '名称',
      'ファイル',
      '行',
      '信頼度',
      '複雑度',
      '点数',
      '評価要因',
      '備考',
    ],
  },
};

const VI: ReportText = {
  customerProvidedCount: 'Số liệu khách hàng cung cấp: chưa nhập',
  notAnalyzed: 'Chưa phân tích (cần phân tích lại)',
  notApplicable: 'Không có',
  unrated: 'Chưa đánh giá',
  sharedModule: 'Dùng chung',
  unassignedModule: 'Chưa thuộc program nào',
  recommendations: [
    'Báo cáo này là kết quả phân tích tĩnh (đọc cơ học mã nguồn). Cơ sở tính được ghi ở từng sheet.',
    'Với từng mục trong sheet "5_Rủi ro" (đặc biệt mức "Cao"), vui lòng cung cấp mã nguồn hoặc thông tin liên quan khi cần.',
    'Dựa trên số liệu sau khi xác nhận, hai bên sẽ thảo luận phạm vi và thứ tự migrate (đơn vị migrate) rồi chốt báo giá.',
  ],
  sheetNames: [
    '1_Quy mô',
    '2_Độ phức tạp',
    '3_Phụ thuộc',
    '4_Cơ sở dữ liệu',
    '5_Rủi ro',
    '6_Màn hình-Report',
  ],
  sheetNotes: [
    [
      'Cách đọc sheet: quy mô cần migrate, tính từ kết quả phân tích mã nguồn. Số liệu là tại thời điểm phân tích.',
      'File của module dùng chung chỉ được tính một lần ở dòng "Dùng chung"; tổng khớp với số thực của toàn bộ mã nguồn.',
      'Cơ sở tính số report được ghi ở mục "Cơ sở tính" cuối sheet này.',
    ],
    [
      'Cách đọc sheet: phân bố độ phức tạp của program và report. Đây không phải effort hay chi phí.',
      'Cơ sở: độ phức tạp được chấm điểm theo số nhánh, số dòng thực thi, số bảng truy cập, SQL động và số lời gọi, rồi chia 4 mức: Thấp, Trung bình, Cao, Rất cao. Phạm vi nêu ở mục "Cơ sở tính" của sheet "1_Quy mô".',
    ],
    [
      'Cách đọc sheet: danh sách thành phần dùng chung được nhiều program tham chiếu, thành phần ngoài (COM/OCX) và Windows API.',
      'Thành phần dùng chung có nhiều nơi tham chiếu thì phạm vi ảnh hưởng khi thay đổi rộng hơn.',
    ],
    [
      'Cách đọc sheet: các bảng được truy cập và số vị trí SQL động / SQL ghép chuỗi.',
    ],
    [
      'Cách đọc sheet: tổng hợp theo mức độ những điểm chưa xác định được qua phân tích hoặc cần lưu ý.',
      'Cột "Đề nghị khách hàng" ghi những việc mong nhận phản hồi.',
    ],
    [
      'Cách đọc sheet: danh sách từng dòng Màn hình, Report, Batch; dùng để đối chiếu với sổ quản lý của khách hàng.',
      'File thiết kế của report: Có = file định nghĩa có trong mã nguồn; Không = chỉ có tên trong code (thiếu file thiết kế).',
      'Cách đếm report theo mục "Cơ sở tính" của sheet "1_Quy mô" (in bằng code và xuất CSV/Excel: mỗi file mã nguồn liên quan là một đơn vị quy đổi).',
    ],
  ],
  sheetTitleSuffix: ' (Báo cáo Assessment)',
  reportKindLabels: {
    'data-report': 'DataReport / ActiveReports',
    crystal: 'Crystal Reports',
    excel: 'Xuất CSV/Excel',
    print: 'In bằng code',
    'file-output': 'Ghi file (không tính vào report)',
    unknown: 'Chỉ có thư viện report (không tính vào report)',
  },
  levelLabels: {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    'very-high': 'Rất cao',
    unrated: 'Chưa đánh giá',
  },
  confidenceLabels: {
    detected: 'Phát hiện',
    referenced: 'Tham chiếu (thiếu file định nghĩa)',
    suspected: 'Không tính vào report',
  },
  reasonLabels: {
    SUSPECTED: 'Không tính vào report',
    NO_PROCEDURE:
      'Không xác định được procedure tạo report nên không đánh giá được',
    DESIGN_NOT_ANALYZED_FLOOR:
      'File thiết kế chưa phân tích nên tối thiểu là "Trung bình"',
  },
  factorLabels: {
    decisionPoints: 'Số nhánh',
    executableLines: 'Số dòng thực thi',
    tables: 'Số bảng truy cập',
    dynamicSql: 'SQL động',
    calls: 'Số lời gọi',
    'design-not-analyzed': 'Chưa phân tích file thiết kế',
  },
  severity: { 高: 'Cao', 中: 'Trung bình', 低: 'Thấp' },
  itemType: {
    画面: 'Màn hình',
    帳票: 'Report',
    バッチ: 'Batch',
    出力機能: 'Ghi file dữ liệu',
  },
  templateStatus: {
    'design-file': 'Có file thiết kế',
    'missing-file': 'Thiếu file thiết kế',
  },
  originLabels: { print: 'In bằng code', export: 'Xuất CSV/Excel' },
  warningLabels: {
    SCREEN_FILE_MISSING: 'Không có file màn hình trong mã nguồn',
    SCREEN_FILE_NOT_ANALYZED:
      'Không phân tích được file màn hình (vẫn tính vào số màn hình)',
    REPORT_FILE_MISSING:
      'Không có file định nghĩa report (.rpt) trong mã nguồn',
  },
  items: {
    sep: '; ',
    batchKind: 'Batch (khởi động bằng Sub Main, không có màn hình)',
    screenKind: 'Màn hình (form)',
    dataFileKind: 'Ghi file (không tính vào report)',
    dataFileConfidence: 'Không tính vào report',
    dataFileNote:
      'Cơ sở tính: ghi file không phải CSV/Excel không được tính là report.',
    usages: (count) => `Số nơi dùng: ${count}`,
    morePrograms: (labels, more) =>
      `${labels.join(', ')} và ${more} program khác`,
  },
  wb: {
    colItem: 'Hạng mục',
    colValue: 'Giá trị',
    colNote: 'Ghi chú',
    origin: 'Nguồn dữ liệu',
    dataKind: 'Loại dữ liệu',
    demo: 'DEMO: dữ liệu mẫu đi kèm (không phải hệ thống của khách hàng)',
    real: 'Kết quả phân tích mã nguồn của khách hàng',
    project: 'Dự án',
    analysedOn: 'Thời điểm phân tích',
    analysisNo: (version) => `Lần phân tích #${version}`,
    scale: 'Quy mô',
    programs: 'Số program',
    ofComplete: (count) => `trong đó phân tích đầy đủ ${count}`,
    files: 'Số file',
    ofAnalyzed: (count) => `trong đó file code đã phân tích ${count}`,
    codeLines: 'Số dòng code',
    sharedOnce: 'File dùng chung chỉ tính một lần',
    commentLines: 'Số dòng comment',
    blankLines: 'Số dòng trống',
    physicalLines: 'Số dòng vật lý',
    procedures: 'Số procedure',
    dbTables: 'Số bảng DB',
    screens: 'Màn hình',
    ofShared: (count) => `trong đó dùng chung ${count} (tính một lần)`,
    reportTotal: 'Report theo quy ước Assessment',
    reportParts: (crystal, print, exports) =>
      `Crystal ${crystal} / In bằng code ${print} / Xuất CSV/Excel ${exports}`,
    crystalRow: '　Crystal Reports / DataReport',
    designSplit: (design, missing) =>
      `Có file thiết kế ${design} / Thiếu ${missing}`,
    printRow: '　In bằng code',
    exportRow: '　Xuất CSV/Excel',
    dataFilesRow: 'Ghi file dữ liệu (không tính vào report)',
    excluded: (count) => `Đã loại ${count} chỗ ghi log/file tạm`,
    batches: 'Batch',
    customerCount: 'Màn hình / report (số của khách hàng)',
    breakdownByKind: 'Chi tiết report (theo cách tạo)',
    kindHeader: ['Loại', 'Số lượng'],
    breakdownByLevel: 'Chi tiết report (theo độ phức tạp)',
    levelHeader: ['Độ phức tạp', 'Số lượng'],
    byModule: 'Theo module (dùng chung là dòng riêng)',
    moduleHeader: [
      'Module',
      'Số program',
      'Màn hình',
      'Report',
      'Batch',
      'Số file',
      'Số dòng code',
    ],
    total: 'Tổng',
    basis: 'Cơ sở tính',
    nextSteps: 'Bước tiếp theo',
    programLevels: 'Phân bố độ phức tạp của program',
    programLevelHeader: ['Mức', 'Số program', 'Tỷ lệ (%)'],
    notAnalyzedLabel: 'Chưa phân tích',
    notApplicableLevel: 'Không áp dụng',
    reportLevels: 'Phân bố độ phức tạp của report',
    reportLevelHeader: ['Mức', 'Số report'],
    topPrograms: 'Top 20 program phức tạp',
    topHeader: [
      'Program',
      'Module',
      'Mức',
      'Điểm',
      'Số dòng code',
      'Màn hình',
      'Report',
    ],
    sharedHeading:
      'Thành phần dùng chung (nhiều program tham chiếu nhất, top 15)',
    sharedHeader: [
      'File',
      'Số program tham chiếu',
      'Số procedure',
      'Số dòng code',
    ],
    componentsHeading: 'Thành phần ngoài (COM / OCX)',
    componentsHeader: [
      'Định danh',
      'Tên file',
      'Mô tả',
      'Số program tham chiếu',
    ],
    referenceTag: '[Reference] ',
    componentTag: '[Component] ',
    apisHeading: 'Hàm của thư viện ngoài như Windows API',
    apisHeader: ['Tên hàm', 'Thư viện', 'Số program gọi'],
    tablesRaw: 'Bảng được truy cập (tên theo mã nguồn, top 30)',
    tablesNormalized: 'Bảng được truy cập (sau khi thống nhất tên, top 30)',
    schemaAssumed: ' *Schema là giả định (quản trị viên DB chưa xác nhận)',
    tablesHeader: [
      'Bảng',
      'Số program tham chiếu',
      'Thao tác (C=tạo R=đọc U=sửa D=xóa X=DDL)',
    ],
    sqlHeading: (dynamic, concat) =>
      `Số vị trí SQL động / SQL ghép chuỗi (động ${dynamic} / ghép ${concat})`,
    sqlHeader: [
      'Module',
      'SQL động (tên bảng quyết định lúc chạy)',
      'SQL ghép chuỗi',
    ],
    riskColumns: [
      'Phân loại',
      'Mức độ',
      'Số lượng',
      'Nội dung',
      'Program bị ảnh hưởng',
      'Đề nghị khách hàng',
    ],
    wholeSystem: '(Toàn hệ thống)',
    joinPrograms: ', ',
    otherPrograms: (count) => ` và ${count} program khác`,
    itemColumns: [
      'Loại',
      'Phân loại',
      'Program',
      'Module',
      'Tên',
      'File',
      'Dòng',
      'Độ tin cậy',
      'Độ phức tạp',
      'Điểm',
      'Yếu tố đánh giá',
      'Ghi chú',
    ],
  },
};

const TEXT: Record<Lang, ReportText> = { ja: JA, vi: VI };

export const reportText = (lang: Lang): ReportText => TEXT[lang];
